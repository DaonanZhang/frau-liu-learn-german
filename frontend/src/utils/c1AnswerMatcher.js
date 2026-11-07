function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("de")
    .replace(/ß/gu, "ss")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\p{P}+|\p{P}+$/gu, "")
    .trim();
}

function expandOptionalFragments(value) {
  const match = value.match(/\(([^()]*)\)/u);
  if (!match) return [value];

  const before = value.slice(0, match.index);
  const after = value.slice(match.index + match[0].length);
  return [
    ...expandOptionalFragments(`${before}${match[1]}${after}`),
    ...expandOptionalFragments(`${before}${after}`),
  ];
}

function matchParts(expectedParts, actualParts, expectedIndex = 0) {
  if (expectedIndex === expectedParts.length) return true;
  const acceptedParts = expectedParts[expectedIndex];

  return actualParts.some((part, actualIndex) => acceptedParts.includes(part)
    && matchParts(expectedParts, actualParts.filter((_, index) => index !== actualIndex), expectedIndex + 1));
}

function matchesScheme(actual, scheme) {
  const actualParts = actual.split(";").map(normalize);
  const expectedParts = scheme.split(";")
    .map((part) => expandOptionalFragments(part).map(normalize))
    .sort((left, right) => left.length - right.length);
  if (actualParts.some((part) => !part) || actualParts.length !== expectedParts.length) return false;

  return matchParts(expectedParts, actualParts);
}

export function answerMatchesExpected(actualValue, expectedValue) {
  const actual = String(actualValue ?? "").trim();
  const expected = String(expectedValue ?? "").trim();
  if (!actual || !expected) return false;

  return expected.split(/<or>/iu).some((scheme) => matchesScheme(actual, scheme));
}

export function expectedHasMultipleAnswers(expectedValue) {
  return String(expectedValue ?? "").split(/<or>/iu).some((scheme) => scheme.includes(";"));
}
