from http.client import IncompleteRead
from pathlib import Path
import sys
import tempfile
from unittest import TestCase
from unittest.mock import MagicMock, patch


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
    parse_pause_markers,
    parse_preparation_marker,
    build_dialogue_timeline,
    synthesize_timeline,
    synthesize_ssml,
    synthesize_turn_segments,
    create_silence,
    main,
    read_workbook,
)


class TelcB2ListeningTeil2AudioTests(TestCase):
    def test_parses_supported_preparation_markers_and_durations(self):
        for marker, seconds in [("<30''>", 30), ("<60''>", 60), ("<2''>", 2)]:
            with self.subTest(marker=marker):
                match, duration = parse_preparation_marker(f"Intro {marker} Dialogue")
                self.assertEqual(duration, seconds)
                self.assertEqual(match.group(), marker)
                self.assertEqual(f"Intro {marker} Dialogue"[match.end():], " Dialogue")

    def test_missing_or_malformed_preparation_marker_is_rejected(self):
        for copy in ["No marker", "Intro <60> Dialogue", "Intro <60'' Dialogue"]:
            with self.subTest(copy=copy), self.assertRaisesRegex(ValueError, "preparation"):
                parse_preparation_marker(copy)

    def test_pause_parser_returns_all_markers_in_order_with_spans_and_durations(self):
        copy = "Intro <30''>Anna: eins <2''> zwei <2''> drei"
        markers = parse_pause_markers(copy)
        self.assertEqual([(match.group(), seconds) for match, seconds in markers], [
            ("<30''>", 30), ("<2''>", 2), ("<2''>", 2),
        ])
        self.assertEqual([copy[match.start():match.end()] for match, _ in markers], [
            "<30''>", "<2''>", "<2''>",
        ])

    def test_b2_does_not_accept_double_quote_markers(self):
        for marker in ['<2">', '<2"">']:
            with self.subTest(marker=marker), self.assertRaises(ValueError):
                parse_pause_markers(marker)

    def test_speech_timeline_keeps_two_body_pauses_in_place(self):
        timeline = build_dialogue_timeline(
            "Anna:\nErster Satz <2''> zweiter Satz <3''> dritter Satz.",
            [("Anna", "frau")],
        )
        self.assertEqual(timeline, [
            ("speech", (("Anna",), "Erster Satz")),
            ("pause", 2),
            ("speech", (("Anna",), "zweiter Satz")),
            ("pause", 3),
            ("speech", (("Anna",), "dritter Satz.")),
        ])

    def test_timeline_synthesis_outputs_speech_silence_speech_silence_speech(self):
        timeline = [
            ("speech", (("Anna",), "first")), ("pause", 2),
            ("speech", (("Anna",), "second")), ("pause", 3),
            ("speech", (("Anna",), "third")),
        ]
        with tempfile.TemporaryDirectory() as directory, \
             patch("generate_telc_b2_listening_teil2_audio.synthesize_turn_segments", side_effect=lambda _turns, _voices, folder, **_kwargs: [folder / "speech.mp3"]) as synthesize, \
             patch("generate_telc_b2_listening_teil2_audio.create_silence") as silence:
            segments = synthesize_timeline(
                timeline, {"Anna": "voice"}, Path(directory), region="test", key="key"
            )
        self.assertEqual([path.name for path in segments], [
            "speech.mp3", "pause_1.mp3", "speech.mp3", "pause_2.mp3", "speech.mp3",
        ])
        self.assertEqual(len({path for path in segments if path.name == "speech.mp3"}), 3)
        self.assertEqual([call.args[1] for call in silence.call_args_list], [2, 3])
        self.assertEqual(synthesize.call_count, 3)

    def test_reader_rejects_malformed_preparation_even_when_body_has_valid_pauses(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "b2_listening_teil2_001.xlsx"
            import pandas as pd
            pd.DataFrame([{
                "音频文件_ID": 1, "出场人物": "Anna (frau)", "Einleitung": "Intro",
                "copy": "Vorbereitung <60''>Anna:\nErster Satz. <2''> Zweiter Satz. <3''> Dritter Satz.",
            }]).to_excel(path, sheet_name="meta", index=False)
            workbook = read_workbook(path)
            self.assertEqual(workbook["preparation_seconds"], 60)
            self.assertEqual([(match.group(), seconds) for match, seconds in workbook["pause_markers"]], [("<2''>", 2), ("<3''>", 3)])
            self.assertEqual([kind for kind, _value in workbook["timeline"]], ["speech", "pause", "speech", "pause", "speech"])
            pd.DataFrame([{
                "音频文件_ID": 1, "出场人物": "Anna (frau)", "Einleitung": "Intro",
                "copy": 'Vorbereitung <60>\nAnna:\nDieser Satz darf nicht verloren gehen. <2">',
            }]).to_excel(path, sheet_name="meta", index=False)
            with self.assertRaisesRegex(ValueError, "preparation"):
                read_workbook(path)
            pd.DataFrame([{
                "音频文件_ID": 1, "出场人物": "Anna (frau)", "Einleitung": "Intro",
                "copy": 'Vorbereitung text\nAnna:\nErster Satz. <2"> Zweiter Satz.',
            }]).to_excel(path, sheet_name="meta", index=False)
            with self.assertRaisesRegex(ValueError, "preparation"):
                read_workbook(path)
            pd.DataFrame([{
                "音频文件_ID": 1, "出场人物": "Anna (frau)", "Einleitung": "Intro",
                "copy": "Vorbereitung <60''>Anna:\nErster Satz. <2> Zweiter Satz.",
            }]).to_excel(path, sheet_name="meta", index=False)
            with self.assertRaisesRegex(ValueError, "pause"):
                read_workbook(path)

    def test_main_uses_each_workbook_duration_and_concatenates_intro_silence_dialogue(self):
        workbooks = [{
            "id": str(index).zfill(3), "intro": "Intro", "participants": [("Anna", "frau")],
            "voices": {"Anna": "voice-a"}, "turns": [(("Anna",), "Hallo.")],
            "timeline": [("speech", (("Anna",), "Hallo.")), ("pause", 2), ("speech", (("Anna",), "Weiter."))],
            "preparation_seconds": 2 if index == 1 else 30,
        } for index in range(1, 21)]
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            with patch.object(sys, "argv", ["audio", "--apply"]), \
                 patch("pathlib.Path.glob", return_value=[Path(f"{index}.xlsx") for index in range(20)]), \
                 patch("generate_telc_b2_listening_teil2_audio.read_workbook", side_effect=workbooks), \
                 patch("generate_telc_b2_listening_teil2_audio.OUTPUT_DIR", output_dir), \
                 patch("generate_telc_b2_listening_teil2_audio.shutil.which", return_value="ffmpeg"), \
                 patch("generate_telc_b2_listening_teil2_audio.load_azure_environment", return_value=("key", "region")), \
                 patch("generate_telc_b2_listening_teil2_audio.synthesize_ssml", return_value=b"intro"), \
                 patch("generate_telc_b2_listening_teil2_audio.create_silence") as create_silence, \
                 patch("generate_telc_b2_listening_teil2_audio.synthesize_timeline", return_value=[Path("speech.mp3"), Path("pause.mp3"), Path("speech2.mp3")]) as synthesize_timeline, \
                 patch("generate_telc_b2_listening_teil2_audio.concatenate_audio", side_effect=lambda _inputs, target: target.touch()) as concatenate, \
                 patch("generate_telc_b2_listening_teil2_audio.audio_duration", return_value=100):
                self.assertEqual(main(), 0)
        self.assertEqual([call.args[1] for call in create_silence.call_args_list[:2]], [2, 30])
        for call in concatenate.call_args_list[:2]:
            self.assertEqual([path.name for path in call.args[0][1:]], ["silence.mp3", "speech.mp3", "pause.mp3", "speech2.mp3"])
        self.assertEqual(synthesize_timeline.call_args_list[0].args[0], workbooks[0]["timeline"])

    def test_read_workbook_stores_duration_and_dialogue_after_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "b2_listening_teil2_001.xlsx"
            import pandas as pd
            pd.DataFrame([{
                "音频文件_ID": 1, "出场人物": "Anna (frau)", "Einleitung": "Intro",
                "copy": "Vorbereitung <30''>Anna:\nHallo.",
            }]).to_excel(path, sheet_name="meta", index=False)
            workbook = read_workbook(path)
        self.assertEqual(workbook["preparation_seconds"], 30)
        self.assertEqual(workbook["turns"], [(('Anna',), "Hallo.")])

    def test_create_silence_uses_requested_duration(self):
        with patch("generate_telc_b2_listening_teil2_audio.run_ffmpeg") as run_ffmpeg:
            create_silence(Path("silence.mp3"), 30)
        self.assertIn("30", run_ffmpeg.call_args.args[0])

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

    def test_retries_when_azure_audio_response_is_incomplete(self):
        incomplete_response = MagicMock()
        incomplete_response.__enter__.return_value.read.side_effect = IncompleteRead(b"partial")
        complete_response = MagicMock()
        complete_response.__enter__.return_value.read.return_value = b"complete audio"

        with patch(
            "generate_telc_b2_listening_teil2_audio.urlopen",
            side_effect=[incomplete_response, complete_response],
        ) as urlopen, patch("generate_telc_b2_listening_teil2_audio.time.sleep"):
            result = synthesize_ssml(b"<speak>Test</speak>", region="test", key="secret")

        self.assertEqual(result, b"complete audio")
        self.assertEqual(urlopen.call_count, 2)

    def test_splits_long_dialogue_before_synthesis(self):
        turns = [(('Moderator',), "Ein längerer Satz. " * 400)]
        with tempfile.TemporaryDirectory() as directory, patch(
            "generate_telc_b2_listening_teil2_audio.synthesize_ssml",
            return_value=b"audio",
        ) as synthesize:
            segments = synthesize_turn_segments(
                turns,
                {"Moderator": "de-DE-ConradNeural"},
                Path(directory),
                region="test",
                key="secret",
            )

        self.assertGreater(len(segments), 1)
        self.assertEqual(synthesize.call_count, len(segments))
