from __future__ import annotations

from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.models.module_season import ModuleSeason
from apps.accounts.serializers.module_season import ModuleSeasonMiniSerializer
from apps.accounts.permissions import IsAdminOrReadOnly


class ModuleSeasonViewSet(
    viewsets.GenericViewSet,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
):
    """
    ModuleSeason endpoints.

    - GET /module-seasons/?module=learning_by_video
      → list seasons for a module (public / authenticated)

    - Admin:
      - POST /module-seasons/
      - PATCH /module-seasons/{id}/
    """

    queryset = (
        ModuleSeason.objects
        .select_related("module")
        .order_by("module_id", "season_number")
    )

    serializer_class = ModuleSeasonMiniSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        module_key = self.request.query_params.get("module")
        if module_key:
            qs = qs.filter(module__key=module_key)
        return qs
