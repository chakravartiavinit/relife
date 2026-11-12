import type { Metadata } from 'next'
import { BareShell } from '@/ui/components/devices/bare-shell'
import { SigninClient } from '@/ui/components/devices/signin-client'

export const metadata: Metadata = { title: 'Connect to ReLife' }

export default async function SigninPage({ searchParams }: PageProps<'/signin'>) {
  const q = await searchParams
  return (
    <BareShell>
      <SigninClient next={typeof q.next === 'string' ? q.next : undefined} reason={typeof q.reason === 'string' ? q.reason : undefined} />
    </BareShell>
  )
}
