import logging
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import (
    DestroyAPIView,
    ListAPIView,
    ListCreateAPIView,
    UpdateAPIView,
)
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import BaseParser, FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

media_log = logging.getLogger("apps.clan.media")


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


class BinaryPassthroughParser(BaseParser):
    media_type = "*/*"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()

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
from .permissions import (
    CanDeleteComment,
    CanModifyGrowthRecord,
    CanPostComment,
    CanUploadWorkspaceMedia,
    IsWorkspaceEditor,
    IsWorkspaceMember,
    IsWorkspaceOwner,
)
from .serializers import (
    AlbumAddItemsSerializer,
    AlbumSerializer,
    AlbumWriteSerializer,
    CommentSerializer,
    CommentWriteSerializer,
    GrowthRecordDetailSerializer,
    GrowthRecordSerializer,
    GrowthRecordWriteSerializer,
    KinshipCreateSerializer,
    KinshipLinkSerializer,
    KinshipUpdateSerializer,
    MediaAssetListSerializer,
    MediaAssetSerializer,
    MediaCompleteSerializer,
    MediaPresignSerializer,
    MembershipInviteSerializer,
    MembershipMeUpdateSerializer,
    MembershipSerializer,
    MembershipUpdateSerializer,
    WorkspaceCreateSerializer,
    WorkspaceUpdateSerializer,
    WorkspaceWithMembershipSerializer,
)
from .services.kinship import create_membership_with_kinship, sync_to_baby_link
from .services.workspace_summary import (
    build_enriched_workspaces_for_user,
    enrich_single_workspace,
)
from .services import (
    expected_key_prefix,
    make_album_object_key,
    make_library_object_key,
    make_object_key,
    normalize_exif,
    presign_put,
    public_url,
    thumbnail_url,
)
from .services.storage import save_local_object, verify_local_put_signature

User = get_user_model()


class WorkspaceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = build_enriched_workspaces_for_user(request.user)
        return Response(WorkspaceWithMembershipSerializer(data, many=True).data)

    def post(self, request):
        if not request.user.is_staff:
            raise PermissionDenied("仅管理员可创建宝宝空间，请联系管理员。")
        ser = WorkspaceCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        baby_name = data["baby_name"]
        name = (data.get("name") or "").strip() or f"{baby_name}的空间"
        birthday = data.get("baby_birthday")
        relation_label = data["relation_label"]

        from django.db import transaction

        with transaction.atomic():
            workspace = Workspace.objects.create(
                name=name,
                baby_name=baby_name,
                baby_birthday=birthday,
                avatar_url="",
            )
            membership = create_membership_with_kinship(
                user_id=request.user.id,
                workspace_id=workspace.id,
                role=Membership.Role.OWNER,
                relation_label=relation_label,
                created_by=request.user,
            )

        payload = enrich_single_workspace(
            workspace=workspace,
            membership=membership,
        )
        return Response(
            WorkspaceWithMembershipSerializer(payload).data,
            status=status.HTTP_201_CREATED,
        )


