import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

// .env is at the repo root, two folders up from this file. drizzle-kit loads this file as CommonJS, so __dirname.
loadEnvConfig(resolve(__dirname, '..', '..'))

export default defineConfig({
  schema: resolve(__dirname, 'src/db/schema.ts'),
  out: resolve(__dirname, 'drizzle'),
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
