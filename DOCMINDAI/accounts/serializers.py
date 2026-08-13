from rest_framework import serializers

from .models import User
class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["password"] != attrs["password2"]:
            raise serializers.ValidationError(
                {"password": "Passwords do not match."}
            )

        return attrs
    def validate_email(self, value):
      if User.objects.filter(email=value).exists():
         raise serializers.ValidationError(
            "A user with this email already exists."
        )

      return value
class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)    
class ProfileSerializer(serializers.ModelSerializer):

    class Meta:
        model = User
        fields = ["id", "email"]    