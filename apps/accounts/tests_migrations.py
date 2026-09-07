from datetime import timedelta

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ActivationCodeLedgerMigrationTests(TransactionTestCase):
    common_parent = ("accounts", "0012_purchaseoffer_paymentgranttask_offer")
    migrate_from = ("accounts", "0016_seed_exam_preparation_offers")
    legacy_parent = ("accounts", "0013_activationcoderecord")
    migrate_to = ("accounts", "0026_restore_plaintext_codes")

    def setUp(self) -> None:
        super().setUp()
        MigrationExecutor(connection).migrate([self.migrate_to])

    def tearDown(self) -> None:
        MigrationExecutor(connection).migrate(
            [("accounts", "0026_restore_plaintext_codes")]
        )
        super().tearDown()

    def test_legacy_activation_code_rows_remain_plaintext(self) -> None:
        executor = MigrationExecutor(connection)
        executor.migrate([self.common_parent])
        executor = MigrationExecutor(connection)
        migration_parents = [
            self.migrate_from,
            self.legacy_parent,
        ]
        executor.migrate(migration_parents)
        old_apps = executor.loader.project_state(migration_parents).apps

        User = old_apps.get_model("accounts", "User")
        Module = old_apps.get_model("accounts", "Module")
        Entitlement = old_apps.get_model("accounts", "Entitlement")
        Payment = old_apps.get_model("accounts", "AlipayWebsitePayment")
        PaymentGrantTask = old_apps.get_model("accounts", "PaymentGrantTask")
        LegacyActivationCodeRecord = old_apps.get_model(
            "accounts", "ActivationCodeRecord"
        )

        user = User.objects.create(
            telephone="13900000017",
            username="migration-user-0017",
        )
        module = Module.objects.create(
            key="migration-safety-module",
            name="Migration safety module",
            is_active=True,
        )
        entitlement = Entitlement.objects.create(
            user=user,
            module=module,
            plan="m1",
            status="active",
            external_ref="migration-safety-entitlement",
        )
        payment = Payment.objects.create(
            merchant_order_no="MIGRATION-SAFETY-0017",
            subject="Migration safety payment",
            total_amount="29.90",
            status="paid",
            alipay_trade_no="MIGRATION-SAFETY-TRADE-0017",
            raw_notify_payload={"trade_status": "TRADE_SUCCESS"},
            paid_at=timezone.now(),
        )
        grant_task = PaymentGrantTask.objects.create(
            payment=payment,
            user=user,
            module=module,
            plan="m1",
            status="succeeded",
            attempt_count=1,
            last_error="",
            processed_at=timezone.now(),
        )

        for code, status in (
            ("LEGACY01", "consumed"),
            ("LEGACY02", "revoked"),
            ("LEGACY03", "active"),
        ):
            LegacyActivationCodeRecord.objects.create(
                code=code,
                status=status,
                payload={
                    "entitlements": [
                        {
                            "module": "migration-safety-module",
                            "plan": "m1",
                            "season_number": None,
                        }
                    ]
                },
                ttl_seconds=3600,
                expires_at=timezone.now() + timedelta(hours=1),
            )

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        migrated_apps = executor.loader.project_state([self.migrate_to]).apps
        ActivationCodeRecord = migrated_apps.get_model("accounts", "ActivationCodeRecord")
        MigratedUser = migrated_apps.get_model("accounts", "User")
        MigratedEntitlement = migrated_apps.get_model("accounts", "Entitlement")
        MigratedPayment = migrated_apps.get_model("accounts", "AlipayWebsitePayment")
        MigratedPaymentGrantTask = migrated_apps.get_model("accounts", "PaymentGrantTask")

        table_name = "accounts_activationcoderecord"
        with connection.cursor() as cursor:
            columns = {
                column.name
                for column in connection.introspection.get_table_description(
                    cursor,
                    table_name,
                )
            }
        self.assertIn("code", columns)
        self.assertNotIn("code_hash", columns)
        self.assertEqual(ActivationCodeRecord.objects.count(), 3)
        self.assertEqual(
            set(ActivationCodeRecord.objects.values_list("code", flat=True)),
            {"LEGACY01", "LEGACY02", "LEGACY03"},
        )
        self.assertEqual(
            set(ActivationCodeRecord.objects.values_list("status", flat=True)),
            {"active", "consumed", "revoked"},
        )
        self.assertEqual(
            MigratedUser.objects.get(pk=user.pk).telephone,
            "13900000017",
        )
        migrated_entitlement = MigratedEntitlement.objects.get(pk=entitlement.pk)
        self.assertEqual(migrated_entitlement.user_id, user.pk)
        self.assertEqual(migrated_entitlement.module_id, module.pk)
        self.assertEqual(migrated_entitlement.plan, "m1")
        self.assertEqual(migrated_entitlement.status, "active")
        self.assertEqual(
            migrated_entitlement.external_ref,
            "migration-safety-entitlement",
        )
        migrated_payment = MigratedPayment.objects.get(pk=payment.pk)
        self.assertEqual(migrated_payment.merchant_order_no, "MIGRATION-SAFETY-0017")
        self.assertEqual(migrated_payment.status, "paid")
        self.assertEqual(migrated_payment.alipay_trade_no, "MIGRATION-SAFETY-TRADE-0017")
        self.assertEqual(
            migrated_payment.raw_notify_payload,
            {"trade_status": "TRADE_SUCCESS"},
        )
        self.assertEqual(str(migrated_payment.total_amount), "29.90")
        self.assertEqual(str(migrated_payment.refunded_amount), "0.00")
        migrated_grant_task = MigratedPaymentGrantTask.objects.get(pk=grant_task.pk)
        self.assertEqual(migrated_grant_task.payment_id, payment.pk)
        self.assertEqual(migrated_grant_task.user_id, user.pk)
        self.assertEqual(migrated_grant_task.module_id, module.pk)
        self.assertEqual(migrated_grant_task.status, "succeeded")
        self.assertEqual(migrated_grant_task.attempt_count, 1)
        self.assertIsNone(migrated_grant_task.idempotency_key)

        from apps.accounts.models import User as CurrentUser
        from apps.accounts.security.activation import apply_activation_code_for_user

        redemption_user = CurrentUser.objects.create(
            telephone="13900000018",
            username="migration-redemption-user",
        )
        granted = apply_activation_code_for_user(
            user=redemption_user,
            code="legacy03",
        )
        self.assertEqual(len(granted), 1)
        self.assertEqual(granted[0].plan, "m1")
        self.assertEqual(
            granted[0].external_ref,
            "activation_code:LEGACY03",
        )
        self.assertEqual(
            ActivationCodeRecord.objects.get(code="LEGACY03").status,
            "consumed",
        )
