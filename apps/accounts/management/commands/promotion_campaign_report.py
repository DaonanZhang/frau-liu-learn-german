from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.services.promotion_codes import get_promotion_campaign_report


class Command(BaseCommand):
    help = "Report promotion-code redemptions and paid coupon purchases for one campaign and period."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--campaign-name", required=True)
        parser.add_argument("--organization", default="")
        parser.add_argument("--code", default="", help="Limit the report to one exact promotion code.")
        parser.add_argument(
            "--month",
            help="Calendar month in YYYY-MM format, or all; defaults to the current month.",
        )
        parser.add_argument("--details", action="store_true")

    def handle(self, *args, **options) -> None:
        month_text = options.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            report = get_promotion_campaign_report(
                campaign_name=options["campaign_name"],
                organization=options["organization"],
                code=options.get("code") or "",
                month_text=month_text,
            )
        except ValueError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            f"campaign_name={report['campaign_name']} organization={report['organization']} "
            f"code={report['code']} month={report['month']}"
        )
        self.stdout.write(f"redeemed_codes={report['redeemed_codes']}")
        self.stdout.write(f"coupon_redemptions={report['coupon_redemptions']}")
        self.stdout.write(f"redeeming_users={report['redeeming_users']}")
        self.stdout.write(f"paid_orders={report['paid_orders']}")
        self.stdout.write(f"paying_users={report['paying_users']}")
        self.stdout.write(f"original_amount={report['original_amount']:.2f}")
        self.stdout.write(f"promotion_discount={report['promotion_discount']:.2f}")
        self.stdout.write(f"final_amount={report['final_amount']:.2f}")

        if not options["details"]:
            return
        self.stdout.write("# redemptions")
        for redemption in report["redemptions"]:
            self.stdout.write(
                "\t".join([
                    redemption["promotion_code"],
                    redemption["telephone"],
                    timezone.localtime(redemption["issued_at"]).isoformat(),
                ])
            )
        self.stdout.write("# paid purchases")
        for purchase in report["purchases"]:
            self.stdout.write(
                "\t".join([
                    purchase["promotion_code"],
                    purchase["telephone"],
                    purchase["offer_code"],
                    purchase["merchant_order_no"],
                    f"{purchase['original_amount']:.2f}",
                    f"{purchase['promotion_discount']:.2f}",
                    f"{purchase['final_amount']:.2f}",
                    timezone.localtime(purchase["applied_at"]).isoformat(),
                ])
            )
