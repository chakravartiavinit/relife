import { stepCountIs } from 'ai'
import { getUser } from '@/core/user'
import { saveCoachMessage, threadForModel } from '@/core/coach-messages'
import { historyForModel, proposalIds, sourcesFromSteps, type CoachSource } from '@/domain/coach-thread'
import { aiEnabled, model } from './models'
import { generate } from './run'
import { COACH_SYSTEM, digestText } from './context'
import { dataTools } from './tools'
import { mask, maskValue } from './mask'
import { localErrorMessage } from '@/ai/local'

export type AskResult = {
  answer: string; error?: string; sources?: CoachSource[]; insightIds?: string[]
  /** The question and the answer are both in `coach_messages`, so the thread already has them. False: the caller shows them itself. */
  saved?: boolean
}

/** The data tools, with what the model reads back masked (merchant UPI ids, account numbers). The saved results and the sources shown to you stay as they were. */
function maskedTools(user: Parameters<typeof dataTools>[0]) {
  const tools = dataTools(user)
  return Object.fromEntries(Object.entries(tools).map(([name, t]) => [name, {
    ...t, toModelOutput: ({ output }: { output: unknown }) => ({ type: 'json' as const, value: maskValue(output) as never }),
  }])) as unknown as typeof tools
}

/**
 * "Ask your data" for the app and Telegram /ask. Never throws. Both channels share one conversation in
 * `coach_messages`: the question and the answer are saved (the answer with the data it read as `sources` and any
 * routines it proposed as `insightIds`), and the last few turns go back to the model so a follow-up works.
 * Without a model, or with an empty question, nothing is saved.
 */
export async function askData(question: string, { channel = 'app' }: { channel?: 'app' | 'telegram' } = {}): Promise<AskResult> {
  const q = question.trim().slice(0, 2000)
  if (!q) return { answer: '', error: 'Ask a question, e.g. “How did I sleep this week?”' }
  if (!aiEnabled('chat')) {
    return { answer: '', error: 'No LLM configured. Set LLM_DEFAULT (e.g. anthropic:claude-sonnet-5-5) and the provider key in .env.' }
  }
  try {
    const user = await getUser()
    const history = historyForModel(await threadForModel(user))
    const asked = await saveCoachMessage(user, { role: 'user', text: q, channel })
    try {
      const res = await generate('chat', 'chat.ask', {
        model: model('chat'),
        system: `${COACH_SYSTEM}\nAnswer the question using the digest and tools. Use tools for exact numbers. If you suggest a new routine, call propose_schedule so the user can approve it. Never suggest medicine or dosage changes. For a medicine reminder, direct the user to the existing medicine form. Reply in plain text, under 120 words.\nDigest: ${await digestText(user)}`,
        messages: [...history, { role: 'user' as const, content: q }].map((m) => ({ ...m, content: mask(m.content) })),
        tools: maskedTools(user),
        stopWhen: stepCountIs(6),
      })
      const answer = res.text.trim() || 'I could not find an answer in your data.'
      const steps = res.steps
      const sources = sourcesFromSteps(steps)
      const insightIds = proposalIds(steps)
      const replied = await saveCoachMessage(user, { role: 'assistant', text: answer, channel, payload: { ...(sources.length ? { sources } : {}), ...(insightIds.length ? { insightIds } : {}) } })
      return { answer, sources, insightIds, saved: !!asked && !!replied }
    } catch (err) {
      const error = localErrorMessage(err) ?? `LLM error: ${String(err instanceof Error ? err.message : err).slice(0, 300)}`
      const replied = await saveCoachMessage(user, { role: 'assistant', text: error, channel, payload: { error: true } })
      return { answer: '', error, saved: !!asked && !!replied }
    }
  } catch (err) {
    return { answer: '', error: localErrorMessage(err) ?? `LLM error: ${String(err instanceof Error ? err.message : err).slice(0, 300)}` }
  }
}
