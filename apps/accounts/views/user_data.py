from __future__ import annotations

from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models.user_data import UserData
from apps.accounts.serializers.user_data import (
    UserDataReadSerializer,
    UserDataWriteSerializer,
)


class UserDataViewSet(viewsets.GenericViewSet):
    """
    UserData endpoints:
    - GET   /user-data/me/
    - PATCH /user-data/me/
    - POST  /user-data/mark-daily-active/
    """

    permission_classes = (IsAuthenticated,)
    queryset = UserData.objects.select_related("user")

    def get_serializer_class(self):
        if self.action in ("me",):
            return UserDataReadSerializer
        if self.action in ("update_me",):
            return UserDataWriteSerializer
        if self.action in ("mark_daily_active",):
            return UserDataReadSerializer
        return UserDataReadSerializer

    def _get_or_create_user_data(self, request: Request) -> UserData:
        obj, _ = UserData.objects.get_or_create(user=request.user)
        return obj

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request: Request) -> Response:
        obj = self._get_or_create_user_data(request)
        serializer = UserDataReadSerializer(instance=obj, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["patch"], url_path="me")
    def update_me(self, request: Request) -> Response:
        obj = self._get_or_create_user_data(request)
        serializer = UserDataWriteSerializer(
            instance=obj,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        out = UserDataReadSerializer(instance=obj, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="mark-daily-active")
    def mark_daily_active(self, request: Request) -> Response:
        """
        Mark the current user as active for today (counted once per calendar day).

        Intended usage:
            Call this endpoint when the user enters the homepage.

        Returns:
            dict:
                incremented: Whether active_days was incremented today.
                user_data: Serialized UserData.
        """
        obj = self._get_or_create_user_data(request)

        if not hasattr(obj, "active_days") or not hasattr(obj, "last_active_date"):
            return Response(
                {
                    "detail": (
                        "UserData.active_days and/or UserData.last_active_date is missing. "
                        "Please add the fields and run migrations."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        today = timezone.localdate()
        incremented = False

        if obj.last_active_date != today:
            obj.active_days = int(obj.active_days or 0) + 1
            obj.last_active_date = today
            obj.save(update_fields=["active_days", "last_active_date", "updated_at"])
            incremented = True

        out = UserDataReadSerializer(instance=obj, context={"request": request})
        return Response(
            {
                "incremented": incremented,
                "user_data": out.data,
            },
            status=status.HTTP_200_OK,
        )
