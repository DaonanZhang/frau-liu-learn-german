# Audio Pause Marker Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing listening-audio generators honor supported numeric pause markers as seconds.

**Architecture:** Add the shared parser and duration-aware silence function to the B2 generator that the C1 generator already imports. Pass the parsed preparation duration through workbook metadata into each generator's audio assembly.

**Tech Stack:** Python, pandas, unittest, ffmpeg command construction

**Spec:** `docs/superpowers/specs/2026-11-16-audio-pause-marker-compatibility-design.md`

## Global Constraints

- Canonical form is `<N''>`; the integer is the exact silence duration in seconds. Reject `<N">`; C1 may retain legacy `<N"">` support.
- Parse and synthesize all body pause markers in source order, including multiple markers embedded in one speaker turn, while keeping the preparation pause separate.
- Preserve existing voice assignments and existing supported marker behavior.
- Add no dependency, generate no audio, make no Drive writes, and do not touch unrelated dirty files.
- Do not commit or push.

## Review Focus

- Canonical two-single-quote markers return the correct duration.
- Legacy two-double-quote markers remain accepted only by C1.
- Missing and malformed preparation markers fail rather than silently removing text.
- B2 passes parsed seconds to silence generation instead of using a hard-coded 60.
- C1 inserts parsed silence between intro and dialogue instead of discarding the marker.

---

### Task 1: Shared pause-marker compatibility

**Files:**
- Modify: `scripts/generate_telc_b2_listening_teil2_audio.py`
- Modify: `scripts/generate_telc_c1_hs_listening_audio.py`
- Modify: `scripts/tests/test_generate_telc_b2_listening_teil2_audio.py`
- Modify: `scripts/tests/test_generate_telc_c1_hs_listening_audio.py`
- Modify: `local-docs/exam-preparation-xlsx-contract.md`

**Interfaces:**
- Consumes: existing workbook `copy`, `Einleitung`, participant parsing, voice pools, and ffmpeg assembly helpers.
- Produces: a shared pause-marker parser returning the matched span and numeric seconds; `create_silence(path, seconds)`; workbook metadata carrying `preparation_seconds`.

- [ ] **Step 1: Write failing tests**

Add focused tests proving all required spellings parse to their integer duration, malformed/missing preparation markers fail, B2 calls duration-aware silence creation, and C1 concatenates intro, parsed silence, then dialogue.

- [ ] **Step 2: Run tests to verify RED**

Run: `.venv/bin/pytest scripts/tests/test_generate_telc_b2_listening_teil2_audio.py scripts/tests/test_generate_telc_c1_hs_listening_audio.py -q`

Expected: new compatibility or C1-silence tests fail for the missing behavior.

- [ ] **Step 3: Implement the minimal shared behavior**

Add the parser to the B2 module, generalize `create_silence`, and pass parsed duration through B2 and C1 workbook reading and generation. Keep the current script structure and voice logic unchanged.

- [ ] **Step 4: Update the XLSX contract**

Document the accepted marker spellings and state that the integer is a silence duration in seconds.

- [ ] **Step 5: Run focused verification**

Run: `.venv/bin/pytest scripts/tests/test_generate_telc_b2_listening_teil2_audio.py scripts/tests/test_generate_telc_c1_hs_listening_audio.py -q`

Expected: all focused tests pass with no failures.

### Task 2: Ordered body-pause timeline

- [ ] Change new workbook markers to canonical `<N''>` and reject `<N">`; keep C1's legacy `<N"">` reader support only if needed.
- [ ] Parse all marker spans in source order and build a speech/pause timeline from dialogue text.
- [ ] Sum all preparation markers before the first recognized participant label into the independent intro silence; start the body after the last one.
- [ ] For every timeline pause, create a duration-matched silence file; synthesize each speech fragment in its own directory and concatenate speech/pause segments in order.
- [ ] Test at least two pauses inside one speech turn and assert `speech → silence → speech → silence → speech` for both B2 and C1 assembly paths.
- [ ] Fail on malformed preparation or body numeric markers; update the contract/spec/plan to remove the obsolete one-double-quote form.
- [ ] Run the focused unittest command and `py_compile`; do not generate audio, call Azure, or write to Drive.

- [ ] **Step 6: Self-review**

Confirm the diff touches only the declared files, preserves voice constants and dialogue parsing, and contains no generated audio or credentials.

