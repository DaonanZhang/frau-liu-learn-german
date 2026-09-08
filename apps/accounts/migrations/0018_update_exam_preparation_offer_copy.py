from django.db import migrations


OFFER_CODES = (
    "exam-preparation-30d",
    "exam-preparation-60d",
    "exam-preparation-90d",
)


def update_exam_preparation_offer_copy(apps, schema_editor):
    PurchaseOffer = apps.get_model("accounts", "PurchaseOffer")
    PurchaseOffer.objects.filter(code__in=OFFER_CODES).update(
        description="激活备考季全部内容！",
    )


def restore_exam_preparation_offer_copy(apps, schema_editor):
    PurchaseOffer = apps.get_model("accounts", "PurchaseOffer")
    for days in (30, 60, 90):
        PurchaseOffer.objects.filter(code=f"exam-preparation-{days}d").update(
            description=f"备考季全部内容，自付款确认起延长 {days} 天。",
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0017_payment_lifecycle_activation_ledger"),
    ]

    operations = [
        migrations.RunPython(
            update_exam_preparation_offer_copy,
            restore_exam_preparation_offer_copy,
        ),
    ]
