import hashlib
import hmac
from datetime import timedelta

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.migrations.exceptions import IrreversibleError
from django.db.models import F, Q


def populate_payment_expiry(apps, schema_editor):
    Payment = apps.get_model("accounts", "AlipayWebsitePayment")
    for payment in Payment.objects.filter(
        status__in=["created", "pending"],
        expires_at__isnull=True,
    ).iterator():
        payment.expires_at = payment.created_at + timedelta(minutes=15)
        payment.save(update_fields=["expires_at"])


def prevent_data_loss_on_reverse(apps, schema_editor):
    Payment = apps.get_model("accounts", "AlipayWebsitePayment")
    PaymentGrantTask = apps.get_model("accounts", "PaymentGrantTask")
    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    if (
        Payment.objects.exists()
        or PaymentGrantTask.objects.exists()
        or ActivationCodeRecord.objects.exists()
    ):
        raise IrreversibleError(
            "Refusing to reverse accounts.0017 because doing so would discard "
            "payment lifecycle fields or make activation-code records unusable."
        )


def activation_code_model_operation():
    return migrations.CreateModel(
        name="ActivationCodeRecord",
        fields=[
            (
                "id",
                models.BigAutoField(
                    auto_created=True,
                    primary_key=True,
                    serialize=False,
                    verbose_name="ID",
                ),
            ),
            ("code_hash", models.CharField(max_length=64, unique=True)),
            ("payload", models.JSONField(default=dict)),
            (
                "status",
                models.CharField(
                    choices=[
                        ("active", "Active"),
                        ("consumed", "Consumed"),
                        ("expired", "Expired"),
                        ("revoked", "Revoked"),
                    ],
                    db_index=True,
                    default="active",
                    max_length=16,
                ),
            ),
            ("ttl_seconds", models.PositiveIntegerField()),
            ("expires_at", models.DateTimeField(db_index=True)),
            ("consumed_at", models.DateTimeField(blank=True, null=True)),
            ("created_at", models.DateTimeField(auto_now_add=True)),
            ("updated_at", models.DateTimeField(auto_now=True)),
            (
                "consumed_by_user",
                models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="consumed_activation_codes",
                    to=settings.AUTH_USER_MODEL,
                ),
            ),
        ],
        options={
            "indexes": [
                models.Index(
                    fields=["status", "expires_at"],
                    name="idx_acr_status_exp",
                ),
                models.Index(
                    fields=["consumed_by_user", "status"],
                    name="idx_acr_user_status",
                ),
            ],
        },
    )


def ensure_activation_code_table(apps, schema_editor):
    """Create the ledger or upgrade the table left by the older branch.

    The historical ``0013_activationcoderecord`` migration existed on another
    branch and may already have created this table with a plaintext ``code``
    column. That migration is not in this branch's graph, so this migration
    must handle both database histories without dropping existing records.
    """

    ActivationCodeRecord = apps.get_model("accounts", "ActivationCodeRecord")
    connection = schema_editor.connection
    table_name = ActivationCodeRecord._meta.db_table
    quote = schema_editor.quote_name

    with connection.cursor() as cursor:
        if table_name not in connection.introspection.table_names(cursor):
            schema_editor.create_model(ActivationCodeRecord)
            return

        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }
        final_columns = {
            "id",
            "code_hash",
            "status",
            "payload",
            "ttl_seconds",
            "expires_at",
            "consumed_at",
            "created_at",
            "updated_at",
            "consumed_by_user_id",
        }
        if "code_hash" in columns:
            missing = final_columns - columns
            if missing:
                raise RuntimeError(
                    "Activation-code table has an unsupported partial schema; "
                    f"missing columns: {', '.join(sorted(missing))}"
                )
            return

        legacy_columns = (final_columns - {"code_hash"}) | {"code"}
        missing = legacy_columns - columns
        if missing:
            raise RuntimeError(
                "Activation-code table does not match the known legacy schema; "
                f"missing columns: {', '.join(sorted(missing))}"
            )

        cursor.execute(
            f"SELECT {quote('id')}, {quote('code')} FROM {quote(table_name)}"
        )
        hashed_rows = []
        seen_hashes = set()
        for record_id, plaintext_code in cursor.fetchall():
            normalized_code = str(plaintext_code or "").strip().upper()
            if not normalized_code:
                raise RuntimeError("Activation-code table contains an empty code")
            hash_key = str(settings.ACTIVATION_CODE_HASH_KEY).encode("utf-8")
            code_hash = hmac.new(
                hash_key,
                normalized_code.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            if code_hash in seen_hashes:
                raise RuntimeError(
                    "Activation-code table contains duplicate codes after normalization"
                )
            seen_hashes.add(code_hash)
            hashed_rows.append((code_hash, record_id))

        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} "
            f"RENAME COLUMN {quote('code')} TO {quote('code_hash')}"
        )
        if connection.vendor == "postgresql":
            schema_editor.execute(
                f"ALTER TABLE {quote(table_name)} "
                f"ALTER COLUMN {quote('code_hash')} TYPE varchar(64)"
            )
        elif connection.vendor != "sqlite":
            raise RuntimeError(
                "Legacy activation-code migration is only supported on PostgreSQL and SQLite"
            )

        for code_hash, record_id in hashed_rows:
            cursor.execute(
                f"UPDATE {quote(table_name)} SET {quote('code_hash')} = %s "
                f"WHERE {quote('id')} = %s",
                [code_hash, record_id],
            )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_seed_exam_preparation_offers"),
        ("accounts", "0013_activationcoderecord"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="entitlement",
            name="uniq_ent_user_scope_plan_start",
        ),
        migrations.AlterField(
            model_name="alipaywebsitepayment",
            name="status",
            field=models.CharField(
                choices=[
                    ("created", "Created"),
                    ("pending", "Pending"),
                    ("paid", "Paid"),
                    ("failed", "Failed"),
                    ("closed", "Closed"),
                    ("partially_refunded", "Partially refunded"),
                    ("refunded", "Refunded"),
                ],
                db_index=True,
                default="created",
                help_text="Current payment lifecycle status.",
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name="alipaywebsitepayment",
            name="expires_at",
            field=models.DateTimeField(
                blank=True,
                db_index=True,
                help_text="Local deadline after which an unpaid checkout must not be reused.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="alipaywebsitepayment",
            name="last_reconciled_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Last time this payment was successfully reconciled with Alipay.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="alipaywebsitepayment",
            name="refunded_amount",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Cumulative amount confirmed as refunded by Alipay.",
                max_digits=10,
            ),
        ),
        migrations.AddField(
            model_name="alipaywebsitepayment",
            name="refunded_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp when a full refund was confirmed.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="paymentgranttask",
            name="idempotency_key",
            field=models.CharField(
                blank=True,
                help_text="Client-generated purchase intent key used to deduplicate order creation.",
                max_length=64,
                null=True,
                unique=True,
            ),
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.SeparateDatabaseAndState(
                    state_operations=[activation_code_model_operation()],
                ),
                migrations.RunPython(
                    ensure_activation_code_table,
                    migrations.RunPython.noop,
                ),
            ],
            state_operations=[activation_code_model_operation()],
        ),
        migrations.RunPython(populate_payment_expiry, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="alipaywebsitepayment",
            constraint=models.CheckConstraint(
                condition=Q(refunded_amount__gte=0) & Q(refunded_amount__lte=F("total_amount")),
                name="alipay_refund_amount_valid",
            ),
        ),
        migrations.RunPython(
            migrations.RunPython.noop,
            prevent_data_loss_on_reverse,
        ),
    ]
