from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import Module, ModuleSeason, PromotionCampaign, PurchaseOffer
from apps.accounts.services.promotion_codes import generate_promotion_code, store_promotion_code


class Command(BaseCommand):
    help = "Generate database-backed one-time promotion codes for one channel campaign."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--campaign", required=True, help="Stable campaign code, for example partner-a-2026.")
        parser.add_argument("--campaign-name", required=True)
        parser.add_argument("--organization", default="")
        parser.add_argument("--discount", required=True, type=Decimal)
        parser.add_argument("--count", type=int, default=1)
        parser.add_argument("--expires-days", type=int, default=180)
        parser.add_argument("--coupon-valid-days", type=int, default=30)
        parser.add_argument("--minimum-order", type=Decimal, default=Decimal("0.00"))
        parser.add_argument("--module", dest="module_key")
        parser.add_argument("--season", dest="season_number", type=int)
        parser.add_argument("--offer", dest="offer_code")
        parser.add_argument("--stackable", action="store_true")
        parser.add_argument("--remark", default="")
        parser.add_argument("--length", type=int, default=10)

    def handle(self, *args, **options) -> None:
        if options["discount"] <= 0:
            raise CommandError("--discount must be greater than zero")
        if options["minimum_order"] < 0:
            raise CommandError("--minimum-order cannot be negative")
        for name in ("count", "expires_days", "coupon_valid_days", "length"):
            if options[name] <= 0:
                raise CommandError(f"--{name.replace('_', '-')} must be greater than zero")
        if options["length"] > 32:
            raise CommandError("--length cannot exceed 32")

        module = None
        season = None
        offer = None
        if options.get("module_key"):
            try:
                module = Module.objects.get(key=options["module_key"], is_active=True)
            except Module.DoesNotExist as exc:
                raise CommandError("Unknown active module") from exc
        if options.get("season_number") is not None:
            if module is None:
                raise CommandError("--season requires --module")
            try:
                season = ModuleSeason.objects.get(module=module, season_number=options["season_number"])
            except ModuleSeason.DoesNotExist as exc:
                raise CommandError("Unknown module season") from exc
        if options.get("offer_code"):
            try:
                offer = PurchaseOffer.objects.select_related("module", "season").get(
                    code=options["offer_code"], is_active=True
                )
            except PurchaseOffer.DoesNotExist as exc:
                raise CommandError("Unknown active purchase offer") from exc
            module = module or offer.module
            season = season or offer.season
            if offer.module_id != module.id or offer.season_id != getattr(season, "id", None):
                raise CommandError("The offer does not match the requested module/season scope")

        campaign, created = PromotionCampaign.objects.get_or_create(
            code=options["campaign"],
            defaults={
                "name": options["campaign_name"],
                "organization_name": options["organization"],
            },
        )
        if not created and (
            campaign.name != options["campaign_name"]
            or campaign.organization_name != options["organization"]
        ):
            raise CommandError("Campaign already exists with different name or organization")
        if not campaign.is_active:
            raise CommandError("Campaign is inactive")

        codes = []
        for _ in range(options["count"]):
            code = generate_promotion_code(length=options["length"])
            store_promotion_code(
                code=code,
                campaign=campaign,
                remark=options["remark"],
                discount_amount=options["discount"],
                minimum_order_amount=options["minimum_order"],
                applicable_module=module,
                applicable_season=season,
                applicable_offer=offer,
                is_stackable=options["stackable"],
                coupon_valid_days=options["coupon_valid_days"],
                expires_at=timezone.now() + timedelta(days=options["expires_days"]),
            )
            codes.append(code)

        self.stdout.write(
            f"# campaign={campaign.code} count={len(codes)} discount={options['discount']:.2f} "
            f"coupon_valid_days={options['coupon_valid_days']}"
        )
        for code in codes:
            self.stdout.write(code)
