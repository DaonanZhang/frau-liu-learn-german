from decimal import Decimal

from django.db import migrations


OFFERS = (
    ("exam-preparation-30d", "备考季 30 天", "m1", Decimal("29.90"), 10),
    ("exam-preparation-60d", "备考季 60 天", "m2", Decimal("49.90"), 20),
    ("exam-preparation-90d", "备考季 90 天", "m3", Decimal("69.90"), 30),
)


def seed_exam_preparation_offers(apps, schema_editor):
    Module = apps.get_model("accounts", "Module")
    PurchaseOffer = apps.get_model("accounts", "PurchaseOffer")

    module, _ = Module.objects.update_or_create(
        key="exam_preparation",
        defaults={"name": "备考季", "is_active": True},
    )
    for code, title, plan, price, sort_order in OFFERS:
        PurchaseOffer.objects.update_or_create(
            code=code,
            defaults={
                "title": title,
                "description": f"备考季全部内容，自付款确认起延长 {title.split()[-2]} 天。",
                "module": module,
                "season": None,
                "plan": plan,
                "price_amount": price,
                "currency": "CNY",
                "is_active": True,
                "sort_order": sort_order,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0015_exam_preparation_timed_offers"),
    ]

    operations = [
        migrations.RunPython(
            seed_exam_preparation_offers,
            migrations.RunPython.noop,
        ),
    ]
