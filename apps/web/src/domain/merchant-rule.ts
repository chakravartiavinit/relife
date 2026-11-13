// Learned merchant rules (the "Remember" button). Pure, so it is tested without a database.

/** Patterns shorter than this match only as a whole word. */
export const MIN_SUBSTRING = 4
/** Shortest merchant / UPI text "Remember" will turn into a rule. */
export const MIN_RULE = 2

/**
 * Does a user rule's pattern match this merchant / UPI text (both lowercase)? A long pattern is a substring, like the
 * built-ins. A short one ("a", "kfc") must stand alone as a word, or one "Remember" would capture every merchant that
 * happens to contain it.
 */
export function ruleMatches(hay: string, pattern: string) {
  if (!pattern) return false
  if (pattern.length >= MIN_SUBSTRING) return hay.includes(pattern)
  return new RegExp(`(^|[^a-z0-9])${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(hay)
}
