// Mask account numbers and UPI handles before data leaves the machine (LLM_MASK=false to disable).

// A long run of digits that is not part of a decimal. Runs of at least 9 digits are phone, account and card numbers;
// shorter ones are amounts and counts. A run glued to letters is an order or reference id (OD123…): left alone, so
// ids the model must copy back exactly stay unique.
const LONG_DIGITS = /(?<![A-Za-z\d.])(\d{5,})(\d{4})(?!\d|\.\d)/g

export function mask(text: string): string {
  if (process.env.LLM_MASK === 'false') return text
  return text
    .replace(LONG_DIGITS, (whole, a: string, b: string, at: number, all: string) => {
      // A bare JSON number ("netWorth":100000000) is a value, not an identifier; identifiers are strings.
      if (/[:[,]/.test(all[at - 1] ?? '') && /[,}\]]/.test(all[at + whole.length] ?? '')) return whole
      return `${'X'.repeat(Math.min(a.length, 4))}${b}`
    })
    .replace(/\b([a-z0-9._-]{2})[a-z0-9._-]*@([a-z]{2,})\b/gi, '$1…@$2')
}

/** `mask` for a value that is sent as JSON (tool results): same rules, same shape back. */
export function maskValue<T>(value: T): T {
  if (process.env.LLM_MASK === 'false' || value === undefined) return value
  return JSON.parse(mask(JSON.stringify(value)))
}
