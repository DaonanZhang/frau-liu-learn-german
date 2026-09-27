export function moveClozeMatchingOption(answers, blankKeys, targetKey, optionKey) {
  const next = { ...answers };
  blankKeys.forEach((blankKey) => {
    if (next[blankKey] === optionKey) {
      next[blankKey] = "";
    }
  });
  next[targetKey] = optionKey;
  return next;
}
