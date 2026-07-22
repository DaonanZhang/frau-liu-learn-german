# Exam Preparation XLSX Import Spec

This document is the current import contract for the `exam_preparation` module.

It records:

- where incoming XLSX files should be placed
- the required filename patterns
- the required tabs and columns for each exercise type
- how each XLSX shape maps into the current Django database structure

## Directory Layout

Place future exam-preparation XLSX files under:

- `apps/exam_preparation/data/imports/listening/raw`
- `apps/exam_preparation/data/imports/reading_title_matching/raw`
- `apps/exam_preparation/data/imports/reading_understanding/raw`
- `apps/exam_preparation/data/imports/reading_ad_matching/raw`
- `apps/exam_preparation/data/imports/cloze_choice/raw`
- `apps/exam_preparation/data/imports/cloze_matching/raw`
- `apps/exam_preparation/data/imports/writing/raw`
- `apps/exam_preparation/data/imports/speaking_gap_matching/raw`
- `apps/exam_preparation/data/imports/speaking_prompt_segmented/raw`

Directory meaning:

- `raw`: new XLSX files waiting to be imported
- `processed`: XLSX files already imported successfully
- `failed`: XLSX files that failed import and need manual inspection

This follows the existing project style of keeping app-specific import data inside the app directory, similar to `apps/learning_by_video/data/...`.

## Shared Database Meta

All exercise types map their shared metadata into `ExerciseBase`.

Current shared fields:

- `level`
- `skill`
- `exercise_type`
- `external_id`
- `exam_type`
- `title`
- `difficulty`
- `is_real_exam`
- `source_name`
- `source_reference`
- `imported_from_file`
- `imported_at`
- `creation_method`

Important notes:

- `title_zh` no longer exists and must not appear in new import assumptions.
- Every exercise must have a non-empty `exam_type`, because each concrete exercise card displays it as an exam-format badge.
- `exam_type` stores values such as `telc` or `Daf`; an import with a blank `考试类型` value must fail instead of creating an unlabelled exercise.
- `external_id` is the editor-facing ID inside one exercise type.
- source file naming is separate from the exercise's own `external_id`.

## Shared Naming Rules

Use half-width ASCII characters in filenames.

Recommended naming intent:

- `[level]_[skill]_[update_id]`
- `[level]_[reading]_[subtype]_[update_id]`

Examples:

- `b1_listening_001.xlsx`
- `b1_reading_title_matching_001.xlsx`
- `b1_reading_understanding_001.xlsx`
- `b1_reading_ad_matching_001.xlsx`
- `b1_cloze_question_001.xlsx`
- `b1_cloze_matching_001.xlsx`
- `b1_writing_001.xlsx`

The filename identifies the import batch/update file.
It is not the same thing as the per-exercise `ID` inside the sheet.

## 1. Listening

Suggested filename:

- `b1_listening_001.xlsx`

Tabs:

- `meta`
- `exercise`

### 1.1 `meta` tab

Columns:

- `音频文件_ID`
- `音频文件网盘地址`
- `原标题` optional
- `script` optional
- `考试类型`
- `什么真题` or equivalent source text

Mapping:

- `音频文件_ID` -> `ExerciseBase.external_id`
- `原标题` -> `ExerciseBase.title`
- `考试类型` -> `ExerciseBase.exam_type`
- `什么真题` -> prefer `ExerciseBase.source_reference` or `source_name` depending on actual content
- `音频文件网盘地址` -> `ListeningExercise.audio_file_url`
- audio file name stem -> `ListeningExercise.audio_file_identifier`
- `script` -> `ListeningExercise.script`
- listening-level constants:
  - `ExerciseBase.skill = LISTENING`
  - `ExerciseBase.exercise_type = LISTENING_CHOICE`

Notes:

- The current database already supports multiple listening subtypes through `ListeningExercise.listening_type`.
- If the XLSX needs to distinguish subtype, the importer should infer it from file location, filename, or an added meta column.

### 1.2 `exercise` tab

Columns:

- `exercise_id`
- `question_type`
- `question_id`
- `question`
- `answer`
- `is_correct`
- `Explanation`

