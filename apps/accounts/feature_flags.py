from __future__ import annotations

from django.conf import settings


def coming_soon_enabled() -> bool:
    return bool(getattr(settings, "COMING_SOON", False))


def user_has_release_access(user) -> bool:
    if not coming_soon_enabled():
        return True
    if not getattr(user, "is_authenticated", False):
        return False
    allowed_telephones = {
        str(telephone).strip()
        for telephone in getattr(
            settings,
            "RELEASE_ACCESS_TELEPHONES",
            ("110",),
        )
        if str(telephone).strip()
    }
    return str(getattr(user, "telephone", "")).strip() in allowed_telephones
