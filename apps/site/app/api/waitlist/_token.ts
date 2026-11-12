import { NextResponse } from 'next/server'

/** Both the JS fetch and the no-JS form post here. Forms get a redirect back to the status page, fetches get JSON. */
export async function readToken(req: Request): Promise<{ token: string | null; isForm: boolean }> {
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = await req.json().catch(() => null)
    return { token: typeof body?.token === 'string' ? body.token : null, isForm: false }
  }
  const fd = await req.formData().catch(() => null)
  const token = fd?.get('token')
  return { token: typeof token === 'string' ? token : null, isForm: true }
}

export const back = (req: Request, path: string) => NextResponse.redirect(new URL(path, req.url), 303)
