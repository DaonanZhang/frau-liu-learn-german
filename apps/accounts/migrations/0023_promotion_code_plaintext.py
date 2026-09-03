import base64
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import migrations, models


def _fernet():
    digest = hashlib.sha256(str(settings.ACTIVATION_CODE_HASH_KEY).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def copy_plaintext_codes(apps, schema_editor):
    PromotionCodeRecord = apps.get_model("accounts", "PromotionCodeRecord")
    fernet = _fernet()
    for record in PromotionCodeRecord.objects.iterator():
        if not record.code_ciphertext:
            raise RuntimeError(
                f"Promotion code record {record.pk} has no encrypted plaintext; migration stopped."
            )
        try:
            code = fernet.decrypt(record.code_ciphertext.encode("ascii")).decode("utf-8")
        except (InvalidToken, ValueError, UnicodeDecodeError) as exc:
            raise RuntimeError(
                f"Promotion code record {record.pk} cannot be decrypted with ACTIVATION_CODE_HASH_KEY."
            ) from exc
        record.code = code.strip().upper()
        record.save(update_fields=["code"])


def restore_protected_codes(apps, schema_editor):
    PromotionCodeRecord = apps.get_model("accounts", "PromotionCodeRecord")
    fernet = _fernet()
    hash_key = str(settings.ACTIVATION_CODE_HASH_KEY).encode("utf-8")
    for record in PromotionCodeRecord.objects.iterator():
        normalized = record.code.strip().upper()
        record.code_hash = hmac.new(
            hash_key,
            normalized.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        record.code_ciphertext = fernet.encrypt(normalized.encode("utf-8")).decode("ascii")
        record.save(update_fields=["code_hash", "code_ciphertext"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0022_flatten_promotion_campaign"),
    ]

    operations = [
        migrations.AlterField(
            model_name="promotioncoderecord",
            name="code_hash",
            field=models.CharField(max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="promotioncoderecord",
            name="code",
            field=models.CharField(max_length=32, null=True, unique=True),
        ),
        migrations.RunPython(copy_plaintext_codes, restore_protected_codes),
        migrations.AlterField(
            model_name="promotioncoderecord",
            name="code",
            field=models.CharField(max_length=32, unique=True),
        ),
        migrations.RemoveField(
            model_name="promotioncoderecord",
            name="code_hash",
        ),
        migrations.RemoveField(
            model_name="promotioncoderecord",
            name="code_ciphertext",
        ),
    ]
