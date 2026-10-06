from django.urls import path

from .views import (
    ManageMembershipListCreateView,
    ManageUserListCreateView,
    ManageWorkspaceAvatarView,
    ManageWorkspaceDetailView,
    ManageWorkspaceListCreateView,
)

urlpatterns = [
    path("users/", ManageUserListCreateView.as_view(), name="manage-users"),
    path(
        "workspaces/",
        ManageWorkspaceListCreateView.as_view(),
        name="manage-workspaces",
    ),
    path(
        "workspaces/<int:pk>/",
        ManageWorkspaceDetailView.as_view(),
        name="manage-workspace-detail",
    ),
    path(
        "workspaces/<int:pk>/avatar/",
        ManageWorkspaceAvatarView.as_view(),
        name="manage-workspace-avatar",
    ),
    path(
        "memberships/",
        ManageMembershipListCreateView.as_view(),
        name="manage-memberships",
    ),
]
