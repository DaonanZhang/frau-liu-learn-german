# HanDeDict source

- Repository: https://github.com/gugray/HanDeDict
- Commit: `910ab2075bf711277cd914c55efb7beaec2212d8`
- Archive: https://github.com/gugray/HanDeDict/archive/910ab2075bf711277cd914c55efb7beaec2212d8.tar.gz
- Archive SHA256: `8968bf307d05bbc4181836d41e5a76db0a198176b28c5012a9d5bb02b96810c0`
- Archive-relative file path: `HanDeDict-910ab2075bf711277cd914c55efb7beaec2212d8/handedict.u8`
- Extracted file: `apps/lexicon/data/external/handedict/handedict.u8`
- Extracted file SHA256: `cd1ed40eda1ee60f5a7c75536482626bca22f6bcd34777a417ceeff56800779a`
- Data timestamp in file: `2026-11-12T02:30:01Z`
- Format: CEDICT-compatible UTF-8 text with traditional and simplified headwords, pinyin, and slash-delimited German glosses. Lines beginning with `#` are comments and include historical edit records.
- Import filtering: only current non-comment lines; each slash-delimited German gloss is accepted only when it is one Unicode word, optionally containing internal hyphens or apostrophes, after removing a recognized trailing `(S)`, `(V)`, `(Adj)`, or `(Adv)` marker. The simplified Chinese headword is stored as the translation. Multiword prose and other non-word glosses are skipped.
- License: CC-BY-SA 3.0, as declared in the source file. https://creativecommons.org/licenses/by-sa/3.0/deed.de
