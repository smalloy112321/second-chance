/** Small display rules for the Practice Room. Pure functions, testable with `node src/practiceDisplay.test.ts`. */

/** After she ends the practice, the partner's last question (which she never answered) is not shown. */
export function withoutUnansweredQuestion<T extends { kind: string }>(items: T[]): T[] {
  const last = items[items.length - 1]
  return last && last.kind === 'partner' && items.some((x) => x.kind === 'me') ? items.slice(0, -1) : items
}
