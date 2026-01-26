from __future__ import annotations

from django.db import models


class ModuleSeason(models.Model):
    """
    Content season for a module, like TV Season 1 / Season 2.

    This is NOT a billing period.
    """

    module = models.ForeignKey(
        "accounts.Module",
        on_delete=models.CASCADE,
        related_name="seasons",
        db_index=True,
    )

    season_number = models.PositiveIntegerField(
        help_text="Content season number, e.g. 1, 2, 3.",
    )

    title = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Optional season title displayed in UI.",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["module", "season_number"],
                name="uniq_module_season_number",
            )
        ]
        indexes = [
            models.Index(fields=["module", "season_number"], name="idx_module_season_num"),
        ]

    def __str__(self) -> str:
        label = self.title or f"Season {self.season_number}"
        return f"ModuleSeason<module={self.module.key} {label}>"
