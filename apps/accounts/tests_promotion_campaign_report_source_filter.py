from __future__ import annotations

from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    UserCoupon,
)


class PromotionCampaignReportSourceFilterTests(TestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13600136000", country_code="+86", password="pass-123456"
        )
        module = Module.objects.create(key="report-test", name="Report Test", is_active=True)
        self.offer = PurchaseOffer.objects.create(
            code="report-offer",
            title="Report Offer",
            module=module,
            plan=Entitlement.Plan.MONTH_1,
            price_amount=Decimal("20.00"),
            currency="CNY",
        )

    def _create_source_row(self, source: str, code: str, organization: str) -> None:
        now = timezone.now()
        promotion = PromotionCodeRecord.objects.create(
            code=code,
            source_kind=source,
            campaign_name="shared-campaign",
            organization_name=organization,
            discount_amount=Decimal("5.00"),
            status=PromotionCodeRecord.Status.CONSUMED,
            consumed_by_user=self.user,
            consumed_at=now,
        )
        coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=promotion,
            discount_amount=Decimal("5.00"),
            status=UserCoupon.Status.USED,
        )
        coupon.issued_at = now
        coupon.save(update_fields=["issued_at"])
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no=f"ORDER-{code}",
            subject=self.offer.title,
            total_amount=Decimal("15.00"),
            status=AlipayWebsitePayment.Status.PAID,
            paid_at=now,
        )
        PaymentDiscountApplication.objects.create(
            payment=payment,
            coupon=coupon,
            promotion_code=promotion,
            user=self.user,
            offer=self.offer,
            original_amount=Decimal("20.00"),
            promotion_discount_amount=Decimal("5.00"),
            final_amount=Decimal("15.00"),
            campaign_name_snapshot="shared-campaign",
            campaign_organization_snapshot=organization,
            status=PaymentDiscountApplication.Status.APPLIED,
            applied_at=now,
        )

    def _report(self, **options) -> str:
        output = StringIO()
        call_command(
            "promotion_campaign_report",
            campaign_name="shared-campaign",
            month=timezone.localdate().strftime("%Y-%m"),
            details=True,
            stdout=output,
            **options,
        )
        return output.getvalue()

    def test_counts_totals_and_details_include_only_operational_sources(self) -> None:
        self._create_source_row(PromotionCodeRecord.SourceKind.OPERATIONAL, "OPER001", "Org A")
        self._create_source_row(PromotionCodeRecord.SourceKind.REFERRAL, "REFER001", "Org A")
        self._create_source_row(PromotionCodeRecord.SourceKind.INTERNAL_REWARD, "INTERN001", "Org A")
        before = (
            list(PromotionCodeRecord.objects.values_list("id", "status", "consumed_at")),
            list(UserCoupon.objects.values_list("id", "status", "issued_at")),
            list(PaymentDiscountApplication.objects.values_list("id", "status", "applied_at", "final_amount")),
        )

        report = self._report()

        self.assertIn("redeemed_codes=1", report)
        self.assertIn("coupon_redemptions=1", report)
        self.assertIn("redeeming_users=1", report)
        self.assertIn("paid_orders=1", report)
        self.assertIn("paying_users=1", report)
        self.assertIn("original_amount=20.00", report)
        self.assertIn("promotion_discount=5.00", report)
        self.assertIn("final_amount=15.00", report)
        self.assertIn("OPER001", report)
        self.assertNotIn("REFER001", report)
        self.assertNotIn("INTERN001", report)
        self.assertEqual(
            before,
            (
                list(PromotionCodeRecord.objects.values_list("id", "status", "consumed_at")),
                list(UserCoupon.objects.values_list("id", "status", "issued_at")),
                list(PaymentDiscountApplication.objects.values_list("id", "status", "applied_at", "final_amount")),
            ),
        )

    def test_organization_and_exact_non_operational_code_filter_within_operational_rows(self) -> None:
        self._create_source_row(PromotionCodeRecord.SourceKind.OPERATIONAL, "OPER001", "Org A")
        self._create_source_row(PromotionCodeRecord.SourceKind.OPERATIONAL, "OPER002", "Org B")
        self._create_source_row(PromotionCodeRecord.SourceKind.REFERRAL, "REFER001", "Org A")

        organization_report = self._report(organization="Org A")
        self.assertIn("redeemed_codes=1", organization_report)
        self.assertIn("OPER001", organization_report)
        self.assertNotIn("OPER002", organization_report)

        exact_referral_report = self._report(code="REFER001")
        self.assertIn("redeemed_codes=0", exact_referral_report)
        self.assertIn("coupon_redemptions=0", exact_referral_report)
        self.assertIn("paid_orders=0", exact_referral_report)
        self.assertNotIn("REFER001\t", exact_referral_report)
