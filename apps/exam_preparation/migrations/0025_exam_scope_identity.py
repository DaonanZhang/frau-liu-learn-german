import re

from django.db import migrations, models


_EXAM_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")


def _normalize_exam_level(value):
    if not isinstance(value, str):
        raise ValueError("Exam level must be a supported CEFR level.")
    level = value.strip().upper()
    if level not in _EXAM_LEVELS:
        raise ValueError(f"Invalid exam level in exam scope migration: {value!r}.")
    return level


def _normalize_exam_family(value, level):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Exam family must be non-empty in exam scope migration.")
    normalized_level = _normalize_exam_level(level)
    family = value.strip()
    legacy_suffix = re.fullmatch(r"(.+?)\s+([A-Z][0-9])", family, re.IGNORECASE)
    if legacy_suffix:
        suffix_level = _normalize_exam_level(legacy_suffix.group(2))
        if suffix_level != normalized_level:
            raise ValueError(
                f"Legacy exam family level {suffix_level} does not match {normalized_level}."
            )
        family = legacy_suffix.group(1)
    family = family.upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*", family):
        raise ValueError(f"Invalid exam family in exam scope migration: {value!r}.")
    return family


def normalize_exam_scope_families(apps, schema_editor):
    ExerciseBase = apps.get_model("exam_preparation", "ExerciseBase")
    MockExamPaper = apps.get_model("exam_preparation", "MockExamPaper")
    SavedMockExam = apps.get_model("exam_preparation", "SavedMockExam")

    exercises = list(ExerciseBase.objects.order_by("id").iterator())
    normalized_exercises = []
    seen = {}
    for exercise in exercises:
        exam_type = _normalize_exam_family(exercise.exam_type, exercise.level)
        level = _normalize_exam_level(exercise.level)
        key = (exam_type, level, exercise.exercise_type, exercise.external_id)
        if key in seen:
            raise RuntimeError(
                "Cannot normalize exam scope: ExerciseBase rows "
                f"{seen[key]} and {exercise.pk} collide at {key!r}."
            )
        seen[key] = exercise.pk
        normalized_exercises.append((exercise, exam_type, level))

    normalized_papers = [
        (
            paper,
            _normalize_exam_family(paper.exam_type, paper.level),
            _normalize_exam_level(paper.level),
        )
        for paper in MockExamPaper.objects.order_by("id").iterator()
    ]
    normalized_saved = [
        (
            saved,
            _normalize_exam_family(saved.exam_type, saved.level),
            _normalize_exam_level(saved.level),
        )
        for saved in SavedMockExam.objects.order_by("id").iterator()
    ]

    for obj, exam_type, level in normalized_exercises + normalized_papers + normalized_saved:
        update_fields = []
        if obj.exam_type != exam_type:
            obj.exam_type = exam_type
            update_fields.append("exam_type")
        if obj.level != level:
            obj.level = level
            update_fields.append("level")
        if update_fields:
            obj.save(update_fields=update_fields)


class Migration(migrations.Migration):
    dependencies = [
        ("exam_preparation", "0024_normalize_listening_teil3_instruction"),
    ]

    operations = [
        migrations.RunPython(normalize_exam_scope_families, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="exercisebase",
            name="exam_prep_base_level_type_ext_uq",
        ),
        migrations.AddConstraint(
            model_name="exercisebase",
            constraint=models.UniqueConstraint(
                fields=("exam_type", "level", "exercise_type", "external_id"),
                name="exam_prep_base_scope_type_ext_uq",
            ),
        ),
        migrations.AddIndex(
            model_name="exercisebase",
            index=models.Index(
                fields=["exam_type", "level", "skill"],
                name="exam_prep_base_scope_skill_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="exercisebase",
            index=models.Index(
                fields=["exam_type", "level", "exercise_type"],
                name="exam_prep_base_scope_type_idx",
            ),
        ),
        migrations.AlterField(
            model_name="exercisebase",
            name="exam_type",
            field=models.CharField(
                db_index=True,
                default="TELC",
                help_text="Exam family or certificate type, for example TELC or GOETHE.",
                max_length=128,
                verbose_name="exam type",
            ),
        ),
        migrations.AlterField(
            model_name="mockexampaper",
            name="exam_type",
            field=models.CharField(default="TELC", max_length=128),
        ),
        migrations.AlterField(
            model_name="savedmockexam",
            name="exam_type",
            field=models.CharField(default="TELC", max_length=128),
        ),
    ]