class WorkspaceDetailView(APIView):
    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsAuthenticated(), IsWorkspaceOwner()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request, pk: int):
        membership = request.membership
        ws = membership.workspace
        payload = enrich_single_workspace(workspace=ws, membership=membership)
        return Response(WorkspaceWithMembershipSerializer(payload).data)

    def patch(self, request, pk: int):
        ws = request.workspace
        serializer = WorkspaceUpdateSerializer(ws, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        payload = enrich_single_workspace(
            workspace=ws,
            membership=request.membership,
        )
        return Response(WorkspaceWithMembershipSerializer(payload).data)


class WorkspaceAvatarView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, workspace_id: int):
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
            media_log.warning(
                "workspace-avatar too large ws=%s %s bytes=%s",
                workspace_id,
                _media_user(request),
                upload.size,
            )
            return Response(
                {"file": "图片请小于 12MB（前端会自动压缩）。"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ext = Path(upload.name or "").suffix.lower()
        if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            ext = ".jpg"
        ws = request.workspace
        object_key = f"workspaces/{ws.id}/avatar/{uuid.uuid4().hex}{ext}"
        body = upload.read()

        media_log.info(
            "workspace-avatar start ws=%s %s backend=%s content_type=%s "
            "filename=%s bytes=%s",
            workspace_id,
            _media_user(request),
            settings.STORAGE_BACKEND,
            content_type,
            upload.name,
            len(body),
        )

        if settings.STORAGE_BACKEND == "oss":
            from .services.storage import _oss_client

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
        payload = enrich_single_workspace(
            workspace=ws,
            membership=request.membership,
        )
        media_log.info(
            "workspace-avatar ok ws=%s %s key=%s",
            workspace_id,
            _media_user(request),
            object_key,
        )
        return Response(WorkspaceWithMembershipSerializer(payload).data)


class MembershipListView(ListAPIView):
    permission_classes = [IsAuthenticated, IsWorkspaceMember]
    serializer_class = MembershipSerializer

    def get_queryset(self):
        return (
            Membership.objects.select_related("user")
            .filter(workspace_id=self.kwargs["workspace_id"])
            .order_by("id")
        )


class MembershipInviteView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request, workspace_id: int):
        serializer = MembershipInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        username = data["username"].strip()
        password = (data.get("password") or "").strip()
        role = data["role"]
        relation_label = data["relation_label"]
        anchor_membership_id = data.get("anchor_membership_id")
        anchor_label = (data.get("anchor_label") or "").strip()

        existing_count = Membership.objects.filter(workspace_id=workspace_id).count()
        if existing_count > 0 and (
            not anchor_membership_id or not anchor_label
        ):
            raise ValidationError(
                {
                    "anchor_membership_id": "空间已有成员时，必须选择相对谁以及关系标签。",
                    "anchor_label": "空间已有成员时，必须填写相对关系。",
                }
            )

        user = User.objects.filter(username=username).first()
        if user is None:
            if not password:
                raise ValidationError({"password": "新用户必须提供初始密码。"})
            user = User.objects.create_user(
                username=username,
                password=password,
                email="",
            )
        elif Membership.objects.filter(user=user, workspace_id=workspace_id).exists():
            raise ValidationError("该用户已是此 Workspace 成员。")

        membership = create_membership_with_kinship(
            user_id=user.id,
            workspace_id=workspace_id,
            role=role,
            relation_label=relation_label,
            created_by=request.user,
            anchor_membership_id=anchor_membership_id,
            anchor_label=anchor_label,
        )
        membership = Membership.objects.select_related("user").get(pk=membership.pk)
        return Response(
            MembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED,
        )


class MembershipMeView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceMember]

    def patch(self, request, workspace_id: int):
        membership = request.membership
        serializer = MembershipMeUpdateSerializer(
            membership,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        membership = Membership.objects.select_related("user").get(pk=membership.pk)
        return Response(MembershipSerializer(membership).data)


class MembershipDetailView(UpdateAPIView, DestroyAPIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]
    serializer_class = MembershipUpdateSerializer
    http_method_names = ["patch", "delete", "head", "options"]

    def get_queryset(self):
        return Membership.objects.filter(workspace_id=self.kwargs["workspace_id"])

    def get_object(self):
        try:
            return self.get_queryset().select_related("user").get(pk=self.kwargs["mid"])
        except Membership.DoesNotExist as exc:
            raise NotFound("成员不存在。") from exc

    def perform_update(self, serializer):
        membership: Membership = serializer.instance
        new_role = serializer.validated_data.get("role", membership.role)

        if (
            membership.role == Membership.Role.OWNER
            and new_role != Membership.Role.OWNER
        ):
            owner_count = Membership.objects.filter(
                workspace_id=membership.workspace_id,
                role=Membership.Role.OWNER,
            ).count()
            if owner_count <= 1:
                raise ValidationError({"role": "不能降级最后一个 owner。"})

        serializer.save()
        sync_to_baby_link(membership, created_by=self.request.user)

    def patch(self, request, *args, **kwargs):
        super().partial_update(request, *args, **kwargs)
        membership = self.get_object()
        return Response(MembershipSerializer(membership).data, status=status.HTTP_200_OK)

    def perform_destroy(self, instance: Membership):
        if instance.role == Membership.Role.OWNER:
            owner_count = Membership.objects.filter(
                workspace_id=instance.workspace_id,
                role=Membership.Role.OWNER,
            ).count()
            if owner_count <= 1:
                raise ValidationError({"detail": "不能移除最后一个 owner。"})
        instance.delete()


class WorkspaceGraphView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceMember]

    def get(self, request, workspace_id: int):
        ws = request.workspace
        members = list(
            Membership.objects.select_related("user", "user__profile")
            .filter(workspace_id=workspace_id)
            .order_by("id")
        )
        links = list(
            KinshipLink.objects.filter(workspace_id=workspace_id).order_by("id")
        )
        baby_id = f"ws_{ws.id}"
        nodes = []
        for m in members:
            profile = getattr(m.user, "profile", None)
            display = (
                m.display_name
                or (profile.display_name if profile and profile.display_name else "")
                or m.user.username
            )
            avatar = m.avatar_url or (profile.avatar_url if profile else "") or ""
            bio = m.bio or (profile.bio if profile else "") or ""
            nodes.append(
                {
                    "id": f"m_{m.id}",
                    "membership_id": m.id,
                    "user_id": m.user_id,
                    "username": m.user.username,
                    "display_name": display,
                    "relation_to_baby": m.relation_label,
                    "avatar_url": avatar,
                    "bio": bio,
                    "generation": m.generation,
                    "role": m.role,
                }
            )
        link_payload = []
        for link in links:
            if link.link_kind == KinshipLink.LinkKind.TO_BABY and link.from_membership_id:
                link_payload.append(
                    {
                        "id": link.id,
                        "kind": link.link_kind,
                        "source": f"m_{link.from_membership_id}",
                        "target": baby_id,
                        "label": link.label,
                    }
                )
            elif (
                link.link_kind == KinshipLink.LinkKind.PEER
                and link.from_membership_id
                and link.to_membership_id
            ):
                link_payload.append(
                    {
                        "id": link.id,
                        "kind": link.link_kind,
                        "source": f"m_{link.from_membership_id}",
                        "target": f"m_{link.to_membership_id}",
                        "label": link.label,
                    }
                )
        return Response(
            {
                "baby": {
                    "id": baby_id,
                    "name": ws.baby_name,
                    "birthday": ws.baby_birthday,
                    "avatar_url": ws.avatar_url,
                },
                "nodes": nodes,
                "links": link_payload,
            }
        )


class KinshipListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def post(self, request, workspace_id: int):
        serializer = KinshipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        from_id = data["from_membership_id"]
        to_id = data["to_membership_id"]
        label = data["label"].strip()
        member_ids = set(
            Membership.objects.filter(workspace_id=workspace_id).values_list(
                "id", flat=True
            )
        )
        if from_id not in member_ids or to_id not in member_ids:
            raise ValidationError("关系两端必须是本工作区成员。")
        link = KinshipLink.objects.create(
            workspace_id=workspace_id,
            from_membership_id=from_id,
            to_membership_id=to_id,
            to_baby=False,
            label=label,
            link_kind=KinshipLink.LinkKind.PEER,
            created_by=request.user,
        )
        return Response(
            KinshipLinkSerializer(link).data,
            status=status.HTTP_201_CREATED,
        )


class KinshipDetailView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceOwner]

    def get_object(self, workspace_id: int, kid: int) -> KinshipLink:
        try:
            return KinshipLink.objects.get(pk=kid, workspace_id=workspace_id)
        except KinshipLink.DoesNotExist as exc:
            raise NotFound("关系不存在。") from exc

    def patch(self, request, workspace_id: int, kid: int):
        link = self.get_object(workspace_id, kid)
        if link.link_kind != KinshipLink.LinkKind.PEER:
            raise ValidationError("对宝宝的关系请通过成员称呼修改。")
        serializer = KinshipUpdateSerializer(link, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(KinshipLinkSerializer(link).data)

    def delete(self, request, workspace_id: int, kid: int):
        link = self.get_object(workspace_id, kid)
        if link.link_kind != KinshipLink.LinkKind.PEER:
            raise ValidationError("不能删除对宝宝的基础关系边。")
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecordPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50


def author_labels_for_workspace(workspace_id: int) -> dict[int, str]:
    return {
        m.user_id: m.relation_label
        for m in Membership.objects.filter(workspace_id=workspace_id).only(
            "user_id",
            "relation_label",
        )
    }


def author_avatars_for_workspace(workspace_id: int) -> dict[int, str]:
    """Membership avatar overrides profile avatar; empty if neither set."""
    out: dict[int, str] = {}
    qs = Membership.objects.filter(workspace_id=workspace_id).select_related(
        "user__profile",
    )
    for m in qs:
        profile = getattr(m.user, "profile", None)
        url = (
            (m.avatar_url or "").strip()
            or ((profile.avatar_url or "").strip() if profile else "")
        )
        if url:
            out[m.user_id] = url
    return out


def record_author_context(workspace_id: int) -> dict:
    return {
        "author_labels": author_labels_for_workspace(workspace_id),
        "author_avatars": author_avatars_for_workspace(workspace_id),
    }


class GrowthRecordListCreateView(ListCreateAPIView):
    pagination_class = RecordPagination

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceEditor()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get_queryset(self):
        post_media = Prefetch(
            "media",
            queryset=MediaAsset.objects.filter(for_comment=False),
        )
        return (
            GrowthRecord.objects.select_related("author")
            .prefetch_related(post_media)
            .filter(workspace_id=self.kwargs["workspace_id"])
            .order_by("-created_at", "-id")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return GrowthRecordWriteSerializer
        return GrowthRecordSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx.update(record_author_context(self.kwargs["workspace_id"]))
        return ctx

    def create(self, request, *args, **kwargs):
        write = GrowthRecordWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        record = GrowthRecord.objects.create(
            workspace_id=self.kwargs["workspace_id"],
            author=request.user,
            title=write.validated_data.get("title", ""),
            content=write.validated_data.get("content", ""),
        )
        return Response(
            GrowthRecordSerializer(
                record,
                context=record_author_context(self.kwargs["workspace_id"]),
            ).data,
            status=status.HTTP_201_CREATED,
        )


class GrowthRecordDetailView(APIView):
    http_method_names = ["get", "patch", "delete", "head", "options"]
    permission_classes = [IsAuthenticated, CanModifyGrowthRecord]

    def get_queryset(self):
        post_media = Prefetch(
            "media",
            queryset=MediaAsset.objects.filter(for_comment=False),
        )
        return (
            GrowthRecord.objects.select_related("author")
            .prefetch_related(post_media)
            .filter(workspace_id=self.kwargs["workspace_id"])
        )

    def get_object(self):
        try:
            obj = self.get_queryset().get(pk=self.kwargs["rid"])
        except GrowthRecord.DoesNotExist as exc:
            raise NotFound("记录不存在。") from exc
        self.check_object_permissions(self.request, obj)
        return obj

    def get_serializer_context(self):
        return {
            "request": self.request,
            **record_author_context(self.kwargs["workspace_id"]),
        }

    def get(self, request, *args, **kwargs):
        record = self.get_object()
        return Response(
            GrowthRecordDetailSerializer(
                record,
                context=self.get_serializer_context(),
            ).data,
        )

    def patch(self, request, *args, **kwargs):
        record = self.get_object()
        write = GrowthRecordWriteSerializer(record, data=request.data, partial=True)
        write.is_valid(raise_exception=True)
        write.save()
        return Response(
            GrowthRecordDetailSerializer(
                record,
                context=self.get_serializer_context(),
            ).data,
        )

    def delete(self, request, *args, **kwargs):
        record = self.get_object()
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _get_record_in_workspace(workspace_id: int, record_id: int) -> GrowthRecord:
    try:
        return GrowthRecord.objects.get(pk=record_id, workspace_id=workspace_id)
    except GrowthRecord.DoesNotExist as exc:
        raise NotFound("记录不存在。") from exc


def _get_album_in_workspace(workspace_id: int, album_id: int) -> Album:
    try:
        return Album.objects.get(pk=album_id, workspace_id=workspace_id)
    except Album.DoesNotExist as exc:
        raise NotFound("相册不存在。") from exc


def _object_key_prefix_for_complete(
    *,
    workspace_id: int,
    record_id: int | None,
    album_id: int | None,
) -> str:
    if record_id:
        return f"workspaces/{workspace_id}/records/{record_id}/"
    if album_id:
        return f"workspaces/{workspace_id}/albums/{album_id}/"
    return f"workspaces/{workspace_id}/library/"


def _upload_url_safe(url: str) -> str:
    """Log host+path only (strip signature query)."""
    try:
        parts = urlsplit(url)
        if parts.scheme and parts.netloc:
            return f"{parts.scheme}://{parts.netloc}{parts.path}"
        return parts.path or url[:120]
    except Exception:
        return url[:120]


def _media_user(request) -> str:
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return f"user={user.pk}"
    return "user=anonymous"


class MediaPresignView(APIView):
    permission_classes = [IsAuthenticated, CanUploadWorkspaceMedia]

    def post(self, request, workspace_id: int):
        ser = MediaPresignSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        record_id = data.get("record_id")
        album_id = data.get("album_id")
        backend = settings.STORAGE_BACKEND

        media_log.info(
            "presign start ws=%s %s backend=%s media_type=%s content_type=%s "
            "filename=%s record_id=%s album_id=%s",
            workspace_id,
            _media_user(request),
            backend,
            data.get("media_type"),
            data.get("content_type"),
            data.get("filename"),
            record_id,
            album_id,
        )

        if record_id:
            record = _get_record_in_workspace(workspace_id, record_id)
            object_key = make_object_key(workspace_id, record.id, data["filename"])
        elif album_id:
            album = _get_album_in_workspace(workspace_id, album_id)
            object_key = make_album_object_key(workspace_id, album.id, data["filename"])
        else:
            if data["media_type"] == MediaAsset.MediaType.AUDIO:
                media_log.warning(
                    "presign reject audio without record ws=%s %s",
                    workspace_id,
                    _media_user(request),
                )
                raise ValidationError({"record_id": "语音必须挂在成长记录上。"})
            object_key = make_library_object_key(workspace_id, data["filename"])

        try:
            payload = presign_put(
                workspace_id=workspace_id,
                object_key=object_key,
                content_type=data["content_type"],
            )
        except RuntimeError as exc:
            media_log.exception(
                "presign failed ws=%s %s key=%s err=%s",
                workspace_id,
                _media_user(request),
                object_key,
                exc,
            )
            raise ValidationError({"detail": str(exc)}) from exc

        media_log.info(
            "presign ok ws=%s %s backend=%s key=%s upload=%s",
            workspace_id,
            _media_user(request),
            backend,
            object_key,
            _upload_url_safe(payload.get("upload_url", "")),
        )
        return Response(payload)


class MediaCompleteView(APIView):
    permission_classes = [IsAuthenticated, CanUploadWorkspaceMedia]

    def post(self, request, workspace_id: int):
        ser = MediaCompleteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data
        record_id = data.get("record_id")
        album_id = data.get("album_id")
        object_key = data["object_key"]
        media_type = data["media_type"]

        media_log.info(
            "complete start ws=%s %s backend=%s media_type=%s key=%s "
            "record_id=%s album_id=%s has_exif=%s thumb_key=%s",
            workspace_id,
            _media_user(request),
            settings.STORAGE_BACKEND,
            media_type,
            object_key,
            record_id,
            album_id,
            bool(data.get("exif")),
            (data.get("thumbnail_object_key") or "")[:80] or "-",
        )

        record = (
            _get_record_in_workspace(workspace_id, record_id) if record_id else None
        )
        album = _get_album_in_workspace(workspace_id, album_id) if album_id else None

        prefix = expected_key_prefix(workspace_id)
        if not object_key.startswith(prefix):
            media_log.warning(
                "complete deny key prefix ws=%s key=%s",
                workspace_id,
                object_key,
            )
            raise PermissionDenied("object_key 不属于该 Workspace。")
        expected_mid = _object_key_prefix_for_complete(
            workspace_id=workspace_id,
            record_id=record.id if record else None,
            album_id=album.id if album else None,
        )
        if not object_key.startswith(expected_mid):
            media_log.warning(
                "complete deny key mid ws=%s key=%s expected_prefix=%s",
                workspace_id,
                object_key,
                expected_mid,
            )
            raise ValidationError({"object_key": "object_key 与目标不匹配。"})
        if MediaAsset.objects.filter(object_key=object_key).exists():
            media_log.warning(
                "complete duplicate key ws=%s key=%s",
                workspace_id,
                object_key,
            )
            raise ValidationError({"object_key": "该对象已登记。"})

        exif_fields = (
            normalize_exif(data.get("exif"))
            if media_type == MediaAsset.MediaType.IMAGE
            else normalize_exif(None)
        )
        file_url = public_url(object_key)
        thumb = thumbnail_url(object_key, media_type, file_url)

        thumb_key = (data.get("thumbnail_object_key") or "").strip()
        if thumb_key:
            if media_type != MediaAsset.MediaType.VIDEO:
                raise ValidationError(
                    {"thumbnail_object_key": "仅视频可附带封面对象。"},
                )
            if not thumb_key.startswith(expected_mid):
                raise ValidationError(
                    {"thumbnail_object_key": "封面 object_key 与目标不匹配。"},
                )
            if thumb_key == object_key:
                raise ValidationError(
                    {"thumbnail_object_key": "封面不能与视频 object_key 相同。"},
                )
            thumb = public_url(thumb_key)

        asset = MediaAsset.objects.create(
            record=record,
            workspace_id=workspace_id,
            object_key=object_key,
            file_url=file_url,
            media_type=media_type,
            thumbnail_url=thumb,
            for_comment=bool(data.get("for_comment")),
            **exif_fields,
        )
        if album is not None:
            next_order = (
                AlbumItem.objects.filter(album=album)
                .order_by("-sort_order")
                .values_list("sort_order", flat=True)
                .first()
                or 0
            )
            AlbumItem.objects.get_or_create(
                album=album,
                media=asset,
                defaults={
                    "added_by": request.user,
                    "sort_order": next_order + 1,
                },
            )
            if album.cover_id is None:
                album.cover = asset
                album.save(update_fields=["cover", "updated_at"])
            else:
                album.save(update_fields=["updated_at"])

        media_log.info(
            "complete ok ws=%s %s asset_id=%s media_type=%s key=%s "
            "file_url=%s width=%s height=%s",
            workspace_id,
            _media_user(request),
            asset.id,
            asset.media_type,
            asset.object_key,
            _upload_url_safe(asset.file_url or ""),
            getattr(asset, "width", None),
            getattr(asset, "height", None),
        )
        return Response(
            MediaAssetSerializer(asset).data,
            status=status.HTTP_201_CREATED,
        )


class MediaLocalPutView(APIView):
    """Local STORAGE_BACKEND equivalent of OSS PUT (signature-gated)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [BinaryPassthroughParser]

    def put(self, request, workspace_id: int):
        object_key = request.query_params.get("object_key", "")
        content_type = request.query_params.get(
            "content_type",
            "application/octet-stream",
        )
        signature = request.query_params.get("signature", "")
        try:
            expires = int(request.query_params.get("expires", "0"))
        except ValueError as exc:
            media_log.warning(
                "local-put bad expires ws=%s key=%s",
                workspace_id,
                object_key,
            )
            raise ValidationError({"detail": "expires 无效。"}) from exc

        media_log.info(
            "local-put start ws=%s backend=%s key=%s content_type=%s "
            "content_length=%s",
            workspace_id,
            settings.STORAGE_BACKEND,
            object_key,
            content_type,
            request.META.get("CONTENT_LENGTH") or request.headers.get("Content-Length"),
        )

        prefix = expected_key_prefix(workspace_id)
        if not object_key.startswith(prefix):
            media_log.warning(
                "local-put deny key ws=%s key=%s",
                workspace_id,
                object_key,
            )
            raise PermissionDenied("object_key 无效。")
        if not verify_local_put_signature(object_key, expires, content_type, signature):
            media_log.warning(
                "local-put bad signature ws=%s key=%s",
                workspace_id,
                object_key,
            )
            raise PermissionDenied("签名无效或已过期。")

        body = request.data if isinstance(request.data, (bytes, bytearray)) else request.body
        if not body:
            media_log.warning("local-put empty body ws=%s key=%s", workspace_id, object_key)
            raise ValidationError({"detail": "空请求体。"})
        save_local_object(object_key, bytes(body))
        media_log.info(
            "local-put ok ws=%s key=%s bytes=%s",
            workspace_id,
            object_key,
            len(body),
        )
        return Response(status=status.HTTP_200_OK)


class MediaPagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = "page_size"
    max_page_size = 100


class CommentPagination(PageNumberPagination):
    page_size = 30
    page_size_query_param = "page_size"
    max_page_size = 100


class MediaLibraryListView(ListAPIView):
    """Workspace media library (views over MediaAsset; no separate upload)."""

    permission_classes = [IsAuthenticated, IsWorkspaceMember]
    serializer_class = MediaAssetListSerializer
    pagination_class = MediaPagination

    def get_queryset(self):
        from django.db.models.functions import Coalesce

        qs = MediaAsset.objects.select_related("record").filter(
            workspace_id=self.kwargs["workspace_id"],
            for_comment=False,
        )
        media_type = self.request.query_params.get("media_type", "image")
        if media_type and media_type != "all":
            qs = qs.filter(media_type=media_type)
        return qs.annotate(
            captured_at_sort=Coalesce("taken_at", "created_at"),
        ).order_by("-captured_at_sort", "-id")


def _resolve_comment_audio(
    *,
    workspace_id: int,
    audio_id: int | None,
    expected_record_id: int,
) -> MediaAsset | None:
    if not audio_id:
        return None
    try:
        asset = MediaAsset.objects.get(pk=audio_id, workspace_id=workspace_id)
    except MediaAsset.DoesNotExist as exc:
        raise ValidationError({"audio_id": "语音媒体不存在。"}) from exc
    if asset.media_type != MediaAsset.MediaType.AUDIO:
        raise ValidationError({"audio_id": "audio_id 必须是 audio 类型。"})
    if asset.record_id != expected_record_id:
        raise ValidationError({"audio_id": "语音必须挂在对应的成长记录上。"})
    if not asset.for_comment:
        asset.for_comment = True
        asset.save(update_fields=["for_comment"])
    return asset


class RecordCommentListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanPostComment()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request, workspace_id: int, rid: int):
        record = _get_record_in_workspace(workspace_id, rid)
        comments = (
            Comment.objects.select_related("author", "audio")
            .filter(workspace_id=workspace_id, record=record)
            .order_by("-created_at", "-id")
        )
        labels = author_labels_for_workspace(workspace_id)
        paginator = CommentPagination()
        page = paginator.paginate_queryset(comments, request, view=self)
        ser = CommentSerializer(page, many=True, context={"author_labels": labels})
        return paginator.get_paginated_response(ser.data)

    def post(self, request, workspace_id: int, rid: int):
        record = _get_record_in_workspace(workspace_id, rid)
        write = CommentWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        audio = _resolve_comment_audio(
            workspace_id=workspace_id,
            audio_id=write.validated_data.get("audio_id"),
            expected_record_id=record.id,
        )
        comment = Comment.objects.create(
            workspace_id=workspace_id,
            author=request.user,
            record=record,
            body=write.validated_data["body"],
            audio=audio,
        )
        labels = author_labels_for_workspace(workspace_id)
        return Response(
            CommentSerializer(comment, context={"author_labels": labels}).data,
            status=status.HTTP_201_CREATED,
        )


class MediaCommentListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), CanPostComment()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def _get_media(self, workspace_id: int, mid: int) -> MediaAsset:
        try:
            return MediaAsset.objects.get(pk=mid, workspace_id=workspace_id)
        except MediaAsset.DoesNotExist as exc:
            raise NotFound("媒体不存在。") from exc

    def get(self, request, workspace_id: int, mid: int):
        media = self._get_media(workspace_id, mid)
        comments = (
            Comment.objects.select_related("author", "audio")
            .filter(workspace_id=workspace_id, media=media)
            .order_by("-created_at", "-id")
        )
        labels = author_labels_for_workspace(workspace_id)
        paginator = CommentPagination()
        page = paginator.paginate_queryset(comments, request, view=self)
        ser = CommentSerializer(page, many=True, context={"author_labels": labels})
        return paginator.get_paginated_response(ser.data)

    def post(self, request, workspace_id: int, mid: int):
        media = self._get_media(workspace_id, mid)
        write = CommentWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        if write.validated_data.get("audio_id") and not media.record_id:
            raise ValidationError(
                {"audio_id": "该照片未关联动态，暂不支持语音评论。"},
            )
        audio = _resolve_comment_audio(
            workspace_id=workspace_id,
            audio_id=write.validated_data.get("audio_id"),
            expected_record_id=media.record_id or 0,
        ) if media.record_id else None
        comment = Comment.objects.create(
            workspace_id=workspace_id,
            author=request.user,
            media=media,
            body=write.validated_data["body"],
            audio=audio,
        )
        labels = author_labels_for_workspace(workspace_id)
        return Response(
            CommentSerializer(comment, context={"author_labels": labels}).data,
            status=status.HTTP_201_CREATED,
        )


class CommentDeleteView(APIView):
    permission_classes = [IsAuthenticated, CanDeleteComment]
    http_method_names = ["delete", "head", "options"]

    def delete(self, request, workspace_id: int, cid: int):
        try:
            comment = Comment.objects.get(pk=cid, workspace_id=workspace_id)
        except Comment.DoesNotExist as exc:
            raise NotFound("评论不存在。") from exc
        self.check_object_permissions(request, comment)
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AlbumPagination(PageNumberPagination):
    page_size = 40
    page_size_query_param = "page_size"
    max_page_size = 100


def _annotate_albums(qs):
    from django.db.models import Count, OuterRef, Subquery

    first_media_id = (
        AlbumItem.objects.filter(album_id=OuterRef("pk"))
        .order_by("sort_order", "id")
        .values("media_id")[:1]
    )
    return qs.annotate(
        item_count=Count("items", distinct=True),
        _first_media_id=Subquery(first_media_id),
    ).select_related("cover")


def _attach_first_covers(albums: list[Album]) -> None:
    need = [a for a in albums if a.cover_id is None and getattr(a, "_first_media_id", None)]
    if not need:
        return
    media_ids = [a._first_media_id for a in need]
    by_id = {
        m.id: m
        for m in MediaAsset.objects.filter(id__in=media_ids)
    }
    for album in need:
        album._first_cover = by_id.get(album._first_media_id)


class AlbumListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceEditor()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request, workspace_id: int):
        albums = list(
            _annotate_albums(
                Album.objects.filter(workspace_id=workspace_id).order_by(
                    "-updated_at",
                    "-id",
                ),
            ),
        )
        _attach_first_covers(albums)
        return Response(AlbumSerializer(albums, many=True).data)

    def post(self, request, workspace_id: int):
        write = AlbumWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        album = Album.objects.create(
            workspace_id=workspace_id,
            title=write.validated_data["title"],
            description=write.validated_data.get("description", ""),
            created_by=request.user,
        )
        album.item_count = 0
        return Response(
            AlbumSerializer(album).data,
            status=status.HTTP_201_CREATED,
        )


class AlbumDetailView(APIView):
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.request.method in ("PATCH", "DELETE"):
            return [IsAuthenticated(), IsWorkspaceEditor()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get_object(self, workspace_id: int, album_id: int) -> Album:
        try:
            album = _annotate_albums(
                Album.objects.filter(workspace_id=workspace_id, pk=album_id),
            ).get()
        except Album.DoesNotExist as exc:
            raise NotFound("相册不存在。") from exc
        _attach_first_covers([album])
        return album

    def get(self, request, workspace_id: int, album_id: int):
        return Response(AlbumSerializer(self.get_object(workspace_id, album_id)).data)

    def patch(self, request, workspace_id: int, album_id: int):
        album = _get_album_in_workspace(workspace_id, album_id)
        write = AlbumWriteSerializer(
            data={
                "title": request.data.get("title", album.title),
                "description": request.data.get(
                    "description",
                    album.description,
                ),
            },
        )
        write.is_valid(raise_exception=True)
        album.title = write.validated_data["title"]
        album.description = write.validated_data.get("description", "")
        album.save(update_fields=["title", "description", "updated_at"])
        annotated = self.get_object(workspace_id, album.id)
        return Response(AlbumSerializer(annotated).data)

    def delete(self, request, workspace_id: int, album_id: int):
        album = _get_album_in_workspace(workspace_id, album_id)
        album.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AlbumItemListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == "POST":
            return [IsAuthenticated(), IsWorkspaceEditor()]
        return [IsAuthenticated(), IsWorkspaceMember()]

    def get(self, request, workspace_id: int, album_id: int):
        album = _get_album_in_workspace(workspace_id, album_id)
        items = (
            AlbumItem.objects.filter(album=album, media__for_comment=False)
            .select_related("media")
            .order_by("sort_order", "id")
        )
        media_list = [item.media for item in items]
        paginator = AlbumPagination()
        page = paginator.paginate_queryset(media_list, request, view=self)
        return paginator.get_paginated_response(
            MediaAssetListSerializer(page, many=True).data,
        )

    def post(self, request, workspace_id: int, album_id: int):
        album = _get_album_in_workspace(workspace_id, album_id)
        write = AlbumAddItemsSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        media_ids = list(dict.fromkeys(write.validated_data["media_ids"]))
        assets = list(
            MediaAsset.objects.filter(
                workspace_id=workspace_id,
                id__in=media_ids,
                for_comment=False,
                media_type__in=[
                    MediaAsset.MediaType.IMAGE,
                    MediaAsset.MediaType.VIDEO,
                ],
            ),
        )
        found = {a.id for a in assets}
        missing = [mid for mid in media_ids if mid not in found]
        if missing:
            raise ValidationError({"media_ids": f"无效媒体：{missing}"})

        next_order = (
            AlbumItem.objects.filter(album=album)
            .order_by("-sort_order")
            .values_list("sort_order", flat=True)
            .first()
            or 0
        )
        created = 0
        cover_changed = False
        for asset in assets:
            _, was_created = AlbumItem.objects.get_or_create(
                album=album,
                media=asset,
                defaults={
                    "added_by": request.user,
                    "sort_order": next_order + 1,
                },
            )
            if was_created:
                next_order += 1
                created += 1
                if album.cover_id is None:
                    album.cover = asset
                    cover_changed = True
        fields = ["updated_at"]
        if cover_changed:
            fields = ["cover", "updated_at"]
        album.save(update_fields=fields)
        return Response({"added": created}, status=status.HTTP_201_CREATED)


class AlbumItemDeleteView(APIView):
    permission_classes = [IsAuthenticated, IsWorkspaceEditor]
    http_method_names = ["delete", "head", "options"]

    def delete(self, request, workspace_id: int, album_id: int, media_id: int):
        album = _get_album_in_workspace(workspace_id, album_id)
        deleted, _ = AlbumItem.objects.filter(
            album=album,
            media_id=media_id,
        ).delete()
        if not deleted:
            raise NotFound("相册中无该照片。")
        if album.cover_id == media_id:
            next_cover = (
                AlbumItem.objects.filter(album=album)
                .order_by("sort_order", "id")
                .select_related("media")
                .first()
            )
            album.cover = next_cover.media if next_cover else None
            album.save(update_fields=["cover", "updated_at"])
        else:
            album.save(update_fields=["updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
