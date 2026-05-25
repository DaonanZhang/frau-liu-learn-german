from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("learning_by_video", "0015_video_full_subtitles"),
    ]

    operations = [
        migrations.AddField(
            model_name="video",
            name="source",
            field=models.URLField(blank=True, default=""),
        ),
    ]
