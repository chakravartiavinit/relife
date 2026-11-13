// Types for the extension's shared globals (lib.js hangs everything off self.RL; the worker loads it with importScripts).
// The files are plain scripts at runtime; tsconfig's moduleDetection "force" only makes the type checker treat each as its own scope.
import type { ActivityBatchInput, TodayAction, TodayActionResult, TodayResponse, TodayView } from '@relife/contract'

export interface Settings {
  server: string
  token: string
  paused: boolean
  exclude: string[]
  /** Items tracked from this browser, by library key. */
  courses: Record<string, { title: string; kind?: string; url?: string }>
  badge: boolean
}

export type Segment = ActivityBatchInput['segments'] extends (infer S)[] | undefined ? S : never
export type Course = NonNullable<ActivityBatchInput['courses']>[number]
export type Rule = NonNullable<ActivityBatchInput['rules']>[number]

/** Everything the extension keeps in chrome.storage (local and session), by key. */
export interface Stored extends Partial<Settings> {
  queue?: Segment[]
  pendingCourses?: Course[]
  pendingRules?: Rule[]
  lastSync?: LastSync | null
  /** The Today tab's cached view; `unsupported` when the server has no /api/companion (older ReLife). */
  companion?: { at: number; view: TodayView | null; unsupported?: boolean } | null
  popupTab?: string
  open?: any
  pages?: any
  frames?: any
}

export interface CallResult<T = unknown> { ok: boolean; status: number; data: T | null }
export interface LastSync { at: number; ok: boolean; status: number; error?: string }

export interface ReLifeShared {
  DEFAULTS: Settings
  KINDS: [string, string, string][]
  KIND: Record<string, { label: string; color: string }>
  TYPES: [string, string][]
  TYPE_LABEL: Record<string, string>
  AREA_COLOR: Record<string, string>
  OFFLINE: string
  progressOf(done: unknown, total: unknown): { done: number; total: number } | null
  settings(): Promise<Settings>
  domainOf(url: string): string | null
  keyOf(url: string): string | null
  under(address: string, key: string): boolean
  esc(text: unknown): string
  hm(seconds: number): string
  ago(at: number): string
  num(value: number | null | undefined): string
  call<T = any>(s: Settings, path: string, init?: RequestInit): Promise<CallResult<T>>
  connect(server: string, token: string): Promise<LastSync>
  toast(text: string, tone?: string): void
}

declare global {
  interface Window { RL: ReLifeShared; ICON: Record<string, string> }
  interface WorkerGlobalScope { RL: ReLifeShared }
  function importScripts(...urls: string[]): void
  namespace chrome.storage {
    interface StorageArea { get(keys?: string | string[] | null): Promise<Stored> }
  }
}

/** Request and response bodies the extension exchanges with the server (see @relife/contract). */
export type { ActivityBatchInput, TodayAction, TodayActionResult, TodayResponse }
