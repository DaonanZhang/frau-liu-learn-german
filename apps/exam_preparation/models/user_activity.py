from __future__ import annotations

from django.conf import settings
from django.db import models


class UserExerciseFavorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="exam_preparation_favorites",
        verbose_name="user",
    )
    exercise = models.ForeignKey(
        "exam_preparation.ExerciseBase",
        on_delete=models.CASCADE,
        related_name="user_favorites",
        verbose_name="exercise",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")

    class Meta:
        verbose_name = "user exercise favorite"
        verbose_name_plural = "user exercise favorites"
        ordering = ["-created_at", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "exercise"],
                name="exam_prep_user_exercise_fav_uq",
            )
        ]

    def __str__(self) -> str:
        return f"UserExerciseFavorite<user={self.user_id} exercise={self.exercise_id}>"

