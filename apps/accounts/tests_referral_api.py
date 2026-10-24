from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import (
    Entitlement, Module, PromotionCodeRecord, ReferralCode, ReferralNotice,
    ReferralParticipation, ReferralReward,
)
from apps.accounts.services.referral_campaign import FIRST_REFERRAL_CAMPAIGN


@override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=True)
class ReferralCampaignAPITests(TestCase):
    snapshot_url = "/api/accounts/referral-campaign/"
    unread_url = "/api/accounts/referral-notices/unread/"

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(telephone="13600139101", password="pass")
        self.other = User.objects.create_user(telephone="13600139102", password="pass")
        self.client = APIClient()

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.user)

    def grant_access(self, user=None):
        return Entitlement.objects.create(
            user=user or self.user, module=Module.objects.get(key="exam_preparation"),
            plan=Entitlement.Plan.MONTH_1, status=Entitlement.Status.EXPIRED,
        )

    def make_code(self, user=None):
        user = user or self.user
        module = Module.objects.get(key="exam_preparation")
        promotion = PromotionCodeRecord.objects.create(
            code=f"BK1-API{user.pk:05d}", source_kind=PromotionCodeRecord.SourceKind.REFERRAL,
            campaign_name=FIRST_REFERRAL_CAMPAIGN.campaign_name,
            discount_amount=Decimal("5.00"), applicable_module=module,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
            stacking_policy=PromotionCodeRecord.StackingPolicy.STACK,
        )
        return ReferralCode.objects.create(
            user=user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            code_prefix=FIRST_REFERRAL_CAMPAIGN.code_prefix, promotion_code=promotion,
        )

    def test_anonymous_requests_are_rejected_for_all_endpoints(self):
        self.assertEqual(self.client.get(self.snapshot_url).status_code, 401)
        self.assertEqual(self.client.get(self.unread_url).status_code, 401)
        self.assertEqual(self.client.post("/api/accounts/referral-notices/1/acknowledge/").status_code, 401)

    def test_locked_user_has_no_code_and_no_code_is_created(self):
        self.make_code()
        self.authenticate()
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["eligible"])
        self.assertTrue(response.data["locked"])
        self.assertIsNone(response.data["code"])
        self.assertEqual(ReferralCode.objects.filter(user=self.user).count(), 1)

    def test_eligible_user_repairs_missing_code(self):
        self.grant_access()
        self.authenticate()
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["eligible"])
        self.assertIsNotNone(response.data["code"])
        self.assertEqual(ReferralCode.objects.filter(user=self.user).count(), 1)

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_disabled_campaign_remains_readable_with_enabled_false(self):
        self.authenticate()
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["enabled"])
        self.assertIn("eligible", response.data)

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_disabled_eligible_user_does_not_create_missing_code(self):
        self.grant_access()
        self.authenticate()
        before = (ReferralCode.objects.count(), PromotionCodeRecord.objects.count())
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["eligible"])
        self.assertIsNone(response.data["code"])
        self.assertEqual(
            (ReferralCode.objects.count(), PromotionCodeRecord.objects.count()), before
        )

    @override_settings(EXAM_PREPARATION_REFERRAL_ENABLED=False)
    def test_disabled_eligible_user_still_reads_existing_code(self):
        self.grant_access()
        code = self.make_code()
        self.authenticate()
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.data["code"], code.promotion_code.code)

    def test_snapshot_keeps_five_progress_nodes_for_zero_three_five_and_twelve(self):
        self.grant_access()
        code = self.make_code()
        self.authenticate()
        created = 0
        for count in (0, 3, 5, 12):
            ReferralParticipation.objects.filter(referral_code=code).delete()
            for i in range(count):
                referred = get_user_model().objects.create_user(
                    telephone=f"137{created:08d}", password="pass"
                )
                created += 1
                ReferralParticipation.objects.create(
                    campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                    referral_code=code, referred_user=referred,
                    status=ReferralParticipation.Status.QUALIFIED,
                )
            response = self.client.get(self.snapshot_url)
            self.assertEqual(response.data["effective_count"], count)
            nodes = response.data["nodes"]
            self.assertEqual(len(nodes), 5)
            self.assertEqual([node["number"] for node in nodes], [1, 2, 3, 4, 5])
            self.assertEqual([node["milestone"] for node in nodes], [False, False, True, False, True])
            self.assertEqual([node["completed"] for node in nodes], [count >= n for n in range(1, 6)])

    def test_milestone_states_and_empty_campaign_rows_are_stable(self):
        self.grant_access()
        self.make_code()
        self.authenticate()
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.data["milestones"], {
            "science_3": {"status": "not_earned"}, "vlog_5": {"status": "not_earned"},
        })
        ReferralReward.objects.create(
            referrer=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            kind=ReferralReward.Kind.SCIENCE_3, status=ReferralReward.Status.GRANTED,
            generation=2, idempotency_key="api-science-2",
        )
        ReferralReward.objects.create(
            referrer=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            kind=ReferralReward.Kind.VLOG_5, status=ReferralReward.Status.GRANTED,
            generation=1, idempotency_key="api-vlog-1",
        )
        ReferralReward.objects.create(
            referrer=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            kind=ReferralReward.Kind.VLOG_5, status=ReferralReward.Status.REVOKED,
            generation=2, idempotency_key="api-vlog-2",
        )
        response = self.client.get(self.snapshot_url)
        self.assertEqual(response.data["milestones"]["science_3"]["status"], "earned")
        self.assertEqual(response.data["milestones"]["vlog_5"], {
            "status": ReferralReward.Status.REVOKED, "generation": 2,
        })

    def test_history_is_latest_first_and_payload_is_allowlisted(self):
        self.authenticate()
        first = ReferralNotice.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_qualified",
            payload={"days": 30, "effective_count": 3, "telephone": "SECRET", "payment_id": 999},
        )
        second = ReferralNotice.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_milestone_granted",
            payload={"threshold": 3, "kind": "science_3", "reward_type": "entitlement", "order": "SECRET"},
        )
        refund = ReferralNotice.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_refunded",
            payload={"progress_removed": True, "days_removed": 5,
                     "access_expires_at": "2026-01-01T00:00:00Z", "payment_id": 999,
                     "effective_count": 2, "milestone_changes": [{
                         "threshold": 3, "kind": "science_3", "outcome": "revoked",
                         "reward_type": "entitlement", "order_id": 999,
                     }]},
        )
        response = self.client.get(self.snapshot_url)
        self.assertEqual([item["id"] for item in response.data["history"]], [refund.pk, second.pk, first.pk])
        self.assertEqual(response.data["history"][0]["payload"], {
            "progress_removed": True, "days_removed": 5,
            "access_expires_at": "2026-01-01T00:00:00Z",
            "effective_count": 2, "milestone_changes": [{
                "threshold": 3, "kind": "science_3", "outcome": "revoked",
                "reward_type": "entitlement",
            }],
        })
        self.assertEqual(response.data["history"][1]["payload"], {
            "threshold": 3, "kind": "science_3", "reward_type": "entitlement",
        })
        self.assertEqual(response.data["history"][2]["payload"], {"days": 30, "effective_count": 3})
        self.assertNotIn("SECRET", str(response.data))

    def test_refund_history_drops_malformed_milestone_changes_without_leaking(self):
        self.authenticate()
        malformed = [
            [{"threshold": 3, "kind": "vlog_5", "outcome": "revoked", "reward_type": "coupon"}],
            [{"threshold": 5, "kind": "vlog_5", "outcome": "secret", "reward_type": "coupon"}],
            [{"threshold": 5, "kind": "vlog_5", "outcome": "revocation_pending",
              "reward_type": "entitlement"}],
            [{"threshold": 3, "kind": "science_3", "outcome": "revoked",
              "reward_type": {"coupon_code": "SECRET"}}],
            [{"threshold": 3, "kind": "science_3", "outcome": "revoked",
              "reward_type": "entitlement", "nested": {"telephone": "SECRET"}},
             {"threshold": 5, "kind": "vlog_5", "outcome": "non_reversible",
              "reward_type": "coupon"},
             {"threshold": 3, "kind": "science_3", "outcome": "revoked",
              "reward_type": "entitlement"}],
        ]
        for changes in malformed:
            ReferralNotice.objects.create(
                user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                event_type="referral_refunded",
                payload={"effective_count": True, "milestone_changes": changes},
            )
        response = self.client.get(self.snapshot_url)
        payloads = [item["payload"] for item in response.data["history"]]
        self.assertEqual(payloads, [{"access_expires_at": None}] * 5)
        self.assertNotIn("SECRET", str(response.data))

    def test_refund_history_rejects_duplicate_or_out_of_order_thresholds(self):
        self.authenticate()
        invalid_changes = [
            [
                {"threshold": 3, "kind": "science_3", "outcome": "revoked", "reward_type": "coupon"},
                {"threshold": 3, "kind": "science_3", "outcome": "revoked", "reward_type": "entitlement"},
            ],
            [
                {"threshold": 5, "kind": "vlog_5", "outcome": "revoked", "reward_type": "coupon"},
                {"threshold": 3, "kind": "science_3", "outcome": "revoked", "reward_type": "entitlement"},
            ],
        ]
        for changes in invalid_changes:
            ReferralNotice.objects.create(
                user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                event_type="referral_refunded",
                payload={"milestone_changes": changes, "payment_id": "SECRET"},
            )
        response = self.client.get(self.snapshot_url)
        payloads = [item["payload"] for item in response.data["history"]]
        self.assertEqual(payloads, [{"access_expires_at": None}] * 2)
        self.assertNotIn("SECRET", str(response.data))

    def test_history_payload_rejects_invalid_semantics_and_secret_values(self):
        self.authenticate()
        notices = [
            ("referral_qualified", {
                "days": "13800138000", "effective_count": 13800138000,
            }),
            ("referral_milestone_granted", {
                "threshold": True, "kind": "order-SECRET", "reward_type": {"order_id": "SECRET"},
            }),
            ("referral_refunded", {
                "progress_removed": 1, "days_removed": "order-SECRET",
                "access_expires_at": "not-a-date-SECRET",
            }),
        ]
        for event_type, payload in notices:
            ReferralNotice.objects.create(
                user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                event_type=event_type, payload=payload,
            )
        response = self.client.get(self.snapshot_url)
        self.assertEqual([item["payload"] for item in response.data["history"]], [{}, {}, {}])
        self.assertNotIn("SECRET", str(response.data))

    def test_unread_endpoint_filters_user_campaign_global_and_unacknowledged(self):
        self.authenticate()
        expected = ReferralNotice.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_refunded", payload={"days_removed": 5}, is_global_notice=True,
        )
        ReferralNotice.objects.create(user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                                      event_type="x", is_global_notice=False)
        ReferralNotice.objects.create(user=self.user, campaign_tag="other", event_type="x",
                                      is_global_notice=True)
        ReferralNotice.objects.create(user=self.other, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
                                      event_type="x", is_global_notice=True)
        self.assertEqual([n["id"] for n in self.client.get(self.unread_url).data], [expected.pk])

    def test_acknowledge_is_owned_and_idempotent(self):
        self.authenticate()
        notice = ReferralNotice.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_refunded", is_global_notice=True,
        )
        response = self.client.post(f"/api/accounts/referral-notices/{notice.pk}/acknowledge/")
        self.assertEqual(response.status_code, 200)
        notice.refresh_from_db()
        original = notice.acknowledged_at
        self.assertIsNotNone(original)
        self.client.post(f"/api/accounts/referral-notices/{notice.pk}/acknowledge/")
        notice.refresh_from_db()
        self.assertEqual(notice.acknowledged_at, original)
        foreign = ReferralNotice.objects.create(
            user=self.other, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_refunded", is_global_notice=True,
        )
        self.assertEqual(self.client.post(f"/api/accounts/referral-notices/{foreign.pk}/acknowledge/").status_code, 404)

    def test_acknowledge_rejects_history_only_private_notice_without_writing(self):
        self.authenticate()
        notice = ReferralNotice.objects.create(
            user=self.user, campaign_tag=FIRST_REFERRAL_CAMPAIGN.campaign_tag,
            event_type="referral_qualified", is_global_notice=False,
        )
        response = self.client.post(f"/api/accounts/referral-notices/{notice.pk}/acknowledge/")
        self.assertEqual(response.status_code, 404)
        notice.refresh_from_db()
        self.assertIsNone(notice.acknowledged_at)
