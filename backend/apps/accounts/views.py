import logging
import uuid
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clan.services.storage import public_url, save_local_object

from .serializers import UserSerializer, UserUpdateSerializer, get_or_create_profile


def _avatar_content_type(upload) -> str | None:
    """Accept empty/octet-stream MIME when extension looks like an image."""
    content_type = (upload.content_type or "").lower().strip()
    if content_type.startswith("image/"):
        return content_type
    if content_type in {"", "application/octet-stream"}:
        ext = Path(upload.name or "").suffix.lower()
        return {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".heic": "image/heic",
            ".heif": "image/heif",
        }.get(ext)
    return None


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get(self, request):
        get_or_create_profile(request.user)
        user = type(request.user).objects.select_related("profile").get(pk=request.user.pk)
        return Response(UserSerializer(user).data)

    def patch(self, request):
        serializer = UserUpdateSerializer(
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.update(request.user, serializer.validated_data)
        user = type(request.user).objects.select_related("profile").get(pk=request.user.pk)
        return Response(UserSerializer(user).data)


class MeAvatarView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get("file") or request.FILES.get("avatar")
        if upload is None:
            return Response({"file": "请选择图片文件。"}, status=status.HTTP_400_BAD_REQUEST)
        content_type = _avatar_content_type(upload)
        if not content_type:
            return Response({"file": "仅支持图片。"}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size and upload.size > 12 * 1024 * 1024:
            return Response(
                {"file": "图片请小于 12MB（前端会自动压缩）。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ext = Path(upload.name or "").suffix.lower()
        if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            ext = ".jpg"
        object_key = f"profiles/{request.user.pk}/{uuid.uuid4().hex}{ext}"
        body = upload.read()

        media_log = logging.getLogger("apps.clan.media")
        media_log.info(
            "user-avatar start user=%s backend=%s content_type=%s "
            "filename=%s bytes=%s",
            request.user.pk,
            settings.STORAGE_BACKEND,
            content_type,
            upload.name,
            len(body),
        )

        if settings.STORAGE_BACKEND == "oss":
            from apps.clan.services.storage import _oss_client

            client = _oss_client()
            client.put_object(
                Bucket=settings.OSS_BUCKET_NAME,
                Key=object_key,
                Body=body,
                ContentType=content_type or "image/jpeg",
            )
        else:
            save_local_object(object_key, body)

        url = public_url(object_key)
        profile = get_or_create_profile(request.user)
        profile.avatar_url = url
        profile.save(update_fields=["avatar_url", "updated_at"])
        user = type(request.user).objects.select_related("profile").get(pk=request.user.pk)
        media_log.info(
            "user-avatar ok user=%s key=%s url=%s",
            request.user.pk,
            object_key,
            url.split("?")[0],
        )
        return Response(UserSerializer(user).data)
