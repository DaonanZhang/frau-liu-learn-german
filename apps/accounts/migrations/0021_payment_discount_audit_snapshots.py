from django.db import migrations, models


def backfill_discount_audit_snapshots(apps, schema_editor):
    PaymentDiscountApplication = apps.get_model("accounts", "PaymentDiscountApplication")
    applications = PaymentDiscountApplication.objects.select_related(
        "campaign",
        "promotion_code",
    )
    for application in applications.iterator():
        application.campaign_name_snapshot = application.campaign.name
        application.campaign_organization_snapshot = application.campaign.organization_name
        application.promotion_code_remark_snapshot = application.promotion_code.remark
        application.save(
            update_fields=[
                "campaign_name_snapshot",
                "campaign_organization_snapshot",
                "promotion_code_remark_snapshot",
            ]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0020_promotioncampaign_promotioncoderecord_usercoupon_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="paymentdiscountapplication",
            name="selection_source",
            field=models.CharField(
                choices=[
                    ("automatic", "Automatically selected"),
                    ("manual", "Selected by user"),
                ],
                default="automatic",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="paymentdiscountapplication",
            name="campaign_name_snapshot",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="paymentdiscountapplication",
            name="campaign_organization_snapshot",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.AddField(
            model_name="paymentdiscountapplication",
            name="promotion_code_remark_snapshot",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(
            backfill_discount_audit_snapshots,
            migrations.RunPython.noop,
        ),
    ]
