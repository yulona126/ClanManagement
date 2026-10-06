"""Normalize client-submitted EXIF (scheme A + GPS, ADR-010)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_datetime

EXTRA_WHITELIST = frozenset({"iso", "focal_length_mm", "lens_model", "software"})


def normalize_exif(raw: Any) -> dict[str, Any]:
    """Return model field kwargs; invalid GPS dropped without failing upload."""
    if not isinstance(raw, dict):
        return _empty()

    width = _positive_int(raw.get("width"))
    height = _positive_int(raw.get("height"))
    orientation = _orientation(raw.get("orientation"))
    taken_at = _parse_taken_at(raw.get("taken_at"))
    make = _str(raw.get("make"), 100)
    model = _str(raw.get("model"), 100)
    lat, lng = _parse_gps(raw.get("gps"))
    extra_src = raw.get("extra") if isinstance(raw.get("extra"), dict) else {}
    exif_json = {
        k: extra_src[k]
        for k in EXTRA_WHITELIST
        if k in extra_src and extra_src[k] is not None
    }

    return {
        "width": width,
        "height": height,
        "taken_at": taken_at,
        "camera_make": make,
        "camera_model": model,
        "orientation": orientation,
        "latitude": lat,
        "longitude": lng,
        "exif_json": exif_json,
    }


def _empty() -> dict[str, Any]:
    return {
        "width": None,
        "height": None,
        "taken_at": None,
        "camera_make": "",
        "camera_model": "",
        "orientation": None,
        "latitude": None,
        "longitude": None,
        "exif_json": {},
    }


def _positive_int(value: Any) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _orientation(value: Any) -> int | None:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= 8 else None


def _str(value: Any, max_len: int) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    return s[:max_len]


def _parse_taken_at(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = parse_datetime(str(value))
        if dt is None:
            return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _parse_gps(gps: Any) -> tuple[Decimal | None, Decimal | None]:
    if not isinstance(gps, dict):
        return None, None
    try:
        lat = Decimal(str(gps.get("lat")))
        lng = Decimal(str(gps.get("lng")))
    except (InvalidOperation, TypeError, ValueError):
        return None, None
    if not (Decimal("-90") <= lat <= Decimal("90")):
        return None, None
    if not (Decimal("-180") <= lng <= Decimal("180")):
        return None, None
    return lat.quantize(Decimal("0.000001")), lng.quantize(Decimal("0.000001"))
