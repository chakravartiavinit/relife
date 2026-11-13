import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { ImportMapping } from '@/domain/imports'
import type { User } from '@/core/user'

/**
 * The saved mapping for a bank: the newest import of this user with the same header signature and a mapping. No table:
 * it survives Undo because the `imports` row stays.
 */
export async function savedMapping(user: User, signature: string): Promise<{ mapping: ImportMapping; fileName: string } | null> {
  const I = schema.imports
  const [row] = await db.select({ mapping: I.mapping, fileName: I.fileName }).from(I)
    .where(and(eq(I.userId, user.id), eq(I.signature, signature), isNotNull(I.mapping)))
    .orderBy(desc(I.createdAt)).limit(1)
  return row?.mapping ? { mapping: row.mapping, fileName: row.fileName } : null
}
