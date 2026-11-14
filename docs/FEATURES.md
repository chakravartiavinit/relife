# Parked features

Scoped features that are not built yet. Each entry says why it is worth building, what it covers, how it fits
the current code, and what must be decided first. Pick one up by turning it into a plan in `plans/`, then mark it
here.

| Feature | Status | Effort | Scoped |
|---|---|---|---|
| [Voice for the assistant](#voice-for-the-assistant) | PARKED | 3–5 days in 4 phases | 2026-11-13 |
| [Party between servers](#party-between-servers) | PARKED | about 1 week | 2026-11-14 |

Statuses: `PARKED` (scoped, waiting), `PLANNED` (plan written in `plans/`), `BUILDING`, `DONE`, `DROPPED` (with a reason).

---

## Voice for the assistant

Talk to ReLife and hear it answer. Speech-to-text (STT) and text-to-speech (TTS) come from
[Fish Audio](https://fish.audio) behind a small interface, so a local engine can replace it later.

### Why

- The assistant already exists (`askData` in `src/ai/ask.ts`), but only as text: the ask box on Insights
  (`src/ui/components/insight-ui.tsx`) and Telegram `/ask` or any plain message (`src/bot/telegram.ts`).
- Most logging happens away from the laptop (gym, walking, cooking). A voice note is faster than typing
  `water 250` on a phone.
- Answers are already plain text under 120 words, which suits TTS with no extra formatting work.

### What exists to build on

- Telegram plain text already routes to the deterministic quick-log parser first (`parseQuickLog`, then
  `applyQuickLog` in `src/core/quicklog.ts`) and to `askData` only when the text is not a log. A voice
  transcript sent through the same path can log things on day one, with no new AI write tools.
- `askData` is single-turn: no chat history. Ten tools: nine read tools plus `propose_schedule`, which only
  creates a pending suggestion.
- Rule from `AGENTS.md` and `docs/AI_COACH.md`: the AI only drafts and proposes. Voice must not change this.
- AI keys are saved from the Connectors page through `EXTRA` in `src/core/integrations.ts`. The voice key
  belongs there too.

### Fish Audio (checked 2026-11-13)

| Need | Endpoint | Price |
|---|---|---|
| STT, one file | `POST /v1/asr`, model `transcribe-1-pro` (send it as the `model` header, or `transcribe-1` is used) | $0.36 per audio hour |
| STT, live | `wss://api.fish.audio/v1/asr/realtime`, model `transcribe-stream-1` (turn detection, live drafts, max 60 min) | $0.36 per session hour |
| TTS | `POST /v1/tts` (HTTP streaming) or `wss://api.fish.audio/v1/tts` (feed text as the LLM writes); MP3, WAV, PCM, Opus | `s2.1-pro`: $15 per 1M UTF-8 bytes; `s2.1-pro-free`: $0 within fair use |
| Own voice | Voice cloning from a sample | Included |

No subscription or minimum. Use `s2.1-pro` or `s2-pro`; `s1` retires on 2026-12-31.

Cost estimate: a 120-word answer is about 700 bytes, so about $0.01 on `s2.1-pro`. A 10-second question costs
about $0.001 to transcribe. At 30 exchanges a day: about $10 a month, or almost $0 on `s2.1-pro-free`.

### Scope

**Phase 1 — Telegram voice notes (1 day). Highest value, no UI.**

- `bot.on('message:voice')`: download the OGG/Opus file, transcribe it, echo the transcript in italics so the
  user can see what was heard, then send the transcript through the existing plain-text routing (quick-log
  first, then `askData`).
- Answer with `sendVoice` (Opus) plus the text, so the reply can be read or heard. A Settings switch chooses
  voice, text or both.
- New module `src/voice/` with `transcribe(audio): Promise<string>` and `speak(text): Promise<Buffer>`, and one
  provider file `src/voice/fish.ts`. Nothing else imports Fish Audio directly.
- `fish` entry in `EXTRA` with `FISH_AUDIO_API_KEY` (secret) and an optional `FISH_AUDIO_VOICE_ID`, plus a
  `check()` that tests the key. Document both in `.env.example` and `docs/CONNECTORS.md`.
- Add an Undo button to the reply when a voice note logs something (see Wrong transcripts below).
- Limits: reject voice notes over 60 s; skip TTS for answers over 1,500 bytes and send text only.

**Phase 2 — Voice actions that keep the "AI only proposes" rule (1 day).**

- Cover what quick-log cannot parse ("I finished my run", "mark reading done") with propose-and-confirm: the
  model calls a tool such as `propose_log` or `propose_complete_quest`, and the bot answers with a Confirm
  button. Nothing changes until the user taps it.
- Reuse the outbox `ref` pattern from `src/core/outbox.ts` for the buttons.

**Phase 3 — Mic button on the dashboard (1 day).**

- Add a mic button to the Insights ask box and the ⌘K menu. Record with `MediaRecorder`, send the clip to a
  server action that calls `transcribe`, and show the transcript before it is sent.
- Play the answer with an `<audio>` element. Show a stop button while it plays.
- States: idle, mic permission denied, recording (with a level meter and a time limit), transcribing, thinking,
  speaking, error with retry, and no voice key (the button links to Connectors).

**Phase 4 — Conversation and polish (1–2 days, only if phases 1–3 get used).**

- Multi-turn chat: keep the last few turns for each Telegram chat or browser session, so follow-ups like "and
  last week?" work.
- Stream TTS while the LLM writes (WebSocket TTS) to cut the wait before the first sound.
- A cloned "System" voice that fits the game look.
- A local engine behind the same interface (for example Whisper for STT), to keep everything on the machine.

### Risks and limits

- **Privacy.** `docs/SYSTEM_DESIGN.md` says only the configured LLM provider sees summaries. Fish Audio is a
  second cloud service: it hears the questions and reads the answers, which include health and money numbers.
  `LLM_MASK` hides only account numbers and UPI handles. Voice must be off until the user adds a key, and the
  Security and privacy section of `docs/SYSTEM_DESIGN.md` must name Fish Audio.
- **Latency.** The LLM is the slow part (up to 6 tool steps, 120 s budget), not TTS. Expect 3–8 s for each
  answer until phase 4 adds streaming. Telegram users already see "typing".
- **Mic needs HTTPS.** Browsers allow the mic on `http://localhost` only. Over Tailscale (`*.ts.net`) the
  dashboard needs HTTPS (for example `tailscale serve`), or phase 3 works only on the laptop itself.
- **Wrong transcripts.** A misheard number ("15" for "50") logs a wrong value. The echoed transcript shows the
  error. Telegram quick-log replies have no Undo button today (only reminder replies do), so phase 1 adds one
  to logs that come from a voice note.
- **Lock-in.** All provider code stays in `src/voice/fish.ts`.

### Decisions before building

1. Is Fish Audio acceptable for health and money data, or must voice wait for a local engine?
2. Paid `s2.1-pro` or free `s2.1-pro-free` (fair-use limits, may change)?
3. Default reply on Telegram: voice, text, or both?
4. Phase 2: may the AI ever log without a confirm tap (for example simple counts), or always confirm?

### Done when

- A Telegram voice note "water 250" logs 250 ml and replies with the transcript and a short voice confirmation.
- A Telegram voice question gets a voice answer and the same text.
- With no `FISH_AUDIO_API_KEY`, voice notes get a text reply that says how to turn voice on, and nothing is
  sent to Fish Audio.
- Unit tests cover the provider interface with a fake provider; no test calls Fish Audio.


## Party between servers

Party mode today works between people on **one** server (`core/party.ts`). Friends who each run their own copy cannot join the
same party yet. That is parked: it needs a public HTTPS `RELIFE_PUBLIC_URL` on both servers, a new endpoint per server to
protect, and handshake, polling, key rotation and revocation work.

### What is ready

- `PartyMemberView` and `PartyView` in `packages/contract/src/party.ts` already say exactly what may cross between people, with
  fixtures. A later transport only moves these shapes.
- Party quest and chest rules are pure (`domain/party.ts`), so a remote member is one more `PartyMemberView`.

### Sketch

- An Ed25519 server key in `data/party.key`, created on first use.
- The invite link carries the server URL and a one-time token.
- `POST /api/v1/party/handshake` swaps bearer tokens with a new scope `party`, which reads nothing but the feed.
- The peer polls `GET /api/v1/party/feed` (ETag, every 15 minutes) and gets `PartyMemberView[]`, built by the same allow-list.
- A member can leave or be removed on either side; a revoked token stops the feed at once.

### Decisions before building

- Whether a remote member can cheer (it would mean a push the other way) or only appear in the list.
- How the party quest counts a remote week when the two servers are in different time zones.
