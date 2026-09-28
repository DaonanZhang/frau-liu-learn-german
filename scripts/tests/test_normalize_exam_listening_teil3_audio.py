from pathlib import Path
import sys
from unittest import TestCase


SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from normalize_exam_listening_teil3_audio import select_single_play_segments  # noqa: E402


class SelectSinglePlaySegmentsTests(TestCase):
    def test_keeps_the_first_recording_from_each_of_five_matching_pairs(self):
        silences = [
            (10.35, 40.48),
            (53.43, 57.14),
            (70.09, 73.82),
            (84.18, 87.88),
            (98.25, 101.88),
            (111.93, 115.61),
            (125.67, 129.16),
            (139.62, 143.23),
            (153.69, 157.23),
            (169.42, 173.03),
            (185.22, 188.54),
        ]

        segments = select_single_play_segments(silences)

        self.assertEqual(segments, [
            (40.48, 57.14),
            (73.82, 87.88),
            (101.88, 115.61),
            (129.16, 143.23),
            (157.23, 173.03),
        ])

    def test_rejects_audio_without_exactly_five_repeated_pairs(self):
        with self.assertRaisesRegex(ValueError, "five repeated pairs"):
            select_single_play_segments([(10.0, 40.0), (50.0, 54.0)])

    def test_splits_a_final_pair_that_has_no_silence_between_plays(self):
        silences = [
            (10.0, 40.0),
            (50.0, 54.0),
            (64.0, 68.0),
            (78.0, 82.0),
            (92.0, 96.0),
            (106.0, 110.0),
            (120.0, 124.0),
            (134.0, 138.0),
            (148.0, 152.0),
        ]

        segments = select_single_play_segments(silences, duration=172.0)

        self.assertEqual(segments[-1], (152.0, 162.0))

    def test_uses_file_end_when_the_final_repeat_has_no_trailing_silence(self):
        silences = [
            (10.0, 40.0),
            (50.0, 54.0),
            (64.0, 68.0),
            (78.0, 82.0),
            (92.0, 96.0),
            (106.0, 110.0),
            (120.0, 124.0),
            (134.0, 138.0),
            (148.0, 152.0),
            (162.0, 166.0),
        ]

        segments = select_single_play_segments(silences, duration=176.0)

        self.assertEqual(segments[-1], (152.0, 166.0))

    def test_keeps_a_single_copy_when_audio_contains_six_repeated_recordings(self):
        silences = [(10.0, 40.0)]
        speech_start = 40.0
        for _ in range(6):
            silences.append((speech_start + 10.0, speech_start + 14.0))
            silences.append((speech_start + 24.0, speech_start + 28.0))
            speech_start += 28.0

        segments = select_single_play_segments(silences)

        self.assertEqual(len(segments), 6)
        self.assertEqual(segments[-1], (180.0, 194.0))
