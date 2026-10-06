import uuid
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.clan.models import Membership, Workspace
from apps.clan.serializers import MembershipSerializer
from apps.clan.services.storage import public_url, save_local_object

from .permissions import IsStaff
from .serializers import (
    ManageMembershipCreateSerializer,
    ManageMembershipSerializer,
    ManageUserCreateSerializer,
    ManageUserSerializer,
    ManageWorkspaceSerializer,
)


def _avatar_content_type(upload) -> str | None:
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


class ManageUserListCreateView(ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get_queryset(self):
        return get_user_model().objects.order_by("id")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ManageUserCreateSerializer
        return ManageUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = ManageUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            ManageUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class ManageWorkspaceListCreateView(ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsStaff]
    queryset = Workspace.objects.order_by("id")
    serializer_class = ManageWorkspaceSerializer


class ManageWorkspaceDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsStaff]
    queryset = Workspace.objects.all()
    serializer_class = ManageWorkspaceSerializer
    http_method_names = ["get", "patch", "head", "options"]


class ManageWorkspaceAvatarView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk: int):
        try:
            ws = Workspace.objects.get(pk=pk)
        except Workspace.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)

        upload = request.FILES.get("file") or request.FILES.get("avatar")
        if upload is None:
            return Response(
                {"file": "请选择图片文件。"},
                status=status.HTTP_400_BAD_REQUEST,
            )
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
        object_key = f"workspaces/{ws.id}/avatar/{uuid.uuid4().hex}{ext}"
        body = upload.read()

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

        ws.avatar_url = public_url(object_key)
        ws.save(update_fields=["avatar_url"])
        return Response(ManageWorkspaceSerializer(ws).data)


class ManageMembershipListCreateView(ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def get_queryset(self):
        qs = Membership.objects.select_related("user", "workspace").order_by("id")
        workspace_id = self.request.query_params.get("workspace_id")
        if workspace_id:
            qs = qs.filter(workspace_id=workspace_id)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ManageMembershipCreateSerializer
        return ManageMembershipSerializer

    def create(self, request, *args, **kwargs):
        serializer = ManageMembershipCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        membership = serializer.save()
        membership = Membership.objects.select_related("user").get(pk=membership.pk)
        return Response(
            MembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )
