from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("accounts", "0012_purchaseoffer_paymentgranttask_offer"),
    ]

    operations = [
        migrations.CreateModel(
            name="ActivationCodeRecord",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("code", models.CharField(db_index=True, max_length=32, unique=True)),
                ("status", models.CharField(choices=[("active", "Active"), ("consumed", "Consumed"), ("expired", "Expired"), ("revoked", "Revoked")], db_index=True, default="active", max_length=16)),
                ("payload", models.JSONField(default=dict)),
                ("ttl_seconds", models.PositiveIntegerField()),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("consumed_by_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="consumed_activation_codes", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name="activationcoderecord",
            index=models.Index(fields=["status", "expires_at"], name="idx_acr_status_exp"),
        ),
        migrations.AddIndex(
            model_name="activationcoderecord",
            index=models.Index(fields=["consumed_by_user", "status"], name="idx_acr_user_status"),
        ),
    ]
