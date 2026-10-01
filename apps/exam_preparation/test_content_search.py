from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.exam_preparation.content_search import (
    parse_search_query,
    search_exam_preparation_content,
)
from apps.exam_preparation.models import (
    ClozeChoiceBlank,
    ClozeChoiceExercise,
    ClozeChoiceOption,
    ClozeMatchingBlankAnswer,
    ClozeMatchingExercise,
    ClozeMatchingOption,
    ExerciseBase,
    ListeningAnswerOption,
    ListeningExercise,
    ListeningQuestion,
    ReadingAdMatchingAd,
    ReadingAdMatchingExercise,
    ReadingAdMatchingItem,
    ReadingTitleMatchingExercise,
    ReadingTitleMatchingItem,
    ReadingTitleMatchingOption,
    ReadingUnderstandingAnswerOption,
    ReadingUnderstandingExercise,
    ReadingUnderstandingQuestion,
    SpeakingTeilExercise,
    UserListeningQuestionState,
    WritingExampleText,
    WritingExercise,
)


class ContentSearchServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.listening_base = cls._base(
            ExerciseBase.Skill.LISTENING,
            ExerciseBase.ExerciseType.LISTENING_TEIL2,
            "LISTEN-TECH-001",
            title="Berliner Alltag",
            source_name="Stadtmagazin",
            imported_from_file="secret-import-token.xlsx",
        )
        cls.listening = ListeningExercise.objects.create(
            exercise_base=cls.listening_base,
            listening_type=ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
            audio_file_url="/resources/private-media-token.mp3",
            script="Im Zentrum wird über den Wohnungsmarkt gesprochen.",
        )
        cls.listening_question = ListeningQuestion.objects.create(
            listening_exercise=cls.listening,
            question_number=3,
            question_type=ListeningQuestion.QuestionType.SINGLE_CHOICE,
            question_text="Die Wohnung liegt neben dem Bahnhof.",
            explanation="Die Sprecherin nennt ausdrücklich die zentrale Lage.",
        )
        ListeningAnswerOption.objects.create(
            question=cls.listening_question,
            option_key="a",
            option_text="Das ist richtig.",
            is_correct=True,
            explanation="Antwortbegründung Alpha.",
        )
        ListeningAnswerOption.objects.create(
            question=cls.listening_question,
            option_key="b",
            option_text="Das ist falsch.",
            is_correct=False,
        )

        title_base = cls._base(
            ExerciseBase.Skill.READING,
            ExerciseBase.ExerciseType.READING_TITLE_MATCHING,
            "READ-T1-001",
            title="Zeitungstexte",
        )
        title_exercise = ReadingTitleMatchingExercise.objects.create(
            exercise_base=title_base,
            instruction="Lesen Sie die Überschriften sorgfältig.",
        )
        title_option = ReadingTitleMatchingOption.objects.create(
            exercise=title_exercise,
            option_key="a",
            option_text="Ein Garten auf dem Dach",
        )
        ReadingTitleMatchingItem.objects.create(
            exercise=title_exercise,
            item_number=1,
            text="Das Projekt bringt Pflanzen in die Innenstadt.",
            correct_option=title_option,
            explanation="Dachgarten ist die passende Überschrift.",
        )

        understanding_base = cls._base(
            ExerciseBase.Skill.READING,
            ExerciseBase.ExerciseType.READING_UNDERSTANDING,
            "READ-T2-001",
        )
        understanding = ReadingUnderstandingExercise.objects.create(
            exercise_base=understanding_base,
            text_markdown="Ein Forschungsbericht über Mehrsprachigkeit.",
        )
        understanding_question = ReadingUnderstandingQuestion.objects.create(
            exercise=understanding,
            question_number=1,
            question_text="Was zeigt die Untersuchung?",
            explanation="Kinder wechseln flexibel zwischen Sprachen.",
        )
        ReadingUnderstandingAnswerOption.objects.create(
            question=understanding_question,
            option_key="a",
            option_text="Mehrsprachigkeit ist hilfreich.",
            is_correct=True,
            explanation="Diese Aussage fasst den Bericht zusammen.",
        )

        ad_base = cls._base(
            ExerciseBase.Skill.READING,
            ExerciseBase.ExerciseType.READING_AD_MATCHING,
            "READ-T3-001",
        )
        ad_exercise = ReadingAdMatchingExercise.objects.create(
            exercise_base=ad_base,
            instruction="Ordnen Sie die Kleinanzeigen zu.",
        )
        ad = ReadingAdMatchingAd.objects.create(
            exercise=ad_exercise,
            ad_key="a",
            ad_text_markdown="Fahrradreparatur am Wochenende",
        )
        ReadingAdMatchingItem.objects.create(
            exercise=ad_exercise,
            item_number=1,
            item_text="Mira sucht Hilfe für ihr kaputtes Rad.",
            correct_ad=ad,
            explanation="Die Reparaturanzeige passt.",
        )

        choice_base = cls._base(
            ExerciseBase.Skill.SPRACHBAUSTEIN,
            ExerciseBase.ExerciseType.CLOZE_CHOICE,
            "SB-T1-001",
        )
        choice = ClozeChoiceExercise.objects.create(
            exercise_base=choice_base,
            content_with_placeholders="Liebe Mia, ich {{blank_1}} morgen.",
            original_source_text="Liebe Mia, ich komme morgen.",
        )
        choice_blank = ClozeChoiceBlank.objects.create(
            exercise=choice,
            blank_key="blank_1",
            blank_number=1,
            explanation="Das Verb wird in der ersten Person verwendet.",
        )
        ClozeChoiceOption.objects.create(
            blank=choice_blank,
            option_key="a",
            option_text="komme",
            is_correct=True,
            explanation="Komme ist die richtige Verbform.",
        )

        matching_base = cls._base(
            ExerciseBase.Skill.SPRACHBAUSTEIN,
            ExerciseBase.ExerciseType.CLOZE_MATCHING,
            "SB-T2-001",
        )
        matching = ClozeMatchingExercise.objects.create(
            exercise_base=matching_base,
            content_with_placeholders="Wir treffen uns {{blank_1}} Bahnhof.",
            original_source_text="Wir treffen uns am Bahnhof.",
        )
        matching_option = ClozeMatchingOption.objects.create(
            exercise=matching,
            option_key="a",
            option_text="am",
        )
        ClozeMatchingBlankAnswer.objects.create(
            exercise=matching,
            blank_key="blank_1",
            blank_number=1,
            correct_option=matching_option,
            explanation="Die Präposition verschmilzt mit dem Artikel.",
        )

        writing_base = cls._base(
            ExerciseBase.Skill.WRITING,
            ExerciseBase.ExerciseType.WRITING_PROMPT,
            "WRITE-001",
            difficulty="mittel",
        )
        writing = WritingExercise.objects.create(
            exercise_base=writing_base,
            request_text="Antworten Sie auf eine Einladung.",
            task_text="Begründen Sie Ihre Absage höflich.",
        )
        WritingExampleText.objects.create(
            writing_exercise=writing,
            label="Musterlösung",
            example_text="Leider kann ich wegen eines Arzttermins nicht kommen.",
            note="Formelle Antwort",
        )

        speaking_base = cls._base(
            ExerciseBase.Skill.SPEAKING,
            ExerciseBase.ExerciseType.SPEAKING_TEIL3,
            "SPEAK-T3-001",
            exam_type="telc B1",
            source_reference="Prüfungssatz Sprechen",
        )
        SpeakingTeilExercise.objects.create(
            exercise_base=speaking_base,
            instruction="Planen Sie gemeinsam einen Ausflug.",
            content={
                "scenario": {"topic": "Nachbarschaftsfest"},
                "dialogue": [
                    {"sequence": 1, "role": "TN1", "text": "Wir brauchen einen Grillplatz."},
                ],
            },
        )

        user = get_user_model().objects.create_user(telephone="13900139001", password="test")
        UserListeningQuestionState.objects.create(
            user=user,
            question=cls.listening_question,
            answer_payload={"private_user_answer": "user-only-secret-token"},
            is_correct=False,
        )

    @classmethod
    def _base(cls, skill, exercise_type, external_id, **overrides):
        values = {
            "exam_type": "Goethe-Zertifikat B1",
            "level": ExerciseBase.Level.B1,
            "skill": skill,
            "exercise_type": exercise_type,
            "external_id": external_id,
            "title": "",
        }
        values.update(overrides)
        return ExerciseBase.objects.create(**values)

    def search(self, query, *, skill=None, teil=None):
        search_query = parse_search_query(query=query, skill=skill, teil=teil)
        return search_exam_preparation_content(search_query)

    def test_terms_match_across_fields_case_insensitively_and_group_one_exercise(self):
        results = self.search("  bERLiN   WOHNUNG  ")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["exercise_base_id"], self.listening_base.pk)
        self.assertEqual(results[0]["href"], f"/modules/exam-preparation/hoeren/short-text-once/{self.listening.pk}")
        self.assertEqual(results[0]["teil"], 2)
        self.assertGreaterEqual(results[0]["match_count"], 2)
        self.assertIn("标题", {match["label"] for match in results[0]["matches"]})

    def test_projects_every_supported_exercise_family_and_correct_answers(self):
        cases = (
            ("Dachgarten", "reading", 1, "/modules/exam-preparation/lesen/title-matching/"),
            ("Mehrsprachigkeit", "reading", 2, "/modules/exam-preparation/lesen/understanding/"),
            ("Fahrradreparatur", "reading", 3, "/modules/exam-preparation/lesen/ad-matching/"),
            ("Verbform", "sprachbausteine", 1, "/modules/exam-preparation/sprachbausteine/cloze-choice/"),
            ("Präposition", "sprachbausteine", 2, "/modules/exam-preparation/sprachbausteine/cloze-matching/"),
            ("Arzttermins", "writing", None, "/modules/exam-preparation/schreiben/"),
            ("Grillplatz", "speaking", 3, "/modules/exam-preparation/sprechen/teil-3/"),
        )

        for term, skill, teil, href_prefix in cases:
            with self.subTest(term=term):
                results = self.search(term)
                self.assertEqual(len(results), 1)
                self.assertEqual(results[0]["skill"], skill)
                self.assertEqual(results[0]["teil"], teil)
                self.assertTrue(results[0]["href"].startswith(href_prefix))

        correct_answer = next(
            result for result in self.search("komme")
            if result["exercise_type"] == ExerciseBase.ExerciseType.CLOZE_CHOICE
        )
        self.assertTrue(any("正确答案" in match["label"] for match in correct_answer["matches"]))

    def test_skill_and_teil_filters_narrow_before_matching(self):
        reading = self.search("Goethe-Zertifikat", skill="reading", teil=2)
        sprachbausteine = self.search("Goethe-Zertifikat", skill="sprachbausteine", teil=1)

        self.assertEqual([result["exercise_type"] for result in reading], [ExerciseBase.ExerciseType.READING_UNDERSTANDING])
        self.assertEqual([result["exercise_type"] for result in sprachbausteine], [ExerciseBase.ExerciseType.CLOZE_CHOICE])

    def test_technical_metadata_and_user_content_are_not_searchable(self):
        for excluded_term in (
            "LISTEN-TECH-001",
            "secret-import-token",
            "private-media-token",
            "user-only-secret-token",
        ):
            with self.subTest(excluded_term=excluded_term):
                self.assertEqual(self.search(excluded_term), [])

    def test_nested_json_source_metadata_and_punctuation_are_searchable(self):
        self.assertEqual(self.search("Nachbarschaftsfest Grillplatz")[0]["skill"], "speaking")
        self.assertEqual(self.search("Prüfungssatz Sprechen")[0]["skill"], "speaking")

        self.listening.script = f"{'x' * 180} C++ {'y' * 180}"
        self.listening.save(update_fields=["script"])
        excerpt = self.search("C++")[0]["matches"][0]["excerpt"]
        self.assertLessEqual(len(excerpt), 240)
        self.assertIn("C++", excerpt)

    def test_parse_search_query_normalizes_and_rejects_invalid_filters(self):
        parsed = parse_search_query(query="  Berlin\n Wohnung ", skill="listening", teil="2")
        self.assertEqual(parsed.query, "Berlin Wohnung")
        self.assertEqual(parsed.terms, ("berlin", "wohnung"))
        self.assertEqual(parsed.skill, "listening")
        self.assertEqual(parsed.teil, 2)

        invalid_values = (
            {"query": ""},
            {"query": "x" * 201},
            {"query": "Text", "skill": "unknown"},
            {"query": "Text", "teil": "1"},
            {"query": "Text", "skill": "writing", "teil": "1"},
            {"query": "Text", "skill": "sprachbausteine", "teil": "3"},
        )
        for params in invalid_values:
            with self.subTest(params=params), self.assertRaises(ValidationError):
                parse_search_query(**params)


class ContentSearchApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.search_user = get_user_model().objects.create_user(telephone="110", password="test")
        cls.regular_user = get_user_model().objects.create_user(telephone="13800138000", password="test")
        cls.other_superuser = get_user_model().objects.create_superuser(telephone="119", password="test")
        cls.expected_routes = {}
        exercise_types = (
            ExerciseBase.ExerciseType.LISTENING_TEIL1,
            ExerciseBase.ExerciseType.LISTENING_TEIL2,
            ExerciseBase.ExerciseType.LISTENING_TEIL3,
            ExerciseBase.ExerciseType.READING_TITLE_MATCHING,
            ExerciseBase.ExerciseType.READING_UNDERSTANDING,
            ExerciseBase.ExerciseType.READING_AD_MATCHING,
            ExerciseBase.ExerciseType.CLOZE_CHOICE,
            ExerciseBase.ExerciseType.CLOZE_MATCHING,
            ExerciseBase.ExerciseType.WRITING_PROMPT,
            ExerciseBase.ExerciseType.SPEAKING_TEIL1,
            ExerciseBase.ExerciseType.SPEAKING_TEIL2,
            ExerciseBase.ExerciseType.SPEAKING_TEIL3,
        )
        for index, exercise_type in enumerate(exercise_types, start=1):
            cls._create_exercise(exercise_type, index, "RouteNeedle")

        for index in range(1, 22):
            cls._create_exercise(
                ExerciseBase.ExerciseType.WRITING_PROMPT,
                100 + index,
                "Paged Needle",
            )

    @classmethod
    def _create_exercise(cls, exercise_type, index, title):
        skill_by_type = {
            ExerciseBase.ExerciseType.LISTENING_TEIL1: ExerciseBase.Skill.LISTENING,
            ExerciseBase.ExerciseType.LISTENING_TEIL2: ExerciseBase.Skill.LISTENING,
            ExerciseBase.ExerciseType.LISTENING_TEIL3: ExerciseBase.Skill.LISTENING,
            ExerciseBase.ExerciseType.READING_TITLE_MATCHING: ExerciseBase.Skill.READING,
            ExerciseBase.ExerciseType.READING_UNDERSTANDING: ExerciseBase.Skill.READING,
            ExerciseBase.ExerciseType.READING_AD_MATCHING: ExerciseBase.Skill.READING,
            ExerciseBase.ExerciseType.CLOZE_CHOICE: ExerciseBase.Skill.SPRACHBAUSTEIN,
            ExerciseBase.ExerciseType.CLOZE_MATCHING: ExerciseBase.Skill.SPRACHBAUSTEIN,
            ExerciseBase.ExerciseType.WRITING_PROMPT: ExerciseBase.Skill.WRITING,
            ExerciseBase.ExerciseType.SPEAKING_TEIL1: ExerciseBase.Skill.SPEAKING,
            ExerciseBase.ExerciseType.SPEAKING_TEIL2: ExerciseBase.Skill.SPEAKING,
            ExerciseBase.ExerciseType.SPEAKING_TEIL3: ExerciseBase.Skill.SPEAKING,
        }
        base = ExerciseBase.objects.create(
            exam_type="telc B1",
            level=ExerciseBase.Level.B1,
            skill=skill_by_type[exercise_type],
            exercise_type=exercise_type,
            external_id=f"API-{index}",
            title=f"{title} {index}",
        )

        if exercise_type in {
            ExerciseBase.ExerciseType.LISTENING_TEIL1,
            ExerciseBase.ExerciseType.LISTENING_TEIL2,
            ExerciseBase.ExerciseType.LISTENING_TEIL3,
        }:
            listening_type = {
                ExerciseBase.ExerciseType.LISTENING_TEIL1: ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_WITH_PREP,
                ExerciseBase.ExerciseType.LISTENING_TEIL2: ListeningExercise.ListeningType.SHORT_TEXT_TRUE_FALSE_ONCE,
                ExerciseBase.ExerciseType.LISTENING_TEIL3: ListeningExercise.ListeningType.DIALOG_TRUE_FALSE_TWICE,
            }[exercise_type]
            exercise = ListeningExercise.objects.create(exercise_base=base, listening_type=listening_type)
        elif exercise_type == ExerciseBase.ExerciseType.READING_TITLE_MATCHING:
            exercise = ReadingTitleMatchingExercise.objects.create(exercise_base=base)
        elif exercise_type == ExerciseBase.ExerciseType.READING_UNDERSTANDING:
            exercise = ReadingUnderstandingExercise.objects.create(exercise_base=base, text_markdown="Text")
        elif exercise_type == ExerciseBase.ExerciseType.READING_AD_MATCHING:
            exercise = ReadingAdMatchingExercise.objects.create(exercise_base=base)
        elif exercise_type == ExerciseBase.ExerciseType.CLOZE_CHOICE:
            exercise = ClozeChoiceExercise.objects.create(exercise_base=base, content_with_placeholders="Text")
        elif exercise_type == ExerciseBase.ExerciseType.CLOZE_MATCHING:
            exercise = ClozeMatchingExercise.objects.create(exercise_base=base, content_with_placeholders="Text")
        elif exercise_type == ExerciseBase.ExerciseType.WRITING_PROMPT:
            exercise = WritingExercise.objects.create(exercise_base=base)
        else:
            exercise = SpeakingTeilExercise.objects.create(exercise_base=base)

        route_templates = {
            ExerciseBase.ExerciseType.LISTENING_TEIL1: "/modules/exam-preparation/hoeren/short-text-prep/{id}",
            ExerciseBase.ExerciseType.LISTENING_TEIL2: "/modules/exam-preparation/hoeren/short-text-once/{id}",
            ExerciseBase.ExerciseType.LISTENING_TEIL3: "/modules/exam-preparation/hoeren/dialog-twice/{id}",
            ExerciseBase.ExerciseType.READING_TITLE_MATCHING: "/modules/exam-preparation/lesen/title-matching/{id}",
            ExerciseBase.ExerciseType.READING_UNDERSTANDING: "/modules/exam-preparation/lesen/understanding/{id}",
            ExerciseBase.ExerciseType.READING_AD_MATCHING: "/modules/exam-preparation/lesen/ad-matching/{id}",
            ExerciseBase.ExerciseType.CLOZE_CHOICE: "/modules/exam-preparation/sprachbausteine/cloze-choice/{id}",
            ExerciseBase.ExerciseType.CLOZE_MATCHING: "/modules/exam-preparation/sprachbausteine/cloze-matching/{id}",
            ExerciseBase.ExerciseType.WRITING_PROMPT: "/modules/exam-preparation/schreiben/{id}",
            ExerciseBase.ExerciseType.SPEAKING_TEIL1: "/modules/exam-preparation/sprechen/teil-1/{id}",
            ExerciseBase.ExerciseType.SPEAKING_TEIL2: "/modules/exam-preparation/sprechen/teil-2/{id}",
            ExerciseBase.ExerciseType.SPEAKING_TEIL3: "/modules/exam-preparation/sprechen/teil-3/{id}",
        }
        if title == "RouteNeedle":
            cls.expected_routes[exercise_type] = route_templates[exercise_type].format(id=exercise.pk)

    def setUp(self):
        self.url = reverse("exam-prep-content-search")

    def test_only_exact_telephone_110_can_search(self):
        anonymous = self.client.get(self.url, {"q": "RouteNeedle"})
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.regular_user)
        regular = self.client.get(self.url, {"q": "RouteNeedle"})
        self.assertEqual(regular.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.other_superuser)
        other_superuser = self.client.get(self.url, {"q": "RouteNeedle"})
        self.assertEqual(other_superuser.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.search_user)
        allowed = self.client.get(self.url, {"q": "RouteNeedle"})
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_invalid_queries_and_filter_combinations_return_400(self):
        self.client.force_authenticate(self.search_user)
        invalid_queries = (
            {},
            {"q": " "},
            {"q": "x" * 201},
            {"q": "Text", "skill": "unknown"},
            {"q": "Text", "teil": "1"},
            {"q": "Text", "skill": "writing", "teil": "1"},
            {"q": "Text", "skill": "reading", "teil": "4"},
            {"q": "Text", "page": "zero"},
            {"q": "Text", "page": "0"},
        )
        for params in invalid_queries:
            with self.subTest(params=params):
                response = self.client.get(self.url, params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_module_and_teil_filters_are_applied(self):
        self.client.force_authenticate(self.search_user)
        response = self.client.get(
            self.url,
            {"q": "RouteNeedle", "skill": "reading", "teil": "2"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["exercise_type"],
            ExerciseBase.ExerciseType.READING_UNDERSTANDING,
        )

    def test_response_is_paginated_twenty_exercises_per_page(self):
        self.client.force_authenticate(self.search_user)
        first = self.client.get(self.url, {"q": "Paged Needle"})
        second = self.client.get(self.url, {"q": "Paged Needle", "page": "2"})

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["count"], 21)
        self.assertEqual(first.data["page_size"], 20)
        self.assertEqual(first.data["page"], 1)
        self.assertEqual(first.data["total_pages"], 2)
        self.assertEqual(len(first.data["results"]), 20)
        self.assertEqual(second.data["page"], 2)
        self.assertEqual(len(second.data["results"]), 1)

    def test_every_exercise_type_returns_its_existing_detail_route(self):
        self.client.force_authenticate(self.search_user)
        response = self.client.get(self.url, {"q": "RouteNeedle"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        actual_routes = {
            result["exercise_type"]: result["href"]
            for result in response.data["results"]
        }
        self.assertEqual(actual_routes, self.expected_routes)
