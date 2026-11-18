# Audio Pause Marker Compatibility Design

## Intent

Make the listening-audio generators interpret canonical workbook markers such as `<30''>`, `<60''>`, and `<2''>` as silence durations in seconds. The marker syntax must be shared by the existing TELC B2 and C1 Hochschule generators so later B1 audio generation can reuse the same behavior.

## Scope

- Parse a timing marker into its numeric duration instead of matching only a hard-coded 60-second spelling.
- Use `<N''>` as the canonical marker spelling; reject `<N">`.
- C1 may continue reading its legacy `<N"">` marker spelling.
- Parse all markers in order, including markers inside speaker turns, and assemble an ordered speech/pause timeline.
- Treat all preparation markers before the first participant label as preparation time; sum their durations and place one independent silence between the introduction and body timeline.
- Update focused tests and the XLSX contract.

## Non-goals

- Do not generate audio in this change.
- Do not build the complete B1 Teil 1/2/3 generator yet.
- Do not edit Google Drive workbooks.
- Do not change voice assignments or add dependencies.

## Approach

Use one parser and timeline builder in the existing B2 audio module, which C1 already imports. The marker parser returns all match spans and integer durations; malformed numeric markers fail. Each generator retains its preparation duration separately, then synthesizes each speech fragment and inserts one silence segment per body pause before concatenating in source order. Give each speech synthesis call its own temporary directory to avoid segment collisions.

## Acceptance

- Canonical markers parse to the expected exact seconds; `<N">` is rejected and C1 may retain `<N"">` compatibility.
- All body markers, including multiple markers inside one turn, appear in source order on the generated timeline.
- Missing or malformed preparation and body markers fail clearly.
- B2 and C1 assembly include the summed preparation silence plus every body pause in the correct order.
- Existing voice-selection and dialogue tests still pass.

