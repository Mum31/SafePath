from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .jwt_utils import decode_token, password_fingerprint


class JWTAuthentication(BaseAuthentication):
    keyword = 'Bearer'

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth:
            return None

        if auth[0].decode('utf-8').lower() != self.keyword.lower():
            return None

        if len(auth) != 2:
            raise AuthenticationFailed('Entete Authorization invalide')

        token = auth[1].decode('utf-8')
        try:
            payload = decode_token(token, expected_type='access')
        except ValueError as exc:
            raise AuthenticationFailed(str(exc)) from exc

        user_model = get_user_model()
        user = user_model.objects.filter(pk=payload.get('sub'), is_active=True).first()
        if not user:
            raise AuthenticationFailed('Utilisateur introuvable')

        if payload.get('pw') != password_fingerprint(user):
            raise AuthenticationFailed('Jeton invalide')

        return (user, payload)
