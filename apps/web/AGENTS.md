<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ReLife web (`apps/web`): notes

Repo-wide rules, the layout map and the commands are in the root `AGENTS.md` (`../../AGENTS.md`). Read it first.
This package is the Next.js dashboard and the worker.

- Paths in this package's docs are relative to the repo root; code lives in `src/` here (`@/` = `apps/web/src/`).
- Run scripts from the repo root (`npm run dev`, `npm test`). Inside this folder, `npm run <script>` works too.
- `.env` and `data/` are at the repo root, not here. `next.config.ts` and `drizzle.config.ts` load `../../.env`;
  worker and test scripts use `tsx --env-file=../../.env`. File paths for runtime state come from
  `src/core/paths.ts` (`dataDir()`); never build a `data/` path from `process.cwd()`.
- Workspace packages (`@relife/contract`, `@relife/tokens`, `@relife/brand`) ship TypeScript or JSON source and are
  listed in `transpilePackages` in `next.config.ts`; Turbopack's root is the repo root so it can resolve them.
- Validate every device-facing request body and type every response with `@relife/contract`.
