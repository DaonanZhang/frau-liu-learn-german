from __future__ import annotations

import re
import unicodedata


def normalize_de_text(text: str) -> str:
    """
    Normalize German text for aggregation/grouping.

    Rules (practical default):
    - strip leading/trailing whitespace
    - collapse multiple whitespaces
    - lowercase
    - keep umlauts/ß as-is (do NOT fold by default)
      (You can later add optional folding if you want).
    """
    s = text.strip()
    s = re.sub(r"\s+", " ", s)
    s = s.lower()
    s = unicodedata.normalize("NFC", s)
    return s