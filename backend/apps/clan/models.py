from django.conf import settings
from django.db import models


class Workspace(models.Model):
    name = models.CharField(max_length=100)
    baby_name = models.CharField(max_length=50)
    baby_birthday = models.DateField(null=True, blank=True)
    avatar_url = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.name} ({self.baby_name})"


class Membership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Viewer"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(max_length=10, choices=Role.choices)
    relation_label = models.CharField(max_length=20)
    display_name = models.CharField(max_length=50, blank=True)
    avatar_url = models.CharField(max_length=500, blank=True)
    bio = models.CharField(max_length=200, blank=True)
    generation = models.SmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "workspace"],
                name="uniq_user_workspace",
            ),
        ]
        indexes = [
            models.Index(fields=["workspace"]),
        ]
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.user} @ {self.workspace} ({self.role}/{self.relation_label})"


class KinshipLink(models.Model):
    class LinkKind(models.TextChoices):
        TO_BABY = "to_baby", "To baby"
        PEER = "peer", "Peer"

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="kinship_links",
    )
    from_membership = models.ForeignKey(
        Membership,
        on_delete=models.CASCADE,
        related_name="links_from",
        null=True,
        blank=True,
    )
    to_membership = models.ForeignKey(
        Membership,
        on_delete=models.CASCADE,
        related_name="links_to",
        null=True,
        blank=True,
    )
    to_baby = models.BooleanField(default=False)
    label = models.CharField(max_length=40)
    link_kind = models.CharField(max_length=10, choices=LinkKind.choices)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_kinship_links",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["workspace"]),
            models.Index(fields=["workspace", "link_kind"]),
        ]
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(
                        link_kind="to_baby",
                        to_baby=True,
                        from_membership__isnull=False,
                        to_membership__isnull=True,
                    )
                    | models.Q(
                        link_kind="peer",
                        to_baby=False,
                        from_membership__isnull=False,
                        to_membership__isnull=False,
                    )
                ),
                name="kinship_link_shape",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.link_kind}:{self.label} @ ws={self.workspace_id}"


class GrowthRecord(models.Model):
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="records",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="authored_records",
    )
    title = models.CharField(max_length=200, blank=True)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["workspace", "-created_at"]),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        label = self.title or f"Record #{self.pk}"
        return f"{label} @ {self.workspace_id}"


class MediaAsset(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"

    record = models.ForeignKey(
        GrowthRecord,
        on_delete=models.CASCADE,
        related_name="media",
        null=True,
        blank=True,
    )
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="media",
    )
    object_key = models.CharField(max_length=500, unique=True)
    file_url = models.CharField(max_length=500)
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    thumbnail_url = models.CharField(max_length=500, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    taken_at = models.DateTimeField(null=True, blank=True)
    camera_make = models.CharField(max_length=100, blank=True)
    camera_model = models.CharField(max_length=100, blank=True)
    orientation = models.PositiveSmallIntegerField(null=True, blank=True)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
    )
    exif_json = models.JSONField(default=dict, blank=True)
    # Voice comments reuse MediaAsset storage but must not appear in post media.
    for_comment = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["record"]),
            models.Index(fields=["workspace"]),
            models.Index(fields=["workspace", "taken_at"]),
            models.Index(fields=["record", "for_comment"]),
        ]
        ordering = ["id"]

    def __str__(self) -> str:
        return f"{self.media_type}:{self.object_key}"


class Album(models.Model):
    """User-managed photo album within a Workspace."""

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="albums",
    )
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    cover = models.ForeignKey(
        "MediaAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="covering_albums",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_albums",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["workspace", "-updated_at"]),
        ]
        ordering = ["-updated_at", "-id"]

    def __str__(self) -> str:
        return f"Album#{self.pk}:{self.title}"


class AlbumItem(models.Model):
    """MediaAsset membership in an Album (post photos or album uploads)."""

    album = models.ForeignKey(
        Album,
        on_delete=models.CASCADE,
        related_name="items",
    )
    media = models.ForeignKey(
        MediaAsset,
        on_delete=models.CASCADE,
        related_name="album_items",
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="album_items_added",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["album", "media"],
                name="album_item_unique_media",
            ),
        ]
        indexes = [
            models.Index(fields=["album", "sort_order", "id"]),
        ]
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return f"AlbumItem album={self.album_id} media={self.media_id}"


class Comment(models.Model):
    """Workspace-scoped comment on a GrowthRecord or MediaAsset."""

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="comments",
    )
    record = models.ForeignKey(
        GrowthRecord,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    media = models.ForeignKey(
        MediaAsset,
        on_delete=models.CASCADE,
        related_name="comments",
        null=True,
        blank=True,
    )
    body = models.TextField(blank=True, default="")
    audio = models.ForeignKey(
        MediaAsset,
        on_delete=models.SET_NULL,
        related_name="voice_comments",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["workspace", "-created_at"]),
            models.Index(fields=["record", "-created_at"]),
            models.Index(fields=["media", "-created_at"]),
        ]
        ordering = ["created_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(record__isnull=False, media__isnull=True)
                    | models.Q(record__isnull=True, media__isnull=False)
                ),
                name="comment_exactly_one_target",
            ),
        ]

    def __str__(self) -> str:
        target = f"record={self.record_id}" if self.record_id else f"media={self.media_id}"
        return f"Comment#{self.pk} ({target})"
