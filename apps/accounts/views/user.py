from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models.entitlement import Entitlement
from apps.accounts.permissions.entitlement import IsSelfOrAdmin
from apps.accounts.serializers.user import UserMeReadSerializer, UserMeWriteSerializer

User = get_user_model()


class UserViewSet(viewsets.GenericViewSet):
    """
    User endpoints:
    - GET/PATCH /users/me/
    - (optional admin endpoints can be added later)
    """

    permission_classes = (IsAuthenticated,)
    queryset = User.objects.all()

    def get_queryset(self):
        # Optimize /me response
        return (
            super()
            .get_queryset()
            .select_related("user_data")
            .prefetch_related(
                Prefetch("entitlements", queryset=Entitlement.objects.select_related("module").order_by("-created_at"))
            )
        )

    def get_serializer_class(self):
        if self.action in ("me",):
            return UserMeReadSerializer
        if self.action in ("update_me",):
            return UserMeWriteSerializer
        return UserMeReadSerializer

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request: Request) -> Response:
        serializer = UserMeReadSerializer(instance=request.user, context={"request": request})
        return Response(serializer.data)

    @action(detail=False, methods=["patch"], url_path="me")
    def update_me(self, request: Request) -> Response:
        serializer = UserMeWriteSerializer(instance=request.user, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # return updated read shape
        out = UserMeReadSerializer(instance=request.user, context={"request": request})
        return Response(out.data, status=status.HTTP_200_OK)
