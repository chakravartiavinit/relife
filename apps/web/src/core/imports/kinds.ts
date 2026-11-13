import type { RawEvent } from '@/core/types'
import type { User } from '@/core/user'
import type { ImportKind, ImportMapping, ImportProgress, ImportPreview } from '@/domain/imports'

/** What one import kind needs: a preview before it starts, and `emit` that turns the file into raw events. */
export type ImportKindImpl = {
  /** Reads the file (the whole of it for CSVs, the zip's directory for zips). `mapping` is the user's current choice. */
  preview(file: string, ctx: { user: User; fileName: string; mapping?: ImportMapping | null }): Promise<ImportPreview>
  emit(file: string, ctx: EmitCtx): Promise<EmitResult>
}

export type EmitCtx = {
  user: User
  importId: string
  mapping: ImportMapping | null
  /** Store raw events (batches of up to 1,000 are best). */
  send(events: RawEvent[]): Promise<void>
  progress(p: ImportProgress): Promise<void>
}

export type EmitResult = {
  /** Values read from the file that could become a row or an entry. */
  rows: number
  invalid: number
  invalidSamples: string[]
  from?: string
  to?: string
  note?: string
  /** Statement imports: the account the rows went to. */
  accountKey?: string
}

export type { ImportKind }
