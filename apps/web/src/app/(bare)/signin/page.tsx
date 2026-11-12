import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BareShell } from '@/ui/components/devices/bare-shell'
import { SigninClient } from '@/ui/components/devices/signin-client'

export const metadata: Metadata = { title: `Connect to ${brand.name}` }

async function Signin({ searchParams }: Pick<PageProps<'/signin'>, 'searchParams'>) {
  const q = await searchParams
  return <SigninClient next={typeof q.next === 'string' ? q.next : undefined} reason={typeof q.reason === 'string' ? q.reason : undefined} />
}

export default function SigninPage({ searchParams }: PageProps<'/signin'>) {
  return (
    <BareShell>
      <Suspense fallback={null}>
        <Signin searchParams={searchParams} />
      </Suspense>
    </BareShell>
  )
}
