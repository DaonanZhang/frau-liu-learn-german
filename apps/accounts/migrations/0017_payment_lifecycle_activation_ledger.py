from datetime import timedelta

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
    if (
        Payment.objects.exists()
        or PaymentGrantTask.objects.exists()
    ):
        raise IrreversibleError(
            "Refusing to reverse accounts.0017 because doing so would discard "
            "payment lifecycle fields."
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
