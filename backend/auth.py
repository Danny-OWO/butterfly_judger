from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import UTC, datetime, timedelta


SESSION_COOKIE = "butterfly_session"
SESSION_DAYS = 30


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return f"scrypt${_encode(salt)}${_encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_text, expected_text = encoded.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = _decode(salt_text)
        expected = _decode(expected_text)
        actual = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def new_session() -> tuple[str, str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(days=SESSION_DAYS)
    return token, hash_session_token(token), expires_at


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
