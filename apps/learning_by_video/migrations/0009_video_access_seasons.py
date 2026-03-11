from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_moduleseason_and_more"),
        ("learning_by_video", "0008_video_season"),
    ]

    operations = [
        migrations.AddField(
            model_name="video",
            name="access_seasons",
            field=models.ManyToManyField(
                blank=True,
                help_text="Additional seasons that grant access to this video.",
                related_name="access_videos",
                to="accounts.moduleseason",
            ),
        ),
    ]
