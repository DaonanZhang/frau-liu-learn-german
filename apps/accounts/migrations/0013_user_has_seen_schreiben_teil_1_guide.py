from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0012_purchaseoffer_paymentgranttask_offer"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="has_seen_schreiben_teil_1_guide",
            field=models.BooleanField(
                default=False,
                verbose_name="has seen Schreiben Teil 1 guide",
            ),
        ),
    ]
