import type { RawEvent } from '@/core/types'

export type GmailBody = { id: string; from: string; subject: string; text: string; date?: string }

export function asObj(e: RawEvent): Record<string, unknown> {
  return e.body && typeof e.body === 'object' ? (e.body as Record<string, unknown>) : {}
}

/** The readable text of an sms / ocr / gmail event. */
export function eventText(e: RawEvent): string {
  if (typeof e.body === 'string') return e.body
  const b = asObj(e)
  if (e.source === 'gmail') return `${b.subject ?? ''}\n${b.text ?? ''}`
  return String(b.text ?? '')
}

export function gmail(e: RawEvent): GmailBody | null {
  if (e.source !== 'gmail') return null
  const b = asObj(e)
  return { id: String(b.id ?? e.externalId), from: String(b.from ?? ''), subject: String(b.subject ?? ''), text: String(b.text ?? '') }
}

export const BANK_SENDER = /axisbank|hdfcbank|icicibank|sbi\.co\.in|kotak|idfcfirst|yesbank|indusind|federalbank|aubank/i
