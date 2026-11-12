# AI coach: evidence first, no sandbox

ReLife keeps its existing Next.js, worker, Postgres and AI SDK architecture. It does not run model-generated code.

## Decision flow

1. Connectors and manual logs produce stored observations.
2. Pure code calculates complete-day baselines and recent performance.
3. Code builds modest, measurable quest candidates.
4. The model selects zero to three candidate IDs using goals, constraints, patterns and quest history.
5. Code rejects unknown/duplicate IDs, enforces load limits, and writes canonical targets and evidence reasons.
6. Observed data updates quest progress. Chat and reviews receive recent targets, progress and completion status.

A model may abstain. An empty selection is not a model failure. ReLife stores the daily abstention as a completed insight so worker restarts do not trigger repeated daily planning. A missing or failed model uses the same validated candidate pool as a deterministic fallback. No candidate means no new quest.

The AI selects priorities; it cannot invent daily quest targets or titles. Existing pending suggestions still require approval before adding schedules.

## Evidence and limits

- Baseline: four weeks before the recent seven complete days.
- Eligibility: at least ten baseline observations, four recent observations, and a record within the last two complete days.
- Today and future records never enter those complete-day averages.
- Missing dates do not become consecutive history for difficulty estimates.
- Recovery targets follow recent capacity instead of demanding an immediate return to an old baseline.
- At most three active/new quests pass selection. A candidate pool contains at most 24 options.
- Active quests block another candidate on the same stat when their date windows overlap. Capacity checks happen before model calls and again under a user-row lock before insertion.
- At most one discretionary-spending habit passes selection. A habit must have worsened, and yesterday's cleared habit receives a break.
- Sensitive measurements are context, not automatic more/less challenges. The policy excludes recognized medical, body, nutrition, sleep and mental-health measurements. Automatic health challenges currently support step counts only.
- Aggregate spending is not an automatic reduction goal because it can include essentials and planned purchases.

Observed-day counts are not verified connector coverage. Existing zero-filled spending signals can still hide missing imports. These checks do not solve source completeness, classifier errors or mislabeled custom trackers.

## Spending changes

An hourly check can detect today's recorded spending above twice its prior recorded-day average and above that average plus two standard deviations. It requires at least 14 prior observations in a 28-day window. It prefers delivery-app context when both app and aggregate signals qualify.

A same-day spike creates one deduplicated context question per local day. It asks whether spending was planned, essential or shared. It does not move money, declare a purchase irresponsible, or demand compensatory restrictions.

Eligible multi-day deterioration can produce a modest corrective quest starting tomorrow. Existing active quests and recent corrective quests constrain repetition. A future quest cannot consume today's measurements.

## Progress and feedback

An empty sum is unknown, not zero. Reduction and average quests need observations across their full expired window before completion. Unknown expired progress becomes `unverified`, shown as No data; it does not affect difficulty or trigger recovery. Average-based increases do not clear from one early observation.

Completion describes adherence, not proof that a quest improved an outcome. The digest now includes recent quest targets, baselines, progress and statuses for reviews and chat. Explicit usefulness ratings, causal outcome evaluation and automatic long-term learning are not implemented here.

## Recovery choices replace penalties

A recorded missed daily quest creates one recovery decision on the next local day. New daily/corrective issuance stays paused until midnight, regardless of the chosen response, unless late evidence clears every miss (below). Existing commitments remain. Users choose an exact previewed smaller step, rest, or a priorities review. No choice means no new recovery quest.

A smaller step must pass evidence, safety, load, overlap and already-satisfied checks, and be strictly easier than its parent after rounding. Increases start today; reductions start tomorrow. Approval revalidates the preview and version. A changed preview requires another explicit approval; it never silently substitutes a target.

Late imports: quests are still judged on the first tick after local midnight, but every tick of the next local day rechecks yesterday's `failed` and `unverified` quests against fresh data. A quest the data now meets becomes `cleared` and earns its XP once. Late data only upgrades: it never creates a new miss or a new pause. When late data clears every recorded miss, the pause lifts (`recovery.liftedAt`) and dailies can be issued on the next tick. An open decision closes without a choice; a saved choice stays as history; an accepted smaller step stays active and can still clear. Late clears are silent: no clear, reward box or level-up messages (the XP and chests are still granted). The one exception is a single `system` message when the pause message already reached Telegram. A queued pause message is dropped because the decision is no longer pending.

