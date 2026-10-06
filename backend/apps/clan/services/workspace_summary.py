"""Workspace list enrichment: counts + latest memory summary."""

from __future__ import annotations

from django.db.models import Count, Max, Q

from apps.clan.models import GrowthRecord, MediaAsset, Membership, Workspace
from apps.clan.services.storage import public_url, thumbnail_url


PREVIEW_LEN = 48


def _content_preview(content: str) -> str:
    text = (content or "").strip().replace("\n", " ")
    if not text:
        return ""
    if len(text) <= PREVIEW_LEN:
        return text
    return f"{text[:PREVIEW_LEN]}…"


def _cover_for_record(record: GrowthRecord) -> tuple[str, str]:
    """Return (cover_thumbnail_url, cover_media_type) for a record's first visual."""
    asset = (
        MediaAsset.objects.filter(
            record_id=record.id,
            media_type__in=(
                MediaAsset.MediaType.IMAGE,
                MediaAsset.MediaType.VIDEO,
            ),
        )
        .order_by("id")
        .first()
    )
    if asset is None:
        return "", ""
    file_url = public_url(asset.object_key)
    thumb = thumbnail_url(asset.object_key, asset.media_type, file_url)
    if not thumb:
        thumb = (asset.thumbnail_url or "").strip()
    return thumb, asset.media_type


def enrich_workspace_payload(
    *,
    workspace: Workspace,
    my_role: str,
    my_relation_label: str,
    photo_count: int = 0,
    video_count: int = 0,
    member_count: int = 0,
    last_record_at=None,
    latest_record: GrowthRecord | None = None,
) -> dict:
    last_activity = last_record_at or workspace.created_at
    if last_record_at and workspace.created_at:
        last_activity = max(last_record_at, workspace.created_at)

    latest_memory = None
    if latest_record is not None:
        cover_url, cover_type = _cover_for_record(latest_record)
        latest_memory = {
            "id": latest_record.id,
            "content_preview": _content_preview(latest_record.content),
            "created_at": latest_record.created_at,
            "cover_thumbnail_url": cover_url,
            "cover_media_type": cover_type,
        }

    return {
        "id": workspace.id,
        "name": workspace.name,
        "baby_name": workspace.baby_name,
        "baby_birthday": workspace.baby_birthday,
        "avatar_url": workspace.avatar_url,
        "created_at": workspace.created_at,
        "my_role": my_role,
        "my_relation_label": my_relation_label,
        "photo_count": photo_count,
        "video_count": video_count,
        "member_count": member_count,
        "last_activity_at": last_activity,
        "latest_memory": latest_memory,
    }


def build_enriched_workspaces_for_user(user) -> list[dict]:
    memberships = (
        Membership.objects.select_related("workspace")
        .filter(user=user)
        .order_by("workspace_id")
    )
    ws_ids = [m.workspace_id for m in memberships]
    if not ws_ids:
        return []

    media_stats = {
        row["workspace_id"]: row
        for row in MediaAsset.objects.filter(workspace_id__in=ws_ids)
        .values("workspace_id")
        .annotate(
            photo_count=Count("id", filter=Q(media_type=MediaAsset.MediaType.IMAGE)),
            video_count=Count("id", filter=Q(media_type=MediaAsset.MediaType.VIDEO)),
        )
    }
    member_stats = {
        row["workspace_id"]: row["member_count"]
        for row in Membership.objects.filter(workspace_id__in=ws_ids)
        .values("workspace_id")
        .annotate(member_count=Count("id"))
    }
    activity_stats = {
        row["workspace_id"]: row["last_record_at"]
        for row in GrowthRecord.objects.filter(workspace_id__in=ws_ids)
        .values("workspace_id")
        .annotate(last_record_at=Max("created_at"))
    }

    # Latest record per workspace (one query, pick max created_at per ws in Python).
    latest_by_ws: dict[int, GrowthRecord] = {}
    for record in (
        GrowthRecord.objects.filter(workspace_id__in=ws_ids)
        .order_by("workspace_id", "-created_at", "-id")
        .only("id", "workspace_id", "content", "created_at")
    ):
        if record.workspace_id not in latest_by_ws:
            latest_by_ws[record.workspace_id] = record

    out: list[dict] = []
    for m in memberships:
        wid = m.workspace_id
        media = media_stats.get(wid, {})
        out.append(
            enrich_workspace_payload(
                workspace=m.workspace,
                my_role=m.role,
                my_relation_label=m.relation_label,
                photo_count=int(media.get("photo_count") or 0),
                video_count=int(media.get("video_count") or 0),
                member_count=int(member_stats.get(wid) or 0),
                last_record_at=activity_stats.get(wid),
                latest_record=latest_by_ws.get(wid),
            )
        )
    return out


def enrich_single_workspace(*, workspace: Workspace, membership: Membership) -> dict:
    media = MediaAsset.objects.filter(workspace_id=workspace.id).aggregate(
        photo_count=Count("id", filter=Q(media_type=MediaAsset.MediaType.IMAGE)),
        video_count=Count("id", filter=Q(media_type=MediaAsset.MediaType.VIDEO)),
    )
    member_count = Membership.objects.filter(workspace_id=workspace.id).count()
    last_record_at = (
        GrowthRecord.objects.filter(workspace_id=workspace.id)
        .aggregate(last=Max("created_at"))
        .get("last")
    )
    latest = (
        GrowthRecord.objects.filter(workspace_id=workspace.id)
        .order_by("-created_at", "-id")
        .only("id", "workspace_id", "content", "created_at")
        .first()
    )
    return enrich_workspace_payload(
        workspace=workspace,
        my_role=membership.role,
        my_relation_label=membership.relation_label,
        photo_count=int(media.get("photo_count") or 0),
        video_count=int(media.get("video_count") or 0),
        member_count=member_count,
        last_record_at=last_record_at,
        latest_record=latest,
    )
