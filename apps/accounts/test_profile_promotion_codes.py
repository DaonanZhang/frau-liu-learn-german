from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PromotionCodeRecord


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
