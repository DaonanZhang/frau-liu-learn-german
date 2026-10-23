from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import PromotionCodeRecord


class PromotionHistorySourceFilterTests(APITestCase):
    def setUp(self) -> None:
        self.admin = get_user_model().objects.create_user(
            telephone="110",
            country_code="+86",
            password="pass-123456",
            is_superuser=True,
            is_staff=True,
        )
        self.client.force_authenticate(user=self.admin)
        self.url = "/api/accounts/users/promotion-codes/"

    def create_record(
        self,
        code: str,
        batch_id,
        source_kind: str,
        campaign: str,
        operator: str,
        discount: str,
    ) -> PromotionCodeRecord:
        return PromotionCodeRecord.objects.create(
            code=code,
            generation_batch_id=batch_id,
            source_kind=source_kind,
            campaign_name=campaign,
            operator_name=operator,
            discount_amount=Decimal(discount),
        )

    def test_list_count_and_pagination_exclude_non_operational_batches(self) -> None:
        operational_ids = []
        for index in range(21):
            batch_id = uuid4()
            operational_ids.append(str(batch_id))
            self.create_record(
                f"OP{index:08d}", batch_id,
                PromotionCodeRecord.SourceKind.OPERATIONAL,
                f"Operational {index}", "Staff", "5.00",
            )
        self.create_record("REF0000001", uuid4(), PromotionCodeRecord.SourceKind.REFERRAL, "Referral only", "Referral actor", "10.00")
        self.create_record("INT0000001", uuid4(), PromotionCodeRecord.SourceKind.INTERNAL_REWARD, "Internal only", "Reward actor", "20.00")

        first_page = self.client.get(self.url)
        second_page = self.client.get(self.url, {"page": 2})

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 21)
        self.assertEqual(first_page.data["total_pages"], 2)
        self.assertEqual(len(first_page.data["results"]), 20)
        self.assertEqual(len(second_page.data["results"]), 1)
        listed_ids = {
            row["generation_batch_id"]
            for row in first_page.data["results"] + second_page.data["results"]
        }
        self.assertEqual(listed_ids, set(operational_ids))

    def test_search_excludes_non_operational_campaign_and_operator(self) -> None:
        self.create_record("REFSEARCH001", uuid4(), PromotionCodeRecord.SourceKind.REFERRAL, "Referral campaign", "Referral operator", "10.00")
        self.create_record("INTSEARCH001", uuid4(), PromotionCodeRecord.SourceKind.INTERNAL_REWARD, "Internal campaign", "Internal operator", "20.00")

        for term in ("Referral", "Referral operator", "Internal", "Internal operator"):
            with self.subTest(term=term):
                response = self.client.get(self.url, {"search": term})
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["results"], [])
                self.assertEqual(response.data["count"], 0)

    def test_non_operational_only_batch_detail_returns_404(self) -> None:
        for source_kind, code in (
            (PromotionCodeRecord.SourceKind.REFERRAL, "REFDETAIL01"),
            (PromotionCodeRecord.SourceKind.INTERNAL_REWARD, "INTDETAIL01"),
        ):
            batch_id = uuid4()
            self.create_record(code, batch_id, source_kind, "Private campaign", "Private operator", "25.00")
            with self.subTest(source_kind=source_kind):
                response = self.client.get(self.url, {"generation_batch_id": str(batch_id)})
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_mixed_batch_detail_contains_only_operational_data(self) -> None:
        batch_id = uuid4()
        self.create_record("OPSDETAIL001", batch_id, PromotionCodeRecord.SourceKind.OPERATIONAL, "Operational campaign", "Operational operator", "5.00")
        self.create_record("REFDETAIL002", batch_id, PromotionCodeRecord.SourceKind.REFERRAL, "Referral campaign", "Referral operator", "99.00")
        self.create_record("INTDETAIL003", batch_id, PromotionCodeRecord.SourceKind.INTERNAL_REWARD, "Internal campaign", "Internal operator", "88.00")

        response = self.client.get(self.url, {"generation_batch_id": str(batch_id)})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["partner_name"], "Operational campaign")
        self.assertEqual(response.data["operator_name"], "Operational operator")
        self.assertEqual(response.data["discount_amount"], "5.00")
        self.assertEqual(response.data["codes"], ["OPSDETAIL001"])

    def test_post_created_records_remain_operational_and_visible(self) -> None:
        response = self.client.post(
            self.url,
            {"partner_name": "New partner", "operator_name": "Staff", "count": 2},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        records = PromotionCodeRecord.objects.filter(code__in=response.data["codes"])
        self.assertEqual(records.count(), 2)
        self.assertEqual(
            set(records.values_list("source_kind", flat=True)),
            {PromotionCodeRecord.SourceKind.OPERATIONAL},
        )
        history = self.client.get(self.url)
        self.assertEqual(history.status_code, status.HTTP_200_OK)
        self.assertIn(
            response.data["partner_name"],
            {row["partner_name"] for row in history.data["results"]},
        )
