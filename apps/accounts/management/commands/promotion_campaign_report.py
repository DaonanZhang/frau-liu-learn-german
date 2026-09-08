from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Sum
from django.utils import timezone

from apps.accounts.models import PaymentDiscountApplication, PromotionCodeRecord


class Command(BaseCommand):
    help = "Report promotion-code redemptions and paid coupon purchases for one campaign and month."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--campaign-name", required=True)
        parser.add_argument("--organization", default="")
        parser.add_argument("--month", help="Calendar month in YYYY-MM format; defaults to the current month.")
        parser.add_argument("--details", action="store_true")

    def handle(self, *args, **options) -> None:
        month_text = options.get("month") or timezone.localdate().strftime("%Y-%m")
        try:
            month_start_date = datetime.strptime(month_text, "%Y-%m").date().replace(day=1)
        except ValueError as exc:
            raise CommandError("--month must use YYYY-MM") from exc
        if month_start_date.month == 12:
            next_month_date = month_start_date.replace(year=month_start_date.year + 1, month=1)
        else:
            next_month_date = month_start_date.replace(month=month_start_date.month + 1)
        current_tz = timezone.get_current_timezone()
        month_start = timezone.make_aware(datetime.combine(month_start_date, datetime.min.time()), current_tz)
        next_month = timezone.make_aware(datetime.combine(next_month_date, datetime.min.time()), current_tz)

        redeemed = PromotionCodeRecord.objects.filter(
            campaign_name=options["campaign_name"],
            status=PromotionCodeRecord.Status.CONSUMED,
            consumed_at__gte=month_start,
            consumed_at__lt=next_month,
        ).select_related("consumed_by_user")
        paid = PaymentDiscountApplication.objects.filter(
            campaign_name_snapshot=options["campaign_name"],
            status=PaymentDiscountApplication.Status.APPLIED,
            applied_at__gte=month_start,
            applied_at__lt=next_month,
        ).select_related("user", "offer", "payment", "promotion_code")
        if options["organization"]:
            redeemed = redeemed.filter(organization_name=options["organization"])
            paid = paid.filter(campaign_organization_snapshot=options["organization"])
        totals = paid.aggregate(
            paid_orders=Count("id"),
            paying_users=Count("user_id", distinct=True),
            original_amount=Sum("original_amount"),
            promotion_discount=Sum("promotion_discount_amount"),
            final_amount=Sum("final_amount"),
        )

        self.stdout.write(
            f"campaign_name={options['campaign_name']} organization={options['organization']} month={month_text}"
        )
        self.stdout.write(f"redeemed_codes={redeemed.count()}")
        self.stdout.write(f"paid_orders={totals['paid_orders'] or 0}")
        self.stdout.write(f"paying_users={totals['paying_users'] or 0}")
        self.stdout.write(f"original_amount={(totals['original_amount'] or Decimal('0')):.2f}")
        self.stdout.write(f"promotion_discount={(totals['promotion_discount'] or Decimal('0')):.2f}")
        self.stdout.write(f"final_amount={(totals['final_amount'] or Decimal('0')):.2f}")

        if not options["details"]:
            return
        self.stdout.write("# redemptions")
        for record in redeemed.order_by("consumed_at", "id"):
            self.stdout.write(
                "\t".join([
                    record.code,
                    getattr(record.consumed_by_user, "telephone", "") or "",
                    timezone.localtime(record.consumed_at).isoformat(),
                ])
            )
        self.stdout.write("# paid purchases")
        for application in paid.order_by("applied_at", "id"):
            self.stdout.write(
                "\t".join([
                    application.promotion_code.code,
                    application.user.telephone,
                    application.offer.code,
                    application.payment.merchant_order_no,
                    f"{application.original_amount:.2f}",
                    f"{application.promotion_discount_amount:.2f}",
                    f"{application.final_amount:.2f}",
                    timezone.localtime(application.applied_at).isoformat(),
                ])
            )
