# Local Dictionary Validation Design

## Intent

Validate the newly implemented local German-to-Chinese dictionary with a real entitled account, fix demonstrated correctness defects, and add another open dataset only when measured content gaps justify it.

## Goals

- Verify login, exam-text lookup, German inflection-to-lemma matching, Chinese definitions, favorite toggling, and ExamVocabularyCard compatibility.
- Measure coverage against real exam-preparation reading text instead of hand-picked success cases.
- Preserve German case distinctions while making Unicode-equivalent spellings match.
- Keep every imported definition attributable to a source and compatible license.

## Non-goals

- Do not add fuzzy spelling correction, online runtime queries, or LLM-generated translations.
- Do not merge a second dataset merely to increase raw row count.
- Do not refactor unrelated exam-preparation or lexicon code.

## Constraints

- Dictionary lookup stays local and entitlement-protected.
- Existing WikDict and morphology files remain the primary sources.
- NFC normalization must not collapse German noun/verb case distinctions such as `Gehen` and `gehen`.
- No Git commit or push is created.

## Approaches

1. **Recommended: evidence-first layered validation.** Fix proven normalization defects, establish a real-content coverage baseline, then evaluate candidate datasets by incremental Chinese-definition coverage, duplicate rate, license, and provenance.
2. Import another dictionary immediately. Rejected because it can hide lookup defects and create duplicate or conflicting definitions before a baseline exists.
3. Generate missing translations automatically. Rejected because it would no longer be a reproducible open-dictionary pipeline.

The user authorized the recommended route and asked the agent to proceed without another design round.

## Acceptance

- Decomposed and precomposed German forms return the same dictionary entries.
- `Gehen` and `gehen` remain distinct source headwords.
- Existing importer and API tests pass, plus a regression test for Unicode equivalence.
- Real UI proves lookup and favorite creation for account `110`.
- A second source is imported only after a written measurement shows meaningful incremental coverage and compatible licensing.
