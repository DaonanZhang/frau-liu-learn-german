from __future__ import annotations

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_moduleseason_and_more"),
        ("learning_by_video", "0007_remove_learningvideouservideomark_uniq_learning_video_userdata_video_mark_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="video",
            name="season",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="videos",
                to="accounts.moduleseason",
                db_index=True,
                help_text="Content season for access control.",
            ),
        ),
    ]
