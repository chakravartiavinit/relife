import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvRow } from './csv'

test('plain cells are joined and the row ends in CRLF', () => {
  assert.equal(csvRow(['a', 'b', 'c']), 'a,b,c\r\n')
})

test('commas, quotes and newlines are quoted, quotes doubled', () => {
  assert.equal(csvRow(['a,b', 'say "hi"', 'two\nlines']), '"a,b","say ""hi""","two\nlines"\r\n')
})

test('text that starts like a formula gets a quote prefix, numbers do not', () => {
  assert.equal(csvRow(['=SUM(A1)', '+1', '@cmd', '-5', 'ok']), "'=SUM(A1),'+1,'@cmd,-5,ok\r\n")
  assert.equal(csvRow([-5, 0, 12.5, true]), '-5,0,12.5,true\r\n')
  assert.equal(csvRow(['\tx']), "'\tx\r\n")
  assert.equal(csvRow(['\rx']), "\"'\rx\"\r\n")
})

test('empty values and dates', () => {
  assert.equal(csvRow([null, undefined, '', new Date('2026-01-02T03:04:05Z')]), ',,,2026-01-02T03:04:05.000Z\r\n')
})
