from django.contrib import admin

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


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ("user",)


class MediaAssetInline(admin.TabularInline):
    model = MediaAsset
    extra = 0
    readonly_fields = ("created_at",)


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "baby_name", "baby_birthday", "created_at")
    search_fields = ("name", "baby_name")
    inlines = [MembershipInline]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "workspace",
        "user",
        "role",
        "relation_label",
        "display_name",
        "created_at",
    )
    list_filter = ("role", "workspace")
    search_fields = (
        "user__username",
        "relation_label",
        "display_name",
        "workspace__name",
        "workspace__baby_name",
    )
    autocomplete_fields = ("user", "workspace")


@admin.register(KinshipLink)
class KinshipLinkAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "workspace",
        "link_kind",
        "label",
        "from_membership",
        "to_membership",
        "to_baby",
        "created_at",
    )
    list_filter = ("link_kind", "workspace")
    search_fields = ("label",)
    autocomplete_fields = (
        "workspace",
        "from_membership",
        "to_membership",
        "created_by",
    )


@admin.register(GrowthRecord)
class GrowthRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "workspace", "author", "created_at", "updated_at")
    list_filter = ("workspace",)
    search_fields = ("title", "content", "author__username")
    autocomplete_fields = ("workspace", "author")
    readonly_fields = ("created_at", "updated_at")
    inlines = [MediaAssetInline]


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "media_type",
        "workspace",
        "record",
        "taken_at",
        "latitude",
        "longitude",
        "created_at",
    )
    list_filter = ("media_type", "workspace")
    search_fields = ("object_key", "file_url", "camera_make", "camera_model")
    autocomplete_fields = ("workspace", "record")
    readonly_fields = ("created_at",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "workspace", "author", "record", "media", "audio", "created_at")
    list_filter = ("workspace",)
    search_fields = ("body", "author__username")
    autocomplete_fields = ("workspace", "author", "record", "media", "audio")
    readonly_fields = ("created_at",)


class AlbumItemInline(admin.TabularInline):
    model = AlbumItem
    extra = 0
    autocomplete_fields = ("media", "added_by")


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "workspace", "created_by", "updated_at")
    list_filter = ("workspace",)
    search_fields = ("title",)
    autocomplete_fields = ("workspace", "created_by", "cover")
    inlines = [AlbumItemInline]


@admin.register(AlbumItem)
class AlbumItemAdmin(admin.ModelAdmin):
    list_display = ("id", "album", "media", "sort_order", "added_by", "created_at")
    autocomplete_fields = ("album", "media", "added_by")
    readonly_fields = ("created_at",)
