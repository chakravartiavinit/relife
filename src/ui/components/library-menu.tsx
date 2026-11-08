'use client'

import { useId, useState, useTransition } from 'react'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { removeLibraryItem, updateLibraryItem } from '@/app/actions'
import { LIBRARY, type LibraryKind } from '@/domain/activity'
import { Button } from './button'
import { Field, Input } from './form'
import { Dialog } from './forms/dialog'
import { RowMenu } from './row-menu'
import { useToast } from './toast'
import { cn } from '../cn'

type Item = { id: string; title: string; kind: LibraryKind; progressTotal: number | null; status: 'planned' | 'active' | 'paused' | 'done' }

/** ⋯ on a library card: edit (name, type, total), mark finished, remove. */
export function LibraryMenu({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false)
  const [, start] = useTransition()
  const toast = useToast()
  return (
    <>
      <RowMenu
        label={item.title}
        items={[
          { label: 'Edit', icon: Pencil, onSelect: () => setEditing(true) },
          ...(item.status !== 'done' ? [{ label: 'Mark finished', icon: Check, onSelect: () => start(async () => { await updateLibraryItem(item.id, { ...item, status: 'done' }); toast(`Finished “${item.title}”`, 'good') }) }] : []),
          { label: 'Remove', icon: Trash2, danger: true, onSelect: () => start(async () => { await removeLibraryItem(item.id); toast('Removed') }) },
        ]}
      />
      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit" icon={Pencil} description="Its type decides what the time counts as: courses, books and video series are learning; shows are entertainment.">
        {editing ? <EditForm item={item} onDone={() => setEditing(false)} /> : null}
      </Dialog>
    </>
  )
}

function EditForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const [title, setTitle] = useState(item.title)
  const [kind, setKind] = useState<LibraryKind>(item.kind)
  const [total, setTotal] = useState(item.progressTotal ? String(item.progressTotal) : '')
  const [pending, start] = useTransition()
  const toast = useToast()
  const id = useId()
  const save = () => start(async () => {
    try {
      await updateLibraryItem(item.id, { title, kind, progressTotal: total ? Number(total) : null, status: item.status })
      toast('Saved', 'good')
      onDone()
    } catch { toast('Check the name and total, then try again.', 'bad') }
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); save() }} className="flex flex-col gap-4">
      <Field label="Name" htmlFor={`${id}-t`}>
        <Input id={`${id}-t`} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus />
      </Field>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-ink-2">Type</div>
        <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1.5">
          {(Object.keys(LIBRARY) as LibraryKind[]).map((k) => (
            <button
              key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn(
                'h-9 rounded-full px-3 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out-quint active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill',
                kind === k ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 hover:text-ink',
              )}
            >
              {LIBRARY[k].label}
            </button>
          ))}
        </div>
      </div>
      <Field label={kind === 'show' ? 'Episodes' : kind === 'book' ? 'Chapters' : 'Lessons'} htmlFor={`${id}-n`} hint="Optional. Shows a progress bar.">
        <Input id={`${id}-n`} type="number" min={1} value={total} onChange={(e) => setTotal(e.target.value)} className="w-32" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending || !title.trim()}>{pending ? 'Saving…' : 'Save'}</Button>
      </div>
    </form>
  )
}
