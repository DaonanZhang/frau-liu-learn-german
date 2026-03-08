from __future__ import annotations

from typing import Optional

from django.apps import apps
from django.db import models
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied


def get_accessible_season_ids(*, user, module_key: str) -> Optional[list[int]]:
    """
    Returns:
      - None: user has access to all seasons for the module
      - []: user has no access to the module
      - [ids...]: user has access to specific seasons
    """
    if not user or not getattr(user, "is_authenticated", False):
        return []

    Entitlement = apps.get_model("accounts", "Entitlement")
    Module = apps.get_model("accounts", "Module")

    now = timezone.now()

    base_qs = Entitlement.objects.filter(
        user=user,
        status=Entitlement.Status.ACTIVE,
        starts_at__lte=now,
    ).filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    )

    # platform-wide entitlement
    if base_qs.filter(module__isnull=True, season__isnull=True).exists():
        return None

    module = Module.objects.filter(key=module_key, is_active=True).only("id").first()
    if not module:
        return []

    # module-level entitlement (all seasons)
    if base_qs.filter(module=module, season__isnull=True).exists():
        return None

    season_ids = list(
        base_qs.filter(module=module, season__isnull=False)
        .values_list("season_id", flat=True)
        .distinct()
    )
    if season_ids:
        # Special case: Season 1 entitlement should also unlock the preview "使用季".
        # This keeps "使用季" as a preview bucket while granting access to full Season 1.
        ModuleSeason = apps.get_model("accounts", "ModuleSeason")
        season_numbers = set(
            ModuleSeason.objects.filter(id__in=season_ids)
            .values_list("season_number", flat=True)
        )
        if 1 in season_numbers:
            preview_ids = list(
                ModuleSeason.objects.filter(module=module, title="使用季")
                .values_list("id", flat=True)
            )
            if preview_ids:
                season_ids = list(set(season_ids) | set(preview_ids))
    return season_ids


def filter_videos_by_entitlement(qs, *, user, module_key: str):
    season_ids = get_accessible_season_ids(user=user, module_key=module_key)
    if season_ids is None:
        return qs.filter(season__isnull=False)
    if not season_ids:
        return qs.none()
    return qs.filter(season_id__in=season_ids)


def filter_occurrences_by_entitlement(qs, *, user, module_key: str):
    season_ids = get_accessible_season_ids(user=user, module_key=module_key)
    if season_ids is None:
        return qs.filter(video__season__isnull=False)
    if not season_ids:
        return qs.none()
    return qs.filter(video__season_id__in=season_ids)


def user_has_video_access(*, user, video, module_key: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_staff", False):
        return True

    # No season assigned => always locked
    if not getattr(video, "season_id", None):
        return False

    season_ids = get_accessible_season_ids(user=user, module_key=module_key)
    if season_ids is None:
        return True
    if not season_ids:
        return False
    return video.season_id in season_ids


def ensure_video_access(*, user, video, module_key: str) -> None:
    if not user_has_video_access(user=user, video=video, module_key=module_key):
        raise PermissionDenied("You do not have access to this video.")
