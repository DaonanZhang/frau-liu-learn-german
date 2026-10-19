from __future__ import annotations

import uuid
from datetime import timedelta

from django.db import migrations, models


def backfill_generation_audit(apps, schema_editor) -> None:
    PromotionCodeRecord = apps.get_model("accounts", "PromotionCodeRecord")
    active_batches = {}
    pending = []

    records = PromotionCodeRecord.objects.order_by("created_at", "id").iterator()
    for record in records:
        signature = (
            record.campaign_name,
            record.organization_name,
            record.remark,
            record.discount_amount,
            record.minimum_order_amount,
            record.applicable_module_id,
            record.applicable_season_id,
            record.applicable_offer_id,
            record.coupon_valid_days,
            record.expires_at,
            record.redemption_mode,
            record.stacking_policy,
        )
        previous = active_batches.get(signature)
        if previous is None or record.created_at - previous[1] > timedelta(minutes=5):
            batch_id = uuid.uuid4()
        else:
            batch_id = previous[0]
        active_batches[signature] = (batch_id, record.created_at)
        record.generation_batch_id = batch_id
        record.operator_name = "daonan"
        pending.append(record)

    if pending:
        PromotionCodeRecord.objects.bulk_update(
            pending,
            ["generation_batch_id", "operator_name"],
            batch_size=1000,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0036_payment_reconciliation_terminal_states"),
    ]

    operations = [
        migrations.AddField(
            model_name="promotioncoderecord",
            name="generation_batch_id",
            field=models.UUIDField(db_index=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="promotioncoderecord",
            name="operator_name",
            field=models.CharField(default="daonan", max_length=128),
        ),
        migrations.RunPython(backfill_generation_audit, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="promotioncoderecord",
            name="generation_batch_id",
            field=models.UUIDField(default=uuid.uuid4, db_index=True, editable=False),
        ),
    ]
