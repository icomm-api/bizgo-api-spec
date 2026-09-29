#!/usr/bin/env node
// dist/openapi.yaml → Postman Collection v2.1 + Bruno 컬렉션 생성기.
//
//   node tools/collections/generate.mjs           # collections/postman, collections/bruno 다시 생성
//   node tools/collections/generate.mjs --check   # 다시 생성한 뒤 커밋된 파일과 다르면 실패 (CI)
//
// - Node 표준 라이브러리만 씁니다. YAML → JSON 변환에만 저장소에 버전이 고정된 @redocly/cli를 씁니다.
// - 출력은 결정적입니다: 무작위 UUID·시각을 쓰지 않고, id는 이름의 해시로 만듭니다.
// - 예시 값은 스펙의 placeholder만 씁니다. API Key 값은 어떤 파일에도 쓰지 않습니다.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC = path.join(ROOT, "dist", "openapi.yaml");
const OUT = path.join(ROOT, "collections");
const POSTMAN_DIR = path.join(OUT, "postman");
const BRUNO_DIR = path.join(OUT, "bruno");

const SANDBOX_URL = "https://sandbox-mars.ibapi.kr";
const PRODUCTION_URL = "https://mars.ibapi.kr";
const COLLECTION_NAME = "Bizgo Communication API";
const METHODS = ["get", "post", "put", "patch", "delete"];
const PHONE_PLACEHOLDER = "01000000000";
const FILE_PLACEHOLDER = "PATH_TO_FILE";

const API_KEY_DESCRIPTION =
  "API Key는 파일에 저장하지 마세요. Postman은 Current value(로컬에만 저장) 또는 Vault에만 넣고 Initial value는 비워 둡니다. " +
  "접두어 없이 키 그대로 보냅니다(Bearer 금지).";

// ---------------------------------------------------------------- spec 읽기

