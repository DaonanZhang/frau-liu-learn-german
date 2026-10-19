from django.test import SimpleTestCase, TestCase

from apps.exam_preparation.scope import ExamScope, normalize_exam_level, normalize_exam_type


class ExamScopeNormalizationTests(SimpleTestCase):
    def test_family_names_normalize_to_uppercase(self):
        self.assertEqual(normalize_exam_type("telc"), "TELC")
        self.assertEqual(normalize_exam_type("Telc"), "TELC")

    def test_legacy_family_and_level_are_normalized_with_scope_context(self):
        self.assertEqual(ExamScope.from_values("telc B1", "B1"), ExamScope("TELC", "B1"))

    def test_family_suffix_without_level_context_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_exam_type("telc B1")

    def test_empty_and_malformed_family_values_are_rejected(self):
        for value in ("", "   ", None, "TELC B2"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_exam_type(value)

    def test_level_is_normalized_and_must_be_supported(self):
        self.assertEqual(normalize_exam_level(" b2 "), "B2")
        for value in ("", "D1", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_exam_level(value)

    def test_only_omitted_scope_values_use_telc_b1_defaults(self):
        self.assertEqual(ExamScope.from_values(), ExamScope("TELC", "B1"))
        with self.assertRaises(ValueError):
            ExamScope.from_values("", "B1")
        with self.assertRaises(ValueError):
            ExamScope.from_values("TELC", "")

    def test_legacy_level_suffix_must_match_requested_level(self):
        with self.assertRaises(ValueError):
            ExamScope.from_values("telc B1", "B2")


class ExerciseScopeIdentityTests(SimpleTestCase):
    def test_exam_type_help_text_describes_family_only(self):
        from apps.exam_preparation.models import ExerciseBase

        self.assertEqual(
            ExerciseBase._meta.get_field("exam_type").help_text,
            "Exam family or certificate type, for example TELC or GOETHE.",
        )

    def test_exercise_identity_includes_family_and_level(self):
        from apps.exam_preparation.models import ExerciseBase

        constraint = next(
            item for item in ExerciseBase._meta.constraints
            if item.name == "exam_prep_base_scope_type_ext_uq"
        )
        self.assertEqual(
            constraint.fields,
            ("exam_type", "level", "exercise_type", "external_id"),
        )

    def test_scope_indexes_cover_skill_and_exercise_type(self):
        from apps.exam_preparation.models import ExerciseBase

        indexes = {index.name: index.fields for index in ExerciseBase._meta.indexes}
        self.assertEqual(
            indexes["exam_prep_base_scope_skill_idx"],
            ["exam_type", "level", "skill"],
        )
        self.assertEqual(
            indexes["exam_prep_base_scope_type_idx"],
            ["exam_type", "level", "exercise_type"],
        )


class ExerciseBaseSaveScopeTests(TestCase):
    def test_create_normalizes_family_and_level(self):
        from apps.exam_preparation.models import ExerciseBase

        exercise = ExerciseBase.objects.create(
            exam_type="telc", level="b1", skill="READING",
            exercise_type="READING_UNDERSTANDING", external_id="scope-save-1",
        )

        self.assertEqual((exercise.exam_type, exercise.level), ("TELC", "B1"))
        exercise.refresh_from_db()
        self.assertEqual((exercise.exam_type, exercise.level), ("TELC", "B1"))

    def test_create_rejects_invalid_scope_before_writing(self):
        from apps.exam_preparation.models import ExerciseBase

        with self.assertRaises(ValueError):
            ExerciseBase.objects.create(
                exam_type="", level="D1", skill="READING",
                exercise_type="READING_UNDERSTANDING", external_id="scope-save-invalid",
            )

        self.assertFalse(ExerciseBase.objects.filter(external_id="scope-save-invalid").exists())

    def test_partial_save_persists_scope_normalization(self):
        from apps.exam_preparation.models import ExerciseBase

        exercise = ExerciseBase.objects.create(
            exam_type="TELC", level="B1", skill="READING",
            exercise_type="READING_UNDERSTANDING", external_id="scope-partial-save",
        )
        ExerciseBase.objects.filter(pk=exercise.pk).update(exam_type="telc", level="b2")
        exercise.refresh_from_db()
        exercise.title = "Updated"
        exercise.save(update_fields=["title"])
        exercise.refresh_from_db()

        self.assertEqual((exercise.exam_type, exercise.level, exercise.title), ("TELC", "B2", "Updated"))

    def test_serializer_normalizes_before_scope_uniqueness_validation(self):
        from apps.exam_preparation.models import ExerciseBase
        from apps.exam_preparation.serializers import ExerciseBaseSerializer

        payload = {
            "exam_type": "telc",
            "level": "b2",
            "skill": "READING",
            "exercise_type": "READING_UNDERSTANDING",
            "external_id": "scope-serializer-1",
        }
        serializer = ExerciseBaseSerializer(data=payload)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        exercise = serializer.save()
        self.assertEqual((exercise.exam_type, exercise.level), ("TELC", "B2"))

        duplicate = ExerciseBaseSerializer(data={**payload, "exam_type": "TELC", "level": "B2"})
        self.assertFalse(duplicate.is_valid())
        self.assertIn("non_field_errors", duplicate.errors)

    def test_serializer_rejects_blank_family_and_invalid_level(self):
        from apps.exam_preparation.serializers import ExerciseBaseSerializer

        serializer = ExerciseBaseSerializer(data={
            "exam_type": "",
            "level": "D1",
            "skill": "READING",
            "exercise_type": "READING_UNDERSTANDING",
            "external_id": "scope-serializer-invalid",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("exam_type", serializer.errors)
        self.assertIn("level", serializer.errors)


class MockExamScopeSaveTests(TestCase):
    def test_paper_and_saved_attempt_normalize_scope(self):
        from django.contrib.auth import get_user_model

        from apps.exam_preparation.models import MockExamPaper, SavedMockExam

        paper = MockExamPaper.objects.create(exam_type="telc", level="b2")
        user = get_user_model().objects.create_user(telephone="13800138088", password="test")
        attempt = SavedMockExam.objects.create(
            user=user,
            paper=paper,
            fingerprint="scope-fingerprint",
            exam_type="telc",
            level="b2",
        )

        self.assertEqual((paper.exam_type, paper.level), ("TELC", "B2"))
        self.assertEqual((attempt.exam_type, attempt.level), ("TELC", "B2"))
