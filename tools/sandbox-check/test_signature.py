"""Offline tests for signature.py and the redacting summary in _common.py."""

import base64
import hashlib
import hmac
import unittest

from _common import _summarize
from signature import match

SECRET = b"test-secret"
TIMESTAMP = b"1743381600000"


class MatchTest(unittest.TestCase):
    def test_reference_scheme_hex(self):
        sig = hmac.new(SECRET, TIMESTAMP, hashlib.sha256).hexdigest()
        self.assertEqual(match(sig, SECRET, TIMESTAMP), ["hmac(key=secret, msg=timestamp) / hex"])

    def test_reference_scheme_base64(self):
        sig = base64.b64encode(hmac.new(SECRET, TIMESTAMP, hashlib.sha256).digest()).decode()
        self.assertEqual(match(sig, SECRET, TIMESTAMP), ["hmac(key=secret, msg=timestamp) / base64"])

    def test_reference_scheme_upper_hex(self):
        sig = hmac.new(SECRET, TIMESTAMP, hashlib.sha256).hexdigest().upper()
        self.assertEqual(match(sig, SECRET, TIMESTAMP), ["hmac(key=secret, msg=timestamp) / HEX"])

    def test_prefixed_signature_matches_nothing(self):
        sig = "sha256=" + hmac.new(SECRET, TIMESTAMP, hashlib.sha256).hexdigest()
        self.assertEqual(match(sig, SECRET, TIMESTAMP), [])

    def test_wrong_secret_matches_nothing(self):
        sig = hmac.new(b"other", TIMESTAMP, hashlib.sha256).hexdigest()
        self.assertEqual(match(sig, SECRET, TIMESTAMP), [])

    def test_non_ascii_signature_does_not_raise(self):
        self.assertEqual(match("서명", SECRET, TIMESTAMP), [])


class SummarizeTest(unittest.TestCase):
    def test_only_codes_and_key_names_are_kept(self):
        raw = (
            b'{"common":{"authCode":"A000","authResult":"Success","infobankTrId":"T"},'
            b'"data":{"code":"A000","result":"Success","data":{"messages":[{"to":"01000000000"}],"hasNext":false}}}'
        )
        result = _summarize(200, {"X-RateLimit-Remaining": "4", "Set-Cookie": "s=1"}, raw)
        self.assertEqual(result.auth_code, "A000")
        self.assertEqual(result.data_keys, ["hasNext", "messages"])
        self.assertEqual(result.safe_headers, {"x-ratelimit-remaining": "4"})
        self.assertNotIn("01000000000", repr(result))

    def test_non_json_body(self):
        self.assertEqual(_summarize(502, {}, b"<html>").error, "응답이 JSON이 아닙니다")


if __name__ == "__main__":
    unittest.main()
