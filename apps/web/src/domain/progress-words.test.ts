import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paceWhen, paceWords, trendWord } from './progress-words'

test('trendWord: 10% either way moves off Steady; nothing at all is Quiet', () => {
  assert.equal(trendWord(0, 0), 'Quiet')
  assert.equal(trendWord(5, 0), 'Ahead')
  assert.equal(trendWord(110, 100), 'Ahead')
  assert.equal(trendWord(105, 100), 'Steady')
  assert.equal(trendWord(95, 100), 'Steady')
  assert.equal(trendWord(90, 100), 'Slipping')
  assert.equal(trendWord(0, 100), 'Slipping')
})

test('paceWords: days, weeks and months at the usual pace; no pace gives nothing', () => {
  assert.equal(paceWords(210, 240), 'about a day')
  assert.equal(paceWords(1000, 240), 'about 5 days')
  assert.equal(paceWords(6000, 240), 'about 4 weeks')
  assert.equal(paceWords(60000, 240), 'about 8 months')
  assert.equal(paceWords(100, 0), null)
  assert.equal(paceWhen(210, 240), 'Tomorrow')
  assert.equal(paceWhen(1000, 240), 'In 5 days')
})
