# iPhone Shortcuts setup

ReLife can't read Apple Health directly (iOS doesn't allow it), so iPhone Shortcuts automations
forward what you need. Each automation appends **one line** to a file in iCloud Drive:

```
iCloud Drive/relife/inbox.txt
```

Your Mac syncs that file to `~/Library/Mobile Documents/com~apple~CloudDocs/relife/inbox.txt`.
The worker reads new lines every minute. If your laptop is off, lines wait in the file and are
processed later, so nothing is lost. Lines are de-duplicated, so a repeated line is harmless.

Newer iOS versions save **Append to Text File** into the Shortcuts folder instead (File Path `inbox.txt` →
**iCloud Drive/Shortcuts/inbox.txt**, `~/Library/Mobile Documents/iCloud~is~workflow~my~workflows/Documents/inbox.txt`
on the Mac). ReLife finds either file on its own. Set **Inbox file** on You → Connections (or `ICLOUD_INBOX_PATH`)
only if you keep it somewhere else. iOS puts its line break before each entry, so the newest line has none after it; ReLife reads it as soon as it is complete JSON.

## Line formats

Each line is a JSON object:

| What | JSON line |
|---|---|
| Steps for a day | `{"type":"steps","value":8423,"date":"2026-11-05"}` |
| Other health metric | `{"type":"health","metric":"weight","value":71.4,"unit":"kg"}` |
| Going to sleep | `{"type":"sleep","event":"start","at":"<ISO date>"}` |
| Woke up | `{"type":"sleep","event":"end","at":"<ISO date>"}` |

Known `metric` values: `weight`, `resting_hr`, `active_energy`, `distance`, `flights`,
`mindful_minutes`, `screen_time`. Anything else becomes a tracker named `health.<metric>`.

**Build JSON with a Dictionary action, not by typing text.** Shortcuts then escapes quotes and keeps
each entry on one line.

Bank SMS and screenshot text are not read (spending comes from the order apps on You → Connections); lines of that
kind are skipped. You can delete any bank-message automations.

For dates, use a **Format Date** action with format **ISO 8601** (include time).

## One-time setup

1. Open the **Files** app → iCloud Drive → create a folder named `relife`.
2. Create an empty `inbox.txt` in it (or let the first automation create it).

## 1. Daily steps (and other Health data)

Automation → **Time of Day** → 23:55, daily, **Run Immediately**.

1. **Find Health Samples** where Type is Steps, Start Date is Today. Group by Day.
2. **Calculate Statistics**: Sum of *Health Samples*.
3. **Format Date**: Current Date, custom format `yyyy-MM-dd`.
4. **Dictionary**: `type` = `steps`, `value` = *Statistics Result* (Number), `date` = *Formatted Date*.
5. **Append to Text File** → `relife/inbox.txt`, new line.

Add more blocks in the same shortcut for weight (`type` = `health`, `metric` = `weight`) or
mindful minutes. Sending the same day twice is fine; the latest value wins.

## 2. Sleep without a wearable

Two automations, both **Run Immediately**:

- **Sleep Focus → When turning on**: Format Date (ISO 8601) → Dictionary
  `type` = `sleep`, `event` = `start`, `at` = date → Append to `relife/inbox.txt`.
- **Alarm → When my alarm is stopped** (choose your wake-up alarm), or **Sleep Focus → When
  turning off**: same, with `event` = `end`.

An `end` pairs with the latest `start` in the 16 hours before it and records `sleep.hours`
for the wake-up day. Gaps under 30 minutes are ignored. From Telegram, `/sleep` and `/wake` do
the same thing.

## Optional: send directly over Tailscale

Instead of the iCloud file you can POST to the dashboard while your Mac is reachable:

1. Set `INGEST_TOKEN` in `.env` to a long random string (`openssl rand -hex 32`).
2. In the shortcut, replace **Append to Text File** with **Get Contents of URL**:
   - URL: `http://<your-mac>.<tailnet>.ts.net:3030/api/ingest`
   - Method: POST, Request Body: JSON (or File → *Dictionary*)
   - Header: `Authorization` = `Bearer <INGEST_TOKEN>`

The body can be one JSON object, an array of them, or plain text with one event per line.
If the Mac is asleep the request fails and the event is lost, which is why the iCloud file is
the default.
