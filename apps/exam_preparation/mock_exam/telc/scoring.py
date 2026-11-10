from decimal import Decimal, ROUND_HALF_UP

from apps.exam_preparation.answer_matching import answer_matches
from apps.exam_preparation.models import (
    ClozeChoiceOption,
    ClozeMatchingBlankAnswer,
    ListeningAnswerOption,
    ListeningQuestion,
    ReadingAdMatchingItem,
    ReadingTitleMatchingItem,
    ReadingUnderstandingAnswerOption,
)
from apps.exam_preparation.mock_exam.telc.reading_ad_matching import selected_item_ids


WRITING_ASSESSMENT_DIMENSIONS = (
    "task_completion",
    "communicative_design",
    "formal_accuracy",
)
WRITING_GRADE_POINTS = {"A": 5, "B": 3, "C": 1, "D": 0}


def normalize_writing_assessment(value):
    if not isinstance(value, dict):
        return None
    allowed_keys = {"topic_relevant", *WRITING_ASSESSMENT_DIMENSIONS}
    if set(value) - allowed_keys:
        return None
    topic_relevant = value.get("topic_relevant")
    if topic_relevant is not None and not isinstance(topic_relevant, bool):
        return None
    normalized = {"topic_relevant": topic_relevant}
    for key in WRITING_ASSESSMENT_DIMENSIONS:
        grade = value.get(key, "")
        if grade not in {"", *WRITING_GRADE_POINTS}:
            return None
        normalized[key] = grade
    return normalized


def legacy_writing_assessment(grade):
    if grade not in WRITING_GRADE_POINTS:
        return {}
    return {
        "topic_relevant": True,
        **{key: grade for key in WRITING_ASSESSMENT_DIMENSIONS},
    }


def writing_assessment_is_complete(assessment):
    if assessment.get("topic_relevant") is False:
        return True
    return assessment.get("topic_relevant") is True and all(
        assessment.get(key) in WRITING_GRADE_POINTS for key in WRITING_ASSESSMENT_DIMENSIONS
    )


def writing_assessment_score(assessment):
    if assessment.get("topic_relevant") is not True:
        return 0
    return sum(WRITING_GRADE_POINTS.get(assessment.get(key), 0) for key in WRITING_ASSESSMENT_DIMENSIONS) * 3


def _correct_counts(instance):
    selection = instance.paper.exercise_selection
    answers = instance.answers

    def selected(part_key, item_id):
        return answers.get(f"{part_key}:{item_id}")

    reading_correct = sum(
        selected("reading_title_matching", item_id) == option_key
        for item_id, option_key in ReadingTitleMatchingItem.objects.filter(
            exercise_id=selection.get("reading_title_matching")
        ).values_list("id", "correct_option__option_key")
    )
    reading_correct += sum(
        selected("reading_understanding", question_id) == option_key
        for question_id, option_key in ReadingUnderstandingAnswerOption.objects.filter(
            question__exercise_id=selection.get("reading_understanding"),
            is_correct=True,
        ).values_list("question_id", "option_key")
    )
    ad_items = list(ReadingAdMatchingItem.objects.filter(exercise_id=selection.get("reading_ad_matching")))
    ad_item_ids = selected_item_ids(ad_items, selection.get("reading_ad_matching_variant", 0))
    reading_correct += sum(
        selected("reading_ad_matching", item.pk) == item.correct_ad.ad_key
        for item in ReadingAdMatchingItem.objects.filter(pk__in=ad_item_ids).select_related("correct_ad")
    )
    cloze_correct = sum(
        selected("cloze_choice", blank_id) == option_key
        for blank_id, option_key in ClozeChoiceOption.objects.filter(
            blank__exercise_id=selection.get("cloze_choice"),
            is_correct=True,
        ).values_list("blank_id", "option_key")
    )
    cloze_correct += sum(
        selected("cloze_matching", blank_id) == option_key
        for blank_id, option_key in ClozeMatchingBlankAnswer.objects.filter(
            exercise_id=selection.get("cloze_matching")
        ).values_list("id", "correct_option__option_key")
    )
    listening_correct = 0
    for part_key in ("listening_teil1", "listening_teil2", "listening_teil3"):
        listening_correct += sum(
            selected(part_key, question_id) == option_key
            for question_id, option_key in ListeningAnswerOption.objects.filter(
                question__listening_exercise_id=selection.get(part_key),
                is_correct=True,
            ).values_list("question_id", "option_key")
        )
    return reading_correct, cloze_correct, listening_correct


