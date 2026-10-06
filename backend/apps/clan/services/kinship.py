"""Helpers for Membership + KinshipLink creation and sync."""

from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.clan.models import KinshipLink, Membership


def sync_to_baby_link(
    membership: Membership,
    *,
    created_by=None,
) -> KinshipLink:
    """Ensure a to_baby link exists and matches relation_label."""
    link = (
        KinshipLink.objects.filter(
            workspace_id=membership.workspace_id,
            from_membership=membership,
            link_kind=KinshipLink.LinkKind.TO_BABY,
        )
        .order_by("id")
        .first()
    )
    if link is None:
        return KinshipLink.objects.create(
            workspace_id=membership.workspace_id,
            from_membership=membership,
            to_membership=None,
            to_baby=True,
            label=membership.relation_label,
            link_kind=KinshipLink.LinkKind.TO_BABY,
            created_by=created_by,
        )
    if link.label != membership.relation_label:
        link.label = membership.relation_label
        link.save(update_fields=["label"])
    return link


def create_membership_with_kinship(
    *,
    user_id: int,
    workspace_id: int,
    role: str,
    relation_label: str,
    created_by=None,
    anchor_membership_id: int | None = None,
    anchor_label: str | None = None,
    display_name: str = "",
) -> Membership:
    """
    Create Membership + to_baby link.
    If the workspace already has members, require an anchor peer link.
    """
    existing_count = Membership.objects.filter(workspace_id=workspace_id).count()

    if existing_count > 0:
        if not anchor_membership_id or not (anchor_label or "").strip():
            raise ValidationError(
                {
                    "anchor_membership_id": "空间已有成员时，必须选择相对谁以及关系标签。",
                    "anchor_label": "空间已有成员时，必须填写相对关系。",
                }
            )
        anchor = Membership.objects.filter(
            pk=anchor_membership_id,
            workspace_id=workspace_id,
        ).first()
        if anchor is None:
            raise ValidationError(
                {"anchor_membership_id": "锚点成员不存在或不属于该工作区。"}
            )
    else:
        anchor = None
        anchor_label = None

    with transaction.atomic():
        membership = Membership.objects.create(
            user_id=user_id,
            workspace_id=workspace_id,
            role=role,
            relation_label=relation_label,
            display_name=display_name or "",
        )
        sync_to_baby_link(membership, created_by=created_by)
        if anchor is not None:
            KinshipLink.objects.create(
                workspace_id=workspace_id,
                from_membership=membership,
                to_membership=anchor,
                to_baby=False,
                label=(anchor_label or "").strip(),
                link_kind=KinshipLink.LinkKind.PEER,
                created_by=created_by,
            )
    return membership


def backfill_to_baby_links(workspace_id: int | None = None) -> int:
    """Create missing to_baby links for existing memberships. Returns count created."""
    qs = Membership.objects.all()
    if workspace_id is not None:
        qs = qs.filter(workspace_id=workspace_id)
    created = 0
    for m in qs.iterator():
        exists = KinshipLink.objects.filter(
            from_membership=m,
            link_kind=KinshipLink.LinkKind.TO_BABY,
        ).exists()
        if not exists:
            KinshipLink.objects.create(
                workspace_id=m.workspace_id,
                from_membership=m,
                to_membership=None,
                to_baby=True,
                label=m.relation_label,
                link_kind=KinshipLink.LinkKind.TO_BABY,
            )
            created += 1
    return created
