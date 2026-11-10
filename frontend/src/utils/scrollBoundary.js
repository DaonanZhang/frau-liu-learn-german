export function stopDownwardScrollChainAtBottom(event) {
  const element = event.currentTarget;
  const hasScrollableContent = element.scrollHeight > element.clientHeight + 1;
  const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;

  if (event.deltaY > 0 && hasScrollableContent && isAtBottom) {
    event.preventDefault();
  }
}
