from rest_framework.permissions import BasePermission


class IsStaff(BasePermission):
    message = "需要实例管理员（is_staff）权限。"

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )
