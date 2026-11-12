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

`next build` refuses while `packages/brand/brand.json` has `publicReady: false` (the fan-tribute brand). For a local preview build use `npm run build:preview -w apps/site` (`SITE_ALLOW_UNREADY_BRAND=1`); such a build is `noindex`. Name and logo come from `@relife/brand`; `npm run brand:sync -w apps/site` copies the built logo files in (the brand build still writes to the dashboard's `public/brand`).

## Decisions baked in

- Self-host shows "Coming soon", no repo link, no license claim. They appear only when `NEXT_PUBLIC_REPO_URL` / `NEXT_PUBLIC_LICENSE_LABEL` are set.
- Position = `seq - 10 x confirmed referrals`; ties go to the person with more referrals, then the earlier seq, so a referral is exactly 10 places.
- Email: `EMAIL_DRIVER=console` (default) or `resend` (`RESEND_API_KEY`, `EMAIL_FROM`). Templates are plain strings in `emails/`.
- Production needs `WAITLIST_SECRET`, `SITE_DATABASE_URL`, `CRON_SECRET` (the daily cleanup in `vercel.json`).
