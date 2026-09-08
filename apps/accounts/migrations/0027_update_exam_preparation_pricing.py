from decimal import Decimal

from django.db import migrations


OFFERS = (
    ("exam-preparation-30d", "备考季 1 个月", "m1", Decimal("59.90"), 10),
    ("exam-preparation-90d", "备考季 3 个月", "m3", Decimal("99.90"), 20),
    ("exam-preparation-180d", "备考季 6 个月", "m6", Decimal("169.90"), 30),
)


def update_exam_preparation_pricing(apps, schema_editor):
    Module = apps.get_model("accounts", "Module")
    PurchaseOffer = apps.get_model("accounts", "PurchaseOffer")

    module = Module.objects.get(key="exam_preparation")
    for code, title, plan, price, sort_order in OFFERS:
        PurchaseOffer.objects.update_or_create(
            code=code,
            defaults={
                "title": title,
                "description": "激活备考季全部内容！",
                "module": module,
                "season": None,
                "plan": plan,
                "price_amount": price,
                "currency": "CNY",
                "is_active": True,
                "sort_order": sort_order,
            },
        )

    PurchaseOffer.objects.filter(code="exam-preparation-60d").update(is_active=False)


def restore_previous_exam_preparation_pricing(apps, schema_editor):
    PurchaseOffer = apps.get_model("accounts", "PurchaseOffer")
    previous_offers = (
        ("exam-preparation-30d", "备考季 30 天", Decimal("29.90"), 10),
        ("exam-preparation-60d", "备考季 60 天", Decimal("49.90"), 20),
        ("exam-preparation-90d", "备考季 90 天", Decimal("69.90"), 30),
    )
    for code, title, price, sort_order in previous_offers:
        PurchaseOffer.objects.filter(code=code).update(
            title=title,
            price_amount=price,
            is_active=True,
            sort_order=sort_order,
        )
    PurchaseOffer.objects.filter(code="exam-preparation-180d").update(is_active=False)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0026_restore_plaintext_codes"),
    ]

    operations = [
        migrations.RunPython(
            update_exam_preparation_pricing,
            restore_previous_exam_preparation_pricing,
        ),
    ]
