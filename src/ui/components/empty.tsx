import { NotebookArt } from './line-art'

export function EmptyState({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {/* Line-art on a soft sky halo, like a page lying in sunlight. */}
      <div className="relative mb-5 grid size-28 place-items-center">
        <div aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--sky)_32%,transparent)_0%,color-mix(in_oklch,var(--sakura)_18%,transparent)_55%,transparent_72%)]" />
        <NotebookArt className="relative h-16 w-auto text-line-blue" />
      </div>
      <h3 className="font-display text-[17px] font-bold tracking-[-0.015em] text-ink">{title}</h3>
      {description ? <p className="mt-1.5 max-w-[42ch] text-[13.5px] leading-relaxed text-ink-3">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
