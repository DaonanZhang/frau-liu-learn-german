from __future__ import annotations

from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models.entitlement import Entitlement
from apps.accounts.serializers.entitlement import EntitlementReadSerializer, EntitlementWriteSerializer


class EntitlementViewSet(viewsets.GenericViewSet, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin):
    """
    Entitlement endpoints:
    - GET /entitlements/me/ (authenticated user)
    - Admin CRUD: list/retrieve/create/update
    """

    queryset = Entitlement.objects.select_related("module", "user").order_by("-created_at")

    def get_permissions(self):
        # /me is for normal authenticated users
        if self.action == "me":
            return [IsAuthenticated()]
        # Admin CRUD
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return EntitlementWriteSerializer
        return EntitlementReadSerializer

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request: Request) -> Response:
        qs = (
            Entitlement.objects.filter(user=request.user)
            .select_related("module")
            .order_by("-created_at")
        )
        serializer = EntitlementReadSerializer(instance=qs, many=True, context={"request": request})
        return Response(serializer.data)
