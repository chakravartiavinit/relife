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
- Active quests block another candidate on the same stat, including a future corrective window.
- At most one discretionary-spending habit passes selection. A habit must have worsened, and yesterday's cleared habit receives a break.
- Sensitive measurements are context, not automatic more/less challenges. The policy excludes recognized medical, body, nutrition, sleep and mental-health measurements. Automatic health challenges currently support step counts only.
- Aggregate spending is not an automatic reduction goal because it can include essentials and planned purchases.

Observed-day counts are not verified connector coverage. Existing zero-filled spending signals can still hide missing imports. These checks do not solve source completeness, classifier errors or mislabeled custom trackers.

## Spending changes

An hourly check can detect today's recorded spending above twice its prior recorded-day average and above that average plus two standard deviations. It requires at least 14 prior observations in a 28-day window. It prefers delivery-app context when both app and aggregate signals qualify.

A same-day spike creates one deduplicated context question per local day. It asks whether spending was planned, essential or shared. It does not move money, declare a purchase irresponsible, or demand compensatory restrictions.

Eligible multi-day deterioration can produce a modest corrective quest starting tomorrow. Existing active quests and recent corrective quests constrain repetition. A future quest cannot consume today's measurements.

## Progress and feedback

An empty sum is unknown, not zero. Reduction quests need observations across their full expired window before completion. Average-based increases do not clear from one early observation. Missing progress cannot trigger a new penalty quest.

Completion describes adherence, not proof that a quest improved an outcome. The digest now includes recent quest targets, baselines, progress and statuses for reviews and chat. Explicit usefulness ratings, causal outcome evaluation and automatic long-term learning are not implemented here.

Legacy penalty quests remain, with target validation and sensitive-measure exclusions. This change does not redesign their labels or replace the game mechanics.

## Model and tool boundaries

- Calls have a 45-second cancellation deadline, at most one SDK retry, and bounded output tokens.
- Caller cancellation remains effective.
- New `llm_runs` records contain operational metadata, not prompt/response excerpts or raw exception messages. Existing historical records are not deleted.
- The generic SQL tool is removed. Tools provide bounded, user-scoped metrics, spending, learning, goals, schedule summaries and quest history.
- Tool date windows use real calendar dates, reject future dates and span at most 90 days.
- Schedule proposals remain pending. Medicine reminders require explicit medication intent in chat; the tool rejects dose/quantity fields.
- Imported text is treated as untrusted data in prompts. This is defense in depth, not proof that prompt injection is impossible.

The model provider still receives the selected context. Metadata-only logs do not make provider calls local or private. Full multi-user authentication/isolation and historical log cleanup remain separate work.

## Verification

Pure scenario tests cover evidence windows, sparse/stale records, sensitive measures, safe recovery, active conflicts, invalid model selections, spending spikes, future quests, unknown versus zero, and average completion. Runtime/tool policy tests cover budgets, cancellation, metadata minimization and date limits. Live model quality and connector coverage require separate, consented validation.
