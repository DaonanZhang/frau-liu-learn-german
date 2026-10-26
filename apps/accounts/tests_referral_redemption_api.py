from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import (
    Entitlement,
    Module,
    PromotionCodeRecord,
    ReferralCode,
    ReferralParticipation,
    UserCoupon,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN


@override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=True)
class CodeRedemptionReferralAPITests(APITestCase):
    url = "/api/accounts/auth/redeem-code/"

    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(telephone="13600138001", password="pass")
        self.user = User.objects.create_user(telephone="13600138002", password="pass")
        self.module = Module.objects.get(key="exam_preparation")
        self.promotion, self.referral = self.make_referral(
            self.owner, "BK1-ABCDEFGH2"
        )
        self.other_promotion, self.other_referral = self.make_referral(
            User.objects.create_user(telephone="13600138003", password="pass"),
            "BK1-BCDEFGH2",
        )
        self.client.force_authenticate(user=self.user)

    def make_referral(self, owner, code):
        promotion = PromotionCodeRecord.objects.create(
            code=code,
            source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name="备考季推广",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            applicable_module=self.module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        referral = ReferralCode.objects.create(
            user=owner,
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix="BK1",
            promotion_code=promotion,
        )
        return promotion, referral

    def snapshot(self):
        return (
            list(UserCoupon.objects.order_by("pk").values()),
            list(ReferralParticipation.objects.order_by("pk").values()),
        )

    def redeem(self, code="BK1-ABCDEFGH2", **payload):
        return self.client.post(self.url, {"code": code, **payload}, format="json")

    def assert_structured_error(self, *, code, outcome, message, user=None):
        if user is not None:
            self.client.force_authenticate(user=user)
        before = self.snapshot()
        with patch("apps.accounts.views.code_redemption.redeem_promotion_code") as ordinary:
            response = self.redeem(code)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data,
            {
                "type": "referral",
                "outcome": outcome,
                "code": code,
                "message": message,
                "detail": message,
            },
        )
        self.assertEqual(self.snapshot(), before)
        ordinary.assert_not_called()

    def test_first_issue_returns_structured_result_and_full_coupon(self):
        response = self.redeem()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {key: response.data[key] for key in ("type", "outcome", "code", "message")},
            {
                "type": "referral",
                "outcome": "issued",
                "code": "BK1-ABCDEFGH2",
                "message": "已领取 ¥5 备考季专用优惠券。",
            },
        )
        coupon = response.data["coupon"]
        self.assertEqual(coupon["display_name"], "无门槛优惠券")
        self.assertEqual(coupon["discount_amount"], "5.00")
        self.assertEqual(coupon["minimum_order_amount"], "0.00")
        self.assertEqual(coupon["stacking_policy"], "stack")
        self.assertEqual(coupon["status"], UserCoupon.Status.AVAILABLE)
        self.assertEqual(coupon["effective_status"], UserCoupon.Status.AVAILABLE)
        self.assertEqual(coupon["scope"]["module_key"], "exam_preparation")
        self.assertIn("issued_at", coupon)
        self.assertIsNone(coupon["expires_at"])
        self.assertIn("reserved_at", coupon)
        self.assertIn("used_at", coupon)
        self.assertEqual(coupon["usage_history"], [])
        self.assertEqual(coupon["profile_path"], "/profile#coupons")
        self.assertEqual(UserCoupon.objects.count(), 1)
        self.assertEqual(ReferralParticipation.objects.count(), 1)

    def test_same_code_is_structured_already_issued_without_null_optionals(self):
        self.redeem()
        response = self.redeem()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "already_issued")
        self.assertIn("coupon", response.data)
        self.assertNotIn("replacement", response.data)

    def test_unconfirmed_replacement_returns_replacement_metadata_without_writes(self):
        first = self.redeem()
        before = self.snapshot()
        response = self.redeem("BK1-BCDEFGH2")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "replacement_required")
        self.assertEqual(
            response.data["replacement"],
            {
                "old_code": "BK1-ABCDEFGH2",
                "new_code": "BK1-BCDEFGH2",
                "old_coupon_id": first.data["coupon"]["id"],
            },
        )
        self.assertIn("coupon", response.data)
        self.assertEqual(response.data["coupon"]["id"], first.data["coupon"]["id"])
        self.assertEqual(self.snapshot(), before)

    def test_confirmed_replacement_passes_confirmation_and_rebinds_participation(self):
        self.redeem()
        old_coupon = UserCoupon.objects.get(user=self.user)
        response = self.redeem("BK1-BCDEFGH2", confirm_replace=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "issued")
        self.assertEqual(response.data["replacement"]["old_code"], "BK1-ABCDEFGH2")
        self.assertEqual(response.data["replacement"]["new_code"], "BK1-BCDEFGH2")
        old_coupon.refresh_from_db()
        participation = ReferralParticipation.objects.get(referred_user=self.user)
        self.assertEqual(old_coupon.status, UserCoupon.Status.REVOKED)
        self.assertEqual(participation.referral_code_id, self.other_referral.pk)
        self.assertEqual(participation.current_coupon_id, response.data["coupon"]["id"])
        self.assertEqual(UserCoupon.objects.filter(user=self.user).count(), 2)

    def test_reserved_unknown_code_is_structured_invalid_and_never_falls_back(self):
        self.assert_structured_error(
            code="BK1-UNKNOWN12", outcome="invalid_code", message="推广码无效。"
        )

    def test_self_referral_is_structured_and_write_free(self):
        self.assert_structured_error(
            code="BK1-ABCDEFGH2",
            outcome="self_referral",
            message="不能兑换自己的推广码。",
            user=self.owner,
        )

    def test_disabled_campaign_is_structured_and_write_free(self):
        with patch(
            "apps.accounts.feature_flags.exam_preparation_referral_enabled",
            return_value=False,
        ):
            self.assert_structured_error(
                code="BK1-ABCDEFGH2",
                outcome="campaign_disabled",
                message="备考季推广活动暂未开放。",
            )

    def test_existing_exam_preparation_access_is_structured_and_write_free(self):
        Entitlement.objects.create(
            user=self.user,
            plan=Entitlement.Plan.MONTH_1,
            status=Entitlement.Status.EXPIRED,
        )
        self.assert_structured_error(
            code="BK1-ABCDEFGH2",
            outcome="existing_exam_preparation_access",
            message="本次推广活动仅针对第一次购买备考季的用户哦！",
        )

    def test_reserved_coupon_is_structured_and_write_free(self):
        coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
            applicable_module=self.module,
            status=UserCoupon.Status.RESERVED,
        )
        ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.user,
            referral_code=self.referral,
            current_coupon=coupon,
            status=ReferralParticipation.Status.OPEN,
        )
        self.assert_structured_error(
            code="BK1-BCDEFGH2",
            outcome="coupon_reserved",
            message="当前活动优惠券正被待支付订单占用，请先完成或关闭该订单。",
        )

    def test_terminal_participation_is_structured_and_write_free(self):
        coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
            applicable_module=self.module,
        )
        ReferralParticipation.objects.create(
            campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            referred_user=self.user,
            referral_code=self.referral,
            current_coupon=coupon,
            status=ReferralParticipation.Status.QUALIFIED,
        )
        self.assert_structured_error(
            code="BK1-BCDEFGH2",
            outcome="already_participated",
            message="你已经参加过本次推广活动。",
        )

    def test_activation_code_match_has_precedence_over_reserved_referral_route(self):
        with (
            patch("apps.accounts.views.code_redemption.activation_code_exists", return_value=True),
            patch("apps.accounts.views.code_redemption.apply_activation_code_for_user", return_value=[]) as activate,
            patch("apps.accounts.views.code_redemption.redeem_referral_code") as referral,
            patch("apps.accounts.views.code_redemption.redeem_promotion_code") as promotion,
        ):
            response = self.redeem("BK1-ABCDEFGH2", confirm_replace=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"type": "activation", "entitlements": []})
        activate.assert_called_once_with(user=self.user, code="BK1-ABCDEFGH2")
        referral.assert_not_called()
        promotion.assert_not_called()

    def test_ordinary_operational_promotion_response_shape_is_unchanged(self):
        promotion = PromotionCodeRecord.objects.create(
            code="OPS-API-001",
            source_kind=PromotionCodeRecord.SourceKind.OPERATIONAL,
            campaign_name="Operational",
            discount_amount=Decimal("10.00"),
        )
        response = self.redeem(promotion.code)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data),
            {"type", "coupon"},
        )
        self.assertEqual(response.data["type"], "promotion")
        self.assertEqual(
            set(response.data["coupon"]),
            {
                "id",
                "display_name",
                "discount_amount",
                "minimum_order_amount",
                "expires_at",
                "profile_path",
            },
        )

    def test_non_operational_non_reserved_code_is_rejected_without_coupon(self):
        for source_kind in (
            PromotionCodeRecord.SourceKind.REFERRAL,
            PromotionCodeRecord.SourceKind.INTERNAL_REWARD,
        ):
            with self.subTest(source_kind=source_kind):
                code = f"NONOP-{source_kind.upper()}"
                PromotionCodeRecord.objects.create(
                    code=code,
                    source_kind=source_kind,
                    campaign_name="Not operational",
                    discount_amount=Decimal("5.00"),
                )
                before = self.snapshot()
                response = self.redeem(code)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(set(response.data), {"detail"})
                self.assertEqual(self.snapshot(), before)

    def test_serializer_validates_default_boolean_required_code_and_length(self):
        response = self.redeem()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["outcome"], "issued")

        for payload in (
            {},
            {"code": "BK1-ABCDEFGH2", "confirm_replace": "not-a-boolean"},
            {"code": "X" * 33},
        ):
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

