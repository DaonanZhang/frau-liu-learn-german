from django.db import migrations, models
from django.db.models import F, Q


def migrate_entitlement_refs_forward(apps, schema_editor):
    Entitlement = apps.get_model("accounts", "Entitlement")
    prefix = "alipay_payment:"
    for entitlement in Entitlement.objects.filter(external_ref__startswith=prefix).iterator():
        entitlement.external_ref = f"payment:alipay:{entitlement.external_ref[len(prefix):]}"
        entitlement.save(update_fields=["external_ref"])


def migrate_entitlement_refs_backward(apps, schema_editor):
    Entitlement = apps.get_model("accounts", "Entitlement")
    prefix = "payment:alipay:"
    for entitlement in Entitlement.objects.filter(external_ref__startswith=prefix).iterator():
        entitlement.external_ref = f"alipay_payment:{entitlement.external_ref[len(prefix):]}"
        entitlement.save(update_fields=["external_ref"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0034_reset_device_activity_after_lifecycle_fix"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="alipaywebsitepayment",
            name="uniq_nonblank_alipay_trade_no",
        ),
        migrations.RemoveConstraint(
            model_name="alipaywebsitepayment",
            name="alipay_refund_amount_valid",
        ),
        migrations.RenameModel(
            old_name="AlipayWebsitePayment",
            new_name="PaymentOrder",
        ),
        migrations.RenameField(
            model_name="paymentorder",
            old_name="alipay_trade_no",
            new_name="provider_trade_no",
        ),
        migrations.RenameIndex(
            model_name="paymentorder",
            old_name="idx_alipay_status_created",
            new_name="idx_payment_status_created",
        ),
        migrations.AddField(
            model_name="paymentorder",
            name="provider",
            field=models.CharField(
                choices=[("alipay", "Alipay"), ("wechat_pay", "WeChat Pay")],
                db_index=True,
                default="alipay",
                help_text="Payment provider responsible for this order.",
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name="paymentorder",
            name="provider_trade_no",
            field=models.CharField(
                blank=True,
                db_index=True,
                default="",
                help_text="Trade number returned by the selected payment provider.",
                max_length=64,
            ),
        ),
        migrations.AlterField(
            model_name="paymentorder",
            name="subject",
            field=models.CharField(
                help_text="Payment subject shown to the customer and payment provider.",
                max_length=256,
            ),
        ),
        migrations.AlterField(
            model_name="paymentorder",
            name="raw_notify_payload",
            field=models.JSONField(
                blank=True,
                help_text="Raw notification payload received from the payment provider, if available.",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="paymentorder",
            name="last_reconciled_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Last time this payment was successfully reconciled with its provider.",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="paymentorder",
            name="refunded_amount",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Cumulative amount confirmed as refunded by the payment provider.",
                max_digits=10,
            ),
        ),
        migrations.RunPython(
            migrate_entitlement_refs_forward,
            migrate_entitlement_refs_backward,
        ),
        migrations.AddConstraint(
            model_name="paymentorder",
            constraint=models.UniqueConstraint(
                condition=~Q(provider_trade_no=""),
                fields=("provider", "provider_trade_no"),
                name="uniq_provider_nonblank_trade_no",
            ),
        ),
        migrations.AddConstraint(
            model_name="paymentorder",
            constraint=models.CheckConstraint(
                condition=Q(refunded_amount__gte=0) & Q(refunded_amount__lte=F("total_amount")),
                name="payment_refund_amount_valid",
            ),
        ),
    ]
