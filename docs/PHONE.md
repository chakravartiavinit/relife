# ReLife on your phone

Three things work together: the web app on your phone's home screen, notifications there, and (Android only) an app that
sends Health Connect data. All three start at **You › Settings › Devices › Use on your phone**.

## 1. Which address can your phone open?

The page checks, from the server, which of these a phone can reach, and shows one QR for the one you pick.

| Option | Works when | Web app | Notifications and install |
|---|---|---|---|
| Tailscale (`https://<mac>.<tailnet>.ts.net`) | the phone has Tailscale and `tailscale serve` is on | yes | yes (HTTPS) |
| Public URL (`RELIFE_PUBLIC_URL`) | you set it in `.env` and the name is in `RELIFE_ALLOWED_HOSTS` | yes | yes if it is `https://` |
| Same Wi-Fi (`http://192.168.x.x:3030`) | the server is bound beyond loopback (`RELIFE_BIND`) and the phone is on the same network | yes | **no**: browsers only allow service workers on HTTPS or `localhost` |
| This address (the one the page is open on) | you opened the page on a non-loopback address | yes | only if HTTPS |

Each option shows what to change when it is not ready (the `.env` lines or the command, copyable). In Docker the container
address is not reachable from a phone, so the page says to publish the port and use the host's address.

Pairing itself is the normal device pairing (a one-time QR secret in the URL fragment, or a typed code you approve in
Settings › Devices). A phone paired this way gets the same access as a browser.

## 2. Notifications (web push)

- iPhone: Safari › Share › Add to Home Screen, open the new icon, then **You › Notifications › Push on this device › Turn on**
  (iOS only allows push for apps added to the home screen, and needs iOS 16.4 or later).
- Android: Chrome › menu › Install app (or just allow notifications in the browser).
- Each browser or installed app is its own device with its own subscription; **Settings › Devices** lists them and revoking
  a device removes its subscription.
- **You › Notifications** has a "Send to" choice per category (Telegram, Push, or both). Quiet hours, daily caps and repeats
  are shared: one message is one message, whichever channel carries it. Answering on one channel (tapping Done) stops the
  repeats on the other.
- Limits: push needs an HTTPS address that the push service can reach you at (Tailscale or a public name); the text is
  clipped (title 120 characters, body 240) and the notification carries at most two buttons (Chrome's limit); tapping the
  notification itself opens the matching page in ReLife.
- VAPID keys identify your server to the browsers' push services. They are made on first use into `data/vapid.json`; set
  `RELIFE_VAPID_PUBLIC_KEY` and `RELIFE_VAPID_PRIVATE_KEY` to carry them to another machine. New keys make every browser
  show "Turn on again".

## 3. Android app (Health Connect)

An iPhone can only send health data through Shortcuts (`docs/SHORTCUTS.md`). On Android the app in `apps/android` reads
Health Connect once an hour and sends one summary per day:

- Steps, active calories, heart rate (average, low, high), resting heart rate, weight, sleep, and exercise sessions.
- Days are cut in the server's time zone (the app learns it right after pairing). Sleep belongs to the day you woke up.
- It reads only, and the token it receives is `ingest` only: it can post health data and sign itself out, nothing else.
- Open the app, tap **Scan code**, scan the QR from "Use on your phone". With no code to scan, type the server's address
  and approve the code it shows in Settings › Devices.
- Entries land under their own trackers (`health-connect.steps`, `health-connect.active.kcal`,
  `health-connect.exercise.minutes`), so they never add up with other step sources. Sleep, resting heart rate and weight
  share the existing trackers (`sleep.hours`, `resting.hr`, `weight`) with the other wearables.
- Install: download `relife-android-<version>.apk` from the project's GitHub Releases and allow installing from your browser.
  Updates install over the old app as long as it comes from the same release key.
