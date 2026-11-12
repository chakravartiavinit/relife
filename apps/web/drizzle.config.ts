import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

// Run from apps/web (npm run db:push); .env is at the repo root.
loadEnvConfig(resolve(process.cwd(), '..', '..'))

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
