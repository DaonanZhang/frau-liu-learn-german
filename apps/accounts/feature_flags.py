from __future__ import annotations

from django.conf import settings


def exam_preparation_coming_soon_enabled() -> bool:
    return bool(getattr(settings, "EXAM_PREPARATION_COMING_SOON_ENABLED", False))


def user_allowed_exam_preparation_preview(user) -> bool:
    if not exam_preparation_coming_soon_enabled():
        return True
    if not getattr(user, "is_authenticated", False):
        return False
    allowed_telephone = str(
        getattr(settings, "EXAM_PREPARATION_PREVIEW_TELEPHONE", "110")
    ).strip()
    return str(getattr(user, "telephone", "")).strip() == allowed_telephone
