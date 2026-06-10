from __future__ import annotations

from django.db import models


class ExerciseBase(models.Model):
    class Level(models.TextChoices):
        A1 = "A1", "A1"
        A2 = "A2", "A2"
        B1 = "B1", "B1"
        B2 = "B2", "B2"
        C1 = "C1", "C1"
        C2 = "C2", "C2"

    class Skill(models.TextChoices):
        LISTENING = "LISTENING", "Listening"
        READING = "READING", "Reading"
        SPRACHBAUSTEIN = "SPRACHBAUSTEIN", "Sprachbaustein"
        WRITING = "WRITING", "Writing"
        SPEAKING = "SPEAKING", "Speaking"

    class ExerciseType(models.TextChoices):
        LISTENING_CHOICE = "LISTENING_CHOICE", "Listening choice"
        READING_TITLE_MATCHING = "READING_TITLE_MATCHING", "Reading title matching"
        READING_UNDERSTANDING = "READING_UNDERSTANDING", "Reading understanding"
        READING_AD_MATCHING = "READING_AD_MATCHING", "Reading ad matching"
        CLOZE_CHOICE = "CLOZE_CHOICE", "Cloze choice"
        CLOZE_MATCHING = "CLOZE_MATCHING", "Cloze matching"
        WRITING_PROMPT = "WRITING_PROMPT", "Writing prompt"
        SPEAKING_GAP_MATCHING = "SPEAKING_GAP_MATCHING", "Speaking gap matching"

    class CreationMethod(models.TextChoices):
        MANUAL = "manual", "Manual"
        XLSX_IMPORT = "xlsx_import", "XLSX import"
        SCRIPT_IMPORT = "script_import", "Script import"
        ADMIN = "admin", "Admin"

    level = models.CharField(
        max_length=8,
        choices=Level.choices,
        db_index=True,
        verbose_name="level",
    )
    skill = models.CharField(
        max_length=32,
        choices=Skill.choices,
        db_index=True,
        verbose_name="skill",
    )
    exercise_type = models.CharField(
        max_length=64,
        choices=ExerciseType.choices,
        db_index=True,
        verbose_name="exercise type",
    )
    external_id = models.CharField(
        max_length=64,
        verbose_name="external ID",
        help_text="Human-readable exercise identifier used by editors and import files.",
    )
    title = models.CharField(max_length=255, blank=True, default="", verbose_name="title")
    title_zh = models.CharField(max_length=255, blank=True, default="", verbose_name="Chinese title")
    difficulty = models.CharField(max_length=32, blank=True, default="", verbose_name="difficulty")
    is_real_exam = models.BooleanField(default=False, db_index=True, verbose_name="is real exam")
    source_name = models.CharField(max_length=255, blank=True, default="", verbose_name="source name")
    source_reference = models.CharField(max_length=255, blank=True, default="", verbose_name="source reference")
    imported_from_file = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="imported from file",
    )
    imported_at = models.DateTimeField(null=True, blank=True, verbose_name="imported at")
    creation_method = models.CharField(
        max_length=32,
        choices=CreationMethod.choices,
        default=CreationMethod.MANUAL,
        db_index=True,
        verbose_name="creation method",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="created at")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="updated at")

    class Meta:
        verbose_name = "exercise base"
        verbose_name_plural = "exercise bases"
        ordering = ["level", "exercise_type", "external_id", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["level", "exercise_type", "external_id"],
                name="exam_prep_base_level_type_ext_uq",
            )
        ]
        indexes = [
            models.Index(fields=["skill", "level"], name="exam_prep_base_skill_lvl_idx"),
            models.Index(fields=["exercise_type", "level"], name="exam_prep_base_type_lvl_idx"),
            models.Index(fields=["creation_method"], name="exam_prep_base_create_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.level}-{self.exercise_type}-{self.external_id}"

