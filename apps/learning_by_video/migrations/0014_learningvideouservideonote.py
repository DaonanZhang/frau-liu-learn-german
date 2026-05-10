from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("learning_by_video", "0013_backfill_videoexercisequestion_category"),
    ]

    operations = [
        migrations.CreateModel(
            name="LearningVideoUserVideoNote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("note_markdown", models.TextField(blank=True, default="")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "learning_video_user_data",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="video_notes",
                        to="learning_by_video.learningvideouserdata",
                    ),
                ),
                (
                    "video",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="user_notes",
                        to="learning_by_video.video",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="learningvideouservideonote",
            constraint=models.UniqueConstraint(
                fields=("learning_video_user_data", "video"),
                name="uniq_lvu_video_note",
            ),
        ),
        migrations.AddIndex(
            model_name="learningvideouservideonote",
            index=models.Index(
                fields=["learning_video_user_data", "updated_at"],
                name="idx_lvu_note_updated",
            ),
        ),
        migrations.AddIndex(
            model_name="learningvideouservideonote",
            index=models.Index(
                fields=["video", "updated_at"],
                name="idx_video_note_updated",
            ),
        ),
    ]
