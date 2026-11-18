# TELC B1 Sprechen Teil 3 — 003 Replacement Design

## Intent

Replace only `TELC / B1 / SPEAKING_TEIL3 / external_id=3` with the current
Google Drive workbook content titled `Eine Schiffsreise planen`, then generate
and deploy matching per-turn audio without changing any other exercise.

## Scope

- Accept the Drive workbook's two-sheet layout: `meta` contains `ID` and
  `task`; `example` contains the repeated dialogue metadata and turns.
- Do not import `task` yet. Task text will be handled in a later batch change.
- Preserve support for the existing single-sheet Teil 3 workbook layout.
- Replace the ignored local processed workbook with the downloaded Drive file.
- Update only local database scope `TELC/B1/SPEAKING_TEIL3/3`.
- Generate exactly 43 MP3 files using `de-DE-KatjaNeural`, overwriting the
  obsolete `B1_3_1.mp3` through `B1_3_20.mp3` files and creating `21` through
  `43`.
- Store nginx-proxied `/resources/ExamPreparation/...` URLs in the database.
- Provide server commands that update the same single database row and upload
  only these 43 files to both Shanghai and Frankfurt COS, overwriting existing
  object keys.

## Non-goals

- No frontend changes.
- No `task` field import.
- No changes to question 2 or any other speaking exercise.
- No commit or push.
- No browser verification unless separately requested.

## Approach

Extend the existing importer rather than hard-coding 43 dialogue turns in a
Django shell command. Add narrow filtering to the existing audio generator so
only the requested exercise is regenerated. Add an opt-in overwrite mode to
the generic COS sync helper; default missing-only behavior remains unchanged.
Use the existing resource layout and URL convention throughout.

## Acceptance

- The old and new Teil 3 workbook shapes both parse successfully.
- New-format parsing yields title `Eine Schiffsreise planen`, 43 ordered turns,
  alternating `TN1`/`TN2`, and ordered sections, without a `task` key.
- Local DB row `TELC/B1/SPEAKING_TEIL3/3` has the new title and 43 turns; row 2
  is unchanged.
- All `B1_3_1.mp3` through `B1_3_43.mp3` exist and are non-empty.
- Every local DB turn has the matching `/resources/.../teil3/B1_3_N.mp3` URL in
  both `dialogue` and `sections`.
- COS tooling can overwrite an existing key only when explicitly requested;
  default behavior still skips existing keys.
- A copy-paste-safe server Django shell command and dual-COS upload sequence are
  delivered.
