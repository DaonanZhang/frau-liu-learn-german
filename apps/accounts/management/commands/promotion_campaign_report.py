from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count, Sum
from django.utils import timezone

from apps.accounts.models import PaymentDiscountApplication, PromotionCampaign, PromotionCodeRecord
from apps.accounts.services.activation_codes import decrypt_activation_code


class Command(BaseCommand):
    help = "Report promotion-code redemptions and paid coupon purchases for one campaign and month."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--campaign", required=True)
        parser.add_argument("--month", help="Calendar month in YYYY-MM format; defaults to the current month.")
        parser.add_argument("--details", action="store_true")

    def handle(self, *args, **options) -> None:
        try:
            campaign = PromotionCampaign.objects.get(code=options["campaign"])
        except PromotionCampaign.DoesNotExist as exc:
            raise CommandError("Unknown promotion campaign") from exc

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
            campaign=campaign,
            status=PromotionCodeRecord.Status.CONSUMED,
            consumed_at__gte=month_start,
            consumed_at__lt=next_month,
        ).select_related("consumed_by_user")
        paid = PaymentDiscountApplication.objects.filter(
            campaign=campaign,
            status=PaymentDiscountApplication.Status.APPLIED,
            applied_at__gte=month_start,
            applied_at__lt=next_month,
        ).select_related("user", "offer", "payment", "promotion_code")
        totals = paid.aggregate(
            paid_orders=Count("id"),
            paying_users=Count("user_id", distinct=True),
            original_amount=Sum("original_amount"),
            promotion_discount=Sum("promotion_discount_amount"),
            final_amount=Sum("final_amount"),
        )

        self.stdout.write(f"campaign={campaign.code} name={campaign.name} month={month_text}")
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
                    decrypt_activation_code(record.code_ciphertext) or record.code_hash[:12],
                    getattr(record.consumed_by_user, "telephone", "") or "",
                    timezone.localtime(record.consumed_at).isoformat(),
                ])
            )
        self.stdout.write("# paid purchases")
        for application in paid.order_by("applied_at", "id"):
            self.stdout.write(
                "\t".join([
                    decrypt_activation_code(application.promotion_code.code_ciphertext)
                    or application.promotion_code.code_hash[:12],
                    application.user.telephone,
                    application.offer.code,
                    application.payment.merchant_order_no,
                    f"{application.original_amount:.2f}",
                    f"{application.promotion_discount_amount:.2f}",
                    f"{application.final_amount:.2f}",
                    timezone.localtime(application.applied_at).isoformat(),
                ])
            )
