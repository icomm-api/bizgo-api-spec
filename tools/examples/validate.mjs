#!/usr/bin/env node
// 요청 본문 예시(requestBody의 example / examples)가 스키마의 x-sdk-required-if 규칙을 지키는지 검사합니다.
//
//   node tools/examples/validate.mjs
//
// - JSON Schema 검사(타입·required·enum·oneOf·추가 속성 등)는 redocly lint의 `no-invalid-media-type-examples`
//   규칙(redocly.yaml에서 error)이 맡습니다. 이 스크립트는 JSON Schema로 표현할 수 없는 조건부 필수 규칙
//   (`x-sdk-required-if`, AGENTS.md 규칙 11)과 규칙 형식만 검사합니다.
// - Node 표준 라이브러리만 씁니다. YAML → JSON 변환에만 저장소에 버전이 고정된 @redocly/cli를 씁니다.
// - 예시 값은 출력하지 않습니다(operation·예시 이름·경로만 출력).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC = path.join(ROOT, "openapi", "openapi.yaml");
const METHODS = ["get", "post", "put", "patch", "delete"];
const OPERATORS = ["equals", "notEquals", "in", "notIn"];

function loadSpec() {
  const cli = path.join(ROOT, "node_modules", "@redocly", "cli", "bin", "cli.js");
  if (!fs.existsSync(cli)) throw new Error("@redocly/cli가 없습니다. 먼저 `npm ci`를 실행하세요.");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bizgo-examples-"));
  try {
    const out = path.join(tmp, "openapi.json");
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
const errors = [];

function deref(node, depth = 0) {
  while (node && typeof node === "object" && typeof node.$ref === "string") {
    if (!node.$ref.startsWith("#/")) throw new Error(`외부 $ref는 지원하지 않습니다: ${node.$ref}`);
    if (depth++ > 50) throw new Error(`$ref 순환: ${node.$ref}`);
    let cur = spec;
    for (const part of node.$ref.slice(2).split("/")) cur = cur?.[part.replace(/~1/g, "/").replace(/~0/g, "~")];
    if (cur === undefined) throw new Error(`찾을 수 없는 $ref: ${node.$ref}`);
    node = cur;
  }
  return node;
}

// allOf를 합친 스키마(properties, required, additionalProperties, x-sdk-required-if)
function flatten(schemaIn) {
  const schema = deref(schemaIn);
  if (!schema || typeof schema !== "object" || !schema.allOf) return schema;
  const out = { ...schema, properties: { ...(schema.properties || {}) }, required: [...(schema.required || [])] };
  const rules = [...(schema["x-sdk-required-if"] || [])];
  delete out.allOf;
  for (const part of schema.allOf) {
    const p = flatten(part);
    if (!p) continue;
    Object.assign(out.properties, p.properties || {});
    for (const r of p.required || []) if (!out.required.includes(r)) out.required.push(r);
    rules.push(...(p["x-sdk-required-if"] || []));
  }
  if (rules.length) out["x-sdk-required-if"] = rules;
  return out;
}

const present = (v) => v !== undefined && v !== null;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function ruleMatches(when, obj) {
  const raw = obj?.[when.field];
  const v = present(raw) ? String(raw) : undefined;
  if ("equals" in when) return v !== undefined && v === String(when.equals);
  if ("notEquals" in when) return v === undefined || v !== String(when.notEquals);
  if ("in" in when) return v !== undefined && when.in.map(String).includes(v);
  if ("notIn" in when) return v === undefined || !when.notIn.map(String).includes(v);
  return false;
}

// 경로의 빠진 위치를 모읍니다. `name[]`은 배열의 모든 원소, 배열이 없거나 비어 있으면 검사할 원소가 없습니다.
function missingPaths(base, segs, where) {
  if (!segs.length) return [];
  const [seg, ...rest] = segs;
  const isArr = seg.endsWith("[]");
  const key = isArr ? seg.slice(0, -2) : seg;
  if (!isObj(base) || !present(base[key])) return isArr ? [] : [`${where}.${key}`];
  const v = base[key];
  if (isArr) {
    if (!Array.isArray(v)) return [`${where}.${key}`];
    return v.flatMap((el, i) => (rest.length ? missingPaths(el, rest, `${where}.${key}[${i}]`) : []));
  }
  return missingPaths(v, rest, `${where}.${key}`);
}

// oneOf/anyOf 후보 중 값에 맞는 첫 후보(필수 키가 있고, additionalProperties: false면 키가 모두 정의된 것)
function pickAlt(value, alts) {
  const cands = alts.map(flatten).filter(Boolean);
  if (!isObj(value)) return cands[0];
  const keys = Object.keys(value);
  return cands.find(
    (s) =>
      (s.required || []).every((k) => present(value[k])) &&
      (s.additionalProperties !== false || keys.every((k) => k in (s.properties || {}))),
  );
}

function walk(value, schemaIn, ctx, where, depth = 0) {
  if (depth > 40 || value === null || typeof value !== "object") return;
  let schema = flatten(schemaIn);
  if (!schema) return;
  const alts = schema.oneOf || schema.anyOf;
  if (alts && !schema.properties) {
    schema = pickAlt(value, alts);
    if (!schema) return; // 어느 후보에도 맞지 않는 값은 redocly lint가 잡습니다.
  }
  if (Array.isArray(value)) {
    if (schema.items) value.forEach((v, i) => walk(v, schema.items, ctx, `${where}[${i}]`, depth + 1));
    return;
  }
  for (const [i, rule] of (schema["x-sdk-required-if"] || []).entries()) {
    if (!ruleMatches(rule.when, value)) continue;
    const cond = `${rule.when.field} ${OPERATORS.find((o) => o in rule.when)} ${JSON.stringify(rule.when[OPERATORS.find((o) => o in rule.when)])}`;
    for (const k of rule.required || []) {
      if (!present(value[k])) errors.push(`${ctx.name}: ${where}.${k} 가 없습니다 (x-sdk-required-if[${i}]: ${cond})`);
    }
    for (const p of rule.requiredPaths || []) {
      let base = value;
      let baseWhere = where;
      let segs = p.split(".");
      if (segs[0] === "$") {
        segs = segs.slice(1);
        const first = segs[0]?.replace(/\[\]$/, "");
        if (!(first in (ctx.rootSchema.properties || {}))) continue; // 요청 본문에 없는 속성은 검사하지 않음
        base = ctx.root;
        baseWhere = "$";
      }
      for (const m of missingPaths(base, segs, baseWhere)) {
        errors.push(`${ctx.name}: ${m} 가 없습니다 (x-sdk-required-if[${i}]: ${cond} → ${p})`);
      }
    }
  }
  for (const [k, v] of Object.entries(value)) {
    const sub = schema.properties?.[k] ?? (isObj(schema.additionalProperties) ? schema.additionalProperties : undefined);
    if (sub) walk(v, sub, ctx, `${where}.${k}`, depth + 1);
  }
}

// 모든 스키마의 x-sdk-required-if 형식 검사 (AGENTS.md 규칙 11)
function lintRules() {
  const seen = new Set();
  const visit = (node, where) => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${where}[${i}]`));
    const rules = node["x-sdk-required-if"];
    if (rules !== undefined) {
      if (!Array.isArray(rules)) errors.push(`${where}: x-sdk-required-if는 목록이어야 합니다`);
      else
        rules.forEach((r, i) => {
          const at = `${where}.x-sdk-required-if[${i}]`;
          const w = r?.when;
          const ops = w ? OPERATORS.filter((o) => o in w) : [];
          if (!w || typeof w.field !== "string") errors.push(`${at}: when.field가 없습니다`);
          else if (!(w.field in (flatten(node).properties || {}))) errors.push(`${at}: when.field '${w.field}'가 이 스키마의 속성이 아닙니다`);
          if (ops.length !== 1) errors.push(`${at}: 연산자(${OPERATORS.join("/")})는 정확히 하나여야 합니다`);
          else if (["in", "notIn"].includes(ops[0]) !== Array.isArray(w[ops[0]])) errors.push(`${at}: ${ops[0]} 값 형식이 잘못되었습니다`);
          if (!r.required && !r.requiredPaths) errors.push(`${at}: required 또는 requiredPaths가 필요합니다`);
          for (const k of r.required || []) {
            if (!(k in (flatten(node).properties || {}))) errors.push(`${at}: required '${k}'가 이 스키마의 속성이 아닙니다`);
          }
        });
    }
    for (const [k, v] of Object.entries(node)) if (k !== "x-sdk-required-if") visit(v, `${where}/${k}`);
  };
  visit(spec.components?.schemas, "#/components/schemas");
}

function main() {
  spec = loadSpec();
  lintRules();
  let count = 0;
  for (const [route, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item[method];
      const rb = deref(op?.requestBody);
      if (!rb?.content) continue;
      for (const [type, mt] of Object.entries(rb.content)) {
        if (!type.includes("json") || !mt.schema) continue;
        const rootSchema = flatten(mt.schema) || {};
        const examples = [];
        if (mt.example !== undefined) examples.push(["example", mt.example]);
        for (const [k, v] of Object.entries(mt.examples || {})) examples.push([k, deref(v)?.value]);
        for (const [name, value] of examples) {
          if (value === undefined) {
            errors.push(`${op.operationId || `${method} ${route}`} examples.${name}: value가 없습니다`);
            continue;
          }
          count++;
          walk(value, mt.schema, { name: `${op.operationId || `${method} ${route}`} examples.${name}`, root: value, rootSchema }, "$");
        }
      }
    }
  }
  if (errors.length) {
    console.error(`examples: x-sdk-required-if 검사 실패 ${errors.length}건`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`examples: 요청 본문 예시 ${count}개가 x-sdk-required-if 규칙을 지킵니다.`);
}

main();
