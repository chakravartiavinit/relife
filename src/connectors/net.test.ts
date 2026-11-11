import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleOf } from './net'

test('handleOf takes the username out of whatever was pasted', () => {
  const cases: [string, string][] = [
    ['tourist', 'tourist'],
    ['  @tourist ', 'tourist'],
    ['https://codeforces.com/profile/tourist', 'tourist'],
    ['https://lichess.org/@/DrNykterstein', 'DrNykterstein'],
    ['https://www.chess.com/member/Hikaru/', 'Hikaru'],
    ['leetcode.com/u/lee215/', 'lee215'],
    ['https://www.codechef.com/users/gennady.korotkevich?tab=1', 'gennady.korotkevich'],
    ['https://github.com/octocat', 'octocat'],
    ['https://www.codewars.com/users/g964', 'g964'],
    ['https://www.last.fm/user/rj/library?x=1', 'rj'],
    ['steamcommunity.com/id/gaben/', 'gaben'],
    ['https://letterboxd.com/dave/films/', 'dave'],
    ['gennady.korotkevich', 'gennady.korotkevich'], // a dotted name is not a link
  ]
  for (const [raw, name] of cases) assert.equal(handleOf(raw), name, raw)
  assert.equal(handleOf(undefined), '')
})
