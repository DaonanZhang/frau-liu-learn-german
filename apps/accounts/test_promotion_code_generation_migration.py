from __future__ import annotations

from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class PromotionCodeGenerationAuditMigrationTests(TransactionTestCase):
    migrate_from = ("accounts", "0036_payment_reconciliation_terminal_states")
    migrate_to = ("accounts", "0037_promotion_code_generation_audit")

    def setUp(self) -> None:
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = executor.loader.project_state([self.migrate_from]).apps
        PromotionCodeRecord = old_apps.get_model("accounts", "PromotionCodeRecord")
        expires_at = timezone.now() + timedelta(days=360)
        for code in ("LEGACYA001", "LEGACYA002"):
            PromotionCodeRecord.objects.create(
                code=code,
                campaign_name="历史博主",
                organization_name="历史博主",
                remark="历史批次",
                discount_amount="5.00",
                minimum_order_amount="0.00",
                expires_at=expires_at,
            )
        PromotionCodeRecord.objects.create(
            code="LEGACYB001",
            campaign_name="另一个博主",
            organization_name="另一个博主",
            remark="另一个批次",
            discount_amount="8.00",
            minimum_order_amount="0.00",
            expires_at=expires_at,
        )

    def tearDown(self) -> None:
        MigrationExecutor(connection).migrate([self.migrate_to])
        super().tearDown()

    def test_backfills_daonan_and_reconstructs_batches(self) -> None:
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        migrated_apps = executor.loader.project_state([self.migrate_to]).apps
        PromotionCodeRecord = migrated_apps.get_model("accounts", "PromotionCodeRecord")

        records = list(PromotionCodeRecord.objects.order_by("code"))
        self.assertEqual({record.operator_name for record in records}, {"daonan"})
        self.assertTrue(all(record.generation_batch_id for record in records))
        first_batch_ids = {
            record.generation_batch_id
            for record in records
            if record.campaign_name == "历史博主"
        }
        second_batch_id = next(
            record.generation_batch_id
            for record in records
            if record.campaign_name == "另一个博主"
        )
        self.assertEqual(len(first_batch_ids), 1)
        self.assertNotIn(second_batch_id, first_batch_ids)
