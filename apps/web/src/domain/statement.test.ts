import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanDescription, defaultInvert, guessMapping, readStatementRow, rowAmount, statementRowId, type StatementMapping } from './statement'

const base: StatementMapping = {
  kind: 'statement', headerRow: 0, delimiter: ',', decimal: '.', dateFormat: 'DD/MM/YYYY',
  columns: { date: 0, description: 1, amount: 2 }, invert: false, currency: 'INR', account: { name: 'Sample Bank', kind: 'bank' },
}

test('guessMapping finds a single-amount layout', () => {
  const g = guessMapping(['Date', 'Description', 'Amount', 'Balance'], [['13/01/2024', 'Coffee', '-3.50', '96.50'], ['14/01/2024', 'Tea', '-2.00', '94.50']])
  assert.deepEqual(g.columns, { date: 0, balance: 3, amount: 2, description: 1 })
  assert.equal(g.dates.format, 'DD/MM/YYYY')
  assert.equal(g.decimal, '.')
})

test('guessMapping finds debit and credit columns and the reference', () => {
  const g = guessMapping(
    ['Txn Date', 'Value Date', 'Narration', 'Chq./Ref.No.', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
    [['13/01/24', '13/01/24', 'UPI-FAKE SHOP-1234', '0000012345678', '120.00', '', '880.00']],
  )
  assert.equal(g.columns.date, 0)
  assert.equal(g.columns.description, 2)
  assert.equal(g.columns.ref, 3)
  assert.equal(g.columns.debit, 4)
  assert.equal(g.columns.credit, 5)
  assert.equal(g.columns.balance, 6)
  assert.equal(g.columns.amount, undefined)
})

test('guessMapping reads German headers and a decimal comma', () => {
  const g = guessMapping(['Buchungstag', 'Verwendungszweck', 'Betrag', 'Saldo'], [['13.01.2024', 'Kaffee', '-3,50', '1.096,50']])
  assert.equal(g.columns.date, 0)
  assert.equal(g.columns.description, 1)
  assert.equal(g.columns.amount, 2)
  assert.equal(g.columns.balance, 3)
  assert.equal(g.decimal, ',')
})

test('rowAmount: signed single column, invert, and credit minus debit', () => {
  assert.equal(rowAmount(['', '', '-12.50'], base), -12.5)
  assert.equal(rowAmount(['', '', '12.50'], { ...base, invert: true }), -12.5)
  const dc = { ...base, columns: { date: 0, description: 1, debit: 2, credit: 3 } }
  assert.equal(rowAmount(['', '', '40.00', ''], dc), -40)
  assert.equal(rowAmount(['', '', '', '1,500.00'], dc), 1500)
  assert.equal(rowAmount(['', '', '-40.00', ''], dc), -40) // a signed debit still means money out
  assert.equal(rowAmount(['', '', '', ''], dc), null)
  assert.equal(rowAmount(['', '', 'abc'], base), null)
  assert.equal(Object.is(rowAmount(['', '', '0'], base), 0), true)
})

test('defaultInvert: a card that lists purchases as positive', () => {
  assert.equal(defaultInvert('card', [10, 20, 30, 40, -5]), true)
  assert.equal(defaultInvert('card', [-10, -20, 5]), false)
  assert.equal(defaultInvert('bank', [10, 20, 30]), false)
  assert.equal(defaultInvert('card', []), false)
})

test('cleanDescription strips long digit runs, masks and bank prefixes', () => {
  assert.equal(cleanDescription('UPI/412345678901/SWIGGY/okaxis'), 'SWIGGY okaxis')
  assert.equal(cleanDescription('POS XXXX1234 FAKE CAFE'), 'FAKE CAFE')
  assert.equal(cleanDescription('IMPS-123456789012-Rent March'), 'Rent March')
  assert.equal(cleanDescription('NEFT-ABCD0123456-Fake Employer'), 'ABCD Fake Employer')
  assert.equal(cleanDescription('ACH D- FAKE INSURANCE 9876543210'), 'D FAKE INSURANCE')
  assert.equal(cleanDescription('  Coffee   shop  '), 'Coffee shop')
})

test('statementRowId is stable, and the counter keeps identical rows apart', () => {
  const r = { date: '2024-01-13', amount: -3.5, description: 'Coffee', balance: 96.5 }
  assert.equal(statementRowId('statement:sample', r, 0), statementRowId('statement:sample', { ...r }, 0))
  assert.notEqual(statementRowId('statement:sample', r, 0), statementRowId('statement:sample', r, 1))
  assert.notEqual(statementRowId('statement:sample', r, 0), statementRowId('statement:other', r, 0))
  assert.notEqual(statementRowId('statement:sample', r, 0), statementRowId('statement:sample', { ...r, amount: -3.6 }, 0))
})

test('readStatementRow gives the reason a row is skipped', () => {
  const ok = readStatementRow(['13/01/2024', '  Fake   Cafe ', '-3.50'], base, 2)
  assert.deepEqual(ok, { ok: true, row: { date: '2024-01-13', amount: -3.5, currency: 'INR', description: 'Fake Cafe' } })
  assert.deepEqual(readStatementRow(['', 'x', '-3'], base, 14), { ok: false, reason: 'row 14: no date' })
  assert.deepEqual(readStatementRow(['13/01/2024', 'x', ''], base, 15), { ok: false, reason: 'row 15: no amount' })
  const withCols = readStatementRow(['13/01/2024', 'x', '-3', '9.5', 'usd', 'R1'], { ...base, columns: { ...base.columns, balance: 3, currency: 4, ref: 5 } }, 2)
  assert.deepEqual(withCols, { ok: true, row: { date: '2024-01-13', amount: -3, currency: 'USD', description: 'x', balance: 9.5, ref: 'R1' } })
})

test('guessMapping reads a Dr / Cr marker column next to an unsigned amount', () => {
  const header = ['Tran Date', 'Description', 'Amount', 'Dr / Cr', 'Balance']
  const rows = [['13/01/2024', 'Coffee', '120.00', 'Dr', '880.00'], ['14/01/2024', 'Salary', '5,000.00', 'Cr', '5,880.00']]
  const g = guessMapping(header, rows)
  assert.deepEqual(g.columns, { date: 0, sign: 3, balance: 4, amount: 2, description: 1 })
  const m: StatementMapping = { ...base, columns: { date: 0, description: 1, amount: 2, sign: 3, balance: 4 } }
  assert.equal(rowAmount(rows[0], m), -120)
  assert.equal(rowAmount(rows[1], m), 5000)
  // Words other than Dr / Cr leave the amount's own sign alone; invert still flips.
  assert.equal(rowAmount(['x', 'y', '-7.00', '', ''], m), -7)
  assert.equal(rowAmount(rows[0], { ...m, invert: true }), 120)
})

test('guessMapping: a column that Debit or Credit named but that only holds Dr / Cr words is the marker', () => {
  const g = guessMapping(['Date', 'Narration', 'Amount', 'Debit/Credit'], [['13/01/2024', 'Coffee', '120.00', 'Debit'], ['14/01/2024', 'Refund', '9.00', 'Credit']])
  assert.equal(g.columns.sign, 3)
  assert.equal(g.columns.debit, undefined)
  // Real money columns stay debit and credit.
  const s = guessMapping(['Date', 'Narration', 'Debit', 'Credit'], [['13/01/2024', 'Coffee', '120.00', ''], ['14/01/2024', 'Refund', '', '9.00']])
  assert.deepEqual([s.columns.debit, s.columns.credit, s.columns.sign], [2, 3, undefined])
})
