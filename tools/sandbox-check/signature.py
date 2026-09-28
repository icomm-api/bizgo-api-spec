"""Webhook signature encoding check.

Report and MO webhooks are signed as X-IB-Signature = HmacSHA256(secret, X-IB-Timestamp)
(confirmed by Bizgo, 2026-09-28). The output encoding (hex or base64) is not confirmed yet;
this module computes each encoding so a real sandbox webhook can tell us which one is used.
"""

from __future__ import annotations

import base64
import hashlib
import hmac


def _hmac(key: bytes, message: bytes) -> bytes:
    return hmac.new(key, message, hashlib.sha256).digest()


def candidates(secret: bytes, timestamp: bytes) -> dict[str, bytes]:
    """Return the raw HMAC digest keyed by a human-readable scheme name."""
    return {"hmac(key=secret, msg=timestamp)": _hmac(secret, timestamp)}


def encodings(digest: bytes) -> dict[str, str]:
    hex_value = digest.hex()
    b64 = base64.b64encode(digest).decode("ascii")
    return {
        "hex": hex_value,
        "HEX": hex_value.upper(),
        "base64": b64,
        "base64url": base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
    }


def match(signature: str, secret: bytes, timestamp: bytes) -> list[str]:
    """Return the scheme/encoding names whose value equals the received signature (constant-time)."""
    received = signature.strip()
    found = []
    for scheme, digest in candidates(secret, timestamp).items():
        for encoding, value in encodings(digest).items():
            if hmac.compare_digest(value.encode("ascii"), received.encode("ascii", "replace")):
                found.append(f"{scheme} / {encoding}")
    return found
