from __future__ import annotations

from django.conf import settings


def exam_preparation_coming_soon_enabled() -> bool:
    return bool(getattr(settings, "EXAM_PREPARATION_COMING_SOON_ENABLED", False))


def user_allowed_exam_preparation_preview(user) -> bool:
    if not exam_preparation_coming_soon_enabled():
        return True
    if not getattr(user, "is_authenticated", False):
        return False
    allowed_telephones = {
        str(telephone).strip()
        for telephone in getattr(
            settings,
            "EXAM_PREPARATION_PREVIEW_TELEPHONES",
            ("110", "11223344551"),
        )
        if str(telephone).strip()
    }
    return str(getattr(user, "telephone", "")).strip() in allowed_telephones
