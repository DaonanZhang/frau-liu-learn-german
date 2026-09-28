from django.db import migrations


OLD_INSTRUCTIONS = (
    "Sie hören jeden Text zweimal.",
    "Sie hören diese Texte zweimal.",
)
NEW_INSTRUCTION = "Sie hören jeden Text nur einmal."


def normalize_teil3_instructions(apps, schema_editor):
    """Normalize existing Teil 3 instructions to a single playback."""
    listening_exercise = apps.get_model("exam_preparation", "ListeningExercise")
    for exercise in listening_exercise.objects.filter(listening_type="dialog_true_false_twice"):
        script = exercise.script
        for instruction in OLD_INSTRUCTIONS:
            script = script.replace(instruction, NEW_INSTRUCTION)
        if script != exercise.script:
            exercise.script = script
            exercise.save(update_fields=["script"])


def restore_teil3_instructions(apps, schema_editor):
    """Restore the legacy two-play instruction during migration rollback."""
    listening_exercise = apps.get_model("exam_preparation", "ListeningExercise")
    for exercise in listening_exercise.objects.filter(listening_type="dialog_true_false_twice"):
        script = exercise.script.replace(NEW_INSTRUCTION, OLD_INSTRUCTIONS[0])
        if script != exercise.script:
            exercise.script = script
            exercise.save(update_fields=["script"])


class Migration(migrations.Migration):
    dependencies = [("exam_preparation", "0023_savedmockexam_is_passed_and_more")]

    operations = [migrations.RunPython(normalize_teil3_instructions, restore_teil3_instructions)]
