import base64
import hashlib
import hmac
import json
import time

from django.conf import settings


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _b64url_decode(data: str) -> bytes:
    padding = '=' * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode('ascii'))


def password_fingerprint(user) -> str:
    password_hash = getattr(user, 'password', '') or ''
    return hashlib.sha256(password_hash.encode('utf-8')).hexdigest()[:16]


def _sign(message: bytes) -> str:
    secret = settings.JWT_SECRET_KEY.encode('utf-8')
    signature = hmac.new(secret, message, hashlib.sha256).digest()
    return _b64url_encode(signature)


def _encode(payload: dict) -> str:
    header = {'alg': 'HS256', 'typ': 'JWT'}
    header_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signature_b64 = _sign(f'{header_b64}.{payload_b64}'.encode('utf-8'))
    return f'{header_b64}.{payload_b64}.{signature_b64}'


def build_token_payload(user, token_type: str, lifetime_seconds: int) -> dict:
    now = int(time.time())
    return {
        'sub': str(user.pk),
        'username': user.get_username(),
        'type': token_type,
        'iat': now,
        'exp': now + int(lifetime_seconds),
        'pw': password_fingerprint(user),
    }


def create_access_token(user) -> str:
    payload = build_token_payload(user, 'access', settings.JWT_ACCESS_TOKEN_LIFETIME_SECONDS)
    return _encode(payload)


def create_refresh_token(user) -> str:
    payload = build_token_payload(user, 'refresh', settings.JWT_REFRESH_TOKEN_LIFETIME_SECONDS)
    return _encode(payload)


def decode_token(token: str, expected_type: str | None = None) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split('.')
    except ValueError as exc:
        raise ValueError('Format de jeton invalide') from exc

    message = f'{header_b64}.{payload_b64}'.encode('utf-8')
    expected_signature = _sign(message)
    if not hmac.compare_digest(signature_b64, expected_signature):
        raise ValueError('Signature de jeton invalide')

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode('utf-8'))
    except Exception as exc:
        raise ValueError('Contenu du jeton invalide') from exc

    if expected_type and payload.get('type') != expected_type:
        raise ValueError('Type de jeton invalide')

    if int(payload.get('exp', 0)) < int(time.time()):
        raise ValueError('Jeton expire')

    return payload
