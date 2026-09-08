# Exam Preparation Import Preflight

This document defines the required static verification before importing
workbooks from `apps/exam_preparation/data/imports/*/raw/` into the database.
It complements:

- `local-docs/exam-preparation-tmp-to-imports.md` for routing files from `tmp/`
- `local-docs/exam-preparation-xlsx-contract.md` for the canonical workbook contract
- `scripts/exam_preparation_importer.py` for executable importer behavior

The preflight does not write to the database and does not move files into
`processed/` or `failed/`.

## Success Gate

Do not run the real import until all applicable checks below report zero
issues. A successful static preflight means the files conform to the current
workbook-reading and validation logic; it does not replace a database-backed
test or guarantee that external database constraints and infrastructure are
available.

## 1. Select Import Candidates

For each importer type, scan its `raw/` directory for:

- `.xlsx`
- `.xlsm`

Extension matching is case-insensitive. Exclude files whose filename stem ends
with `_example`; examples are contracts, not import candidates.

Record the file count per type and the total count before continuing.

## 2. Verify Workbook Structure

For every candidate workbook:

1. Open it with the same `openpyxl` engine used by the importer.
2. Confirm that every sheet required by its importer exists.
3. Trim leading and trailing whitespace from each header, matching the
   importer's `normalize_columns()` behavior.
4. Confirm that all required columns exist with exact case-sensitive names.
5. Distinguish between:
   - required columns
   - optional columns that the importer reads
   - unused columns that the importer does not read
6. Treat every unused column as a preflight issue until its intent is reviewed.

Use `local-docs/exam-preparation-xlsx-contract.md` and the corresponding importer
function as the source of truth for sheets and columns. If they disagree, stop
and resolve the contract before importing.

## 3. Compare Cross-Sheet IDs

Workbook IDs used only to link sheets follow numeric equivalence:

- `012 = 12 = 12.0`
- non-numeric IDs remain exact text matches

Normalization is used for finding related rows across sheets. Each workbook
must contain exactly one exercise, and its filename must end in a numeric ID
suffix. That suffix is the canonical `ExerciseBase.external_id`; for example,
`b1_reading_title_matching_013.xlsm` stores external ID `13`.

Check that every non-empty child row belongs to a meta exercise after this
normalization. Fully empty rows may be ignored where the importer explicitly
allows them.

After checking each file, build a batch-wide index of both internal IDs and
filename suffix IDs by `(level, exercise_type, normalized ID)`:

- duplicate filename suffix IDs are blocking because they still target the
  same database key
- duplicate internal IDs or an internal/filename mismatch must be reported and
  reviewed
- after review, the filename suffix is authoritative for the database ID while
  the internal ID remains authoritative for linking sheets inside that file

## 4. Run Shared Content Checks

For every exercise type:

- the meta/exercise ID required to create `ExerciseBase` is non-empty
- `考试类型` / `exam_type` is non-empty
- supported boolean fields can be parsed by `parse_bool()`
- numeric Excel boolean values such as `0.0` and `1.0` are accepted as false
  and true respectively
- integer fields can be parsed by `parse_int()`
- child rows link to the intended meta exercise

## 5. Run Type-Specific Checks

### Reading title matching

- every `exercise.Title` exists exactly in the same exercise's
  `question_bank.question_bank`

### Reading understanding

- each `(exercise_id, question_id)` group has exactly one correct answer

### Reading ad matching

Interpret the flat `exercise` sheet as follows:

- every non-empty `Ad` contributes to the exercise's deduplicated ad pool
- a row with both `situation` and `Ad` creates one item whose correct answer is
  that row's ad
- a row with empty `situation` and non-empty `Ad` is an extra/distractor ad and
  must not create an item
- a row with non-empty `situation` and empty `Ad` is invalid
- a row with both fields empty is ignored
- `X` is non-empty and is imported as the special “no advertisement matches”
  option; when a non-empty situation is paired with `X`, `X` is that item's
  correct answer
- after numeric ID normalization, all retained rows must link to their intended
  meta exercise

### Cloze choice

- every `(exercise_id, blank_key, blank_number)` group has exactly one correct
  option

### Cloze matching

- `options.option_text` is unique within one exercise
- every `answer.correct_option_text` matches exactly one
  `options.option_text` in the same exercise
- optional `option_order` and `is_extra` values are parseable when present

### Writing

- `是否真题` is parseable
- optional `time_limit` and `words_limit` values are valid integers when
  present

### Listening and speaking

- apply the same structural, ID-link, boolean, and integer checks
- speaking Teil 1: require one sheet with `ID`, `Role`, and `内容`; every
  dialogue row must have a role
