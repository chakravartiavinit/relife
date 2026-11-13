import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Suspense } from 'react'
import { safeNext } from '@/core/auth/next'
import { requestOrigin } from '@/core/auth/trust'
import { inContainer } from '@/core/platform'
import { BareShell } from '@/ui/components/devices/bare-shell'
import { SigninClient } from '@/ui/components/devices/signin-client'

export const metadata: Metadata = { title: `Connect to ${brand.name}` }

async function Signin({ searchParams }: Pick<PageProps<'/signin'>, 'searchParams'>) {
  const q = await searchParams
  const next = typeof q.next === 'string' ? safeNext(q.next, requestOrigin(await headers())) : '/'
  return <SigninClient next={next === '/' ? undefined : next} reason={typeof q.reason === 'string' ? q.reason : undefined} container={inContainer()} />
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
