from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
import sys
import tempfile
from unittest import TestCase
from unittest.mock import patch

import pandas as pd

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import generate_telc_c1_hs_listening_audio as audio  # noqa: E402


class C1ListeningAudioTests(TestCase):
    def test_read_workbook_parses_speakers_and_assigns_distinct_voices(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "listening_teil2__mode_001.xlsx"
            pd.DataFrame([{
                "音频文件_ID": "", "出场人物": "Moderator (Mann), Julia (Frau)",
                "Einleitung": "Sie hören ein Gespräch.",
                "copy": "Vorbereitung <60''>\nModerator: Herr Meier, guten Tag.\nJulia: Guten Tag zurück.",
            }]).to_excel(path, sheet_name="meta", index=False)
            workbook = audio.read_workbook(path)
        self.assertEqual(len(workbook["participants"]), 2)
        self.assertEqual(len(set(workbook["voices"].values())), 2)
        self.assertEqual(workbook["preparation_seconds"], 60)
        self.assertEqual(workbook["turns"][0][0], ("Moderator",))
        self.assertEqual(workbook["turns"][0][1], "Herr Meier, guten Tag.")

    def test_real_metadata_variants_parse_gender_descriptions_and_double_quote_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "listening_teil3__001.xlsx"
            pd.DataFrame([{
                "音频文件_ID": "", " 出现人物": "Moderator, Dr. Matthias Kässner (Psychologe, Mann)",
                "Einleitung": "Sie hören einen Vortrag.",
                "copy": "Vorbereitung <60\"\"><br>Moderator: Guten Tag.<br>Dr. Kässner: Vielen Dank.",
            }]).to_excel(path, sheet_name="meta", index=False)
            workbook = audio.read_workbook(path)

        self.assertEqual(workbook["participants"], [("Moderator", "mann"), ("Dr. Matthias Kässner", "mann")])
        self.assertEqual(workbook["preparation_seconds"], 60)
        self.assertEqual(workbook["turns"], [(("Moderator",), "Guten Tag."), (("Dr. Matthias Kässner",), "Vielen Dank.")])

    def test_known_role_aliases_and_genderless_generic_speakers(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "listening_teil2__002.xlsx"
            pd.DataFrame([{
                "音频文件_ID": "", "出场人物": "Moderatorin Molitor (Frau), Frau Mentor (Frau)",
                "Einleitung": "Sie hören ein Gespräch.",
                "copy": "Vorbereitung <60''><br>Moderatorin: Willkommen.<br>Frau Mentor: Danke.",
            }]).to_excel(path, sheet_name="meta", index=False)
            moderator_workbook = audio.read_workbook(path)
            pd.DataFrame([{
                "音频文件_ID": "", "出现人物": "Sprecher 1, Sprecher 2",
                "Einleitung": "Sie hören Meinungen.",
                "copy": "Vorbereitung <60''><br>Sprecher 1<br>Erster Beitrag.<br>Sprecher 2<br>Zweiter Beitrag.",
            }]).to_excel(path, sheet_name="meta", index=False)
            generic_workbook = audio.read_workbook(path)

        self.assertEqual(moderator_workbook["turns"][0][0], ("Moderatorin Molitor",))
        self.assertEqual(moderator_workbook["turns"][1][0], ("Frau Mentor",))
        self.assertEqual(generic_workbook["participants"], [("Sprecher 1", "mann"), ("Sprecher 2", "frau")])
        self.assertEqual(len(generic_workbook["turns"]), 2)

    def test_read_workbook_accepts_canonical_duration_and_rejects_noncanonical_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "listening_teil1__003.xlsx"
            def write_copy(copy):
                pd.DataFrame([{
                    "音频文件_ID": "", "出场人物": "Moderator (Mann)",
                    "Einleitung": "Intro", "copy": copy,
                }]).to_excel(path, sheet_name="meta", index=False)
            write_copy("Vorbereitung <2''>Moderator: Hallo.")
            workbook = audio.read_workbook(path)
            self.assertEqual(workbook["preparation_seconds"], 2)
            for copy in ["Moderator: Hallo.", "Vorbereitung <60>Moderator: Hallo.", 'Vorbereitung <2">Moderator: Hallo.']:
                write_copy(copy)
                with self.subTest(copy=copy), self.assertRaisesRegex(ValueError, "preparation"):
                    audio.read_workbook(path)

    def test_reader_keeps_body_pauses_and_rejects_malformed_preparation_before_them(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "listening_teil1__003.xlsx"
            def write_copy(copy):
                pd.DataFrame([{
                    "音频文件_ID": "", "出场人物": "Moderator (Mann)",
                    "Einleitung": "Intro", "copy": copy,
                }]).to_excel(path, sheet_name="meta", index=False)
            write_copy("Vorbereitung <30''><br>Moderator: Hallo. <2''> Weiter. <2''> Ende.")
            workbook = audio.read_workbook(path)
            self.assertEqual(workbook["preparation_seconds"], 30)
            self.assertEqual([kind for kind, _value in workbook["timeline"]], ["speech", "pause", "speech", "pause", "speech"])
            self.assertEqual([(match.group(), seconds) for match, seconds in workbook["pause_markers"]], [
                ("<2''>", 2), ("<2''>", 2),
            ])
            write_copy('Vorbereitung <60>\nModerator: Dieser Satz darf not be lost. <2\'>')
            with self.assertRaisesRegex(ValueError, "preparation"):
                audio.read_workbook(path)
            write_copy("Vorbereitung text<br>Moderator: Erster Satz. <2''> Zweiter Satz.")
            with self.assertRaisesRegex(ValueError, "preparation"):
                audio.read_workbook(path)
            write_copy("Vorbereitung <30''><br>Moderator: Satz eins. <2> Satz zwei.")
            with self.assertRaisesRegex(ValueError, "pause"):
                audio.read_workbook(path)

    def test_repeated_preparation_markers_sum_duration_and_start_body_after_last(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "listening_teil2__003.xlsx"
            pd.DataFrame([{
                "音频文件_ID": "", "出场人物": "Moderator (Mann)",
                "Einleitung": "Intro",
                "copy": "Vorbereitung <60''><60''><60''><br>Moderator: Dialog beginnt.",
            }]).to_excel(path, sheet_name="meta", index=False)
            workbook = audio.read_workbook(path)
        self.assertEqual(workbook["preparation_seconds"], 180)
        self.assertEqual(workbook["turns"], [(('Moderator',), "Dialog beginnt.")])
        self.assertEqual(workbook["pause_markers"], [])

    def test_host_voices_are_reserved_and_eight_generic_speakers_are_distinct(self):
        male_aliases = audio._speaker_aliases("Moderator Andreas Köhler")
        female_aliases = audio._speaker_aliases("Moderatorin Molitor")
        speakers = audio._parse_participants(", ".join(f"Sprecher {number}" for number in range(1, 9)))
        speaker_voices = audio._assign_voices(speakers)
        hosts_and_guests = audio._parse_participants(
            "Moderator, Moderatorin Molitor (Frau), Thomas (Mann), Julia (Frau)"
        )
        voices = audio._assign_voices(hosts_and_guests)

        self.assertIn("moderator", male_aliases)
        self.assertNotIn("moderatorin", male_aliases)
        self.assertIn("moderatorin", female_aliases)
        self.assertNotIn("moderator", female_aliases)
        self.assertEqual(len(set(speaker_voices.values())), 8)
        self.assertTrue(set(speaker_voices.values()).isdisjoint(audio.MODERATOR_VOICES.values()))
        self.assertEqual(voices["Moderator"], audio.MODERATOR_VOICES["mann"])
        self.assertEqual(voices["Moderatorin Molitor"], audio.MODERATOR_VOICES["frau"])
        self.assertTrue({voices["Thomas"], voices["Julia"]}.isdisjoint(audio.MODERATOR_VOICES.values()))
        self.assertEqual(len(set(voices.values())), len(hosts_and_guests))

    def test_default_run_is_dry_and_does_not_call_azure(self):
        workbook = {"teil": "1", "id": "1", "participants": [("A", "mann"), ("B", "frau")], "turns": [(('A',), "Text")], "voices": {"A": "voice-a", "B": "voice-b"}}
        target = audio.ROOT / "tmp/c1-audio-dry-run.mp3"
        with patch.object(sys, "argv", ["audio"]), \
             patch.object(audio, "source_files", return_value=[Path("input.xlsx")]), \
             patch.object(audio, "read_workbook", return_value=workbook), \
             patch.object(audio, "output_path", return_value=target), \
             patch.object(audio.b2_audio, "synthesize_ssml") as synthesize, \
             redirect_stdout(StringIO()):
            self.assertEqual(audio.main(), 0)
        synthesize.assert_not_called()

    def test_execute_uses_azure_ssml_pipeline_with_separate_speaker_voices(self):
        voices = {"Moderator": "de-DE-ConradNeural", "Julia": "de-DE-KatjaNeural"}
        workbook = {
            "intro": "Sie hören ein Gespräch.", "preparation_seconds": 60,
            "timeline": [("speech", (("Moderator",), "Guten Tag.")), ("speech", (("Julia",), "Guten Tag zurück."))],
            "voices": voices,
            "turns": [(('Moderator',), "Guten Tag."), (('Julia',), "Guten Tag zurück.")],
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "teil2.mp3"
            with patch.object(audio.b2_audio, "synthesize_ssml", return_value=b"mock audio") as synthesize, \
                 patch.object(audio.b2_audio, "create_silence"), \
                 patch.object(audio.b2_audio, "concatenate_audio") as concatenate:
                audio.generate(workbook, target, key="mock", region="westeurope")
        generated_ssml = [call.args[0].decode("utf-8") for call in synthesize.call_args_list]
        dialogue_ssml = [text for text in generated_ssml if "Guten Tag" in text]
        self.assertTrue(any(f'<voice name="{voices["Moderator"]}">' in text for text in dialogue_ssml))
        self.assertTrue(any(f'<voice name="{voices["Julia"]}">' in text for text in dialogue_ssml))
        concatenate.assert_called_once()

    def test_execute_places_parsed_silence_between_intro_and_dialogue(self):
        workbook = {
            "intro": "Intro", "preparation_seconds": 2,
            "timeline": [("speech", (("Moderator",), "Dialog"))],
            "voices": {"Moderator": "voice-a"},
            "turns": [(('Moderator',), "Dialog")],
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "teil2.mp3"
            with patch.object(audio.b2_audio, "create_silence") as create_silence, \
                 patch.object(audio.b2_audio, "synthesize_ssml", return_value=b"audio"), \
                 patch.object(audio.b2_audio, "synthesize_turn_segments", return_value=[Path("dialogue.mp3")]), \
                 patch.object(audio.b2_audio, "concatenate_audio") as concatenate:
                audio.generate(workbook, target, key="mock", region="westeurope")
        create_silence.assert_called_once()
        self.assertEqual(create_silence.call_args.args[1], 2)
        inputs = concatenate.call_args.args[0]
        self.assertEqual([path.name for path in inputs[1:]], ["silence.mp3", "dialogue.mp3"])

    def test_execute_consumes_body_timeline_after_preparation_silence(self):
        timeline = [
            ("speech", (("Moderator",), "first")), ("pause", 2),
            ("speech", (("Moderator",), "second")), ("pause", 3),
            ("speech", (("Moderator",), "third")),
        ]
        body = [Path("speech1.mp3"), Path("pause1.mp3"), Path("speech2.mp3"), Path("pause2.mp3"), Path("speech3.mp3")]
        workbook = {
            "intro": "Intro", "preparation_seconds": 60, "timeline": timeline,
            "voices": {"Moderator": "voice-a"}, "turns": [],
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "teil2.mp3"
            with patch.object(audio.b2_audio, "create_silence") as create_silence, \
                 patch.object(audio.b2_audio, "synthesize_ssml", return_value=b"audio"), \
                 patch.object(audio.b2_audio, "synthesize_timeline", return_value=body) as synthesize_timeline, \
                 patch.object(audio.b2_audio, "concatenate_audio") as concatenate:
                audio.generate(workbook, target, key="mock", region="westeurope")
        synthesize_timeline.assert_called_once()
        self.assertEqual(synthesize_timeline.call_args.args[0], timeline)
        self.assertEqual(create_silence.call_args.args[1], 60)
        self.assertEqual([path.name for path in concatenate.call_args.args[0][1:]], [
            "silence.mp3", "speech1.mp3", "pause1.mp3", "speech2.mp3", "pause2.mp3", "speech3.mp3",
        ])