Mapping:

- `exercise_id` -> link to `ListeningExercise`
- one `(exercise_id, question_id)` group -> one `ListeningQuestion`
- `question_type` -> `ListeningQuestion.question_type`
- `question` -> `ListeningQuestion.question_text`
- each answer row -> one `ListeningAnswerOption`
- `answer` -> `ListeningAnswerOption.option_text`
- `is_correct` -> `ListeningAnswerOption.is_correct`
- `Explanation` -> `ListeningAnswerOption.explanation`

Importer behavior:

- `option_key` is not provided in the XLSX; importer should generate it from row order, for example `A`, `B`, `C`, `D`.

## 2. Reading

### 2.1 Reading Title Matching

Suggested filename:

- `b1_reading_title_matching_001.xlsx`

Tabs:

- `meta`
- `exercise`
- `question_bank`

#### 2.1.1 `meta` tab

Columns:

- `ID`
- `原标题` optional
- `考试类型`
- `是否真题`

Mapping:

- `ID` -> `ExerciseBase.external_id`
- `原标题` -> `ExerciseBase.title`
- `考试类型` -> `ExerciseBase.exam_type`
- `是否真题` -> `ExerciseBase.is_real_exam`
- constants:
  - `ExerciseBase.skill = READING`
  - `ExerciseBase.exercise_type = READING_TITLE_MATCHING`

#### 2.1.2 `exercise` tab

Columns:

- `exercise_id`
- `Text`
- `Title`
- `Explanation`

Mapping:

- one row -> one `ReadingTitleMatchingItem`
- `exercise_id` -> parent exercise
- `Text` -> `ReadingTitleMatchingItem.text`
- `Title` -> correct title text for the item
- `Explanation` -> `ReadingTitleMatchingItem.explanation`

Importer behavior:

- `item_number` is not explicitly provided; importer should assign it by row order within the same `exercise_id`.
- `Title` should be resolved against `question_bank.option_text`.

#### 2.1.3 `question_bank` tab

Columns:

- `exercise_id`
- `question_bank`

Mapping:

- each row -> one `ReadingTitleMatchingOption`
- `question_bank` -> `ReadingTitleMatchingOption.option_text`

Importer behavior:

- `option_key` is not provided; importer should generate `A`, `B`, `C`, ...
- `option_order` should follow row order.

### 2.2 Reading Understanding

Suggested filename:

- `b1_reading_understanding_001.xlsx`

Tabs:

- `meta`
- `exercise`

#### 2.2.1 `meta` tab

Columns:

- `ID`
- `标题`
- `文本`
- `考试类型`
- `是否真题`

Mapping:

- `ID` -> `ExerciseBase.external_id`
- `标题` -> `ExerciseBase.title`
- `文本` -> `ReadingUnderstandingExercise.text_markdown`
- `考试类型` -> `ExerciseBase.exam_type`
- `是否真题` -> `ExerciseBase.is_real_exam`
- constants:
  - `ExerciseBase.skill = READING`
  - `ExerciseBase.exercise_type = READING_UNDERSTANDING`

#### 2.2.2 `exercise` tab

Columns currently proposed:

- `exercise_id`
- `question_id`
- `question`
- `answer`
- `explanation`

Current database fit:

- The current database expects one question with multiple answer options.
- Therefore, the sheet also needs a way to identify which answer is correct.

Required importer conclusion:

- This current XLSX shape is not fully sufficient yet for the current database.
- At minimum, add:
  - `is_correct`

Recommended final columns:

- `exercise_id`
- `question_id`
- `question`
- `answer`
- `is_correct`
- `explanation`

Mapping after that adjustment:

- one `(exercise_id, question_id)` group -> one `ReadingUnderstandingQuestion`
- `question` -> `ReadingUnderstandingQuestion.question_text`
- each answer row -> one `ReadingUnderstandingAnswerOption`
- `answer` -> `ReadingUnderstandingAnswerOption.option_text`
- `is_correct` -> `ReadingUnderstandingAnswerOption.is_correct`
- `explanation` -> `ReadingUnderstandingAnswerOption.explanation`

