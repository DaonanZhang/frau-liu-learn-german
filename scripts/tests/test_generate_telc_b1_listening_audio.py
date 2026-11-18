from pathlib import Path
import sys
import tempfile
from unittest import TestCase
from unittest.mock import patch

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generate_telc_b1_listening_audio import (  # noqa: E402
    OUTPUT_DIRS,
    NARRATOR_VOICE,
    parse_part1_timeline,
    parse_part2_timeline,
    parse_part3_timeline,
    resolve_target_file,
    main,
)


class TelcB1ListeningAudioTests(TestCase):
    def test_teil1_and_teil3_split_five_segments_around_all_four_pauses(self):
        part1 = (
            "Vorbereitung <30''>\nNummer 1:\nEins <2''>\nNummer 2:\nZwei <2''>\n"
            "Nummer 3:\nDrei <2''>\nNummer 4:\nVier <2''>\nNummer 5:\nFünf"
        )
        genders = [(f"Nummer {i}", "frau" if i % 2 else "mann") for i in range(1, 6)]
        timeline1 = parse_part1_timeline(part1, genders)
        self.assertEqual([kind for kind, _ in timeline1], [
            "speech", "pause", "speech", "pause", "speech", "pause", "speech", "pause", "speech"
        ])
        self.assertEqual([value[1] for kind, value in timeline1 if kind == "speech"], ["Eins", "Zwei", "Drei", "Vier", "Fünf"])
        self.assertEqual([value for kind, value in timeline1 if kind == "pause"], [2, 2, 2, 2])
        self.assertEqual(len({value[0] for kind, value in timeline1 if kind == "speech"}), 5)

        part3 = "Einleitung <30''>\n1\nEins <2''>\n2\nZwei <2''>\n3\nDrei <2''>\n4\nVier <2''>\n5\nFünf"
        timeline3, voices3 = parse_part3_timeline(part3)
        self.assertEqual([kind for kind, _ in timeline3], [
            "speech", "pause", "speech", "pause", "speech", "pause", "speech", "pause", "speech"
        ])
        self.assertEqual([value[1] for kind, value in timeline3 if kind == "speech"], ["Eins", "Zwei", "Drei", "Vier", "Fünf"])
        self.assertEqual(len({value[0] for kind, value in timeline3 if kind == "speech"}), 5)
        body_voices = [voices3[value[0][0]] for kind, value in timeline3 if kind == "speech"]
        self.assertEqual(body_voices, [
            "de-DE-KatjaNeural", "de-DE-ConradNeural", "de-DE-AmalaNeural",
            "de-DE-KillianNeural", "de-DE-LouisaNeural",
        ])
        self.assertNotIn(NARRATOR_VOICE, body_voices)

    def test_teil2_skips_role_lines_parses_inline_standalone_and_joint_speakers_then_repeats(self):
        participants = [("J.", "mann"), ("M.", "mann"), ("B.", "frau")]
        copy = (
            "Prep <60''>\nJ.: = Journalist\n\n"
            "J.: Start question.\nM. & B.:\nShared answer.\n"
            "J.:\nSecond question.\nM.: Reply."
        )
        timeline = parse_part2_timeline(copy, participants)
        first_pass = [
            ("speech", (("J.",), "Start question.")),
            ("speech", (("M.", "B."), "Shared answer.")),
            ("speech", (("J.",), "Second question.")),
            ("speech", (("M.",), "Reply.")),
        ]
        self.assertEqual(timeline, [*first_pass, ("pause", 2), *first_pass])
        self.assertNotIn("Journalist", repr(timeline))

    def test_target_extension_is_retained_and_duplicate_stems_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "Teil1_001.m4a").touch()
            self.assertEqual(resolve_target_file(folder, "Teil1_001"), folder / "Teil1_001.m4a")
            self.assertEqual(resolve_target_file(folder, "Teil1_002"), folder / "Teil1_002.mp3")
            (folder / "Teil1_001.mp3").touch()
            with self.assertRaisesRegex(ValueError, "multiple output files"):
                resolve_target_file(folder, "Teil1_001")

    def test_dry_run_validates_all_42_without_azure_or_output_writes(self):
        import openpyxl

        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as output_root:
            source = Path(source_dir)
            output_dirs = {}
            for part in (1, 2, 3):
                folder = Path(output_root) / f"teil{part}"
                folder.mkdir()
                output_dirs[part] = folder
                for item_id in range(1, 15):
                    path = source / f"b1_listening_teil{part}_{item_id:03}.xlsm"
                    workbook = openpyxl.Workbook()
                    sheet = workbook.active
                    sheet.title = "meta"
                    headers = ["音频文件_ID", "script", "copy", "Einleitung", "出场人物"]
                    sheet.append(headers)
                    if part == 1:
                        people = ", ".join(f"Nummer {n} ({'Frau' if n % 2 else 'Mann'})" for n in range(1, 6))
                        copy = "Start <30''>\n" + "\n".join(
                            f"Nummer {n}: Text {n}" + (" <2''>" if n < 5 else "") for n in range(1, 6)
                        )
                    elif part == 2:
                        people = "J. (Mann), M. (Mann)"
                        copy = "Vorbereitung <60''>\nJ.: = Journalist\nJ.: Frage\nM.: Antwort"
                    else:
                        people = ""
                        copy = "Start <30''>\n" + "\n".join(
                            f"{n}\nText {n}" + (" <2''>" if n < 5 else "") for n in range(1, 6)
                        )
                    intro = "Einleitung nur einmal" if part != 2 else "Einleitung zweimal"
                    sheet.append([f"{item_id:03}", "", copy, intro, people])
                    workbook.save(path)
            with patch.dict("generate_telc_b1_listening_audio.OUTPUT_DIRS", output_dirs), \
                 patch("generate_telc_b1_listening_audio.b2.load_azure_environment", side_effect=AssertionError("Azure key read")), \
                 patch("generate_telc_b1_listening_audio.b2.synthesize_ssml", side_effect=AssertionError("Azure called")):
                result = main(["--source-dir", str(source)])
            self.assertEqual(result, 0)
            self.assertEqual(len(list(source.glob("*.xlsm"))), 42)
            self.assertFalse(any(list(folder.iterdir()) for folder in output_dirs.values()))
