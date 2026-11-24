import assert from 'node:assert/strict'
import { test } from 'node:test'
import { againstCap, againstUsual } from './time-status'

test('focus today: nothing yet is Quiet, near usual Steady, well above Ahead, below never Slipping', () => {
  assert.equal(againstUsual('up', 0, 7200), 'Quiet')
  assert.equal(againstUsual('up', 7000, 7200), 'Steady')
  assert.equal(againstUsual('up', 9000, 7200), 'Ahead')
  assert.equal(againstUsual('up', 1800, 7200), 'Steady')
})

test('messages have no better direction: always Steady once there is any', () => {
  assert.equal(againstUsual('none', 9000, 3000), 'Steady')
  assert.equal(againstUsual('none', 0, 3000), 'Quiet')
})

test('distraction against its cap', () => {
  assert.equal(againstCap(0, 5400), 'Quiet')
  assert.equal(againstCap(2880, 5400), 'On track')
  assert.equal(againstCap(100, 100), 'On track')
  assert.equal(againstCap(120, 100), 'Slipping')
  assert.equal(againstCap(126, 100), 'Behind')
})