Importer behavior:

- `option_key` should be generated as `a`, `b`, `c` or `A`, `B`, `C`.

### 2.3 Reading Ad Matching

Suggested filename:

- `b1_reading_ad_matching_001.xlsx`

Tabs:

- `meta`
- `exercise`

#### 2.3.1 `meta` tab

Columns:

- `ID`
- `原标题` optional
- `考试类型`
- `是否真题`

Mapping:

- `ID` -> `ExerciseBase.external_id`
- `原标题` -> `ExerciseBase.title`
- `考试类型` -> `ExerciseBase.exam_type`
- `是否真题` -> `ExerciseBase.is_real_exam`
- constants:
  - `ExerciseBase.skill = READING`
  - `ExerciseBase.exercise_type = READING_AD_MATCHING`

#### 2.3.2 `exercise` tab

Columns:

- `exercise_id`
- `situation`
- `Ad`

Current database fit:

- The database models ads separately from items, which is correct for the actual business structure.
- The proposed XLSX merges the correct ad text directly into each item row.

Conclusion:

- The current database structure is still reasonable.
- The importer should normalize this flat sheet into:
  - distinct `ReadingAdMatchingAd` rows deduplicated by ad text per exercise
  - `ReadingAdMatchingItem` rows pointing to the correct deduplicated ad

Special handling:

- if `Ad = X`, importer should map it to one special `ReadingAdMatchingAd` with:
  - `ad_key = X`
  - `is_no_match_option = True`

Recommended improvement:

- The current XLSX can work, but a future `ads` tab would be cleaner if you want explicit ad order and explicit extra ads.

## 3. Sprachbaustein

### 3.1 Cloze Choice

Suggested filename:

- `b1_cloze_question_001.xlsx`

Tabs:

- `meta`
- `exercise`

#### 3.1.1 `meta` tab

Columns:

- `ID`
- `标题`
- `内容`
- `考试类型`
- `原题`

Mapping:

- `ID` -> `ExerciseBase.external_id`
- `标题` -> `ExerciseBase.title`
- `内容` -> `ClozeChoiceExercise.content_with_placeholders`
- `考试类型` -> `ExerciseBase.exam_type`
- `原题` -> prefer `ExerciseBase.source_reference` or `original_source_text` depending on actual meaning
- constants:
  - `ExerciseBase.skill = SPRACHBAUSTEIN`
  - `ExerciseBase.exercise_type = CLOZE_CHOICE`

#### 3.1.2 `exercise` tab

Columns:

- `exercise_id`
- `blank_key`
- `blank_number`
- `Option`
- `is_correct`
- `explanation`

Mapping:

- one `(exercise_id, blank_key)` group -> one `ClozeChoiceBlank`
- each option row -> one `ClozeChoiceOption`
- `Option` -> `ClozeChoiceOption.option_text`
- `is_correct` -> `ClozeChoiceOption.is_correct`
- `explanation` -> `ClozeChoiceOption.explanation`

Importer behavior:

- `option_key` is not supplied; generate `A`, `B`, `C`, ...

### 3.2 Cloze Matching

Suggested filename:

- `b1_cloze_matching_001.xlsx`

Tabs:

- `meta`
- `options`
- `answer`

#### 3.2.1 `meta` tab

Columns:

- `ID`
- `标题`
- `内容`
- `考试类型`
- `原题`

Mapping:

- `ID` -> `ExerciseBase.external_id`
- `标题` -> `ExerciseBase.title`
- `内容` -> `ClozeMatchingExercise.content_with_placeholders`
- `考试类型` -> `ExerciseBase.exam_type`
- `原题` -> prefer `ExerciseBase.source_reference` or `original_source_text`
- constants:
  - `ExerciseBase.skill = SPRACHBAUSTEIN`
  - `ExerciseBase.exercise_type = CLOZE_MATCHING`

#### 3.2.2 `options` tab

Columns:

- `exercise_id`
- `option_key`
- `option_text`

Mapping:

