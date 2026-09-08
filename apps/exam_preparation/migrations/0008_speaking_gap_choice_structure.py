from django.db import migrations, models
import django.db.models.deletion


def expand_shared_speaking_options(apps, schema_editor):
    SpeakingGapExercise = apps.get_model("exam_preparation", "SpeakingGapMatchingExercise")
    SpeakingGapOption = apps.get_model("exam_preparation", "SpeakingGapOption")

    for exercise in SpeakingGapExercise.objects.all().iterator():
        shared_options = list(
            SpeakingGapOption.objects.filter(exercise_id=exercise.pk, blank_id__isnull=True)
            .order_by("option_order", "id")
        )
        for blank in exercise.blanks.all().order_by("blank_number", "id"):
            for option in shared_options:
                is_correct = option.pk == blank.correct_option_id
                SpeakingGapOption.objects.create(
                    exercise_id=exercise.pk,
                    blank_id=blank.pk,
                    option_key=option.option_key,
                    option_text=option.option_text,
                    option_order=option.option_order,
                    is_extra=option.is_extra,
                    is_correct=is_correct,
                    explanation=blank.explanation if is_correct else "",
                    sort_order=option.option_order,
                )


def delete_old_shared_speaking_options(apps, schema_editor):
    SpeakingGapOption = apps.get_model("exam_preparation", "SpeakingGapOption")
    SpeakingGapOption.objects.filter(blank_id__isnull=True).delete()


def seed_cloze_choice_copy(apps, schema_editor):
    ExerciseBase = apps.get_model("exam_preparation", "ExerciseBase")
    ClozeChoiceExercise = apps.get_model("exam_preparation", "ClozeChoiceExercise")
    SpeakingGapExercise = apps.get_model("exam_preparation", "SpeakingGapMatchingExercise")
    SpeakingGapBlank = apps.get_model("exam_preparation", "SpeakingGapBlank")
    SpeakingGapOption = apps.get_model("exam_preparation", "SpeakingGapOption")

    source = ClozeChoiceExercise.objects.select_related("exercise_base").order_by("id").first()
    if source:
        source_base = source.exercise_base
        external_id = f"CLOZE-{source_base.external_id}"
        base_defaults = {
            "skill": "SPEAKING",
            "exam_type": source_base.exam_type or "telc",
            "title": source_base.title,
            "difficulty": source_base.difficulty,
            "is_real_exam": source_base.is_real_exam,
            "source_name": source_base.source_name,
            "source_reference": source_base.source_reference,
            "imported_from_file": "b1_cloze_question_example.xlsx",
            "creation_method": "script_import",
        }
        level = source_base.level
        content = source.content_with_placeholders
        original_source_text = source.original_source_text
        blank_rows = []
        for source_blank in source.blanks.all().order_by("blank_number", "id"):
            blank_rows.append(
                {
                    "blank_key": source_blank.blank_key,
                    "blank_number": source_blank.blank_number,
                    "options": [
                        {
                            "option_key": option.option_key,
                            "option_text": option.option_text,
                            "is_correct": option.is_correct,
                            "explanation": option.explanation,
                            "sort_order": option.sort_order,
                        }
                        for option in source_blank.options.all().order_by("sort_order", "id")
                    ],
                }
            )
    else:
        external_id = "CLOZE-001"
        level = "B1"
        base_defaults = {
            "skill": "SPEAKING",
            "exam_type": "telc",
            "title": "Ein Ausflug",
            "difficulty": "",
            "is_real_exam": False,
            "source_name": "Sprachbausteine Teil 1 sample",
            "source_reference": "",
            "imported_from_file": "b1_cloze_question_example.xlsx",
            "creation_method": "script_import",
        }
        content = "Last weekend, I {{blank_1}} to the park. The weather was {{blank_2}}."
        original_source_text = "Original telc-style practice item"
        blank_rows = [
            {
                "blank_key": "blank_1",
                "blank_number": 1,
                "options": [
                    {"option_key": "A", "option_text": "go", "is_correct": False, "explanation": "", "sort_order": 0},
                    {"option_key": "B", "option_text": "went", "is_correct": True, "explanation": "Last weekend signals past tense, so went is correct.", "sort_order": 1},
                    {"option_key": "C", "option_text": "going", "is_correct": False, "explanation": "", "sort_order": 2},
                ],
            },
            {
                "blank_key": "blank_2",
                "blank_number": 2,
                "options": [
                    {"option_key": "A", "option_text": "sunny", "is_correct": True, "explanation": "The adjective sunny fits after was.", "sort_order": 0},
                    {"option_key": "B", "option_text": "sun", "is_correct": False, "explanation": "", "sort_order": 1},
                    {"option_key": "C", "option_text": "shine", "is_correct": False, "explanation": "", "sort_order": 2},
                ],
            },
        ]

    exercise_base, _ = ExerciseBase.objects.update_or_create(
        level=level,
        exercise_type="SPEAKING_GAP_MATCHING",
        external_id=external_id,
        defaults=base_defaults,
    )
    exercise, _ = SpeakingGapExercise.objects.update_or_create(
        exercise_base=exercise_base,
        defaults={
            "content_with_placeholders": content,
            "original_source_text": original_source_text,
        },
    )
    exercise.blanks.all().delete()
    for blank_row in blank_rows:
        blank = SpeakingGapBlank.objects.create(
            exercise=exercise,
            blank_key=blank_row["blank_key"],
            blank_number=blank_row["blank_number"],
        )
        for option_row in blank_row["options"]:
            SpeakingGapOption.objects.create(blank=blank, **option_row)


