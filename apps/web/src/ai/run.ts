import { generateText, type GenerateTextResult, type OutputInterface, type ToolSet } from 'ai'
import { db, schema } from '@/db'
import { scopedUser } from '@/core/context'
import { AI_OFF_MESSAGE, aiAllowed } from '@/core/multi-user'
import { getUser } from '@/core/user'
import { modelId, type Task } from './models'
import { failedRun, prepareRuntime, successfulRun } from './runtime-policy'

/** generateText with an llm_runs row for every call (tokens, latency, errors). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export async function generate<TOOLS extends ToolSet = {}, OUTPUT extends OutputInterface = OutputInterface<string, string>>(
  task: Task, label: string, args: Parameters<typeof generateText<TOOLS, OUTPUT>>[0],
): Promise<GenerateTextResult<TOOLS, OUTPUT>> {
  const started = Date.now()
  const m = modelId(task) ?? 'unknown'
  // Whose call it is: logged per person, and refused for a member when the owner turned the shared model off.
  const who = scopedUser() ?? (await getUser().catch(() => null))
  if (who && !(await aiAllowed(who))) throw new Error(AI_OFF_MESSAGE)
  const userId = who?.id
  const runtime = prepareRuntime(task, label, args)
  try {
    const res = await generateText(runtime.args)
    await db.insert(schema.llmRuns).values({ ...successfulRun(label, m, Date.now() - started, res.totalUsage, res.finishReason), userId }).catch(() => {})
    return res
  } catch (err) {
    await db.insert(schema.llmRuns).values({ ...failedRun(label, m, Date.now() - started, err, runtime.timeoutSignal, args.abortSignal), userId }).catch(() => {})
    throw err
  }
}
