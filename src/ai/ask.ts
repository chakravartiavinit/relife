import { stepCountIs } from 'ai'
import { getUser } from '@/core/user'
import { aiEnabled, model } from './models'
import { generate } from './run'
import { COACH_SYSTEM, digestText } from './context'
import { dataTools } from './tools'

/** "Ask your data" for Telegram /ask and the dashboard. Never throws. */
export async function askData(question: string): Promise<{ answer: string; error?: string }> {
  const q = question.trim().slice(0, 2000)
  if (!q) return { answer: '', error: 'Ask a question, e.g. “How did I sleep this week?”' }
  if (!aiEnabled('chat')) {
    return { answer: '', error: 'No LLM configured. Set LLM_DEFAULT (e.g. anthropic:claude-sonnet-5-5) and the provider key in .env.' }
  }
  try {
    const user = await getUser()
    const res = await generate('chat', 'chat.ask', {
      model: model('chat'),
      system: `${COACH_SYSTEM}\nAnswer the question using the digest and tools. Use tools for exact numbers. If you suggest a new routine, call propose_schedule so the user can approve it. Never suggest medicine or dosage changes. For a medicine reminder, direct the user to the existing medicine form. Reply in plain text, under 120 words.\nDigest: ${await digestText(user)}`,
      prompt: q,
      tools: dataTools(user),
      stopWhen: stepCountIs(6),
    })
    return { answer: res.text.trim() || 'I could not find an answer in your data.' }
  } catch (err) {
    return { answer: '', error: `LLM error: ${String(err instanceof Error ? err.message : err).slice(0, 300)}` }
  }
}