def remove_seeded_cloze_choice_copy(apps, schema_editor):
    ExerciseBase = apps.get_model("exam_preparation", "ExerciseBase")
    ExerciseBase.objects.filter(
        exercise_type="SPEAKING_GAP_MATCHING",
        external_id__startswith="CLOZE-",
        imported_from_file="b1_cloze_question_example.xlsx",
    ).delete()


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("exam_preparation", "0007_userwritingexampletextstate"),
    ]

    operations = [
        migrations.AddField(
            model_name="speakinggapmatchingexercise",
            name="original_source_text",
            field=models.TextField(blank=True, default="", verbose_name="original source text"),
        ),
        migrations.AddField(
            model_name="speakinggapoption",
            name="blank",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="options",
                to="exam_preparation.speakinggapblank",
                verbose_name="blank",
            ),
        ),
        migrations.AddField(
            model_name="speakinggapoption",
            name="explanation",
            field=models.TextField(blank=True, default="", verbose_name="explanation"),
        ),
        migrations.AddField(
            model_name="speakinggapoption",
            name="is_correct",
            field=models.BooleanField(db_index=True, default=False, verbose_name="is correct"),
        ),
        migrations.AddField(
            model_name="speakinggapoption",
            name="sort_order",
            field=models.PositiveIntegerField(default=0, verbose_name="sort order"),
        ),
        migrations.RemoveConstraint(
            model_name="speakinggapoption",
            name="exam_prep_sg_opt_key_uq",
        ),
        migrations.RunPython(expand_shared_speaking_options, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="speakinggapblank",
            name="correct_option",
        ),
        migrations.RunPython(delete_old_shared_speaking_options, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="speakinggapblank",
            name="explanation",
        ),
        migrations.RemoveField(
            model_name="speakinggapoption",
            name="exercise",
        ),
        migrations.RemoveField(
            model_name="speakinggapoption",
            name="is_extra",
        ),
        migrations.RemoveField(
            model_name="speakinggapoption",
            name="option_order",
        ),
        migrations.AlterModelOptions(
            name="speakinggapoption",
            options={
                "ordering": ["blank_id", "sort_order", "id"],
                "verbose_name": "speaking gap option",
                "verbose_name_plural": "speaking gap options",
            },
        ),
        migrations.AlterField(
            model_name="speakinggapoption",
            name="blank",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="options",
                to="exam_preparation.speakinggapblank",
                verbose_name="blank",
            ),
        ),
        migrations.AddConstraint(
            model_name="speakinggapoption",
            constraint=models.UniqueConstraint(
                fields=("blank", "option_key"),
                name="exam_prep_sg_opt_key_uq",
            ),
        ),
        migrations.RunPython(seed_cloze_choice_copy, remove_seeded_cloze_choice_copy),
    ]
