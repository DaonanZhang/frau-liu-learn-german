import sys
from importlib import import_module
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def order_by(self, *_fields):
        return self

    def iterator(self):
        return iter(self.rows)


class ExamScopeMigrationTests(SimpleTestCase):
    def setUp(self):
        self.migration = import_module(
            "apps.exam_preparation.migrations.0025_exam_scope_identity"
        )

    def _apps(self, exercises, papers=(), saved=()):
        models = {
            "ExerciseBase": SimpleNamespace(objects=_Rows(exercises)),
            "MockExamPaper": SimpleNamespace(objects=_Rows(papers)),
            "SavedMockExam": SimpleNamespace(objects=_Rows(saved)),
        }
        return SimpleNamespace(get_model=lambda _app, name: models[name])

    def test_migration_normalizes_legacy_and_lowercase_families(self):
        exercise = SimpleNamespace(
            id=1, pk=1, exam_type="telc B1", level="B1", exercise_type="READING_UNDERSTANDING",
            external_id="1", save=lambda **_kwargs: None,
        )
        paper = SimpleNamespace(exam_type="telc B2", level="B2", save=lambda **_kwargs: None)
        saved = SimpleNamespace(exam_type="Telc", level="B1", save=lambda **_kwargs: None)

        with patch.dict(sys.modules, {"apps.exam_preparation.scope": None}):
            self.migration.normalize_exam_scope_families(self._apps([exercise], [paper], [saved]), None)

        self.assertEqual((exercise.exam_type, paper.exam_type, saved.exam_type), ("TELC",) * 3)

    def test_migration_normalizes_family_and_level_for_every_scoped_model(self):
        writes = []

        def row(**values):
            values["save"] = lambda **kwargs: writes.append((values, kwargs["update_fields"]))
            return SimpleNamespace(**values)

        exercise = row(
            id=1, pk=1, exam_type="telc", level="b1", exercise_type="READING_UNDERSTANDING",
            external_id="1",
        )
        paper = row(exam_type="goethe", level="a2")
        saved = row(exam_type="telc", level="b2")

        with patch.dict(sys.modules, {"apps.exam_preparation.scope": None}):
            self.migration.normalize_exam_scope_families(self._apps([exercise], [paper], [saved]), None)

        self.assertEqual(
            [(item.exam_type, item.level) for item in (exercise, paper, saved)],
            [("TELC", "B1"), ("GOETHE", "A2"), ("TELC", "B2")],
        )
        self.assertEqual([fields for _item, fields in writes], [["exam_type", "level"]] * 3)

    def test_migration_does_not_write_when_all_scope_values_are_canonical(self):
        writes = []
        exercise = SimpleNamespace(
            id=1, pk=1, exam_type="TELC", level="B1", exercise_type="READING_UNDERSTANDING",
            external_id="1", save=lambda **kwargs: writes.append(kwargs["update_fields"]),
        )

        with patch.dict(sys.modules, {"apps.exam_preparation.scope": None}):
            self.migration.normalize_exam_scope_families(self._apps([exercise]), None)

        self.assertEqual(writes, [])

    def test_migration_refuses_rows_that_collide_after_family_normalization(self):
        def row(pk, family):
            return SimpleNamespace(
                id=pk, pk=pk, exam_type=family, level="B1", exercise_type="READING_UNDERSTANDING",
                external_id="1", save=lambda **_kwargs: None,
            )

        with self.assertRaisesRegex(RuntimeError, r"TELC.*B1.*READING_UNDERSTANDING.*1"):
            with patch.dict(sys.modules, {"apps.exam_preparation.scope": None}):
                self.migration.normalize_exam_scope_families(
                    self._apps([row(1, "telc"), row(2, "TELC")]), None
                )

    def test_invalid_historical_level_fails_before_any_family_is_written(self):
        writes = []
        exercise = SimpleNamespace(
            id=1, pk=1, exam_type="telc", level="B1", exercise_type="READING_UNDERSTANDING",
            external_id="1", save=lambda **_kwargs: writes.append(True),
        )
        invalid_paper = SimpleNamespace(
            exam_type="telc", level="D1", save=lambda **_kwargs: writes.append(True),
        )

        with self.assertRaisesRegex(ValueError, "Invalid exam level"):
            with patch.dict(sys.modules, {"apps.exam_preparation.scope": None}):
                self.migration.normalize_exam_scope_families(
                    self._apps([exercise], [invalid_paper]), None
                )

        self.assertEqual(exercise.exam_type, "telc")
        self.assertEqual(writes, [])

    def test_collision_fails_before_any_row_is_written(self):
        writes = []

        def row(pk, family):
            return SimpleNamespace(
                id=pk, pk=pk, exam_type=family, level="b1", exercise_type="READING_UNDERSTANDING",
                external_id="1", save=lambda **_kwargs: writes.append(pk),
            )

        with self.assertRaises(RuntimeError):
            with patch.dict(sys.modules, {"apps.exam_preparation.scope": None}):
                self.migration.normalize_exam_scope_families(
                    self._apps([row(1, "telc"), row(2, "TELC")]), None
                )

        self.assertEqual(writes, [])
