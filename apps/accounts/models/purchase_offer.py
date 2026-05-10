from __future__ import annotations

from django.core.exceptions import ValidationError
from django.db import models

from apps.accounts.models.entitlement import Entitlement


class PurchaseOffer(models.Model):
    """
    Sellable offer for one module scope.

    The target access scope is represented by:
    - module only: season is null
    - module season: season is set
    """

    code = models.SlugField(max_length=64, unique=True)
    title = models.CharField(max_length=128)
    description = models.TextField(blank=True, default="")
    module = models.ForeignKey(
        "accounts.Module",
        on_delete=models.CASCADE,
        related_name="purchase_offers",
        db_index=True,
    )
    season = models.ForeignKey(
        "accounts.ModuleSeason",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="purchase_offers",
        db_index=True,
    )
    plan = models.CharField(max_length=16, choices=Entitlement.Plan.choices, db_index=True)
    price_amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=8, default="CNY")
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["module", "is_active", "sort_order"], name="idx_offer_module_active_sort"),
            models.Index(fields=["season", "is_active"], name="idx_offer_season_active"),
        ]

    def clean(self) -> None:
        super().clean()
        if self.season_id and self.module_id and self.season.module_id != self.module_id:
            raise ValidationError({"season": "Selected season does not belong to the selected module."})

    def __str__(self) -> str:
        scope = self.module.key
        if self.season_id:
            scope = f"{scope}:season-{self.season.season_number}"
        return f"PurchaseOffer<{self.code} {scope} {self.plan} {self.price_amount} {self.currency}>"
