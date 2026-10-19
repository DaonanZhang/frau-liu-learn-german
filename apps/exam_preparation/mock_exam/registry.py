from apps.exam_preparation.mock_exam.telc import rules as telc_rules


_RULES_BY_SCOPE = {
    ("TELC", "B1"): telc_rules,
    ("TELC", "B2"): telc_rules,
}


def get_mock_exam_rules(exam_type: str, level: str):
    return _RULES_BY_SCOPE.get((str(exam_type).upper(), str(level).upper()))


def is_mock_exam_family_supported(exam_type: str) -> bool:
    normalized = str(exam_type).upper()
    return any(family == normalized for family, _level in _RULES_BY_SCOPE)