Recovery decisions use the existing insights JSON payload. Creation, decisions and quest insertion lock the user row inside short transactions. Duplicate requests return the stored choice without another write. Rest/priorities do not require an eligible target or a model call. Generic insight accept/dismiss cannot bypass this flow.

Active old penalties become `cancelled`, shown as Retired. Existing failed rows with null progress become unverified. Resolved history and earned XP remain. Recovery uses normal daily XP and never earns the all-daily-clear chest. Only successful active-to-cleared updates can award quest rewards. Today and Telegram remove penalty threats; choices live on Today.

## Outcome goals and weekly reviews

Outcome goals (`apps/web/src/domain/goals.ts`, `apps/web/src/core/goals.ts`, page `/goals`) close the loop: choose an outcome, record a baseline, link 1–3 existing routines or trackers, review, decide. At most 3 are active.

- Code owns every number. A tracker baseline is the mean of recorded days in the 28 complete days before the start (at least 7); missing days are skipped, never zero. A check-in goal uses the user's own baseline. The measure and baseline are locked once the goal starts.
- Status compares the period's outcome with baseline and target. Movement of at least 10% of the gap is toward (or away); less is flat. Too few records is "Not enough data", never a miss. Activity counts are flagged as weak outcome measures but allowed.
- Reviews compare action adherence with outcome change and always say that moving together does not show cause. Each review needs an explicit Keep, Change, Pause or Finish; nothing changes without one, and an undecided review stays "No decision recorded".
- The Sunday `ai:weekly-review` job runs without a model too. Without one it writes a rule-based "Goal check-in" only when a goal review is due. With one, the model adds an optional note and at most one proposal per goal (target, range, date or cadence). Proposals are dropped for sensitive goals or when they fail validation, and are applied only when the user saves the Change form. Decisions happen in the app, not through Telegram buttons.
- AI drafts: "Suggest a draft" asks the plan model for one goal from the profile goals text, using only listed tracker slugs and routine IDs. Drafts never carry a baseline. `checkGoalDraft` rejects medical, body, weight, calorie and medication content, health outcomes other than steps, unknown references and out-of-range dates. A draft is a pending insight; only saving it in the Goals form starts a goal (generic accept, Insights and Telegram cannot).
- Daily quests rank validated candidates linked to an active goal first (`prefer` in `questCandidates`/`selectQuests`). Linking only reorders: every check, the sensitive-measure exclusion, the 3-quest cap and the recovery pause still apply. Goals add no XP.

## Model and tool boundaries

- Calls use bounded per-task profiles: chat 120s total/30s per step; parse 180s/90s; plan 120s/60s; site classification 45s/45s. Each profile bounds output tokens, with larger parse/plan budgets for structured output and reasoning. At most one SDK retry is allowed.
- Caller cancellation remains effective.
- New `llm_runs` records contain operational metadata, not prompt/response excerpts or raw exception messages. Existing historical records are not deleted.
- The generic SQL tool is removed. Tools provide bounded, user-scoped metrics, spending, portfolio summaries, recent trades, people, learning, goals, schedule summaries and quest history.
- Tool date windows use real calendar dates, reject future dates and span at most 90 days.
- Schedule proposals remain pending. AI-generated medicine schedules are excluded in chat, weekly review and onboarding. A bounded keyword/dose guard also rejects recognized medical content disguised as another routine kind. This is not a complete drug classifier; users manage medicines through the medicine form.
- Imported text is treated as untrusted data in prompts. This is defense in depth, not proof that prompt injection is impossible.

The model provider still receives the selected context. Metadata-only logs do not make provider calls local or private. Full multi-user authentication/isolation and historical log cleanup remain separate work.

## Verification

Pure scenario tests cover evidence windows, sparse/stale records, sensitive measures, safe recovery, active conflicts, invalid model selections, spending spikes, future quests, unknown versus zero, and average completion. Runtime/tool policy tests cover budgets, cancellation, metadata minimization and date limits. Live model quality and connector coverage require separate, consented validation. Mock-database adapter and browser checks validate integration without using production data or sending real notifications.
