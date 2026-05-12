from __future__ import annotations

from django.contrib.auth import logout
from django.http import JsonResponse

from apps.accounts.maintenance import maintenance_message, user_allowed_during_maintenance


class MaintenanceSessionKickoutMiddleware:
    """
    Expire session-authenticated users during maintenance unless they are whitelisted.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if getattr(user, "is_authenticated", False) and not user_allowed_during_maintenance(user):
            logout(request)
            if request.path.startswith("/api/"):
                return JsonResponse({"detail": maintenance_message()}, status=403)

        return self.get_response(request)
