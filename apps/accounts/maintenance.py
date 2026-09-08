from __future__ import annotations

from django.conf import settings


def maintenance_mode_enabled() -> bool:
    return bool(getattr(settings, "MAINTENANCE_MODE_ENABLED", False))


def allowed_telephones() -> set[str]:
    raw_value = getattr(settings, "MAINTENANCE_ALLOWED_TELEPHONES", None)
    if raw_value is None:
        raw_value = getattr(settings, "MAINTENANCE_ALLOWED_TELEPHONE", "110")
    return {
        telephone.strip()
        for telephone in str(raw_value).split(",")
        if telephone.strip()
    }


def maintenance_message() -> str:
    return str(
        getattr(
            settings,
            "MAINTENANCE_MESSAGE",
            "网站正在更新中，请稍后再试。当前仅允许维护账号登录。",
        )
    )


def user_allowed_during_maintenance(user) -> bool:
    if not maintenance_mode_enabled():
        return True
    if not getattr(user, "is_authenticated", False):
        return True
    return str(getattr(user, "telephone", "")).strip() in allowed_telephones()
