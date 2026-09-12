from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0028_optional_promotion_code_expiry"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="promotioncoderecord",
            name="is_stackable",
        ),
        migrations.RemoveField(
            model_name="usercoupon",
            name="is_stackable",
        ),
    ]
