import { defineConfig } from 'drizzle-kit'

try { process.loadEnvFile('.env.local') } catch { /* env already set, e.g. on Vercel */ }

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.SITE_DATABASE_URL ?? '' },
})
