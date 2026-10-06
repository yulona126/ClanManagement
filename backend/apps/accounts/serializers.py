from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import UserProfile

User = get_user_model()


def get_or_create_profile(user) -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    bio = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "is_staff",
            "display_name",
            "bio",
            "avatar_url",
        )
        read_only_fields = fields

    def get_display_name(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        if profile and profile.display_name:
            return profile.display_name
        return obj.username

    def get_bio(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        return profile.bio if profile else ""

    def get_avatar_url(self, obj) -> str:
        profile = getattr(obj, "profile", None)
        return profile.avatar_url if profile else ""


class UserUpdateSerializer(serializers.Serializer):
    display_name = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
    )
    bio = serializers.CharField(max_length=200, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    def update(self, user, validated_data):
        profile = get_or_create_profile(user)
        if "email" in validated_data:
            user.email = validated_data["email"] or ""
            user.save(update_fields=["email"])
        if "display_name" in validated_data:
            profile.display_name = validated_data["display_name"].strip()
        if "bio" in validated_data:
            profile.bio = validated_data["bio"].strip()
        profile.save()
        return user
