from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import (
    AlipayWebsitePayment,
    Entitlement,
    Module,
    PaymentDiscountApplication,
    PromotionCodeRecord,
    PurchaseOffer,
    UserCoupon,
)
from apps.accounts.services.promotion_codes import store_promotion_code


class ProfilePromotionCodeApiTests(APITestCase):
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(
            telephone="13800138009",
            country_code="+86",
            password="pass-123456",
        )
        self.admin = get_user_model().objects.create_user(
            telephone="110",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.url = "/api/accounts/users/promotion-codes/"

    def test_requires_superuser_for_generation_and_history(self) -> None:
        self.client.force_authenticate(user=self.user)

        generated = self.client.post(
            self.url,
            {"partner_name": "合作博主", "operator_name": "管理员", "count": 2},
            format="json",
        )
        history = self.client.get(self.url)

        self.assertEqual(generated.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(history.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(PromotionCodeRecord.objects.count(), 0)


    def test_telephone_110_without_superuser_is_rejected(self) -> None:
        self.admin.is_superuser = False
        self.admin.is_staff = False
        self.admin.save(update_fields=["is_superuser", "is_staff"])
        self.client.force_authenticate(user=self.admin)

        generated = self.client.post(
            self.url,
            {"partner_name": "合作博主", "operator_name": "管理员", "count": 2},
            format="json",
        )
        history = self.client.get(self.url)
        details = self.client.get(self.url, {"generation_batch_id": str(uuid4())})

        self.assertEqual(generated.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(history.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(details.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_with_other_telephone_can_manage_codes(self) -> None:
        other_superuser = get_user_model().objects.create_user(
            telephone="13800138010",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.client.force_authenticate(user=other_superuser)

        generated = self.client.post(
            self.url,
            {"partner_name": "合作博主", "operator_name": "管理员", "count": 2},
            format="json",
        )
        history = self.client.get(self.url)
        batch_id = str(PromotionCodeRecord.objects.first().generation_batch_id)
        details = self.client.get(self.url, {"generation_batch_id": batch_id})

        self.assertEqual(generated.status_code, status.HTTP_201_CREATED)
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertEqual(details.status_code, status.HTTP_200_OK)
        self.assertEqual(PromotionCodeRecord.objects.count(), 2)

    def test_unauthenticated_user_is_rejected(self) -> None:
        self.client.logout()

        generated = self.client.post(
            self.url,
            {"partner_name": "合作博主", "operator_name": "管理员", "count": 2},
            format="json",
        )
        history = self.client.get(self.url)
        details = self.client.get(self.url, {"generation_batch_id": str(uuid4())})

        self.assertEqual(generated.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(history.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(details.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_generates_requested_quantity_with_default_parameters(self) -> None:
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            self.url,
            {
                "partner_name": "  于云  ",
                "operator_name": "  daonan  ",
                "count": 3,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["partner_name"], "于云")
        self.assertEqual(response.data["operator_name"], "daonan")
        self.assertEqual(response.data["discount_amount"], "5.00")
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["codes"]), 3)
        records = PromotionCodeRecord.objects.filter(campaign_name="于云")
        self.assertEqual(records.count(), 3)
        self.assertEqual(records.values_list("generation_batch_id", flat=True).distinct().count(), 1)
        record = records.first()
        self.assertEqual(record.operator_name, "daonan")
        self.assertEqual(record.organization_name, "于云")
        self.assertEqual(record.discount_amount, Decimal("5.00"))
        self.assertEqual(record.minimum_order_amount, Decimal("0.00"))
        self.assertIsNone(record.applicable_module_id)
        self.assertIsNone(record.applicable_season_id)
        self.assertIsNone(record.applicable_offer_id)
        self.assertIsNone(record.coupon_valid_days)
        self.assertAlmostEqual(
            (record.expires_at - timezone.now()).total_seconds(),
            timedelta(days=360).total_seconds(),
            delta=5,
        )

    def test_accepts_custom_discount_and_keeps_batches_separate(self) -> None:
        self.client.force_authenticate(user=self.admin)
        payload = {
            "partner_name": "同一博主",
            "operator_name": "Liu",
            "count": 2,
            "discount_amount": "12.30",
        }

        first = self.client.post(self.url, payload, format="json")
        second = self.client.post(self.url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        records = PromotionCodeRecord.objects.filter(campaign_name="同一博主")
        self.assertEqual(records.count(), 4)
        self.assertEqual(records.values_list("generation_batch_id", flat=True).distinct().count(), 2)
        self.assertEqual(set(records.values_list("discount_amount", flat=True)), {Decimal("12.30")})

    def test_history_returns_one_row_per_generation_batch(self) -> None:
        self.client.force_authenticate(user=self.admin)
        for partner_name, operator_name, count in (
            ("博主甲", "daonan", 2),
            ("博主乙", "Anna", 3),
        ):
            response = self.client.post(
                self.url,
                {
                    "partner_name": partner_name,
                    "operator_name": operator_name,
                    "count": count,
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 2)
        by_partner = {item["partner_name"]: item for item in response.data["results"]}
        self.assertEqual(by_partner["博主甲"]["operator_name"], "daonan")
        self.assertEqual(by_partner["博主甲"]["count"], 2)
        self.assertEqual(by_partner["博主乙"]["operator_name"], "Anna")
        self.assertEqual(by_partner["博主乙"]["count"], 3)
        self.assertTrue(all(item["created_at"] for item in response.data["results"]))
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["page"], 1)
        self.assertEqual(response.data["total_pages"], 1)

    def test_history_searches_partner_and_operator_names(self) -> None:
        self.client.force_authenticate(user=self.admin)
        for partner_name, operator_name in (("博主甲", "管理员甲"), ("博主乙", "管理员乙")):
            response = self.client.post(
                self.url,
                {
                    "partner_name": partner_name,
                    "operator_name": operator_name,
                    "count": 1,
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        partner_response = self.client.get(self.url, {"search": "  博主甲 "})
        operator_response = self.client.get(self.url, {"search": "管理员乙"})

        self.assertEqual(partner_response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["partner_name"] for item in partner_response.data["results"]], ["博主甲"])
        self.assertEqual(operator_response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["operator_name"] for item in operator_response.data["results"]], ["管理员乙"])

    def test_history_has_fixed_twenty_item_pages(self) -> None:
        self.client.force_authenticate(user=self.admin)
        for index in range(21):
            response = self.client.post(
                self.url,
                {
                    "partner_name": f"博主{index}",
                    "operator_name": "管理员",
                    "count": 1,
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        first_page = self.client.get(self.url)
        second_page = self.client.get(self.url, {"page": 2})
        out_of_range = self.client.get(self.url, {"page": 3})

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(len(first_page.data["results"]), 20)
        self.assertEqual(first_page.data["count"], 21)
        self.assertEqual(first_page.data["total_pages"], 2)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertEqual(second_page.data["page"], 2)
        self.assertEqual(len(out_of_range.data["results"]), 0)
        self.assertEqual(out_of_range.data["page"], 3)

    def test_history_rejects_invalid_page(self) -> None:
        self.client.force_authenticate(user=self.admin)

        zero = self.client.get(self.url, {"page": 0})
        text = self.client.get(self.url, {"page": "nope"})

        self.assertEqual(zero.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(text.status_code, status.HTTP_400_BAD_REQUEST)

    def test_history_details_returns_codes_for_one_batch(self) -> None:
        self.client.force_authenticate(user=self.admin)
        first = self.client.post(
            self.url,
            {"partner_name": "博主甲", "operator_name": "管理员甲", "count": 2},
            format="json",
        )
        second = self.client.post(
            self.url,
            {"partner_name": "博主乙", "operator_name": "管理员乙", "count": 1},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        first_batch = PromotionCodeRecord.objects.filter(
            code__in=first.data["codes"]
        ).first().generation_batch_id

        response = self.client.get(self.url, {"generation_batch_id": str(first_batch)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["generation_batch_id"], str(first_batch))
        self.assertEqual(response.data["operator_name"], "管理员甲")
        self.assertEqual(response.data["partner_name"], "博主甲")
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["codes"], first.data["codes"])
        self.assertNotIn(second.data["codes"][0], response.data["codes"])

    def test_history_details_rejects_invalid_and_unknown_batch_ids(self) -> None:
        self.client.force_authenticate(user=self.admin)

        invalid = self.client.get(self.url, {"generation_batch_id": "invalid"})
        unknown = self.client.get(self.url, {"generation_batch_id": str(uuid4())})

        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unknown.status_code, status.HTTP_404_NOT_FOUND)

    def test_history_details_requires_superuser(self) -> None:
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self.url, {"generation_batch_id": str(uuid4())})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_validates_required_fields_quantity_and_discount(self) -> None:
        self.client.force_authenticate(user=self.admin)

        invalid_payloads = (
            {"partner_name": "", "operator_name": "管理员", "count": 1},
            {"partner_name": "博主", "operator_name": "", "count": 1},
            {"partner_name": "博主", "operator_name": "管理员", "count": 0},
            {
                "partner_name": "博主",
                "operator_name": "管理员",
                "count": 1,
                "discount_amount": "0",
            },
        )

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PromotionCodeRecord.objects.count(), 0)


class ProfilePromotionCampaignReportApiTests(APITestCase):
    def setUp(self) -> None:
        User = get_user_model()
        self.admin = User.objects.create_user(
            telephone="110",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.user = User.objects.create_user(
            telephone="13800138009",
            country_code="+86",
            password="pass-123456",
        )
        self.other_superuser = User.objects.create_user(
            telephone="13800138010",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.url = "/api/accounts/users/promotion-campaign-report/"
        self.campaigns_url = "/api/accounts/users/promotion-campaigns/"

    def test_campaign_report_requires_superuser_telephone_110(self) -> None:
        for user in (self.user, self.other_superuser):
            with self.subTest(telephone=user.telephone):
                self.client.force_authenticate(user=user)
                response = self.client.get(
                    self.url,
                    {"campaign_name": "花虫二", "month": "2026-10"},
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.admin.is_superuser = False
        self.admin.save(update_fields=["is_superuser"])
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            self.url,
            {"campaign_name": "花虫二", "month": "2026-10"},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_campaign_report_returns_summary_and_purchase_details(self) -> None:
        module = Module.objects.create(
            key="profile-report",
            name="Profile Report",
            is_active=True,
        )
        offer = PurchaseOffer.objects.create(
            code="profile-report-lifetime",
            title="科普季永久权限",
            module=module,
            plan=Entitlement.Plan.LIFETIME,
            price_amount=Decimal("39.90"),
            currency="CNY",
        )
        promotion = store_promotion_code(
            code="PROFILE001",
            campaign_name="花虫二",
            organization_name="花虫二",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            coupon_valid_days=None,
            expires_at=None,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
        )
        similar_promotion = store_promotion_code(
            code="PROFILE002",
            campaign_name="花虫二-其他批次",
            organization_name="花虫二",
            discount_amount=Decimal("5.00"),
            minimum_order_amount=Decimal("0.00"),
            coupon_valid_days=None,
            expires_at=None,
            redemption_mode=PromotionCodeRecord.RedemptionMode.REUSABLE,
        )
        coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=promotion,
            discount_amount=Decimal("5.00"),
        )
        similar_coupon = UserCoupon.objects.create(
            user=self.user,
            promotion_code=similar_promotion,
            discount_amount=Decimal("5.00"),
        )
        applied_at = timezone.make_aware(datetime(2026, 10, 15, 12, 0))
        UserCoupon.objects.filter(pk__in=[coupon.pk, similar_coupon.pk]).update(
            issued_at=applied_at
        )
        payment = AlipayWebsitePayment.objects.create(
            merchant_order_no="profile-report-order",
            subject=offer.title,
            total_amount=Decimal("34.90"),
            status=AlipayWebsitePayment.Status.PAID,
            paid_at=applied_at,
        )
        PaymentDiscountApplication.objects.create(
            payment=payment,
            coupon=coupon,
            promotion_code=promotion,
            user=self.user,
            offer=offer,
            original_amount=Decimal("39.90"),
            automatic_discount_amount=Decimal("0.00"),
            promotion_discount_amount=Decimal("5.00"),
            final_amount=Decimal("34.90"),
            selection_source=PaymentDiscountApplication.SelectionSource.MANUAL,
            campaign_name_snapshot="花虫二",
            campaign_organization_snapshot="花虫二",
            status=PaymentDiscountApplication.Status.APPLIED,
            applied_at=applied_at,
        )
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            self.url,
            {"campaign_name": "花虫二", "month": "2026-10"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["campaign_name"], "花虫二")
        self.assertEqual(response.data["month"], "2026-10")
        self.assertEqual(response.data["coupon_redemptions"], 2)
        self.assertEqual(response.data["redeeming_users"], 1)
        self.assertEqual(response.data["paid_orders"], 1)
        self.assertEqual(response.data["paying_users"], 1)
        self.assertEqual(response.data["original_amount"], "39.90")
        self.assertEqual(response.data["promotion_discount"], "5.00")
        self.assertEqual(response.data["final_amount"], "34.90")
        self.assertEqual(len(response.data["purchases"]), 1)
        self.assertEqual(response.data["purchases"][0]["telephone"], self.user.telephone)
        self.assertEqual(response.data["purchases"][0]["offer_code"], offer.code)
        self.assertEqual(response.data["purchases"][0]["offer_title"], offer.title)
        self.assertEqual(
            response.data["purchases"][0]["merchant_order_no"],
            payment.merchant_order_no,
        )

        all_time_response = self.client.get(
            self.url,
            {"campaign_name": "花虫二", "month": "all"},
        )
        self.assertEqual(all_time_response.status_code, status.HTTP_200_OK)
        self.assertEqual(all_time_response.data["month"], "all")
        self.assertEqual(all_time_response.data["paid_orders"], 1)

    def test_campaign_report_validates_query_and_returns_empty_result(self) -> None:
        self.client.force_authenticate(user=self.admin)
        invalid_queries = (
            {"campaign_name": "花虫二"},
            {"campaign_name": "花虫二", "month": "2026-1"},
            {"campaign_name": "", "month": "2026-10"},
        )
        for query in invalid_queries:
            with self.subTest(query=query):
                response = self.client.get(self.url, query)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response = self.client.get(
            self.url,
            {"campaign_name": "不存在的博主", "month": "2026-10"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["coupon_redemptions"], 0)
        self.assertEqual(response.data["paid_orders"], 0)
        self.assertEqual(response.data["purchases"], [])

    def test_campaign_list_is_complete_distinct_sorted_and_restricted(self) -> None:
        for code, campaign_name in (
            ("PROFILE101", "Beta"),
            ("PROFILE102", "Alpha"),
            ("PROFILE103", "Alpha"),
            ("PROFILE104", ""),
        ):
            PromotionCodeRecord.objects.create(
                code=code,
                campaign_name=campaign_name,
                discount_amount=Decimal("5.00"),
            )

        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.campaigns_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {"campaigns": ["Alpha", "Beta"]})

        for user in (self.user, self.other_superuser):
            with self.subTest(telephone=user.telephone):
                self.client.force_authenticate(user=user)
                response = self.client.get(self.campaigns_url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
