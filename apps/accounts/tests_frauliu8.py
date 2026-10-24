from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import (
    Entitlement,
    Module,
    ModuleSeason,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import store_promotion_code


class Frauliu8Tests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            telephone="13700138000", country_code="+86", password="pass-123456"
        )
        self.module, _ = Module.objects.get_or_create(
            key="exam_preparation", defaults={"name": "FRAULIU8", "is_active": True}
        )
        self.other_module, _ = Module.objects.get_or_create(
            key="learning_by_video", defaults={"name": "Other", "is_active": True}
        )
        self.season = ModuleSeason.objects.create(module=self.module, season_number=1, title="Season 1")
        self.offer = PurchaseOffer.objects.create(
            code="frauliu8-offer", title="FRAULIU8 offer", module=self.module,
            season=self.season, plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("59.90"), currency="CNY",
        )
        self.other_offer = PurchaseOffer.objects.create(
            code="frauliu8-other-offer", title="Other offer", module=self.other_module,
            plan=Entitlement.Plan.MONTH_1, price_amount=Decimal("39.90"), currency="CNY",
        )
        self.client.force_authenticate(user=self.user)

    def create_code(self, **overrides):
        code = overrides.pop("code", "FRAULIU8")
        values = dict(
            campaign_name="FRAULIU8", organization_name="", discount_amount=Decimal("8.00"),
            minimum_order_amount=Decimal("0.00"), applicable_module=None, applicable_season=None,
            applicable_offer=None, coupon_valid_days=None, expires_at=None,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.EXCLUSIVE_BRAND_FRIEND,
        )
        values.update(overrides)
        return store_promotion_code(code=code, **values)

    def test_reusable_global_coupon_can_be_redeemed_twice(self):
        record = self.create_code()
        first = self.client.post("/api/accounts/auth/redeem-code/", {"code": record.code}, format="json")
        second = self.client.post("/api/accounts/auth/redeem-code/", {"code": record.code}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(record.coupons.count(), 2)
        coupon = record.coupons.first()
        self.assertEqual(coupon.display_name, "FRAULIU专属优惠券")
        self.assertEqual(coupon.discount_amount, Decimal("8.00"))
        self.assertEqual(coupon.minimum_order_amount, Decimal("0.00"))
        self.assertIsNone(coupon.applicable_module_id)
        self.assertIsNone(coupon.expires_at)

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_global_coupon_is_auto_selected_on_tie_and_payment_uses_eight_discount(self):
        Entitlement.objects.create(
            user=self.user, module=self.other_module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        self.create_code()
        coupon = self.client.post(
            "/api/accounts/auth/redeem-code/", {"code": "FRAULIU8"}, format="json"
        ).data["coupon"]["id"]
        choices = self.client.get("/api/accounts/coupons/choices/", {"offer_code": self.offer.code})
        self.assertEqual(choices.data["default_coupon_id"], coupon)
        self.assertEqual(choices.data["no_coupon_pricing"]["final_amount"], "51.90")
        other_choices = self.client.get(
            "/api/accounts/coupons/choices/", {"offer_code": self.other_offer.code}
        )
        self.assertEqual(other_choices.data["default_coupon_id"], coupon)
        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {"offer_code": self.offer.code, "use_coupon": True,
             "idempotency_key": "00000000-0000-4000-8000-000000000801"}, format="json"
        )
        self.assertEqual(purchase.status_code, 201)
        self.assertEqual(purchase.data["amount"], "51.90")
        application = PaymentDiscountApplication.objects.get(payment_id=purchase.data["payment_id"])
        self.assertEqual(application.automatic_discount_amount, Decimal("0.00"))
        self.assertEqual(application.promotion_discount_amount, Decimal("8.00"))
        self.assertEqual(
            application.selection_source,
            PaymentDiscountApplication.SelectionSource.AUTOMATIC,
        )
        coupon = UserCoupon.objects.get(pk=coupon)
        self.assertEqual(coupon.status, UserCoupon.Status.USED)

    def test_frauliu8_wins_same_discount_tie_against_regular_stack_coupon(self):
        stack_record = self.create_code(
            code="STACK8", stacking_policy=PromotionCodeRecord.StackingPolicy.STACK
        )
        frauliu8_record = self.create_code(code="FRAULIU8")
        self.client.post(
            "/api/accounts/auth/redeem-code/", {"code": stack_record.code}, format="json"
        )
        frauliu8_coupon_id = self.client.post(
            "/api/accounts/auth/redeem-code/", {"code": frauliu8_record.code}, format="json"
        ).data["coupon"]["id"]

        choices = self.client.get("/api/accounts/coupons/choices/", {"offer_code": self.offer.code})

        self.assertEqual(choices.data["default_coupon_id"], frauliu8_coupon_id)

    def test_kunlun_exclusive_coupon_is_not_auto_selected(self):
        Entitlement.objects.create(
            user=self.user, module=self.module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        record = self.create_code(code="KLDYZMZ", campaign_name="昆仑字幕组", discount_amount=Decimal("5.00"))
        coupon = self.client.post(
            "/api/accounts/auth/redeem-code/", {"code": record.code}, format="json"
        ).data["coupon"]["id"]
        choices = self.client.get("/api/accounts/coupons/choices/", {"offer_code": self.offer.code})
        self.assertIsNone(choices.data["default_coupon_id"])
        self.assertEqual(choices.data["choices"][0]["coupon"]["id"], coupon)

    @override_settings(ALIPAY_LOCAL_SIMULATE_SUCCESS=True, DEBUG=True)
    def test_payment_without_coupon_id_keeps_old_user_discount_instead_of_using_kunlun_coupon(self):
        Entitlement.objects.create(
            user=self.user, module=self.other_module, plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.ACTIVE, starts_at=timezone.now(),
        )
        record = self.create_code(
            code="KLDYZMZ", campaign_name="昆仑字幕组", discount_amount=Decimal("5.00")
        )
        coupon_id = self.client.post(
            "/api/accounts/auth/redeem-code/", {"code": record.code}, format="json"
        ).data["coupon"]["id"]

        purchase = self.client.post(
            "/api/accounts/payments/alipay/create/",
            {
                "offer_code": self.offer.code,
                "use_coupon": True,
                "idempotency_key": "00000000-0000-4000-8000-000000000802",
            },
            format="json",
        )

        self.assertEqual(purchase.status_code, 201)
        self.assertEqual(purchase.data["amount"], "51.90")
        self.assertFalse(PaymentDiscountApplication.objects.exists())
        coupon = self.user.promotion_coupons.get(pk=coupon_id)
        self.assertEqual(coupon.status, coupon.Status.AVAILABLE)
        self.assertIsNone(coupon.reserved_payment_id)
