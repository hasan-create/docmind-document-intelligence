from .models import User
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken

class AuthService:

    @staticmethod
    def register_user(validated_data):
        validated_data.pop("password2")

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
        )

        return user
    @staticmethod
    def login_user(validated_data):

     user = authenticate(
        email=validated_data["email"],
        password=validated_data["password"],
    )

     if user is None:
          return None

     refresh = RefreshToken.for_user(user)

     return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
    }