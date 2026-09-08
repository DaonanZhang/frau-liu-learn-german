from django.db import migrations, models


def copy_campaign_fields(apps, schema_editor):
    PromotionCodeRecord = apps.get_model("accounts", "PromotionCodeRecord")
    for record in PromotionCodeRecord.objects.select_related("campaign").iterator():
        record.campaign_name = record.campaign.name
        record.organization_name = record.campaign.organization_name
        record.save(update_fields=["campaign_name", "organization_name"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0021_payment_discount_audit_snapshots"),
    ]

    operations = [
        migrations.AddField(
            model_name="promotioncoderecord",
            name="campaign_name",
            field=models.CharField(default="", max_length=128),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="promotioncoderecord",
            name="organization_name",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
        migrations.RunPython(copy_campaign_fields, migrations.RunPython.noop),
        migrations.RemoveIndex(
            model_name="promotioncoderecord",
            name="idx_promo_campaign_use",
        ),
        migrations.RemoveIndex(
            model_name="usercoupon",
            name="idx_coupon_campaign_use",
        ),
        migrations.RemoveIndex(
            model_name="paymentdiscountapplication",
            name="idx_discount_campaign_paid",
        ),
        migrations.RemoveField(
            model_name="promotioncoderecord",
            name="campaign",
        ),
        migrations.RemoveField(
            model_name="usercoupon",
            name="campaign",
        ),
        migrations.RemoveField(
            model_name="paymentdiscountapplication",
            name="campaign",
        ),
        migrations.DeleteModel(
            name="PromotionCampaign",
        ),
        migrations.AddIndex(
            model_name="promotioncoderecord",
            index=models.Index(
                fields=["campaign_name", "status", "consumed_at"],
                name="idx_promo_name_use",
            ),
        ),
        migrations.AddIndex(
            model_name="paymentdiscountapplication",
            index=models.Index(
                fields=["campaign_name_snapshot", "status", "applied_at"],
                name="idx_discount_name_paid",
            ),
        ),
    ]
