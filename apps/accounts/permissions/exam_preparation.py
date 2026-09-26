from __future__ import annotations

from rest_framework.permissions import BasePermission

from apps.accounts.feature_flags import user_allowed_exam_preparation_preview


class HasExamPreparationReleaseAccess(BasePermission):
    message = {
        "message": "模拟考试即将上线，敬请期待。",
        "code": "mock_exam_coming_soon",
    }

    def has_permission(self, request, view) -> bool:
        return user_allowed_exam_preparation_preview(request.user)
