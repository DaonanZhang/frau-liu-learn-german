from __future__ import annotations

from rest_framework import mixins, viewsets
from rest_framework.permissions import AllowAny

from apps.accounts.models.purchase_offer import PurchaseOffer
from apps.accounts.serializers.purchase_offer import PurchaseOfferReadSerializer


class PurchaseOfferViewSet(
    viewsets.GenericViewSet,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
):
    """
    Public read-only purchase offers used by the frontend checkout pages.
    """

    serializer_class = PurchaseOfferReadSerializer
    permission_classes = [AllowAny]
    lookup_field = "code"
    queryset = (
        PurchaseOffer.objects
        .filter(is_active=True)
        .select_related("module", "season")
        .order_by("sort_order", "id")
    )

    def get_queryset(self):
        qs = super().get_queryset()
        module_key = self.request.query_params.get("module")
        if module_key:
            qs = qs.filter(module__key=module_key)

        season_number = self.request.query_params.get("season_number")
        if season_number:
            try:
                parsed = int(season_number)
            except (TypeError, ValueError):
                parsed = None
            if parsed and parsed > 0:
                qs = qs.filter(season__season_number=parsed)

        return qs
