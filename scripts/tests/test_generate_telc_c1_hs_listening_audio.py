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
            "intro": "Sie hören ein Gespräch.",
            "voices": voices,
            "turns": [(('Moderator',), "Guten Tag."), (('Julia',), "Guten Tag zurück.")],
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "teil2.mp3"
            with patch.object(audio.b2_audio, "synthesize_ssml", return_value=b"mock audio") as synthesize, \
                 patch.object(audio.b2_audio, "concatenate_audio") as concatenate:
                audio.generate(workbook, target, key="mock", region="westeurope")
        generated_ssml = [call.args[0].decode("utf-8") for call in synthesize.call_args_list]
        dialogue_ssml = next(text for text in generated_ssml if "Guten Tag zurück" in text)
        self.assertIn(f'<voice name="{voices["Moderator"]}">', dialogue_ssml)
        self.assertIn(f'<voice name="{voices["Julia"]}">', dialogue_ssml)
        concatenate.assert_called_once()