def _c1_correct_counts(instance):
    selection = instance.paper.exercise_selection
    answers = instance.answers

    def selected(part_key, item_id):
        return answers.get(f"{part_key}:{item_id}")

    reading_correct = sum(
        selected("cloze_matching", answer_id) == option_key
        for answer_id, option_key in ClozeMatchingBlankAnswer.objects.filter(
            exercise_id=selection.get("cloze_matching"),
            blank_number__gt=0,
        ).values_list("id", "correct_option__option_key")
    )
    reading_correct += sum(
        selected("reading_understanding", question_id) == option_key
        for question_id, option_key in ReadingUnderstandingAnswerOption.objects.filter(
            question__exercise_id=selection.get("reading_understanding"),
            is_correct=True,
        ).values_list("question_id", "option_key")
    )
    ad_items = list(ReadingAdMatchingItem.objects.filter(exercise_id=selection.get("reading_ad_matching")))
    ad_item_ids = selected_item_ids(ad_items, selection.get("reading_ad_matching_variant", 0))
    reading_correct += sum(
        selected("reading_ad_matching", item.pk) == item.correct_ad.ad_key
        for item in ReadingAdMatchingItem.objects.filter(pk__in=ad_item_ids).select_related("correct_ad")
    )
    cloze_correct = sum(
        selected("cloze_choice", blank_id) == option_key
        for blank_id, option_key in ClozeChoiceOption.objects.filter(
            blank__exercise_id=selection.get("cloze_choice"),
            is_correct=True,
        ).values_list("blank_id", "option_key")
    )

    listening_scores = {"listening_teil1": 0, "listening_teil2": 0, "listening_teil3": 0}
    for part_key in listening_scores:
        questions = ListeningQuestion.objects.filter(
            listening_exercise_id=selection.get(part_key),
        ).prefetch_related("answer_options")
        for question in questions:
            answer = selected(part_key, question.pk)
            if question.question_type == ListeningQuestion.QuestionType.TEXT_INPUT:
                is_correct = answer_matches(question.correct_answer, answer)
            else:
                is_correct = question.answer_options.filter(is_correct=True, option_key=answer).exists()
            listening_scores[part_key] += int(is_correct)
    return reading_correct, cloze_correct, listening_scores


def _calculate_c1_result(instance):
    reading_correct, cloze_correct, listening_scores = _c1_correct_counts(instance)
    writing_raw = Decimal(str(writing_assessment_score(
        instance.writing_assessment or legacy_writing_assessment(instance.writing_grade)
    )))
    writing_score = (writing_raw * Decimal(48) / Decimal(45)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    reading_score = Decimal(reading_correct) * Decimal(2)
    cloze_score = Decimal(cloze_correct)
    listening_correct = sum(listening_scores.values())
    listening_score = (
        Decimal(listening_scores["listening_teil1"])
        + Decimal(listening_scores["listening_teil2"] + listening_scores["listening_teil3"]) * Decimal(2)
    )
    total_score = reading_score + cloze_score + listening_score + writing_score
    percentage = ((total_score / Decimal(166)) * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return {
        "score_breakdown": {
            "reading_correct": reading_correct,
            "reading_score": float(reading_score),
            "cloze_correct": cloze_correct,
            "cloze_score": float(cloze_score),
            "listening_correct": listening_correct,
            "listening_score": float(listening_score),
            "writing_score": float(writing_score),
        },
        "total_score": total_score,
        "score_percentage": percentage,
        "is_passed": total_score >= Decimal("99.6"),
    }


def calculate_result(instance):
    if str(instance.paper.level).upper() == "C1":
        return _calculate_c1_result(instance)
    reading_correct, cloze_correct, listening_correct = _correct_counts(instance)
    writing_score = Decimal(str(writing_assessment_score(
        instance.writing_assessment or legacy_writing_assessment(instance.writing_grade)
    )))
    reading_score = Decimal(reading_correct) * Decimal("3.75")
    cloze_score = Decimal(cloze_correct) * Decimal("1.5")
    listening_score = Decimal(listening_correct) * Decimal("3.75")
    total_score = reading_score + cloze_score + listening_score + writing_score
    percentage = ((total_score / Decimal("225")) * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return {
        "score_breakdown": {
            "reading_correct": reading_correct,
            "reading_score": float(reading_score),
            "cloze_correct": cloze_correct,
            "cloze_score": float(cloze_score),
            "listening_correct": listening_correct,
            "listening_score": float(listening_score),
            "writing_score": float(writing_score),
        },
        "total_score": total_score,
        "score_percentage": percentage,
        "is_passed": total_score >= Decimal("135"),
    }


def apply_result(instance):
    result = calculate_result(instance)
    for field, value in result.items():
        setattr(instance, field, value)
    return result