- each row -> one `ClozeMatchingOption`
- `option_key` -> `ClozeMatchingOption.option_key`
- `option_text` -> `ClozeMatchingOption.option_text`

Recommended improvement:

- add optional `option_order`
- add optional `is_extra`

Reason:

- the current database supports both
- if omitted, importer must infer order from row order and infer extras from whether an option is referenced by any blank

#### 3.2.3 `answer` tab

Columns:

- `exercise_id`
- `blank_key`
- `blank_number`
- `correct_option_key`
- `explanation`

Mapping:

- each row -> one `ClozeMatchingBlankAnswer`
- `correct_option_key` resolves to `ClozeMatchingOption.option_key`
- `explanation` -> `ClozeMatchingBlankAnswer.explanation`

## 4. Writing

Suggested filename:

- `b1_writing_001.xlsx`

Current sheet can be one tab or split later if needed.

Columns:

- `ID`
- `Title`
- `request`
- `考试类型`
- `是否真题`
- `time_limit`
- `words_limit`
- `task`
- `Example_Text`

Mapping:

- `ID` -> `ExerciseBase.external_id`
- `Title` -> `ExerciseBase.title`
- `request` -> `WritingExercise.request_text`
- `考试类型` -> `ExerciseBase.exam_type`
- `是否真题` -> `ExerciseBase.is_real_exam`
- `time_limit` -> `WritingExercise.time_limit_minutes`
- `words_limit` -> `WritingExercise.words_limit`
- `task` -> `WritingExercise.task_text`
- `Example_Text` -> one `WritingExampleText.example_text`
- constants:
  - `ExerciseBase.skill = WRITING`
  - `ExerciseBase.exercise_type = WRITING_PROMPT`

Conclusion:

- The current database is more flexible than the sheet because it supports multiple example texts.
- The current XLSX shape is still valid; importer can create one `WritingExampleText`.

## 5. Speaking

Speaking now needs to support two different exercise types:

- `SPEAKING_GAP_MATCHING`
- `SPEAKING_PROMPT_SEGMENTED`

### 5.1 Speaking Gap Matching

Suggested filename:

- `b1_speaking_gap_matching_example.xlsx`

Speaking XLSX is now intentionally aligned with `3.1 Cloze Choice`.

Tabs:

- `meta`
- `exercise`

#### 5.1.1 `meta` tab

Columns:

- `ID`
- `标题`
- `内容`
- `考试类型`
- `是否真题`

Important:

- remove any old `title_zh` column from future files

Mapping intent:

- `ID` -> `ExerciseBase.external_id`
- `标题` -> `ExerciseBase.title`
- `内容` -> `SpeakingGapMatchingExercise.content_with_placeholders`
- `考试类型` -> `ExerciseBase.exam_type`
- `是否真题` -> `ExerciseBase.is_real_exam`
- constants:
  - `ExerciseBase.skill = SPEAKING`
  - `ExerciseBase.exercise_type = SPEAKING_GAP_MATCHING`

#### 5.1.2 `exercise` tab

Columns:

- `exercise_id`
- `blank_key`
- `blank_number`
- `Option`
- `is_correct`
- `explanation`

XLSX shape meaning:

- this is now a non-shared blank-filling structure
- each blank repeats across multiple rows
- each row represents one candidate option for that blank
- only `is_correct` differs between candidate answers

Example shape:

- `blank_1` may appear on three rows with three different options
- only one of them has `is_correct = true`

Current database fit:

- `SpeakingGapBlank` owns its candidate `SpeakingGapOption` rows
- every option stores `is_correct`, `explanation`, and `sort_order`
- this matches `ClozeChoice` directly; no shared-option normalization is required

### 5.2 Speaking Prompt With Segmented Model Text

This is the new speaking type you described:

- one prompt
- one model answer
- the model answer is split by an agreed delimiter such as `<分段>`
- the database must store each segment in order for later exercises

Suggested filename:

- `b1_speaking_prompt_segmented_001.xlsx`

Tabs:

- `meta`
- `example`

#### 5.2.1 `meta` tab

Columns:

- `ID`
- `标题`
- `题目`
- `考试类型`
- `是否真题`
- `分段符号`

