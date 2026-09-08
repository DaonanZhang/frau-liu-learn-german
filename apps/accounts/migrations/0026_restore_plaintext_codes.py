import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import migrations


def _legacy_fernet():
    legacy_key = os.getenv("ACTIVATION_CODE_HASH_KEY") or settings.SECRET_KEY
    digest = hashlib.sha256(str(legacy_key).encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _restore_table(schema_editor, table_name):
    connection = schema_editor.connection
    quote = schema_editor.quote_name
    with connection.cursor() as cursor:
        if table_name not in connection.introspection.table_names(cursor):
            return
        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }
        if "code" in columns:
            if "code_hash" in columns or "code_ciphertext" in columns:
                raise RuntimeError(f"{table_name} contains mixed plaintext and legacy code columns")
            return
        if "code_hash" not in columns or "code_ciphertext" not in columns:
            raise RuntimeError(f"{table_name} does not contain a supported code schema")

        cursor.execute(
            f"SELECT {quote('id')}, {quote('code_ciphertext')} FROM {quote(table_name)}"
        )
        fernet = _legacy_fernet()
        plaintext_rows = []
        seen_codes = set()
        for record_id, ciphertext in cursor.fetchall():
            if not ciphertext:
                raise RuntimeError(
                    f"{table_name} record {record_id} has no recoverable plaintext code; "
                    "restore a pre-hash backup before continuing"
                )
            try:
                code = fernet.decrypt(str(ciphertext).encode("ascii")).decode("utf-8")
            except (InvalidToken, ValueError, UnicodeDecodeError) as exc:
                raise RuntimeError(
                    f"{table_name} record {record_id} cannot be restored with the legacy key"
                ) from exc
            normalized = code.strip().upper()
            if not normalized or len(normalized) > 32 or normalized in seen_codes:
                raise RuntimeError(f"{table_name} contains an invalid or duplicate plaintext code")
            seen_codes.add(normalized)
            plaintext_rows.append((record_id, normalized))

        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} "
            f"RENAME COLUMN {quote('code_hash')} TO {quote('code')}"
        )
        for record_id, code in plaintext_rows:
            cursor.execute(
                f"UPDATE {quote(table_name)} SET {quote('code')} = %s WHERE {quote('id')} = %s",
                [code, record_id],
            )
        if connection.vendor == "postgresql":
            schema_editor.execute(
                f"ALTER TABLE {quote(table_name)} "
                f"ALTER COLUMN {quote('code')} TYPE varchar(32)"
            )
        elif connection.vendor != "sqlite":
            raise RuntimeError("Legacy code recovery only supports PostgreSQL and SQLite")
        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} DROP COLUMN {quote('code_ciphertext')}"
        )


def restore_plaintext_codes(apps, schema_editor):
    _restore_table(schema_editor, "accounts_activationcoderecord")
    _restore_table(schema_editor, "accounts_promotioncoderecord")


class Migration(migrations.Migration):
    dependencies = [("accounts", "0025_bugreport")]

    operations = [
        migrations.RunPython(restore_plaintext_codes, migrations.RunPython.noop),
    ]
