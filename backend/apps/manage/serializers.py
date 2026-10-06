from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.clan.models import Membership, Workspace
from apps.clan.services.kinship import create_membership_with_kinship

User = get_user_model()


class ManageUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "is_staff")
        read_only_fields = fields


class ManageUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=1)
    email = serializers.EmailField(required=False, allow_blank=True, default="")

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("用户名已存在。")
        return value

    def create(self, validated_data):
        return User.objects.create_user(
            username=validated_data["username"],
            password=validated_data["password"],
            email=validated_data.get("email") or "",
        )


class ManageWorkspaceSerializer(serializers.ModelSerializer):
    name = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    baby_name = serializers.CharField(max_length=50, trim_whitespace=True)

    class Meta:
        model = Workspace
        fields = (
            "id",
            "name",
            "baby_name",
            "baby_birthday",
            "avatar_url",
            "created_at",
        )
        read_only_fields = ("id", "created_at", "avatar_url")

    def validate_baby_name(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("宝宝名不能为空。")
        return value.strip()

    def create(self, validated_data):
        baby_name = validated_data["baby_name"]
        name = (validated_data.get("name") or "").strip() or f"{baby_name}的空间"
        return Workspace.objects.create(
            name=name,
            baby_name=baby_name,
            baby_birthday=validated_data.get("baby_birthday"),
            avatar_url="",
        )

    def update(self, instance, validated_data):
        baby_name = validated_data.get("baby_name", instance.baby_name)
        if isinstance(baby_name, str):
            baby_name = baby_name.strip() or instance.baby_name
        name = validated_data.get("name", instance.name)
        if isinstance(name, str):
            name = name.strip() or instance.name
        instance.baby_name = baby_name
        instance.name = name
        if "baby_birthday" in validated_data:
            instance.baby_birthday = validated_data["baby_birthday"]
        instance.save()
        return instance


class ManageMembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    workspace_id = serializers.IntegerField(source="workspace.id", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    baby_name = serializers.CharField(source="workspace.baby_name", read_only=True)

    class Meta:
        model = Membership
        fields = (
            "id",
            "user_id",
            "username",
            "workspace_id",
            "workspace_name",
            "baby_name",
            "role",
            "relation_label",
            "display_name",
            "avatar_url",
            "bio",
            "generation",
            "created_at",
        )
        read_only_fields = fields


class ManageMembershipCreateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    workspace_id = serializers.IntegerField()
    role = serializers.ChoiceField(choices=Membership.Role.choices)
    relation_label = serializers.CharField(max_length=20)
    anchor_membership_id = serializers.IntegerField(required=False, allow_null=True)
    anchor_label = serializers.CharField(
        max_length=40,
        required=False,
        allow_blank=True,
        default="",
    )

    def validate(self, attrs):
        if not User.objects.filter(pk=attrs["user_id"]).exists():
            raise serializers.ValidationError({"user_id": "用户不存在。"})
        if not Workspace.objects.filter(pk=attrs["workspace_id"]).exists():
            raise serializers.ValidationError({"workspace_id": "Workspace 不存在。"})
        if Membership.objects.filter(
            user_id=attrs["user_id"],
            workspace_id=attrs["workspace_id"],
        ).exists():
            raise serializers.ValidationError("该用户已是此 Workspace 成员。")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        created_by = getattr(request, "user", None) if request else None
        return create_membership_with_kinship(
            user_id=validated_data["user_id"],
            workspace_id=validated_data["workspace_id"],
            role=validated_data["role"],
            relation_label=validated_data["relation_label"],
            created_by=created_by if created_by and created_by.is_authenticated else None,
            anchor_membership_id=validated_data.get("anchor_membership_id"),
            anchor_label=(validated_data.get("anchor_label") or "").strip(),
        )