Recommended example row:

- `001 | Ein Thema zum Sprechen | Sie möchten über Ihre letzte Reise sprechen. Beschreiben Sie das Reiseziel, die Aktivitäten und Ihre Meinung. | telc | FALSE | <分段>`

Recommended mapping:

- `ID` -> `ExerciseBase.external_id`
- `标题` -> `ExerciseBase.title`
- `题目` -> new prompt field on the concrete speaking exercise
- `考试类型` -> `ExerciseBase.exam_type`
- `是否真题` -> `ExerciseBase.is_real_exam`
- `分段符号` -> optional delimiter field, default `<分段>`
- constants:
  - `ExerciseBase.skill = SPEAKING`
  - `ExerciseBase.exercise_type = SPEAKING_PROMPT_SEGMENTED`

#### 5.2.2 `example` tab

Columns:

- `exercise_id`
- `example_text`

Recommended example row:

- `001 | Letztes Jahr bin ich mit meiner Familie nach Berlin gefahren.<分段>Dort haben wir viele Museen besucht und jeden Tag etwas Neues gesehen.<分段>Am besten hat mir gefallen, dass die Stadt so lebendig und international ist.`

Importer behavior:

- split `example_text` by the agreed delimiter, for example `<分段>`
- trim whitespace
- ignore empty segments after trimming
- create one ordered segment row per part

Recommended database structure:

```python
class SpeakingPromptSegmentedExercise:
    exercise_base = OneToOneField(ExerciseBase)
    prompt_text
    segment_delimiter
    example_text_raw

class SpeakingPromptSegment:
    exercise = ForeignKey(SpeakingPromptSegmentedExercise)
    segment_order
    segment_text
```

Recommended constraints:

- `ExerciseBase.exercise_type = SPEAKING_PROMPT_SEGMENTED` must be unique with `level + external_id` under the existing base constraint pattern
- `SpeakingPromptSegment.exercise + segment_order` unique

Recommended field intent:

- `prompt_text`: the actual speaking task shown to the learner
- `segment_delimiter`: usually `<分段>`, stored so importer and later tooling know what was used
- `example_text_raw`: optional raw full text before splitting, useful for auditing or reimport
- `segment_order`: the stable order of each model paragraph or sentence block
- `segment_text`: the actual split segment content used by later practice modes

Architectural conclusion:

- this new speaking type does not fit the current `SpeakingGapMatchingExercise` table
- it should be implemented as a second concrete speaking model, not forced into the gap-matching tables
- this is a real database extension, not just an importer transformation

## Overall Database Assessment

The current database structure is still broadly reasonable for the new XLSX specification.

What already fits well:

- listening
- reading title matching
- cloze choice
- cloze matching
- speaking gap matching
- writing

What is still structurally correct in DB but needs importer normalization:

- reading ad matching
  - XLSX is flat
  - DB is normalized
  - importer should deduplicate ad texts into a shared ad pool

What requires a new concrete database model:

- speaking prompt with segmented model text
  - this is a genuinely different business object
  - it should not be forced into `SpeakingGapMatchingExercise`

What needs a small XLSX adjustment to fully match the current DB:

- reading understanding
  - add `is_correct`

What should be standardized for all importers:

- `exam_type` always maps to `ExerciseBase.exam_type` and is required for every exercise
- `原标题` or `标题` always maps to `ExerciseBase.title`
- `是否真题` always maps to `ExerciseBase.is_real_exam`
- `ID` always maps to `ExerciseBase.external_id`
- file name always maps to `ExerciseBase.imported_from_file`
- importer should set `ExerciseBase.creation_method = xlsx_import`

## Recommended Importer Rules

- infer `level` from the filename prefix such as `b1`
- keep `external_id` exactly as provided in the sheet
- generate missing option keys when the sheet does not provide them
- generate item order or blank order from row order when the sheet omits explicit numbering
- store original file name in `imported_from_file`
- move imported files from `raw` to `processed` only after the entire workbook is imported successfully
- move failed files into `failed` and log the exact row-level validation error
