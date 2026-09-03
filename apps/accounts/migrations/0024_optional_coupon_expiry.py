from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0023_promotion_code_plaintext"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="promotioncoderecord",
            name="promo_valid_days_positive",
        ),
        migrations.AlterField(
            model_name="promotioncoderecord",
            name="coupon_valid_days",
            field=models.PositiveIntegerField(blank=True, default=None, null=True),
        ),
        migrations.AlterField(
            model_name="usercoupon",
            name="expires_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="promotioncoderecord",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(coupon_valid_days__isnull=True)
                    | models.Q(coupon_valid_days__gt=0)
                ),
                name="promo_valid_days_positive",
            ),
        ),
    ]
