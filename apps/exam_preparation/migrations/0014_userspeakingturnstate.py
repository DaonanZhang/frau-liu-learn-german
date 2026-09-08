import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("exam_preparation", "0013_remove_speakinggapblank_exam_prep_sg_blank_key_uq_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserSpeakingTurnState",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_favorited", models.BooleanField(db_index=True, default=False, verbose_name="is favorited")),
                ("answer_payload", models.JSONField(blank=True, default=dict, verbose_name="answer payload")),
                ("is_correct", models.BooleanField(blank=True, db_index=True, null=True, verbose_name="is correct")),
                ("last_answered_at", models.DateTimeField(blank=True, null=True, verbose_name="last answered at")),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="created at")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="updated at")),
                ("turn_key", models.CharField(max_length=80)),
                ("exercise", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="user_turn_states", to="exam_preparation.speakingteilexercise")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="exam_preparation_speaking_turn_states", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at", "id"]},
        ),
        migrations.AddConstraint(
            model_name="userspeakingturnstate",
            constraint=models.UniqueConstraint(fields=("user", "exercise", "turn_key"), name="exam_prep_user_speak_turn_state_uq"),
        ),
    ]
