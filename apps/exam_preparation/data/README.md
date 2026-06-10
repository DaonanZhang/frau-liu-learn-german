# Exam Preparation Import Directories

Place future exam-preparation XLSX files under:

- `apps/exam_preparation/data/imports/listening/raw`
- `apps/exam_preparation/data/imports/reading_title_matching/raw`
- `apps/exam_preparation/data/imports/reading_understanding/raw`
- `apps/exam_preparation/data/imports/reading_ad_matching/raw`
- `apps/exam_preparation/data/imports/cloze_choice/raw`
- `apps/exam_preparation/data/imports/cloze_matching/raw`
- `apps/exam_preparation/data/imports/writing/raw`
- `apps/exam_preparation/data/imports/speaking_gap_matching/raw`

Directory meaning:

- `raw`: new XLSX files waiting to be imported
- `processed`: XLSX files already imported successfully
- `failed`: XLSX files that failed import and need manual inspection

This follows the existing project style of keeping app-specific import data inside the app directory, similar to `apps/learning_by_video/data/...`, while also separating files by exercise type for easier future import commands.

