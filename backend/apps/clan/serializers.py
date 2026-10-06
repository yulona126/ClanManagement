from rest_framework import serializers

from .models import (
    Album,
    AlbumItem,
    Comment,
    GrowthRecord,
    KinshipLink,
    MediaAsset,
    Membership,
    Workspace,
)
from .services import public_url as public_url_for_key
from .services import thumbnail_url as build_thumbnail_url


class LatestMemorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    content_preview = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    cover_thumbnail_url = serializers.CharField(allow_blank=True)
    cover_media_type = serializers.CharField(allow_blank=True)


class WorkspaceWithMembershipSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    baby_name = serializers.CharField()
    baby_birthday = serializers.DateField(allow_null=True)
    avatar_url = serializers.CharField(allow_blank=True)
    created_at = serializers.DateTimeField()
    my_role = serializers.CharField()
    my_relation_label = serializers.CharField()
    photo_count = serializers.IntegerField()
    video_count = serializers.IntegerField()
    member_count = serializers.IntegerField()
    last_activity_at = serializers.DateTimeField()
    latest_memory = LatestMemorySerializer(allow_null=True)


class WorkspaceCreateSerializer(serializers.Serializer):
    baby_name = serializers.CharField(max_length=50, trim_whitespace=True)
    name = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )
    baby_birthday = serializers.DateField(required=False, allow_null=True)
    relation_label = serializers.CharField(max_length=20, trim_whitespace=True)

    def validate_baby_name(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("宝宝名不能为空。")
        return value.strip()

    def validate_relation_label(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("请填写你对宝宝的称呼。")
        return value.strip()


class WorkspaceUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ("name", "baby_name", "baby_birthday")

    def validate_baby_name(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("宝宝名不能为空。")
        return value.strip()

    def validate_name(self, value: str) -> str:
        if not value.strip():
            raise serializers.ValidationError("空间名称不能为空。")
        return value.strip()


class MembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Membership
        fields = (
            "id",
            "user_id",
            "username",
            "role",
            "relation_label",
            "display_name",
            "avatar_url",
            "bio",
            "generation",
            "created_at",
        )
        read_only_fields = (
            "id",
            "user_id",
            "username",
            "created_at",
        )


class MembershipUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Membership
        fields = ("role", "relation_label")

    def validate_role(self, value: str) -> str:
        allowed = {c.value for c in Membership.Role}
        if value not in allowed:
            raise serializers.ValidationError("role 必须是 owner / editor / viewer。")
        return value


class MembershipMeUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Membership
        fields = ("display_name", "avatar_url", "bio", "generation")


class MembershipInviteSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        default="",
    )
    role = serializers.ChoiceField(choices=Membership.Role.choices)
    relation_label = serializers.CharField(max_length=20)
    anchor_membership_id = serializers.IntegerField(required=False, allow_null=True)
    anchor_label = serializers.CharField(
        max_length=40,
        required=False,
        allow_blank=True,
        default="",
    )


class KinshipCreateSerializer(serializers.Serializer):
    from_membership_id = serializers.IntegerField()
    to_membership_id = serializers.IntegerField()
    label = serializers.CharField(max_length=40)

    def validate(self, attrs):
        if attrs["from_membership_id"] == attrs["to_membership_id"]:
            raise serializers.ValidationError("不能与自己建立关系。")
        return attrs


class KinshipUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = KinshipLink
        fields = ("label",)


class KinshipLinkSerializer(serializers.ModelSerializer):
    from_membership_id = serializers.IntegerField(
        source="from_membership.id",
        read_only=True,
        allow_null=True,
    )
    to_membership_id = serializers.IntegerField(
        source="to_membership.id",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = KinshipLink
        fields = (
            "id",
            "link_kind",
            "label",
            "from_membership_id",
            "to_membership_id",
            "to_baby",
            "created_at",
        )
        read_only_fields = fields


class MediaAssetListSerializer(serializers.ModelSerializer):
    """Lean payload for feed / library / nested record lists (no EXIF blob)."""

    record_id = serializers.IntegerField(read_only=True, allow_null=True)
    file_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    captured_at = serializers.SerializerMethodField()
    taken_at_source = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = (
            "id",
            "record_id",
            "media_type",
            "object_key",
            "file_url",
            "thumbnail_url",
            "width",
            "height",
            "taken_at",
            "captured_at",
            "taken_at_source",
            "created_at",
        )

    def get_file_url(self, obj: MediaAsset) -> str:
        from django.conf import settings

        if settings.STORAGE_BACKEND == "local":
            return public_url_for_key(obj.object_key)
        return obj.file_url or public_url_for_key(obj.object_key)

    def get_thumbnail_url(self, obj: MediaAsset) -> str:
        from django.conf import settings

        file_url = self.get_file_url(obj)
        built = build_thumbnail_url(obj.object_key, obj.media_type, file_url)
        if built:
            return built
        stored = (obj.thumbnail_url or "").strip()
        if stored:
            if settings.STORAGE_BACKEND == "local" and stored.startswith("http"):
                # Prefer relative /media path when stored absolute localhost URLs.
                from urllib.parse import urlparse

                path = urlparse(stored).path
                if path.startswith("/media/"):
                    return path
            return stored
        # Never fall back to the video/audio binary URL as an <img> src.
        if obj.media_type == MediaAsset.MediaType.IMAGE:
            return file_url
        return ""

    def get_captured_at(self, obj: MediaAsset):
        return obj.taken_at or obj.created_at

    def get_taken_at_source(self, obj: MediaAsset) -> str:
        return "exif" if obj.taken_at else "upload"


class MediaAssetSerializer(MediaAssetListSerializer):
    """Full media payload (detail / complete)."""

    class Meta(MediaAssetListSerializer.Meta):
        fields = MediaAssetListSerializer.Meta.fields + (
            "camera_make",
            "camera_model",
            "orientation",
            "latitude",
            "longitude",
            "exif_json",
        )


class MediaAssetAudioSerializer(MediaAssetListSerializer):
    """Minimal fields for nested comment audio players."""

    class Meta(MediaAssetListSerializer.Meta):
        fields = (
            "id",
            "record_id",
            "media_type",
            "object_key",
            "file_url",
            "created_at",
        )


class GrowthRecordSerializer(serializers.ModelSerializer):
    """List / create response — nested media uses lean serializer."""

    author_id = serializers.IntegerField(source="author.id", read_only=True)
    author_relation_label = serializers.SerializerMethodField()
    media = MediaAssetListSerializer(many=True, read_only=True)

    class Meta:
        model = GrowthRecord
        fields = (
            "id",
            "title",
            "content",
            "author_id",
            "author_relation_label",
            "created_at",
            "updated_at",
            "media",
        )
        read_only_fields = (
            "id",
            "author_id",
            "author_relation_label",
            "created_at",
            "updated_at",
            "media",
        )

    def get_author_relation_label(self, obj: GrowthRecord) -> str:
        labels = self.context.get("author_labels") or {}
        return labels.get(obj.author_id, "")


class GrowthRecordDetailSerializer(GrowthRecordSerializer):
    """Record detail / patch — nested media includes EXIF columns."""

    media = MediaAssetSerializer(many=True, read_only=True)

class GrowthRecordWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = GrowthRecord
        fields = ("title", "content")


class MediaPresignSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    media_type = serializers.ChoiceField(choices=MediaAsset.MediaType.choices)
    record_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    album_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)

    def validate(self, attrs):
        media_type = attrs["media_type"]
        record_id = attrs.get("record_id")
        album_id = attrs.get("album_id")
        if media_type == MediaAsset.MediaType.AUDIO:
            if not record_id:
                raise serializers.ValidationError(
                    {"record_id": "语音必须挂在成长记录上。"},
                )
            if album_id:
                raise serializers.ValidationError(
                    {"album_id": "语音不能上传到相册。"},
                )
            return attrs
        if record_id and album_id:
            raise serializers.ValidationError("record_id 与 album_id 不能同时指定。")
        return attrs


class MediaCompleteSerializer(serializers.Serializer):
    object_key = serializers.CharField(max_length=500)
    media_type = serializers.ChoiceField(choices=MediaAsset.MediaType.choices)
    record_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    album_id = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    exif = serializers.JSONField(required=False, allow_null=True)
    thumbnail_object_key = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        default="",
    )
    for_comment = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        media_type = attrs["media_type"]
        record_id = attrs.get("record_id")
        album_id = attrs.get("album_id")
        for_comment = bool(attrs.get("for_comment"))
        if for_comment and media_type != MediaAsset.MediaType.AUDIO:
            raise serializers.ValidationError(
                {"for_comment": "仅语音可作为评论附件。"},
            )
        if media_type == MediaAsset.MediaType.AUDIO:
            if not record_id:
                raise serializers.ValidationError(
                    {"record_id": "语音必须挂在成长记录上。"},
                )
            if album_id:
                raise serializers.ValidationError(
                    {"album_id": "语音不能上传到相册。"},
                )
            return attrs
        if record_id and album_id:
            raise serializers.ValidationError("record_id 与 album_id 不能同时指定。")
        return attrs


class AlbumSerializer(serializers.ModelSerializer):
    cover_url = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Album
        fields = (
            "id",
            "title",
            "description",
            "cover_url",
            "item_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_cover_url(self, obj: Album) -> str:
        cover = obj.cover
        if cover is None:
            cover = getattr(obj, "_first_cover", None)
        if cover is None:
            return ""
        from django.conf import settings

        file_url = (
            public_url_for_key(cover.object_key)
            if settings.STORAGE_BACKEND == "local"
            else (cover.file_url or public_url_for_key(cover.object_key))
        )
        built = build_thumbnail_url(cover.object_key, cover.media_type, file_url)
        return built or file_url


class AlbumWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=120, trim_whitespace=True)
    description = serializers.CharField(
        max_length=2000,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )


class AlbumAddItemsSerializer(serializers.Serializer):
    media_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        min_length=1,
        max_length=100,
    )


class CommentSerializer(serializers.ModelSerializer):
    author_id = serializers.IntegerField(source="author.id", read_only=True)
    author_relation_label = serializers.SerializerMethodField()
    audio = MediaAssetAudioSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = (
            "id",
            "author_id",
            "author_relation_label",
            "record_id",
            "media_id",
            "body",
            "audio",
            "created_at",
        )
        read_only_fields = fields

    def get_author_relation_label(self, obj: Comment) -> str:
        labels = self.context.get("author_labels") or {}
        return labels.get(obj.author_id, "")


class CommentWriteSerializer(serializers.Serializer):
    body = serializers.CharField(
        max_length=5000,
        trim_whitespace=True,
        required=False,
        allow_blank=True,
        default="",
    )
    audio_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        body = (attrs.get("body") or "").strip()
        audio_id = attrs.get("audio_id")
        if not body and not audio_id:
            raise serializers.ValidationError("评论须包含文字或语音。")
        attrs["body"] = body
        return attrs
