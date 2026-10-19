from django.test import SimpleTestCase

from apps.exam_preparation.mock_exam.registry import get_mock_exam_rules


class MockExamRegistryTests(SimpleTestCase):
    def test_only_configured_telc_scopes_resolve_rules(self):
        self.assertIsNotNone(get_mock_exam_rules("TELC", "B1"))
        self.assertIsNotNone(get_mock_exam_rules("TELC", "B2"))
        self.assertIsNone(get_mock_exam_rules("TELC", "C1"))
        self.assertIsNone(get_mock_exam_rules("TESTDAF", "B2"))
