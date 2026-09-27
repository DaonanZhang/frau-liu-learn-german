from __future__ import annotations

from rest_framework.permissions import BasePermission

from apps.accounts.feature_flags import user_has_release_access


class HasReleaseAccess(BasePermission):
    """Temporary gate; views may supply a release_access_denial response dict."""

    message = {
        "message": "此功能即将上线，敬请期待。",
        "code": "coming_soon",
    }

    def has_permission(self, request, view) -> bool:
        self.message = getattr(view, "release_access_denial", type(self).message)
        return user_has_release_access(request.user)
