from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("learning_by_video", "0014_learningvideouservideonote"),
    ]

    operations = [
        migrations.AddField(
            model_name="video",
            name="full_subtitle_de",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="video",
            name="full_subtitle_zh",
            field=models.TextField(blank=True, default=""),
        ),
    ]