function loadSpec() {
  const cli = path.join(ROOT, "node_modules", "@redocly", "cli", "bin", "cli.js");
  if (!fs.existsSync(cli)) throw new Error("@redocly/cli가 없습니다. 먼저 `npm ci`를 실행하세요.");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bizgo-collections-"));
  try {
    const out = path.join(tmp, "openapi.json");
    // 비즈고 키 같은 환경변수는 넘기지 않습니다.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("BIZGO_")));
    env.REDOCLY_TELEMETRY = "off";
    env.REDOCLY_SUPPRESS_UPDATE_NOTICE = "true";
    const r = spawnSync(process.execPath, [cli, "bundle", SPEC, "--ext", "json", "-o", out], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    });
    if (r.status !== 0) throw new Error(`redocly bundle 실패:\n${r.stderr}`);
    return JSON.parse(fs.readFileSync(out, "utf8"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

let spec;

function deref(node, depth = 0) {
  while (node && typeof node === "object" && typeof node.$ref === "string") {
    if (!node.$ref.startsWith("#/")) throw new Error(`외부 $ref는 지원하지 않습니다: ${node.$ref}`);
    if (depth++ > 50) throw new Error(`$ref 순환: ${node.$ref}`);
    let cur = spec;
    for (const part of node.$ref.slice(2).split("/")) {
      cur = cur?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    if (cur === undefined) throw new Error(`찾을 수 없는 $ref: ${node.$ref}`);
    node = cur;
  }
  return node;
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// allOf를 합친 object 스키마 (properties, required, x-sdk-required-if)
function flatten(schema) {
  schema = deref(schema);
  if (!schema || !schema.allOf) return schema;
  const out = { ...schema, properties: { ...(schema.properties || {}) }, required: [...(schema.required || [])] };
  const rules = [...(schema["x-sdk-required-if"] || [])];
  delete out.allOf;
  for (const part of schema.allOf) {
    const p = flatten(part);
    if (!p) continue;
    if (p.type && !out.type) out.type = p.type;
    Object.assign(out.properties, p.properties || {});
    for (const r of p.required || []) if (!out.required.includes(r)) out.required.push(r);
    rules.push(...(p["x-sdk-required-if"] || []));
    if (p.example !== undefined && out.example === undefined) out.example = p.example;
  }
  if (rules.length) out["x-sdk-required-if"] = rules;
  return out;
}

// ---------------------------------------------------------------- 예시 값

const FORMAT_SAMPLES = {
  HHmm: "0900",
  "YYYY-MM-DD": "2026-01-01",
  YYYYMMDD: "20260101",
  yyyyMMdd: "20260101",
  "yyyy-MM-dd HH:mm:ss": "2026-01-01 09:00:00",
  "yyyy-MM-dd'T'HH:mm:ss": "2026-01-01T09:00:00",
  "yyyy-MM-dd'T'HH:mm:ss.SSS": "2026-01-01T09:00:00.000",
  "yyyy-MM-dd'T'HH:mm:ss.SSSXXX": "2026-01-01T09:00:00.000+09:00",
  "yyyy-MM-dd'T'HH:mm:ssXXX": "2026-01-01T09:00:00+09:00",
  yyyyMMddHHmmss: "20260101090000",
};

const PHONE_NAME = /^(to|from|callback|phone|phoneNumber|mobile|mobileNumber|.*PhoneNumber)$/i;

function upperSnake(name) {
  return String(name || "value")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
}

function placeholderString(name, schema) {
  if (name && PHONE_NAME.test(name)) return PHONE_PLACEHOLDER;
  if (name === "senderKey") return "SENDER_KEY_EXAMPLE";
  if (name === "templateCode") return "TEMPLATE_CODE_EXAMPLE";
  const fmt = schema?.["x-format"];
  if (fmt && FORMAT_SAMPLES[fmt]) return FORMAT_SAMPLES[fmt];
  if (schema?.format === "date-time") return "2026-01-01T09:00:00+09:00";
  if (schema?.format === "date") return "2026-01-01";
  if (schema?.format === "email") return "user@example.com";
  if (schema?.format === "uri" || schema?.format === "url") return "https://example.com";
  let v = `${upperSnake(name)}_EXAMPLE`;
  if (typeof schema?.maxLength === "number" && v.length > schema.maxLength) v = v.slice(0, schema.maxLength);
  return v;
}

function schemaType(schema) {
  const t = schema?.type;
  if (Array.isArray(t)) return t.find((x) => x !== "null");
  if (t) return t;
  if (schema?.properties) return "object";
  if (schema?.items) return "array";
  return undefined;
}

function ruleMatches(when, obj) {
  const raw = obj?.[when.field];
  const present = raw !== undefined && raw !== null;
  const v = present ? String(raw) : undefined;
  if ("equals" in when) return present && v === String(when.equals);
  if ("notEquals" in when) return !present || v !== String(when.notEquals);
  if ("in" in when) return present && when.in.map(String).includes(v);
  if ("notIn" in when) return !present || !when.notIn.map(String).includes(v);
  return false;
}

// x-sdk-required-if 의 `required` 규칙으로 빠진 필드를 채웁니다(알림톡 msgType 등).
function applyRequiredIf(obj, schema, depth) {
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const rule of schema["x-sdk-required-if"] || []) {
      if (!rule.required || !ruleMatches(rule.when, obj)) continue;
      for (const k of rule.required) {
        if (obj[k] === undefined || obj[k] === null) {
          obj[k] = sample(schema.properties?.[k], k, depth + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

// 스키마에서 최소 예시(필수 필드만)를 만듭니다.
function sample(schemaIn, name, depth = 0) {
  const schema = flatten(schemaIn);
  if (!schema || depth > 12) return null;
  if (schema.example !== undefined) return clone(schema.example);
  if (Array.isArray(schema.examples) && schema.examples.length) return clone(schema.examples[0]);
  if (schema.const !== undefined) return clone(schema.const);
  if (schema.default !== undefined) return clone(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return clone(schema.enum[0]);
  const alt = schema.oneOf || schema.anyOf;
  if (alt && !schema.properties) return sample(alt[0], name, depth + 1);
  switch (schemaType(schema)) {
    case "object": {
      const obj = {};
      for (const k of schema.required || []) obj[k] = sample(schema.properties?.[k], k, depth + 1);
      applyRequiredIf(obj, schema, depth);
      return obj;
    }
    case "array": {
      const n = Math.max(1, schema.minItems || 0);
      return Array.from({ length: n }, () => sample(schema.items, name, depth + 1));
    }
    case "integer":
    case "number":
      return typeof schema.minimum === "number" ? Math.max(schema.minimum, 1) : 1;
    case "boolean":
      return false;
    case "string":
      return placeholderString(name, schema);
    default:
      return placeholderString(name, schema);
  }
}

// 스펙 예시에 스키마의 조건부 필수 규칙을 적용합니다(값이 이미 있으면 그대로 둠).
function fixup(value, schemaIn, depth = 0) {
  if (depth > 20 || value === null || typeof value !== "object") return;
  let schema = flatten(schemaIn);
  if (!schema) return;
  if (Array.isArray(value)) {
    if (schema.items) for (const v of value) fixup(v, schema.items, depth + 1);
    return;
  }
  const alt = schema.oneOf || schema.anyOf;
  if (alt && !schema.properties) {
    // 값의 키를 모두 가진 첫 후보를 고릅니다.
    const keys = Object.keys(value);
    const pick = alt.map(flatten).find((s) => s?.properties && keys.every((k) => k in s.properties));
    if (!pick) return;
    schema = pick;
  }
  if (!schema.properties) return;
  applyRequiredIf(value, schema, depth);
  for (const [k, v] of Object.entries(value)) {
    if (schema.properties[k]) fixup(v, schema.properties[k], depth + 1);
  }
}

// 실제처럼 보이는 전화번호·이메일을 placeholder로 바꿉니다(스펙 예시에 들어오더라도 컬렉션에는 남기지 않음).
const PHONE_RE = /\b01[016789]-?[1-9][0-9]{2,3}-?[0-9]{4}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const sanitized = [];
function sanitize(value, where) {
  if (typeof value === "string") {
    const out = value.replace(PHONE_RE, PHONE_PLACEHOLDER).replace(EMAIL_RE, "user@example.com");
    if (out !== value) sanitized.push(where);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, where));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, where)]));
  }
  return value;
}

function paramValue(p) {
  const s = deref(p.schema) || {};
  let v = p.example;
  if (v === undefined && p.examples) v = Object.values(p.examples).map(deref)[0]?.value;
  if (v === undefined) v = sample(s, p.name);
  if (Array.isArray(v)) v = v.join(",");
  if (v && typeof v === "object") v = JSON.stringify(v);
  return sanitize(String(v ?? ""), p.name);
}

// ---------------------------------------------------------------- operation 모으기

function collectOperations() {
  const tagOrder = (spec.tags || []).map((t) => t.name);
  const ops = [];
  const seenIds = new Set();
  for (const [route, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const id = op.operationId;
      if (!id || seenIds.has(id)) throw new Error(`operationId 누락/중복: ${method} ${route}`);
      seenIds.add(id);

      const merged = new Map();
      for (const raw of [...(item.parameters || []), ...(op.parameters || [])]) {
        const p = deref(raw);
        merged.set(`${p.in}:${p.name}`, p);
      }
      const params = [...merged.values()];
      for (const seg of route.split("/")) {
        if (seg.includes("{") && !/^\{[A-Za-z0-9_]+\}$/.test(seg)) throw new Error(`지원하지 않는 경로 세그먼트: ${route}`);
      }

      ops.push({
        route,
        method,
        op,
        id,
        tag: (op.tags && op.tags[0]) || "Other",
        resource: op["x-sdk-resource"] || "other",
        params,
        body: buildBody(op),
      });
    }
  }
  const tagIdx = (t) => (tagOrder.includes(t) ? tagOrder.indexOf(t) : tagOrder.length);
  // 태그(스펙 순서) → 리소스(이름순) → 스펙의 경로 순서. sort는 안정 정렬입니다.
  ops.sort((a, b) => tagIdx(a.tag) - tagIdx(b.tag) || (a.resource < b.resource ? -1 : a.resource > b.resource ? 1 : 0));
  return ops;
}

function buildBody(op) {
  const rb = deref(op.requestBody);
  if (!rb || !rb.content) return null;
  const types = Object.keys(rb.content);
  const json = types.find((t) => t.includes("json"));
  const multipart = types.find((t) => t === "multipart/form-data");
  const other = types.filter((t) => t !== (json || multipart));
  if (json) {
    const mt = rb.content[json];
    const schema = flatten(mt.schema);
    // 이름 있는 예시(examples)는 모두 씁니다. 2개 이상이면 예시마다 요청을 하나씩 만듭니다(variantsOf).
    let examples;
    if (mt.example !== undefined) examples = [{ name: null, value: clone(mt.example) }];
    else if (mt.examples && Object.keys(mt.examples).length) {
      examples = Object.entries(mt.examples).map(([k, raw]) => {
        const v = deref(raw);
        return { name: k, summary: oneLine(v.summary || k), description: oneLine(v.description || ""), value: clone(v.value) };
      });
    } else examples = [{ name: null, value: sample(schema, null) }];
    for (const e of examples) {
      fixup(e.value, schema);
      e.value = sanitize(e.value, op.operationId);
    }
    const summaries = examples.map((e) => e.summary).filter(Boolean);
    if (new Set(summaries).size !== summaries.length) throw new Error(`${op.operationId}: 예시 summary가 겹칩니다`);
    return { kind: "json", contentType: json, value: examples[0].value, examples, otherTypes: other };
  }
  if (multipart) {
    const schema = flatten(rb.content[multipart].schema) || {};
    const required = new Set(schema.required || []);
    const fields = [];
    for (const [name, rawProp] of Object.entries(schema.properties || {})) {
      const prop = flatten(rawProp) || {};
      const items = flatten(prop.items);
      const isFile =
        prop.format === "binary" ||
        prop.contentMediaType !== undefined ||
        (schemaType(prop) === "array" && (items?.format === "binary" || items?.contentMediaType !== undefined));
      let value = null;
      if (!isFile) {
        const v = sample(prop, name);
        value = sanitize(typeof v === "string" ? v : JSON.stringify(v), op.operationId);
      }
      fields.push({
        name,
        file: isFile,
        value,
        enabled: required.has(name),
        description: oneLine(prop.description || ""),
      });
    }
    return { kind: "multipart", contentType: multipart, fields, otherTypes: other };
  }
  return { kind: "unsupported", contentType: types[0], otherTypes: other };
}

function oneLine(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

function requestName(o) {
  return `${oneLine(o.op.summary || o.id)} (${o.id})`;
}

// 이름 있는 예시가 2개 이상인 operation은 예시마다 요청 1개로 나눠 operation 이름의 하위 폴더에 넣습니다.
function variantsOf(o) {
  const ex = o.body?.kind === "json" ? o.body.examples : null;
  return ex && ex.length > 1 ? ex : null;
}

function requestCount(ops) {
  return ops.reduce((n, o) => n + (variantsOf(o)?.length || 1), 0);
}

function docsFor(o, example = null) {
  const lines = [`**${oneLine(o.op.summary || o.id)}** — \`${o.method.toUpperCase()} ${o.route}\``, ""];
  if (example) {
    lines.push(`예시: **${example.summary}** (\`${example.name}\`)${example.description ? ` — ${example.description}` : ""}`, "");
  }
  if (o.op.description) lines.push(String(o.op.description).trim(), "");
  lines.push(`- operationId: \`${o.id}\``);
  if (o.op["x-sdk-resource"]) lines.push(`- SDK: \`${o.op["x-sdk-resource"]}.${o.op["x-sdk-method"]}\``);
  if (o.op["x-sdk-rate"] === "send") lines.push("- 발송 API입니다. sandbox에서 먼저 확인하세요(sandbox는 실제로 발송되지 않습니다).");
  if (o.op["x-source"]) lines.push(`- 원문: ${o.op["x-source"]}`);
  if (o.body?.kind === "multipart") lines.push(`- 파일 필드에 업로드할 파일을 지정하세요(${FILE_PLACEHOLDER}는 자리표시자입니다).`);
  if (o.body?.otherTypes?.length) lines.push(`- 이 요청은 ${o.body.otherTypes.map((t) => `\`${t}\``).join(", ")} 형식도 지원합니다(스펙 참고).`);
  if (!example && variantsOf(o)) {
    lines.push("", "이 폴더에는 스펙의 예시마다 요청이 하나씩 있습니다:", "");
    for (const e of variantsOf(o)) lines.push(`- ${e.summary} (\`${e.name}\`)${e.description ? ` — ${e.description}` : ""}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- 결정적 id

function stableUuid(name) {
  const h = crypto.createHash("sha1").update(`bizgo-api-spec:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5 형식
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function toColonPath(route) {
  return route.replace(/\{([A-Za-z0-9_]+)\}/g, ":$1");
}

// ---------------------------------------------------------------- Postman

function postmanRequest(o, example = null) {
  const pathParams = o.params.filter((p) => p.in === "path");
  const query = o.params.filter((p) => p.in === "query");
  const headers = o.params.filter((p) => p.in === "header");
  const segs = toColonPath(o.route).split("/").filter(Boolean);
  const url = {
    raw: "",
    host: ["{{baseUrl}}"],
    path: segs,
  };
  if (query.length) {
    url.query = query.map((p) => ({
      key: p.name,
      value: paramValue(p),
      description: oneLine(`${p.required ? "(필수) " : ""}${p.description || ""}`),
      ...(p.required ? {} : { disabled: true }),
    }));
  }
  if (pathParams.length) {
    url.variable = pathParams.map((p) => ({ key: p.name, value: paramValue(p), description: oneLine(p.description || "") }));
  }
  const enabledQuery = (url.query || []).filter((q) => !q.disabled);
  url.raw = `{{baseUrl}}/${segs.join("/")}${enabledQuery.length ? "?" + enabledQuery.map((q) => `${q.key}=${q.value}`).join("&") : ""}`;

  const header = headers.map((p) => ({
    key: p.name,
    value: paramValue(p),
    description: oneLine(p.description || ""),
    ...(p.required ? {} : { disabled: true }),
  }));
  const req = { method: o.method.toUpperCase(), header, url, description: docsFor(o, example) };
  if (o.body?.kind === "json") {
    header.push({ key: "Content-Type", value: "application/json" });
    const value = example ? example.value : o.body.value;
    req.body = { mode: "raw", raw: JSON.stringify(value, null, 2), options: { raw: { language: "json" } } };
  } else if (o.body?.kind === "multipart") {
    req.body = {
      mode: "formdata",
      formdata: o.body.fields.map((f) => ({
        key: f.name,
        ...(f.file ? { type: "file", src: [] } : { type: "text", value: f.value }),
        description: f.description,
        ...(f.enabled ? {} : { disabled: true }),
      })),
    };
  }
  return { name: example ? example.summary : requestName(o), request: req, response: [] };
}

function postmanItem(o) {
  const variants = variantsOf(o);
  if (!variants) return postmanRequest(o);
  return { name: oneLine(o.op.summary || o.id), description: docsFor(o), item: variants.map((e) => postmanRequest(o, e)) };
}

function buildPostman(ops) {
  const tags = new Map();
  for (const o of ops) {
    if (!tags.has(o.tag)) tags.set(o.tag, new Map());
    const res = tags.get(o.tag);
    if (!res.has(o.resource)) res.set(o.resource, []);
    res.get(o.resource).push(postmanItem(o));
  }
  const tagDesc = Object.fromEntries((spec.tags || []).map((t) => [t.name, t.description || ""]));
  const item = [...tags].map(([tag, res]) => ({
    name: tag,
    description: tagDesc[tag] || "",
    item: [...res].map(([resource, items]) => ({ name: resource, item: items })),
  }));
  return {
    info: {
      _postman_id: stableUuid("postman-collection"),
      name: COLLECTION_NAME,
      description: collectionDocs(ops),
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item,
    auth: {
      type: "apikey",
      apikey: [
        { key: "key", value: "Authorization", type: "string" },
        { key: "value", value: "{{apiKey}}", type: "string" },
        { key: "in", value: "header", type: "string" },
      ],
    },
    variable: [
      { key: "baseUrl", value: SANDBOX_URL, type: "string", description: `기본은 sandbox입니다. 운영: ${PRODUCTION_URL}` },
      { key: "apiKey", value: "", type: "string", description: API_KEY_DESCRIPTION },
    ],
  };
}

function postmanEnvironment(name, baseUrl) {
  return {
    id: stableUuid(`postman-environment:${name}`),
    name,
    values: [
      { key: "baseUrl", value: baseUrl, type: "default", enabled: true },
      { key: "apiKey", value: "", type: "secret", enabled: true },
    ],
    _postman_variable_scope: "environment",
  };
}

function collectionDocs(ops, apiKeyLine = `비어 있습니다. ${API_KEY_DESCRIPTION}`) {
  return [
    `${spec.info?.title || "Bizgo API"} ${spec.info?.version || ""} — \`dist/openapi.yaml\`의 operation ${ops.length}개에서 생성한 ${requestCount(ops)}개 요청입니다.`,
    "",
    "이 파일은 `npm run collections`로 생성됩니다. 직접 수정하지 마세요.",
    "",
    `- \`baseUrl\`: 기본 ${SANDBOX_URL}(sandbox, 실제 발송 없음). 운영은 ${PRODUCTION_URL}.`,
    `- \`apiKey\`: ${apiKeyLine}`,
    "- 인증: `Authorization: {{apiKey}}` 헤더(컬렉션 수준).",
    "- 스펙에 예시가 여러 개인 operation(통합 발송, 예약 발송 등록 등)은 operation 이름의 하위 폴더에 예시마다 요청이 하나씩 있습니다.",
    "- 웹훅(비즈고 → 고객 서버)은 요청이 아니므로 포함하지 않습니다.",
  ].join("\n");
}

// ---------------------------------------------------------------- Bruno

function indent(text, n = 2) {
  const pad = " ".repeat(n);
  return String(text)
    .split("\n")
    .map((l) => (l.length ? pad + l : ""))
    .join("\n");
}

function bruDict(name, entries) {
  if (!entries.length) return null;
  return `${name} {\n${entries.map(([k, v, enabled = true]) => `  ${enabled ? "" : "~"}${k}: ${v}`).join("\n")}\n}`;
}

function bruValue(v) {
  // Bruno 사전 블록 값은 한 줄이어야 합니다.
  return oneLine(v);
}

function brunoRequest(o, seq, example = null) {
  const pathParams = o.params.filter((p) => p.in === "path");
  const query = o.params.filter((p) => p.in === "query");
  const headers = o.params.filter((p) => p.in === "header");
  const enabledQuery = query.filter((p) => p.required);
  let url = `{{baseUrl}}${toColonPath(o.route)}`;
  if (enabledQuery.length) url += "?" + enabledQuery.map((p) => `${p.name}=${bruValue(paramValue(p))}`).join("&");
  const bodyMode = o.body?.kind === "json" ? "json" : o.body?.kind === "multipart" ? "multipartForm" : "none";

  const blocks = [];
  blocks.push(`meta {\n  name: ${example ? example.summary : requestName(o)}\n  type: http\n  seq: ${seq}\n}`);
  blocks.push(`${o.method} {\n  url: ${url}\n  body: ${bodyMode}\n  auth: inherit\n}`);
  const q = bruDict(
    "params:query",
    query.map((p) => [p.name, bruValue(paramValue(p)), !!p.required]),
  );
  if (q) blocks.push(q);
  const pp = bruDict(
    "params:path",
    pathParams.map((p) => [p.name, bruValue(paramValue(p))]),
  );
  if (pp) blocks.push(pp);
  const hd = bruDict(
    "headers",
    headers.map((p) => [p.name, bruValue(paramValue(p)), !!p.required]),
  );
  if (hd) blocks.push(hd);
  if (o.body?.kind === "json") {
    blocks.push(`body:json {\n${indent(JSON.stringify(example ? example.value : o.body.value, null, 2))}\n}`);
  } else if (o.body?.kind === "multipart") {
    const mp = bruDict(
      "body:multipart-form",
      o.body.fields.map((f) => [f.name, f.file ? `@file(${FILE_PLACEHOLDER})` : bruValue(f.value), f.enabled]),
    );
    if (mp) blocks.push(mp);
  }
  blocks.push(`docs {\n${indent(docsFor(o, example))}\n}`);
  return blocks.join("\n\n") + "\n";
}

function safeDirName(s) {
  return String(s).replace(/[^A-Za-z0-9._-]+/g, "_");
}

function buildBruno(ops) {
  const files = new Map();
  files.set(
    "bruno.json",
    JSON.stringify({ version: "1", name: COLLECTION_NAME, type: "collection", ignore: ["node_modules", ".git"] }, null, 2) + "\n",
  );
  files.set(
    "collection.bru",
    [
      "headers {\n  Authorization: {{apiKey}}\n  Accept: application/json\n}",
      "auth {\n  mode: none\n}",
      `docs {\n${indent(collectionDocs(ops, "환경 파일에는 값이 없고 `{{process.env.BIZGO_API_KEY}}`로 `.env`(커밋 금지) 또는 환경변수에서 읽습니다. 접두어 없이 키 그대로 보냅니다."))}\n}`,
    ].join("\n\n") + "\n",
  );
  const envFile = (baseUrl) =>
    `vars {\n  baseUrl: ${baseUrl}\n  apiKey: {{process.env.BIZGO_API_KEY}}\n}\n`;
  files.set("environments/sandbox.bru", envFile(SANDBOX_URL));
  files.set("environments/production.bru", envFile(PRODUCTION_URL));
  files.set(".env.example", "# 이 파일을 .env로 복사하고 키를 넣으세요. .env는 커밋하지 마세요(.gitignore 대상).\nBIZGO_API_KEY=\n");

  const tagSeq = new Map();
  const resSeq = new Map();
  const reqSeq = new Map();
  for (const o of ops) {
    const tagDir = safeDirName(o.tag);
    const resDir = `${tagDir}/${safeDirName(o.resource)}`;
    if (!tagSeq.has(tagDir)) {
      tagSeq.set(tagDir, tagSeq.size + 1);
      files.set(`${tagDir}/folder.bru`, `meta {\n  name: ${o.tag}\n  seq: ${tagSeq.get(tagDir)}\n}\n`);
    }
    if (!resSeq.has(resDir)) {
      const n = [...resSeq.keys()].filter((k) => k.startsWith(`${tagDir}/`)).length + 1;
      resSeq.set(resDir, n);
      files.set(`${resDir}/folder.bru`, `meta {\n  name: ${o.resource}\n  seq: ${n}\n}\n`);
    }
    const seq = (reqSeq.get(resDir) || 0) + 1;
    reqSeq.set(resDir, seq);
    const variants = variantsOf(o);
    if (!variants) {
      files.set(`${resDir}/${o.id}.bru`, brunoRequest(o, seq));
      continue;
    }
    // 예시마다 요청 1개: <리소스>/<operationId>/<예시 이름>.bru, 폴더 이름은 operation summary
    const opDir = `${resDir}/${o.id}`;
    files.set(`${opDir}/folder.bru`, `meta {\n  name: ${oneLine(o.op.summary || o.id)}\n  seq: ${seq}\n}\n`);
    variants.forEach((e, i) => {
      const file = `${opDir}/${safeDirName(e.name)}.bru`;
      if (files.has(file)) throw new Error(`${o.id}: 예시 파일 이름이 겹칩니다: ${e.name}`);
      files.set(file, brunoRequest(o, i + 1, e));
    });
  }
  return files;
}

// ---------------------------------------------------------------- 쓰기

function writeTree(dir, files, managedExt) {
  fs.mkdirSync(dir, { recursive: true });
  // 생성 대상이 아닌 이전 생성물(.bru/.json)만 지웁니다. .env 같은 로컬 파일은 건드리지 않습니다.
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        if (!fs.readdirSync(full).length) fs.rmdirSync(full);
      } else {
        const rel = path.relative(dir, full).split(path.sep).join("/");
        if (!files.has(rel) && managedExt.some((e) => ent.name.endsWith(e))) fs.rmSync(full);
      }
    }
  };
  walk(dir);
  for (const [rel, content] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const full = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const old = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (old !== content) fs.writeFileSync(full, content, "utf8");
  }
}

function assertNoSecrets(files) {
  for (const [rel, content] of files) {
    // apiKey 값은 비어 있거나 환경변수 참조여야 합니다.
    const bad =
      /"key":\s*"apiKey",\s*"value":\s*"[^"]+"/.test(content) ||
      [...content.matchAll(/^[ \t]*~?apiKey:[ \t]*(.*)$/gm)].some((m) => m[1].trim() !== "{{process.env.BIZGO_API_KEY}}") ||
      /^BIZGO_API_KEY=.+$/m.test(content);
    if (bad) throw new Error(`${rel}: apiKey 값이 비어 있지 않습니다`);
    const phones = content.match(PHONE_RE);
    if (phones) throw new Error(`${rel}: 전화번호처럼 보이는 값이 있습니다`);
  }
}

function main() {
  const check = process.argv.includes("--check");
  spec = loadSpec();
  const ops = collectOperations();

  const postmanFiles = new Map([
    ["bizgo-api.postman_collection.json", JSON.stringify(buildPostman(ops), null, 2) + "\n"],
    ["bizgo-sandbox.postman_environment.json", JSON.stringify(postmanEnvironment("Bizgo Sandbox", SANDBOX_URL), null, 2) + "\n"],
    ["bizgo-production.postman_environment.json", JSON.stringify(postmanEnvironment("Bizgo Production", PRODUCTION_URL), null, 2) + "\n"],
  ]);
  const brunoFiles = buildBruno(ops);
  assertNoSecrets(postmanFiles);
  assertNoSecrets(brunoFiles);

  writeTree(POSTMAN_DIR, postmanFiles, [".json"]);
  writeTree(BRUNO_DIR, brunoFiles, [".bru", ".json", ".env.example"]);

  const reqCount = [...brunoFiles.keys()].filter((k) => k.endsWith(".bru") && !k.endsWith("folder.bru") && k.includes("/") && !k.startsWith("environments/")).length;
  const countPostman = (items) => items.reduce((n, it) => n + (it.item ? countPostman(it.item) : 1), 0);
  const pmCount = countPostman(JSON.parse(postmanFiles.get("bizgo-api.postman_collection.json")).item);
  if (pmCount !== reqCount || pmCount !== requestCount(ops)) throw new Error(`요청 수가 맞지 않습니다: postman ${pmCount}, bruno ${reqCount}`);
  console.log(`collections: ${ops.length} operations → postman ${pmCount} requests, bruno ${reqCount} requests`);
  if (sanitized.length) console.log(`collections: placeholder로 바꾼 값이 있는 operation: ${[...new Set(sanitized)].join(", ")}`);

  if (check) {
    const git = (args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
    const diff = git(["diff", "--exit-code", "--stat", "--", "collections/"]);
    const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "collections/"]);
    if (diff.status !== 0 || untracked.stdout.trim()) {
      console.error("collections/가 dist/openapi.yaml과 다릅니다. `npm run collections`를 실행하고 결과를 커밋하세요.");
      if (diff.stdout) console.error(diff.stdout);
      if (untracked.stdout.trim()) console.error(`커밋되지 않은 파일:\n${untracked.stdout}`);
      process.exit(1);
    }
    console.log("collections: 최신 상태입니다.");
  }
}

main();
