from django.test import TestCase

from apps.exam_preparation import content_bundle
from apps.exam_preparation.models import ExerciseBase, SpeakingTeilExercise


class SpeakingContentBundleTests(TestCase):
    def test_task_round_trips_through_content_bundle(self):
        base = ExerciseBase.objects.create(
            exam_type="TELC",
            level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL3,
            external_id="bundle-task",
            title="Planen",
        )
        exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base,
            task="Zusammen planen.",
            content={"teil": "3", "dialogue": []},
        )

        data = content_bundle._serialize_speaking(base)
        content_bundle._sync_speaking(base, data)
        exercise.refresh_from_db()

        self.assertEqual(data["task"], "Zusammen planen.")
        self.assertEqual(exercise.task, "Zusammen planen.")

    def test_sync_without_task_clears_existing_task(self):
        base = ExerciseBase.objects.create(
            exam_type="TELC", level=ExerciseBase.Level.B1,
            skill=ExerciseBase.Skill.SPEAKING,
            exercise_type=ExerciseBase.ExerciseType.SPEAKING_TEIL3,
            external_id="bundle-task-clear", title="Planen",
        )
        exercise = SpeakingTeilExercise.objects.create(
            exercise_base=base, task="Old task", content={},
        )

        content_bundle._sync_speaking(base, {"instruction": "", "content": {}})
        exercise.refresh_from_db()

        self.assertEqual(exercise.task, "")
