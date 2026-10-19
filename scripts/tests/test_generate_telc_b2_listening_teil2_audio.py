from pathlib import Path
import sys
from unittest import TestCase


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_telc_b2_listening_teil2_audio import (  # noqa: E402
    NARRATOR_VOICE,
    VOICE_POOLS,
    assign_voices,
    build_dialogue_ssml,
    build_intro_ssml,
    parse_dialogue,
    parse_participants,
)


class TelcB2ListeningTeil2AudioTests(TestCase):
    def test_builds_the_approved_intro_without_reading_range_symbols(self):
        ssml = build_intro_ssml(
            "Entscheiden Sie, ob die Aussagen 1–10 richtig sind.\n"
            "Markieren Sie PLUS (+) gleich richtig und MINUS (–) gleich falsch."
        ).decode("utf-8")

        self.assertEqual(NARRATOR_VOICE, "de-DE-SeraphinaMultilingualNeural")
        self.assertNotIn(NARRATOR_VOICE, {
            voice for voices in VOICE_POOLS.values() for voice in voices
        })
        self.assertIn("Aussagen eins bis zehn", ssml)
        self.assertIn("Plus gleich richtig und Minus gleich falsch", ssml)
        self.assertNotIn("1–10", ssml)
        self.assertNotIn("(+)", ssml)
        self.assertNotIn("(–)", ssml)
        self.assertIn('<break time="700ms"/>', ssml)

    def test_assigns_a_distinct_voice_to_every_participant(self):
        participants = parse_participants(
            "Moderator (mann), Frau Janke (frau), Herr Gasser (mann)"
        )

        voices = assign_voices(participants)

        self.assertEqual(voices["Moderator"], "de-DE-ConradNeural")
        self.assertEqual(voices["Frau Janke"], "de-DE-KatjaNeural")
        self.assertEqual(voices["Herr Gasser"], "de-DE-KillianNeural")
        self.assertEqual(len(set(voices.values())), 3)
        self.assertNotIn("de-DE-KlarissaNeural", voices.values())

    def test_preserves_the_joint_closing_as_one_simultaneous_turn(self):
        participants = parse_participants(
            "Moderator (mann), Frau Janke (frau), Herr Gasser (mann)"
        )
        dialogue = """Moderator:
Vielen Dank für das Gespräch.

Herr Gasser / Frau Janke:
Vielen Dank!"""

        turns = parse_dialogue(dialogue, participants)

        self.assertEqual(turns[0], (("Moderator",), "Vielen Dank für das Gespräch."))
        self.assertEqual(turns[1], (("Herr Gasser", "Frau Janke"), "Vielen Dank!"))

    def test_ssml_switches_voices_without_speaking_role_labels(self):
        voices = {"Moderator": "de-DE-ConradNeural", "Julia": "de-DE-KatjaNeural"}

        ssml = build_dialogue_ssml(
            [
                (("Moderator",), "Guten Tag!"),
                (("Julia",), "Hallo & willkommen."),
            ],
            voices,
        ).decode("utf-8")

        self.assertIn('<voice name="de-DE-ConradNeural">Guten Tag!', ssml)
        self.assertIn('<voice name="de-DE-KatjaNeural">Hallo &amp; willkommen.', ssml)
        self.assertNotIn("Moderator:", ssml)
        self.assertNotIn("Julia:", ssml)
