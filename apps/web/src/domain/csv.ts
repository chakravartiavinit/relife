// CSV for people: RFC 4180 quoting, CRLF row ends. No DB, no React.

export type CsvCell = string | number | boolean | Date | null | undefined

/** Text that a spreadsheet would run as a formula starts with one of these. */
const FORMULA = /^[-=+@\t\r]/

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  let s = v instanceof Date ? v.toISOString() : v
  if (FORMULA.test(s)) s = `'${s}` // formula injection: Excel and Sheets show the text, not the result
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** One CSV line, ending in CRLF. Numbers are left alone; text that starts with `- = + @ TAB CR` gets a `'` prefix. */
export function csvRow(values: CsvCell[]): string {
  return values.map(cell).join(',') + '\r\n'
}