- speaking Teil 2: require one matching row in `meta` and `example`, two
  complete opinion cards, and a fully TN1/TN2-tagged example dialogue
- speaking Teil 3: require consistent repeated metadata, a non-empty
  `句子类型` for every turn, and preserve section order by first occurrence
- follow all importer-specific validation in
  `scripts/exam_preparation_importer.py`

## 6. Confirm Atomicity Expectations

The importer wraps each workbook in its own `transaction.atomic()` block.
Therefore:

- one workbook either commits all of its database changes or rolls them back
- a failure in one workbook does not roll back earlier successful workbooks
- moving a file to `processed/` or `failed/` happens outside the database
  transaction

Preflight all files before the first real import to reduce partial batch
outcomes.

## 7. Execute the Real Import

Run each populated type from the repository root. Do not use `--no-move` for a
real operational import: successful files should move to `processed/`, and
failed files should move to `failed/`.

```bash
.venv/bin/python scripts/import_exam_preparation_writing.py
.venv/bin/python scripts/import_exam_preparation_cloze_choice.py
.venv/bin/python scripts/import_exam_preparation_cloze_matching.py
.venv/bin/python scripts/import_exam_preparation_reading_understanding.py
.venv/bin/python scripts/import_exam_preparation_reading_ad_matching.py
.venv/bin/python scripts/import_exam_preparation_reading_title_matching.py
.venv/bin/python scripts/import_exam_preparation_speaking_einander_kennenlernen.py
.venv/bin/python scripts/import_exam_preparation_speaking_ueber_ein_thema_sprechen.py
.venv/bin/python scripts/import_exam_preparation_speaking_gemeinsam_etwas_planen.py
```

After execution, reconcile the import summaries with filesystem counts. For a
fully successful 96-file batch, all 96 candidates must be in their matching
`processed/` directories, `raw/` must contain no non-example candidates, and
`failed/` must be empty.

## Current Verified Batch

Static preflight snapshot on 2026-07-27:

| Import type | Candidate files | Static issues |
| --- | ---: | ---: |
| `writing` | 20 | 0 |
| `cloze_choice` | 15 | 0 |
| `cloze_matching` | 15 | 0 |
| `reading_understanding` | 16 | 0 |
| `reading_ad_matching` | 15 | 0 |
| `reading_title_matching` | 15 | 0 |
| **Total** | **96** | **0** |

For the initial file-by-file snapshot:

- all 96 workbooks were readable
- all required sheets and columns existed
- no importer-unused columns were found
- numeric cross-sheet ID equivalence passed
- reading-ad situation/ad row behavior passed
- all implemented type-specific checks passed

The real import later revealed that this initial preflight was incomplete at
the batch level. The importer reported 96 successful file transactions, but
only 92 exercises remained attributable to the batch because four earlier
exercises were replaced at duplicate database keys:

| Exercise type | Duplicate ID | Source files | Final database source |
| --- | --- | --- | --- |
| `writing` | `016` | `b1_writing_015.xlsm`, `b1_writing_016.xlsm` | `b1_writing_016.xlsm` |
| `reading_title_matching` | `003` | `003.xlsm`, `013.xlsm`, `014.xlsm`, `015.xlsm` | `b1_reading_title_matching_015.xlsm` |

The static success gate now checks batch-wide filename suffix uniqueness and
reports internal-ID conflicts. The filename suffix rule prevents these four
known internal-ID mistakes from overwriting other exercises during re-import.

## Final Corrected Import Result

The importer was updated and the batch was re-imported on 2026-07-27 after
clearing only the `exam_preparation` app's data:

| Import type | Database exercises | Processed files | Failed files |
| --- | ---: | ---: | ---: |
| `writing` | 20 | 20 | 0 |
| `cloze_choice` | 15 | 15 | 0 |
| `cloze_matching` | 15 | 15 | 0 |
| `reading_understanding` | 16 | 16 | 0 |
| `reading_ad_matching` | 15 | 15 | 0 |
| `reading_title_matching` | 15 | 15 | 0 |
| **Total** | **96** | **96** | **0** |

Final integrity checks:

- 96 distinct `ExerciseBase` rows reference 96 distinct source filenames
- reading-title IDs `3`, `13`, `14`, and `15` reference their correspondingly
  suffixed source files
- writing IDs `15` and `16` reference `b1_writing_015.xlsm` and
  `b1_writing_016.xlsm` respectively
- reading-ad contains 15 exercises, 150 items, 196 per-exercise deduplicated ad
  options, and 26 items whose correct option is `X`
- Django system checks pass

This snapshot describes the files as they existed on the date above. Rerun the
full preflight whenever files or importer code change.
