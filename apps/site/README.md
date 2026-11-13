# apps/site: landing page and waitlist

Marketing page plus a double opt-in waitlist with referrals. Static page, one form island, its own Postgres (never the user-data database). Plan: `.plans/v1-relife-ecosystem.md`, Part 2.

## Run it

```sh
# once: a separate database in the local Docker Postgres, then the tables
#   create database relife_site;
cp apps/site/env.example apps/site/.env.local   # then edit; SITE_DATABASE_URL points at relife_site
npm run db:push -w apps/site
NODE_ENV=development npm run dev -w apps/site   # http://127.0.0.1:3040, EMAIL_DRIVER=console prints the confirm link in the terminal
```

## Checks

- `npm test -w apps/site` unit tests (position math, token hashing, rate-limit windows, form schema, disposable list).
- `npm run typecheck -w apps/site`.
- End to end (needs the dev server running with its output in a file, and a local `SITE_DATABASE_URL`; it empties the tables):
  `NODE_ENV=development npm run dev -w apps/site > /var/tmp/site-dev.log 2>&1 &` then
  `node --env-file=apps/site/.env.local apps/site/scripts/e2e.mjs /var/tmp/site-dev.log`.
- `npm run waitlist:export -w apps/site` (CSV of confirmed rows) and `npm run waitlist:stats -w apps/site`.

## Brand gate

`next build` refuses while `packages/brand/brand.json` has `publicReady: false` (the fan-tribute brand). For a local preview build use `npm run build:preview -w apps/site` (`SITE_ALLOW_UNREADY_BRAND=1`); such a build is `noindex`. The override is refused when `VERCEL_ENV=production`, and it does not relax `WAITLIST_SECRET`, which every production run needs. Name and logo come from `@relife/brand`; `npm run brand:sync -w apps/site` copies the built logo files in (the brand build still writes to the dashboard's `public/brand`).

## Decisions baked in

- Position = `seq - 10 x confirmed referrals`, ties by `seq`. A friend who confirms moves you up to 10 places (copy says "up to 10 places"; a tie can cost one).
- Referrals: credit is the number of confirmed friends (capped at 50), recomputed on confirm and on leave, so leave + rejoin can't pay twice. No credit when the friend's address is the referrer's mailbox under another alias (+tag, gmail dots) or comes from the referrer's IP hash, however old the referrer is. The referrer is set only when a row is created.
- Email: `EMAIL_DRIVER` has no default in production. `console` prints the confirm link with its live token, so it only runs in dev or a local preview build (never on Vercel); `resend` (`RESEND_API_KEY`, `EMAIL_FROM`) sends. Templates are plain strings in `emails/`. Server errors are logged through `lib/log.ts`, which drops emails, SQL params and tokens.
- Analytics: Vercel Web Analytics only (cookieless). `/w/<token>` is reported as `/w/[token]` (`lib/analytics.ts`) so the private link never reaches it.
- Turnstile is off by default: set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` together.
- The client IP comes from `x-forwarded-for`, which is only trustworthy on Vercel.
- Self-host shows "Coming soon", no repo link, no license claim. They appear only when `NEXT_PUBLIC_REPO_URL` / `NEXT_PUBLIC_LICENSE_LABEL` are set.
- Production needs `WAITLIST_SECRET`, `SITE_DATABASE_URL`, `CRON_SECRET` (the daily cleanup in `vercel.json`).
