import { AsyncLocalStorage } from 'node:async_hooks'
import type { User } from './user'

// Who the code is running for, when it is not inside a web request: the worker's per-person jobs, the Telegram bot,
// scripts and the web routes that read a person's keys (OAuth, ingest). `getUser()` (core/user.ts) reads this first;
// `env()` (core/env.ts, which imports nothing) reads the same store through globalThis, so one person's key can never
// serve another.
//
//   await runAs(user, () => processNew())

export type Scope = { user: User }

const g = globalThis as unknown as { __relifeScope?: AsyncLocalStorage<Scope> }
/** Shared through globalThis: Next bundles routes and the proxy separately, and each must see the same store. */
export const scope = (g.__relifeScope ??= new AsyncLocalStorage<Scope>())

/** Run `fn` as `user`: `getUser()` answers with them and `env()` reads their keys, for everything `fn` starts. */
export function runAs<T>(user: User, fn: () => T): T {
  return scope.run({ user }, fn)
}

/** The person `runAs` set, if any. */
export const scopedUser = (): User | undefined => scope.getStore()?.user
