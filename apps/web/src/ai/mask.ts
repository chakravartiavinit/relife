// Mask account numbers and UPI handles before data leaves the machine (LLM_MASK=false to disable).
export function mask(text: string): string {
  if (process.env.LLM_MASK === 'false') return text
  return text
    .replace(/\b(\d{4,})(\d{4})\b/g, (_, a: string, b: string) => `${'X'.repeat(Math.min(a.length, 4))}${b}`)
    .replace(/\b([a-z0-9._-]{2})[a-z0-9._-]*@([a-z]{2,})\b/gi, '$1…@$2')
}
