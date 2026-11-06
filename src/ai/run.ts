import { generateText, type GenerateTextResult, type OutputInterface, type ToolSet } from 'ai'
import { db, schema } from '@/db'
import { modelId, type Task } from './models'


const trim = (v: unknown, n = 8000) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s && s.length > n ? `${s.slice(0, n)}…` : s
}

/** generateText with an llm_runs row for every call (tokens, latency, errors). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export async function generate<TOOLS extends ToolSet = {}, OUTPUT extends OutputInterface = OutputInterface<string, string>>(
  task: Task, label: string, args: Parameters<typeof generateText<TOOLS, OUTPUT>>[0],
): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
  const started = Date.now()
  const m = modelId(task) ?? 'unknown'
  try {
    const res = await generateText(args)
    await db.insert(schema.llmRuns).values({
      task: label, model: m, ok: true, ms: Date.now() - started,
      inputTokens: res.totalUsage.inputTokens ?? null, outputTokens: res.totalUsage.outputTokens ?? null,
      request: { prompt: trim(args.prompt ?? args.messages) }, response: { text: trim(res.text), output: trim(safeOutput(res)) },
    }).catch(() => {})
    return res
  } catch (err) {
    await db.insert(schema.llmRuns).values({
      task: label, model: m, ok: false, ms: Date.now() - started,
      request: { prompt: trim(args.prompt ?? args.messages) }, error: String(err instanceof Error ? err.message : err).slice(0, 2000),
    }).catch(() => {})
    throw err
  }
}

function safeOutput(res: { output?: unknown }) {
  try { return res.output } catch { return undefined }
}
