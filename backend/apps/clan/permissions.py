from rest_framework.permissions import BasePermission, SAFE_METHODS

from .models import MediaAsset, Membership


def get_workspace_id(view) -> int | None:
    raw = view.kwargs.get("workspace_id") or view.kwargs.get("pk")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def load_membership(user, workspace_id: int) -> Membership | None:
    if not user or not user.is_authenticated or workspace_id is None:
        return None
    return (
        Membership.objects.select_related("workspace", "user")
        .filter(user=user, workspace_id=workspace_id)
        .first()
    )


class IsWorkspaceMember(BasePermission):
    """Requires Membership for workspace_id (or pk on Workspace detail)."""

    message = "不是该 Workspace 的成员。"

    def has_permission(self, request, view) -> bool:
        workspace_id = get_workspace_id(view)
        membership = load_membership(request.user, workspace_id)
        if membership is None:
            return False
        request.membership = membership
        request.workspace = membership.workspace
        return True


class IsWorkspaceOwner(IsWorkspaceMember):
    message = "需要 owner 权限。"

    def has_permission(self, request, view) -> bool:
        if not super().has_permission(request, view):
            return False
        return request.membership.role == Membership.Role.OWNER


class IsWorkspaceEditor(IsWorkspaceMember):
    """owner 或 editor（写操作）；读仍要求成员。"""

    message = "需要 owner 或 editor 权限。"

    def has_permission(self, request, view) -> bool:
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.membership.role in {
            Membership.Role.OWNER,
            Membership.Role.EDITOR,
        }


class CanModifyGrowthRecord(IsWorkspaceMember):
    """GET：成员；PATCH/DELETE：owner 任意，editor 仅本人记录。"""

    message = "无权修改该记录。"

    def has_permission(self, request, view) -> bool:
        if not super().has_permission(request, view):
            return False
        if request.method in SAFE_METHODS:
            return True
        role = request.membership.role
        if role == Membership.Role.OWNER:
            return True
        if role == Membership.Role.EDITOR:
            return True
        return False

    def has_object_permission(self, request, view, obj) -> bool:
        if request.method in SAFE_METHODS:
            return True
        membership = request.membership
        if membership.role == Membership.Role.OWNER:
            return True
        if membership.role == Membership.Role.EDITOR:
            return obj.author_id == request.user.id
        return False


class CanUploadWorkspaceMedia(IsWorkspaceMember):
    """owner/editor 可上传任意媒体；普通成员仅可上传 audio（语音评论）。"""

    message = "无权上传该类型媒体。"

    def has_permission(self, request, view) -> bool:
        if not super().has_permission(request, view):
            return False
        role = request.membership.role
        if role in {Membership.Role.OWNER, Membership.Role.EDITOR}:
            return True
        media_type = (request.data.get("media_type") or "").strip()
        return media_type == MediaAsset.MediaType.AUDIO


class CanPostComment(IsWorkspaceMember):
    """GET / POST：该 Workspace 全体成员均可。"""

    message = "不是该 Workspace 的成员。"

    def has_permission(self, request, view) -> bool:
        return super().has_permission(request, view)


class CanDeleteComment(IsWorkspaceMember):
    """删除：作者本人或 owner。"""

    message = "无权删除该评论。"

    def has_object_permission(self, request, view, obj) -> bool:
        if request.membership.role == Membership.Role.OWNER:
            return True
        return obj.author_id == request.user.id
