# HanDeDict Supplement Design

## Intent

Supplement WikDict with a reproducible, source-attributed German-to-Chinese index reversed from the human-maintained HanDeDict Chinese-to-German dictionary.

## Evidence

- Current real-reading occurrence coverage: 83.94%; unique-form coverage: 58.36%.
- Filtered HanDeDict plus the existing morphology data projects 89.32% occurrence and 73.04% unique-form coverage.
- The pinned source is `gugray/HanDeDict` commit `910ab2075bf711277cd914c55efb7beaec2212d8`; its data header declares CC BY-SA 3.0.

## Approaches

1. **Selected:** reverse only unambiguous single German word or hyphenated-word glosses, retain Chinese simplified headwords as translations, set `source=handedict`, and reuse morphology mapping.
2. PanLex direct merge: rejected for the first supplement because heterogeneous upstream licensing and noisy inferred translations make provenance and review harder.
3. Hand-maintained contraction list: deferred because it gives little broad coverage and creates project-owned translations.

## Constraints

- WikDict remains the higher-priority source.
- HanDeDict entries never overwrite WikDict rows.
- Ignore comments/history and multiword German explanations.
- Strip only recognized trailing part-of-speech annotations; do not heuristically translate or split arbitrary prose.
- Pin the source archive and document URL, commit, date, format, and license.
- Morphology lemma association is NFC-normalized but case-sensitive; it never falls back across German casing because `Dürfen` and `dürfen` can have different parts of speech.
- Re-running the command must replace only managed `wikdict` and `handedict` rows, without touching other future sources.

## Acceptance

- Import tests cover a normal entry, multiple Chinese translations, rejected multiword prose, morphology expansion, source separation, and idempotent re-import.
- API results keep WikDict before HanDeDict when both match.
- Real database import increases coverage and representative gaps such as `dafür`, `liegt`, and `weltweit` return Chinese results.
