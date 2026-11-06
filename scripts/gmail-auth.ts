// Get a Gmail read-only refresh token for the gmail connector.
//   1. Create an OAuth client of type "Desktop app" (docs/CONNECTORS.md).
//   2. Put GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.
//   3. npx tsx --env-file=.env scripts/gmail-auth.ts
//   4. Copy the printed GMAIL_REFRESH_TOKEN into .env.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const clientId = process.env.GMAIL_CLIENT_ID
const clientSecret = process.env.GMAIL_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first.')
  process.exit(1)
}

const state = randomBytes(16).toString('hex')
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const code = url.searchParams.get('code')
  if (url.searchParams.get('state') !== state || !code) {
    res.writeHead(400).end('Missing code or state mismatch.')
    return
  }
  const { port } = server.address() as AddressInfo
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: `http://127.0.0.1:${port}`, grant_type: 'authorization_code',
    }),
  })
  const j = (await r.json()) as { refresh_token?: string; error_description?: string }
  if (!j.refresh_token) {
    res.writeHead(500).end('No refresh token returned. Remove ReLife from https://myaccount.google.com/permissions and retry.')
    console.error('Token exchange failed:', j.error_description ?? j)
    process.exit(1)
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Done. You can close this tab and return to the terminal.')
  console.log(`\nAdd this to .env:\n\nGMAIL_REFRESH_TOKEN=${j.refresh_token}\n`)
  server.close()
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  auth.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly', access_type: 'offline', prompt: 'consent', state,
  }).toString()
  console.log(`Opening your browser to authorize read-only Gmail access…\nIf it doesn't open, visit:\n${auth}\n`)
  spawn('open', [auth.toString()], { stdio: 'ignore', detached: true }).on('error', () => {})
})
