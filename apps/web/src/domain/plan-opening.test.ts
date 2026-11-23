import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planOpening } from './plan-opening'

test('planOpening names the pace and what slipped', () => {
  assert.equal(planOpening({ paces: [], slipping: [] }), 'No goals yet. Pick one outcome you want to change.')
  assert.equal(planOpening({ paces: ['Ahead', 'Reached'], slipping: [] }), 'Both goals are ahead of pace.')
  assert.equal(planOpening({ paces: ['Ahead', 'On pace', 'Ahead'], slipping: [] }), 'All goals are on or ahead of pace.')
  assert.equal(planOpening({ paces: ['Ahead'], slipping: [] }), 'Your goal is ahead of pace.')
  assert.equal(planOpening({ paces: ['Ahead', 'Ahead'], slipping: ['Guitar', 'Guitar'] }), 'Both goals are ahead of pace, but Guitar slipped this week.')
  assert.equal(planOpening({ paces: ['Behind', 'Ahead'], slipping: ['Guitar', 'Reading'] }), '1 of 2 goals is behind pace. Guitar and Reading slipped this week.')
  assert.equal(planOpening({ paces: ['Behind', 'Behind', 'Ahead'], slipping: [] }), '2 of 3 goals are behind pace.')
  assert.equal(planOpening({ paces: ['Ahead', 'Too early'], slipping: [] }), 'Some goals are too new to judge pace.')
  assert.equal(planOpening({ paces: [null], slipping: [] }), 'Your goal is too new to judge pace.')
})
