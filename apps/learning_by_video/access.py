from __future__ import annotations

from functools import lru_cache
from typing import Optional

from django.apps import apps
from django.db import models
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

FREE_PREVIEW_COUNT = 3
FREE_PREVIEW_SEASON_GROUPS: dict[str, tuple[tuple[int, ...], ...]] = {
    "learning_by_video": ((1, 2), (3,), (4,)),
}
FREE_PREVIEW_VIDEO_TITLES: dict[str, dict[tuple[int, ...], tuple[str, ...]]] = {
    "learning_by_video": {
        (1, 2): (
            "幸运饼干里的纸条是怎么塞进去的",
            "小孩应该被允许用手机吗（1）",
            "人工智能在学校中的应用",
        ),
    },
}


def _get_primary_video_season_number(video) -> int | None:
    season = getattr(video, "season", None)
    if season is not None and getattr(season, "season_number", None):
        return int(season.season_number)
    return None


def _get_free_preview_group(module_key: str, season_number: int | None) -> tuple[int, ...] | None:
    if season_number is None:
        return None
    for group in FREE_PREVIEW_SEASON_GROUPS.get(module_key, ()):
        if season_number in group:
            return group
    return None


@lru_cache(maxsize=32)
def get_free_preview_video_ids(module_key: str, season_group: tuple[int, ...]) -> tuple[int, ...]:
    Video = apps.get_model("learning_by_video", "Video")

    configured_titles = (
        FREE_PREVIEW_VIDEO_TITLES.get(module_key, {}).get(tuple(season_group), ())
    )
    if configured_titles:
        matched_ids_by_title = {
            title: video_id
            for title, video_id in Video.objects.filter(
                season__module__key=module_key,
                season__season_number__in=season_group,
                title__in=configured_titles,
            ).values_list("title", "id")
        }
        return tuple(
            matched_ids_by_title[title]
            for title in configured_titles
            if title in matched_ids_by_title
        )

    return tuple(
        Video.objects.filter(
            season__module__key=module_key,
            season__season_number__in=season_group,
        )
        .order_by("created_at", "id")
        .values_list("id", flat=True)[:FREE_PREVIEW_COUNT]
    )


def is_video_free_preview(*, video, module_key: str) -> bool:
    season_number = _get_primary_video_season_number(video)
    season_group = _get_free_preview_group(module_key, season_number)
    if not season_group:
        return False
    return int(getattr(video, "id", 0) or 0) in get_free_preview_video_ids(module_key, season_group)


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
    preview_ids = []
    for group in FREE_PREVIEW_SEASON_GROUPS.get(module_key, ()):
        preview_ids.extend(get_free_preview_video_ids(module_key, group))
    if season_ids is None:
        return qs.filter(
            models.Q(season__isnull=False) | models.Q(access_seasons__isnull=False)
        ).distinct()
    if not season_ids:
        return qs.filter(id__in=preview_ids).distinct()
    return qs.filter(
        models.Q(id__in=preview_ids) |
        models.Q(season_id__in=season_ids) |
        models.Q(access_seasons__id__in=season_ids)
    ).distinct()


def filter_occurrences_by_entitlement(qs, *, user, module_key: str):
    season_ids = get_accessible_season_ids(user=user, module_key=module_key)
    preview_ids = []
    for group in FREE_PREVIEW_SEASON_GROUPS.get(module_key, ()):
        preview_ids.extend(get_free_preview_video_ids(module_key, group))
    if season_ids is None:
        return qs.filter(
            models.Q(video__season__isnull=False) | models.Q(video__access_seasons__isnull=False)
        ).distinct()
    if not season_ids:
        return qs.filter(video_id__in=preview_ids).distinct()
    return qs.filter(
        models.Q(video_id__in=preview_ids) |
        models.Q(video__season_id__in=season_ids) |
        models.Q(video__access_seasons__id__in=season_ids)
    ).distinct()


def _get_video_season_ids(video) -> set[int]:
    season_ids: set[int] = set()
    if getattr(video, "season_id", None):
        season_ids.add(video.season_id)
    access_rel = getattr(video, "access_seasons", None)
    if access_rel is not None:
        season_ids.update(access_rel.values_list("id", flat=True))
    return season_ids


def user_has_video_access(*, user, video, module_key: str) -> bool:
    if is_video_free_preview(video=video, module_key=module_key):
        return True

    return user_has_video_entitlement(user=user, video=video, module_key=module_key)


def user_has_video_entitlement(*, user, video, module_key: str) -> bool:
    """
    Check whether the user has actual entitlement-based access to the video.

    Unlike `user_has_video_access`, this ignores free-preview allowance.
    """

    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_staff", False):
        return True

    # No season assigned => always locked
    video_season_ids = _get_video_season_ids(video)
    if not video_season_ids:
        return False

    season_ids = get_accessible_season_ids(user=user, module_key=module_key)
    if season_ids is None:
        return True
    if not season_ids:
        return False
    return bool(video_season_ids.intersection(season_ids))


def ensure_video_access(*, user, video, module_key: str) -> None:
    if not user_has_video_access(user=user, video=video, module_key=module_key):
        raise PermissionDenied("You do not have access to this video.")
