import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PushRow } from './components/push-row'

// The read-only demo draws the row disabled with its own wording, instead of a button that fails with "Couldn't turn on".
test('a locked push row disables its actions and says why', () => {
  const html = renderToStaticMarkup(createElement(PushRow, { state: 'off', devices: 0, locked: 'Demo: changes are off' }))
  assert.match(html, /<button[^>]*\sdisabled=""[^>]*>[\s\S]*Turn on/)
  assert.match(html, /Demo: changes are off/)
  const on = renderToStaticMarkup(createElement(PushRow, { state: 'on', devices: 1, locked: 'Demo: changes are off' }))
  assert.equal((on.match(/<button[^>]*\sdisabled=""/g) ?? []).length, 2, 'test and turn off are both disabled')
})

test('an unlocked push row keeps its button live', () => {
  const html = renderToStaticMarkup(createElement(PushRow, { state: 'off', devices: 0 }))
  assert.doesNotMatch(html, /<button[^>]*\sdisabled=""/)
})
