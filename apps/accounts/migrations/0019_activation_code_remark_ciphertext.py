from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0018_update_exam_preparation_offer_copy")]

    operations = [
        migrations.AddField(
            model_name="activationcoderecord",
            name="code_ciphertext",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="activationcoderecord",
            name="remark",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
