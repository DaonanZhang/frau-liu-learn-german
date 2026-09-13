from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0029_remove_coupon_stackability"),
    ]

    operations = [
        migrations.CreateModel(
            name="AccountLoginSession",
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
                ("device_id", models.CharField(max_length=64)),
                (
                    "token_id",
                    models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="login_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="accountloginsession",
            constraint=models.UniqueConstraint(
                fields=("user", "device_id"),
                name="accounts_unique_login_device",
            ),
        ),
        migrations.AddIndex(
            model_name="accountloginsession",
            index=models.Index(
                fields=["user", "revoked_at", "expires_at"],
                name="accounts_login_active_idx",
            ),
        ),
    ]
