import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cn } from './cn'

test('type-scale sizes are not read as colours', () => {
  assert.equal(cn('text-caption', 'text-ink-3'), 'text-caption text-ink-3')
  assert.equal(cn('text-body text-ink', 'text-small'), 'text-ink text-small')
  assert.equal(cn('text-ink-3', 'text-label font-mono'), 'text-ink-3 text-label font-mono')
})
