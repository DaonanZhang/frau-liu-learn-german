from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import IntegrityError, transaction
from django.db import connection
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from apps.accounts.models import AlipayWebsitePayment, PromotionCodeRecord, UserCoupon


class ReferralModelTests(TestCase):
    def setUp(self) -> None:
        self.ReferralCode = apps.all_models.get("accounts", {}).get("referralcode")
        self.ReferralParticipation = apps.all_models.get("accounts", {}).get("referralparticipation")
        self.assertIsNotNone(self.ReferralCode, "ReferralCode must be registered")
        self.assertIsNotNone(self.ReferralParticipation, "ReferralParticipation must be registered")
        self.User = get_user_model()
        self.referrer = self.User.objects.create_user(telephone="13600136001", password="pass")
        self.referred = self.User.objects.create_user(telephone="13600136002", password="pass")
        self.other_user = self.User.objects.create_user(telephone="13600136003", password="pass")
        self.promotion = PromotionCodeRecord.objects.create(
            code="REFERRAL001",
            source_kind="referral",
            campaign_name="备考季推广",
            discount_amount=Decimal("5.00"),
        )
        self.referral_code = self.ReferralCode.objects.create(
            user=self.referrer,
            campaign_tag="exam_preparation_referral_v1",
            code_prefix="BK1",
            promotion_code=self.promotion,
        )

    def make_participation(self, **overrides):
        values = {
            "campaign_tag": "exam_preparation_referral_v1",
            "referred_user": self.referred,
            "referral_code": self.referral_code,
        }
        values.update(overrides)
        return self.ReferralParticipation.objects.create(**values)

    def test_code_and_participation_defaults_choices_and_limits(self) -> None:
        participation = self.make_participation()

        self.assertTrue(self.referral_code.is_active)
        self.assertEqual(self.referral_code.campaign_tag, "exam_preparation_referral_v1")
        self.assertEqual(self.referral_code.code_prefix, "BK1")
        self.assertEqual(participation.status, "open")
        self.assertEqual(
            self.ReferralParticipation.Status.choices,
            [
                ("open", "Open"),
                ("payment_reserved", "Payment reserved"),
                ("reward_pending", "Reward pending"),
                ("qualified", "Qualified"),
                ("disqualified", "Disqualified"),
                ("refunded", "Refunded"),
            ],
        )
        self.assertEqual(self.ReferralCode._meta.get_field("campaign_tag").max_length, 128)
        self.assertEqual(self.ReferralCode._meta.get_field("code_prefix").max_length, 16)
        self.assertEqual(self.ReferralParticipation._meta.get_field("campaign_tag").max_length, 128)
        self.assertTrue(self.ReferralParticipation._meta.get_field("status").db_index)
        self.assertIsNotNone(participation.status_changed_at)
        self.assertEqual(participation.last_error, "")
        self.assertIsNotNone(participation.created_at)
        self.assertIsNotNone(participation.updated_at)

    def test_code_user_and_campaign_pair_is_unique(self) -> None:
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.ReferralCode.objects.create(
                user=self.referrer,
                campaign_tag="exam_preparation_referral_v1",
                code_prefix="BK1",
                promotion_code=PromotionCodeRecord.objects.create(
                    code="REFERRAL002",
                    source_kind="referral",
                    campaign_name="备考季推广",
                    discount_amount=Decimal("5.00"),
                ),
            )

    def test_participation_user_and_campaign_pair_is_unique(self) -> None:
        self.make_participation()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_participation()

    def test_associated_promotion_coupon_and_payment_are_one_to_one(self) -> None:
        coupon = UserCoupon.objects.create(
            user=self.referred,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="ORDER-REFERRAL-1",
            subject="Exam preparation",
            total_amount=Decimal("30.00"),
        )
        participation = self.make_participation(current_coupon=coupon, qualifying_payment=payment)
        self.assertEqual(participation.current_coupon, coupon)
        self.assertEqual(participation.qualifying_payment, payment)

        second = self.User.objects.create_user(telephone="13600136004", password="pass")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_participation(referred_user=second, current_coupon=coupon)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_participation(referred_user=second, qualifying_payment=payment)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.ReferralCode.objects.create(
                user=self.other_user,
                campaign_tag="another_campaign",
                code_prefix="BK1",
                promotion_code=self.promotion,
            )

    def test_protected_relations_preserve_referral_history(self) -> None:
        participation = self.make_participation()
        with self.assertRaises(ProtectedError):
            self.promotion.delete()
        with self.assertRaises(ProtectedError):
            self.referral_code.delete()
        self.assertTrue(self.ReferralParticipation.objects.filter(pk=participation.pk).exists())

        coupon = UserCoupon.objects.create(
            user=self.referred,
            promotion_code=self.promotion,
            discount_amount=Decimal("5.00"),
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="ORDER-REFERRAL-PROTECT",
            subject="Exam preparation",
            total_amount=Decimal("30.00"),
        )
        participation.current_coupon = coupon
        participation.qualifying_payment = payment
        participation.save(update_fields=["current_coupon", "qualifying_payment"])
        with self.assertRaises(ProtectedError):
            coupon.delete()
        with self.assertRaises(ProtectedError):
            payment.delete()

    def test_models_are_exported_from_accounts_models(self) -> None:
        from apps.accounts import models

        self.assertIs(models.ReferralCode, self.ReferralCode)
        self.assertIs(models.ReferralParticipation, self.ReferralParticipation)

    def test_nullable_timestamps_and_error_default_are_persisted(self) -> None:
        participation = self.make_participation()
        for field_name in (
            "eligibility_checked_at",
            "order_created_at",
            "qualified_at",
            "refunded_at",
            "refund_reconciled_at",
        ):
            self.assertIsNone(getattr(participation, field_name))
        self.assertIn("exam_preparation_referral_v1", str(self.referral_code))
        self.assertIn("exam_preparation_referral_v1", str(participation))


