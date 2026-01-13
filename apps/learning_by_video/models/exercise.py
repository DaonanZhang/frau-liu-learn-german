from __future__ import annotations

from django.db import models


class VideoExerciseQuestion(models.Model):
    """
    Exercise question belonging to a video.

    CSV mapping:
    - question_id -> external_id
    - question_type -> question_type (mapped to stable enum)
    - question -> prompt
    """

    class QuestionType(models.TextChoices):
        TRUE_FALSE = "TRUE_FALSE"
        CHOICE = "CHOICE"

    video = models.ForeignKey(
        "learning_by_video.Video",
        on_delete=models.CASCADE,
        related_name="exercise_questions",
        db_index=True,
    )

    external_id = models.CharField(
        max_length=64,
        blank=True,
        default="",
        db_index=True,
        help_text="question_id from CSV (unique per video).",
    )

    question_type = models.CharField(max_length=16, choices=QuestionType.choices, db_index=True)

    prompt = models.TextField(help_text="Question stem shown to the user.")

    order = models.PositiveIntegerField(default=0, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["video", "order"], name="vxq_v_o"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["video", "external_id"],
                condition=~models.Q(external_id=""),
                name="vxq_v_ext_uq",
            )
        ]

    def __str__(self) -> str:
        return f"VideoExerciseQuestion<video={self.video_id} ext={self.external_id}>"


class VideoExerciseOption(models.Model):
    """
    One answer/option belonging to a VideoExerciseQuestion.

    CSV mapping:
    - answer -> text
    - is_correct -> is_correct (TRUE/FALSE string converted to bool at import)
    - explanation -> explanation
    """

    question = models.ForeignKey(
        "learning_by_video.VideoExerciseQuestion",
        on_delete=models.CASCADE,
        related_name="options",
        db_index=True,
    )

    text = models.TextField(help_text="Option text (CSV column: answer).")

    is_correct = models.BooleanField(default=False, db_index=True)

    explanation = models.TextField(blank=True, default="", help_text="Explanation for this specific option.")

    order = models.PositiveIntegerField(default=0, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["question", "order"], name="vxo_q_o"),
            models.Index(fields=["question", "is_correct"], name="vxo_q_c"),
        ]
        # Optional: prevents duplicate identical option text for same question
        constraints = [
            models.UniqueConstraint(
                fields=["question", "text"],
                name="vxo_q_text_uq",
            )
        ]

    def __str__(self) -> str:
        return f"VideoExerciseOption<q={self.question_id} correct={self.is_correct}>"
