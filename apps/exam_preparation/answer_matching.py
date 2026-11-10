import re
import unicodedata


_OPTIONAL_FRAGMENT = re.compile(r"\(([^()]*)\)")
_ALTERNATIVE = re.compile(r"<or>", re.IGNORECASE)


def _normalize(value):
    value = " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())
    start, end = 0, len(value)
    while start < end and unicodedata.category(value[start]).startswith("P"):
        start += 1
    while end > start and unicodedata.category(value[end - 1]).startswith("P"):
        end -= 1
    return value[start:end]


def _expand_optional_fragments(value):
    variants = [value]
    while any(_OPTIONAL_FRAGMENT.search(variant) for variant in variants):
        expanded_variants = []
        for variant in variants:
            match = _OPTIONAL_FRAGMENT.search(variant)
            if not match:
                expanded_variants.append(variant)
                continue
            prefix, optional, suffix = variant[:match.start()], match.group(1), variant[match.end():]
            expanded_variants.extend((prefix + suffix, prefix + optional + suffix))
        variants = expanded_variants
    return variants


def _components(value):
    return [_normalize(component) for component in value.split(";") if _normalize(component)]


def answer_matches(expected, actual):
    expected = str(expected or "")
    actual_components = _components(actual or "")
    if not _normalize(expected) or not actual_components:
        return False

    for solution in _ALTERNATIVE.split(expected):
        for expanded in _expand_optional_fragments(solution):
            expected_components = _components(expanded)
            if expected_components and sorted(expected_components) == sorted(actual_components):
                return True
    return False
