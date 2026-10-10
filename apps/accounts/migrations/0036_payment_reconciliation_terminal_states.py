from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0035_reusable_promotion_codes"),
    ]

    operations = [
        migrations.AlterField(
            model_name="paymentgranttask",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("processing", "Processing"),
                    ("succeeded", "Succeeded"),
                    ("failed", "Failed"),
                    ("canceled", "Canceled"),
                ],
                db_index=True,
                default="pending",
                help_text="Current processing state of the entitlement grant task.",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="alipaywebsitepayment",
            name="refund_entitlement_reconciled_at",
            field=models.DateTimeField(
                blank=True,
                help_text="Timestamp when entitlement revocation for a full refund was reconciled.",
                null=True,
            ),
        ),
    ]