class ReferralRewardModelTests(TestCase):
    def setUp(self) -> None:
        self.ReferralReward = apps.all_models.get("accounts", {}).get("referralreward")
        self.assertIsNotNone(self.ReferralReward, "ReferralReward must be registered")
        self.ReferralParticipation = apps.all_models["accounts"]["referralparticipation"]
        self.User = get_user_model()
        self.referrer = self.User.objects.create_user(telephone="13600136101", password="pass")
        self.referred = self.User.objects.create_user(telephone="13600136102", password="pass")
        promotion = PromotionCodeRecord.objects.create(
            code="REWARD001", campaign_name="Reward test", discount_amount=Decimal("5.00")
        )
        referral_code = apps.all_models["accounts"]["referralcode"].objects.create(
            user=self.referrer, campaign_tag="campaign", code_prefix="BK1", promotion_code=promotion
        )
        self.participation = self.ReferralParticipation.objects.create(
            campaign_tag="campaign", referred_user=self.referred, referral_code=referral_code
        )

    def make_reward(self, **overrides):
        values = {
            "campaign_tag": "campaign",
            "referrer": self.referrer,
            "participation": self.participation,
            "kind": self.ReferralReward.Kind.REFERRAL_MONTH,
            "idempotency_key": "campaign:participation:month",
        }
        values.update(overrides)
        return self.ReferralReward.objects.create(**values)

    def test_choices_defaults_and_limits(self) -> None:
        reward = self.make_reward()
        self.assertEqual(self.ReferralReward.Kind.choices, [
            ("referral_month", "Referral month"), ("science_3", "Science 3"), ("vlog_5", "Vlog 5")
        ])
        self.assertEqual(self.ReferralReward.Status.choices, [
            ("granted", "Granted"), ("revocation_pending", "Revocation pending"),
            ("revoked", "Revoked"), ("non_reversible", "Non-reversible")
        ])
        self.assertEqual(reward.status, "granted")
        self.assertTrue(self.ReferralReward._meta.get_field("status").db_index)
        limits = {"campaign_tag": 128, "kind": 32, "idempotency_key": 191}
        for field, limit in limits.items():
            self.assertEqual(self.ReferralReward._meta.get_field(field).max_length, limit)
        self.assertEqual(reward.amount_days, 0)
        self.assertEqual(reward.generation, 1)
        self.assertIsNone(reward.threshold)
        self.assertIsNone(reward.entitlement_id)
        self.assertIsNone(reward.coupon_id)
        self.assertIsNone(reward.revocation_pending_at)
        self.assertIsNone(reward.revoked_at)
        self.assertIsNone(reward.settled_at)
        self.assertIsNotNone(reward.created_at)
        self.assertIsNotNone(reward.updated_at)

    def test_idempotency_key_is_globally_unique(self) -> None:
        self.make_reward()
        other_referrer = self.User.objects.create_user(telephone="13600136103", password="pass")
        other_referred = self.User.objects.create_user(telephone="13600136104", password="pass")
        other_promotion = PromotionCodeRecord.objects.create(
            code="REWARD002", campaign_name="Other reward test", discount_amount=Decimal("5.00")
        )
        other_referral_code = apps.all_models["accounts"]["referralcode"].objects.create(
            user=other_referrer,
            campaign_tag="other_campaign",
            code_prefix="BK1",
            promotion_code=other_promotion,
        )
        other_participation = self.ReferralParticipation.objects.create(
            campaign_tag="other_campaign",
            referred_user=other_referred,
            referral_code=other_referral_code,
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.ReferralReward.objects.create(
                campaign_tag="other_campaign",
                referrer=other_referrer,
                participation=other_participation,
                kind="science_3",
                idempotency_key="campaign:participation:month",
            )

    def test_database_checks(self) -> None:
        cases = [
            {"amount_days": -1, "idempotency_key": "bad-days"},
            {"generation": 0, "idempotency_key": "bad-generation"},
            {"threshold": 0, "idempotency_key": "bad-threshold"},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(IntegrityError), transaction.atomic():
                self.make_reward(**values)

    def test_named_database_check_constraints_exist(self) -> None:
        expected = {
            "ref_reward_days_nonnegative",
            "ref_reward_generation_positive",
            "ref_reward_threshold_positive",
        }
        table = self.ReferralReward._meta.db_table
        with connection.cursor() as cursor:
            tables = connection.introspection.table_names(cursor)
            self.assertIn(table, tables)
            constraints = connection.introspection.get_constraints(cursor, table)
        checks = {name for name, details in constraints.items() if details.get("check")}
        self.assertTrue(expected.issubset(checks), f"Missing database checks: {expected - checks}")

    def test_protected_participation_entitlement_and_coupon(self) -> None:
        reward = self.make_reward()
        with self.assertRaises(ProtectedError):
            self.participation.delete()
        from apps.accounts.models import Entitlement, Module
        module = Module.objects.get(key="exam_preparation")
        entitlement = Entitlement.objects.create(user=self.referrer, module=module, plan="m1")
        reward.entitlement = entitlement
        reward.save(update_fields=["entitlement"])
        with self.assertRaises(ProtectedError):
            entitlement.delete()
        coupon = UserCoupon.objects.create(
            user=self.referrer, promotion_code=PromotionCodeRecord.objects.get(code="REWARD001"),
            discount_amount=Decimal("5.00")
        )
        reward.coupon = coupon
        reward.save(update_fields=["coupon"])
        with self.assertRaises(ProtectedError):
            coupon.delete()

    def test_index_and_model_export(self) -> None:
        indexes = {index.name: index.fields for index in self.ReferralReward._meta.indexes}
        self.assertEqual(indexes["idx_ref_reward_owner_state"], ["referrer", "campaign_tag", "status"])
        from apps.accounts import models
        self.assertIs(models.ReferralReward, self.ReferralReward)


class ReferralNoticeModelTests(TestCase):
    def setUp(self) -> None:
        self.ReferralNotice = apps.all_models.get("accounts", {}).get("referralnotice")
        self.assertIsNotNone(self.ReferralNotice, "ReferralNotice must be registered")
        self.User = get_user_model()
        self.user = self.User.objects.create_user(telephone="13600136120", password="pass")

    def make_notice(self, **overrides):
        values = {
            "user": self.user,
            "campaign_tag": "exam_preparation_referral_v1",
            "event_type": "reward_granted",
        }
        values.update(overrides)
        return self.ReferralNotice.objects.create(**values)

    def test_fields_defaults_and_limits(self) -> None:
        notice = self.make_notice()
        fields = {field.name: field for field in self.ReferralNotice._meta.fields}
        self.assertEqual(fields["campaign_tag"].max_length, 128)
        self.assertEqual(fields["event_type"].max_length, 64)
        self.assertEqual(fields["payload"].default, dict)
        self.assertFalse(notice.is_global_notice)
        self.assertIsNone(notice.acknowledged_at)
        self.assertIsNotNone(notice.created_at)
        self.assertEqual(notice.payload, {})
        self.assertTrue(fields["acknowledged_at"].null)
        self.assertTrue(fields["acknowledged_at"].blank)
        self.assertEqual(fields["user"].remote_field.related_name, "referral_notices")

    def test_payload_defaults_are_independent_and_persist(self) -> None:
        first = self.make_notice()
        second = self.make_notice(event_type="other")
        first.payload["items"] = [1]
        first.save(update_fields=["payload"])
        second.refresh_from_db()
        self.assertEqual(second.payload, {})
        first.refresh_from_db()
        self.assertEqual(first.payload, {"items": [1]})

    def test_history_only_global_pending_and_acknowledged_semantics(self) -> None:
        history = self.make_notice(event_type="history")
        pending = self.make_notice(is_global_notice=True, event_type="notice")
        acknowledged = self.make_notice(
            is_global_notice=True, event_type="notice_read", acknowledged_at=timezone.now()
        )
        pending_global = self.ReferralNotice.objects.filter(
            user=self.user, is_global_notice=True, acknowledged_at__isnull=True
        )
        self.assertFalse(history.is_global_notice)
        self.assertEqual(list(pending_global), [pending])
        self.assertNotIn(acknowledged, pending_global)
        self.assertIsNone(history.acknowledged_at)

    def test_named_indexes(self) -> None:
        indexes = {index.name: index.fields for index in self.ReferralNotice._meta.indexes}
        self.assertEqual(indexes["idx_ref_notice_unread"], ["user", "is_global_notice", "acknowledged_at"])
        self.assertEqual(indexes["idx_ref_notice_history"], ["user", "campaign_tag", "created_at"])

    def test_user_delete_cascades_notices(self) -> None:
        notice = self.make_notice()
        notice_id = notice.pk
        self.user.delete()
        self.assertFalse(self.ReferralNotice.objects.filter(pk=notice_id).exists())

    def test_model_export(self) -> None:
        from apps.accounts import models

        self.assertIs(models.ReferralNotice, self.ReferralNotice)

