from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0034_reset_device_activity_after_lifecycle_fix"),
    ]

    operations = [
        migrations.AddField(
            model_name="promotioncoderecord",
            name="redemption_mode",
            field=models.CharField(
                choices=[("single_use", "Single use"), ("reusable", "Reusable")],
                default="single_use",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="promotioncoderecord",
            name="stacking_policy",
            field=models.CharField(
                choices=[
                    ("stack", "Stack with automatic discounts"),
                    (
                        "exclusive_brand_friend",
                        "Cannot stack with the brand-friend discount",
                    ),
                ],
                default="stack",
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name="usercoupon",
            name="promotion_code",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="coupons",
                to="accounts.promotioncoderecord",
            ),
        ),
    ]
