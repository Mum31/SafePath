from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .jwt_utils import create_access_token, create_refresh_token, decode_token, password_fingerprint

User = get_user_model()


def _serialize_user(user):
    return {
        'id': user.pk,
        'username': user.get_username(),
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
    }


def _build_auth_response(user, status_code=status.HTTP_200_OK):
    return Response(
        {
            'user': _serialize_user(user),
            'tokens': {
                'access': create_access_token(user),
                'refresh': create_refresh_token(user),
            },
        },
        status=status_code,
    )


def _find_user_by_identifier(identifier):
    identifier = (identifier or '').strip()
    if not identifier:
        return None

    user = User.objects.filter(username__iexact=identifier).first()
    if user:
        return user
    return User.objects.filter(email__iexact=identifier).first()


class RegisterView(APIView):
    def post(self, request):
        username = (request.data.get('username') or '').strip()
        email = (request.data.get('email') or '').strip().lower()
        password = request.data.get('password') or ''
        password_confirm = request.data.get('password_confirm') or ''
        first_name = (request.data.get('first_name') or '').strip()
        last_name = (request.data.get('last_name') or '').strip()

        if not username or not email or not password:
            return Response(
                {'error': 'Nom d’utilisateur, email et mot de passe requis'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if password != password_confirm:
            return Response(
                {'error': 'Les mots de passe ne correspondent pas'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username__iexact=username).exists():
            return Response(
                {'error': 'Ce nom d’utilisateur est deja utilise'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'error': 'Cet email est deja utilise'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        temp_user = User(username=username, email=email, first_name=first_name, last_name=last_name)
        try:
            validate_password(password, user=temp_user)
        except ValidationError as exc:
            return Response(
                {'error': 'Mot de passe invalide', 'details': exc.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name,
        )
        return _build_auth_response(user, status_code=status.HTTP_201_CREATED)


class LoginView(APIView):
    def post(self, request):
        identifier = (request.data.get('identifier') or '').strip()
        password = request.data.get('password') or ''
        if not identifier or not password:
            return Response(
                {'error': 'Identifiant et mot de passe requis'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = _find_user_by_identifier(identifier)
        if not user:
            return Response(
                {'error': 'Identifiants invalides'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        authenticated_user = authenticate(username=user.get_username(), password=password)
        if not authenticated_user:
            return Response(
                {'error': 'Identifiants invalides'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return _build_auth_response(authenticated_user)


class RefreshTokenView(APIView):
    def post(self, request):
        refresh_token = request.data.get('refresh_token') or ''
        if not refresh_token:
            return Response(
                {'error': 'Refresh token requis'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = decode_token(refresh_token, expected_type='refresh')
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        user = User.objects.filter(pk=payload.get('sub'), is_active=True).first()
        if not user or payload.get('pw') != password_fingerprint(user):
            return Response(
                {'error': 'Refresh token invalide'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return _build_auth_response(user)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({'user': _serialize_user(request.user)})
