# Generated manually for purchase offers and payment task linkage.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0011_paymentgranttask"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchaseOffer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.SlugField(max_length=64, unique=True)),
                ("title", models.CharField(max_length=128)),
                ("description", models.TextField(blank=True, default="")),
                ("plan", models.CharField(choices=[("trial_7d", "Trial (7 days)"), ("m1", "1 month"), ("m3", "3 months"), ("m6", "6 months"), ("m12", "12 months"), ("lifetime", "Lifetime")], db_index=True, max_length=16)),
                ("price_amount", models.DecimalField(decimal_places=2, max_digits=10)),
                ("currency", models.CharField(default="CNY", max_length=8)),
                ("is_active", models.BooleanField(db_index=True, default=True)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("module", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="purchase_offers", to="accounts.module")),
                ("season", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="purchase_offers", to="accounts.moduleseason")),
            ],
        ),
        migrations.AddIndex(
            model_name="purchaseoffer",
            index=models.Index(fields=["module", "is_active", "sort_order"], name="idx_offer_module_active_sort"),
        ),
        migrations.AddIndex(
            model_name="purchaseoffer",
            index=models.Index(fields=["season", "is_active"], name="idx_offer_season_active"),
        ),
        migrations.AddField(
            model_name="paymentgranttask",
            name="offer",
            field=models.ForeignKey(blank=True, db_index=True, help_text="Purchase offer used to create this payment, if applicable.", null=True, on_delete=django.db.models.deletion.PROTECT, related_name="payment_grant_tasks", to="accounts.purchaseoffer"),
        ),
    ]
