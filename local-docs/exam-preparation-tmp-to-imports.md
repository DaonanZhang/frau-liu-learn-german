# Exam Preparation tmp-to-imports Routing

This document defines how files staged under the repository-level `tmp/`
directory are routed into `apps/exam_preparation/data/imports/*/raw/`.

## Routing Source of Truth

Route a file by matching its ASCII filename prefix to the example workbook in
the destination `raw/` directory. Do not route only from a Chinese folder name
when the filename and example disagree.

| Filename prefix | Destination `raw/` directory | Reference workbook |
| --- | --- | --- |
| `b1_listening_` | `imports/listening/raw/` | `b1_listening_example.xlsx` |
| `b1_reading_title_matching_` | `imports/reading_title_matching/raw/` | `b1_reading_title_matching_example.xlsx` |
| `b1_reading_understanding_` | `imports/reading_understanding/raw/` | `b1_reading_understanding_example.xlsx` |
| `b1_reading_ad_matching_` | `imports/reading_ad_matching/raw/` | `b1_reading_ad_matching_example.xlsx` |
| `b1_cloze_question_` | `imports/cloze_choice/raw/` | `b1_cloze_question_example.xlsx` |
| `b1_cloze_matching_` | `imports/cloze_matching/raw/` | `b1_cloze_matching_example.xlsx` |
| `b1_writing_` | `imports/writing/raw/` | `b1_writing_example.xlsx` |
| `Kennenlernen_` | `imports/speaking_einander_kennenlernen/raw/` | Einander kennenlernen |
| `b1_speaking_segmented_` | `imports/speaking_ueber_ein_thema_sprechen/raw/` | Über ein Thema sprechen |
| `b1_speaking_planen_` | `imports/speaking_gemeinsam_etwas_planen/raw/` | Gemeinsam etwas planen |

All paths in the table are relative to
`apps/exam_preparation/data/`.

## Current Chinese Folder Mapping

When the repository-level `tmp/` uses the current Chinese category folders,
the expected mapping is:

| `tmp/` folder | Destination |
| --- | --- |
| `B1写作` | `imports/writing/raw/` |
| `B1完型_选择_Teil1` | `imports/cloze_choice/raw/` |
| `B1完型_选词填空_Teil 2` | `imports/cloze_matching/raw/` |
| `B1阅读_单选_Teil2` | `imports/reading_understanding/raw/` |
| `B1阅读_广告_Teil3` | `imports/reading_ad_matching/raw/` |
| `B1阅读_标题_Teil1` | `imports/reading_title_matching/raw/` |
| `B1_口语_kennenlernen` | `imports/speaking_einander_kennenlernen/raw/` |
| `B1_口语_über_ein_Thema_sprechen` | `imports/speaking_ueber_ein_thema_sprechen/raw/` |
| `B1_口语_Gemeinsam_etwas_planen` | `imports/speaking_gemeinsam_etwas_planen/raw/` |

Filename-prefix matching remains authoritative if more source folders are
added later.

## Safe Move Procedure

1. Inspect every file under repository-level `tmp/`, including files in nested
   category folders.
2. Match each filename prefix to the table above and confirm that the matching
   example workbook exists in the destination `raw/` directory.
3. Check that no destination file has the same name. Never overwrite an
   existing raw file; stop and report the collision instead.
4. Move only recognized workbook files. Leave an unrecognized or ambiguously
   named file in `tmp/` and report it for manual routing.
5. Keep every `*_example.xlsx` file in place. Examples are references and must
   not be imported or replaced.
6. After moving, verify the source and destination file counts and confirm that
   no source workbook was missed.

## Workbook Extension Support

The importer scans both `.xlsx` and `.xlsm` workbooks and deliberately skips
files whose stem ends with `_example`. Keep the ASCII filename stem so the
routing rule remains valid. VBA macros are not executed during import; only the
worksheet data required by the importer is read.

For workbook schema, sheet, and field requirements, follow
`local-docs/exam-preparation-xlsx-contract.md`.

## Rules Confirmed During the Current Import Preparation

- `.xlsx` and `.xlsm` are equivalent import candidates for worksheet data.
  Macros are not executed or required.
- Cross-sheet numeric IDs are compared by numeric value, so `012`, `12`, and
  `12.0` link to the same exercise. Do not depend on leading zeroes being
  retained in `ExerciseBase.external_id`: spreadsheet type inference can parse
  a numeric-looking ID such as `003` as `3`.
- Each workbook contains exactly one exercise. Its filename must end in a
  numeric suffix such as `_013`, and that suffix is the canonical database
  `external_id` (`13` after numeric normalization).
- The workbook's internal meta ID remains the link key for its child sheets.
  If the internal ID conflicts with another file or disagrees with the filename
  suffix, the importer logs an `ID OVERRIDE` and uses the filename suffix for
  the database ID.
- Batch preflight must still report duplicate or mismatched internal IDs so the
  source quality issue is visible even though filename-based import prevents
  database overwrites.
- `cloze_matching.answer.correct_option_text` must exactly equal one
  `options.option_text` in the same exercise. `correct_option_key` is not part
  of the current contract.
- `reading_ad_matching` uses a flat `exercise` sheet: every non-empty `Ad`
  enters the option pool, while only a non-empty `situation` creates an item.
  A row with an empty situation and a non-empty ad is therefore a valid
  distractor row.
- `Ad = X` is a real special option meaning that no advertisement matches; it
  is not an empty value. A non-empty situation paired with `X` creates an item
  whose correct answer is `X`.
- Only a non-empty situation paired with a truly empty Ad is invalid. Empty
  means missing, blank, or whitespace-only after trimming.
- Candidate workbooks must contain no columns unused by their importer unless
  that column has first been added to the documented contract and importer.

## Current Routed Batch

The batch prepared on 2026-07-27 contains:

| Import type | Files |
| --- | ---: |
| `writing` | 20 |
| `cloze_choice` | 15 |
| `cloze_matching` | 15 |
| `reading_understanding` | 16 |
| `reading_ad_matching` | 15 |
| `reading_title_matching` | 15 |
| **Total** | **96** |

The 2026-07-27 real import exposed four cross-file collisions that the initial
file-by-file preflight did not detect:

- `b1_writing_015.xlsm` and `b1_writing_016.xlsm` both contain ID `016`
- `b1_reading_title_matching_003.xlsm`, `013.xlsm`, `014.xlsm`, and `015.xlsm`
  all contain meta/child ID `003`

All 96 files completed their per-file transactions, but the original importer
allowed later files to replace earlier exercises at these duplicate keys. The
importer now uses filename suffixes as canonical database IDs so these files can
be re-imported without editing their internal sheet-link IDs.

Final re-import result on 2026-07-27:

- all existing `exam_preparation` records and app-level cascades were cleared;
  no other Django app data was deleted
- all 96 candidates were moved from `processed/` back to `raw/`
- all 96 files imported successfully and returned to `processed/`
- `raw/` contains no non-example candidates and `failed/` is empty
- the database contains 96 distinct `ExerciseBase` rows from 96 distinct source
  files
- the four mismatched workbooks logged `ID OVERRIDE` and were stored under
  their filename IDs as intended
