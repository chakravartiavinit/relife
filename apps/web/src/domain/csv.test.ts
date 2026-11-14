import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvRow, detectDateFormat, detectDelimiter, findHeader, guessDecimal, headerSignature, looksLikeDate, parseAmount, parseCsv, parseDate, stripBom } from './csv'

test('parseCsv handles quotes, escaped quotes, CRLF and empty lines', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""",3\r\n\r\n,,\r\nlast,row,here')
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', '3'], ['last', 'row', 'here']])
})

test('parseCsv keeps a newline inside quotes and honours the delimiter', () => {
  assert.deepEqual(parseCsv('a;b\n"one\ntwo";2', ';'), [['a', 'b'], ['one\ntwo', '2']])
})

test('stripBom removes the byte order mark', () => {
  assert.equal(stripBom('﻿Date,Amount'), 'Date,Amount')
})

test('detectDelimiter picks the one that splits steadily', () => {
  assert.equal(detectDelimiter('Date,Desc,Amount\n2024-01-01,Coffee,-3.50\n2024-01-02,Tea,-2'), ',')
  assert.equal(detectDelimiter('Datum;Text;Betrag\n01.02.2024;Kaffee;-3,50\n02.02.2024;Tee;-2,00'), ';')
  assert.equal(detectDelimiter('Date\tDesc\tAmount\n2024-01-01\tCoffee\t-3.5'), '\t')
  assert.equal(detectDelimiter('a|b|c\n1|2|3'), '|')
  assert.equal(detectDelimiter('"Smith, J",x,y\n"Lee, K",z,w'), ',')
})

test('findHeader skips account details printed above the table', () => {
  const rows = [
    ['Account statement'], ['Account: Sample Bank 0000'], ['Period', '01/01/2024', 'to', '31/01/2024'],
    ['Date', 'Narration', 'Amount', 'Balance'], ['02/01/2024', 'Coffee', '-3.50', '96.50'], ['03/01/2024', 'Tea', '-2.00', '94.50'],
  ]
  assert.equal(findHeader(rows), 3)
  assert.equal(findHeader([['a', 'b', 'c'], ['x', 'y', 'z']]), -1)
})

test('headerSignature ignores case and spacing around cells', () => {
  assert.equal(headerSignature([' Date', 'AMOUNT ']), headerSignature(['date', 'amount']))
  assert.notEqual(headerSignature(['date', 'amount']), headerSignature(['date', 'debit']))
  assert.equal(headerSignature(['a']).length, 16)
})

test('parseDate reads every supported format and refuses impossible days', () => {
  assert.equal(parseDate('2024-03-05', 'YYYY-MM-DD'), '2024-03-05')
  assert.equal(parseDate('05/03/2024', 'DD/MM/YYYY'), '2024-03-05')
  assert.equal(parseDate('05/03/2024', 'MM/DD/YYYY'), '2024-05-03')
  assert.equal(parseDate('05-03-2024', 'DD-MM-YYYY'), '2024-03-05')
  assert.equal(parseDate('05.03.2024', 'DD.MM.YYYY'), '2024-03-05')
  assert.equal(parseDate('5 Mar 2024', 'DD MMM YYYY'), '2024-03-05')
  assert.equal(parseDate('05-Mar-2024', 'DD MMM YYYY'), '2024-03-05')
  assert.equal(parseDate('Mar 5, 2024', 'MMM D, YYYY'), '2024-03-05')
  assert.equal(parseDate('05/03/24', 'DD/MM/YY'), '2024-03-05')
  assert.equal(parseDate('5 Mar 99', 'DD MMM YY'), '1999-03-05')
  assert.equal(parseDate('2024-03-05 10:22:01', 'YYYY-MM-DD'), '2024-03-05')
  assert.equal(parseDate('2024-03-05T10:22:01+05:30', 'YYYY-MM-DD'), '2024-03-05')
  assert.equal(parseDate('05/03/2024 10:22 PM', 'DD/MM/YYYY'), '2024-03-05')
  assert.equal(parseDate('30/02/2024', 'DD/MM/YYYY'), null)
  assert.equal(parseDate('13/13/2024', 'DD/MM/YYYY'), null)
  assert.equal(parseDate('hello', 'YYYY-MM-DD'), null)
  assert.equal(looksLikeDate('12/01/2024'), true)
  assert.equal(looksLikeDate('Coffee'), false)
})

test('detectDateFormat: a first part over 12 rules out MM/DD, a second part over 12 rules out DD/MM', () => {
  assert.equal(detectDateFormat(['13/01/2024', '02/01/2024']).format, 'DD/MM/YYYY')
  assert.equal(detectDateFormat(['01/13/2024', '01/02/2024']).format, 'MM/DD/YYYY')
  assert.equal(detectDateFormat(['2024-01-13', '2024-02-03']).format, 'YYYY-MM-DD')
  assert.equal(detectDateFormat(['05 Mar 2024', '06 Mar 2024']).format, 'DD MMM YYYY')
  assert.equal(detectDateFormat(['Mar 5, 2024']).format, 'MMM D, YYYY')
  assert.equal(detectDateFormat(['05/03/24', '06/03/24']).candidates.length, 2)
})

test('detectDateFormat: stays open when both readings run in order, or there is no way to tell', () => {
  const open = detectDateFormat(['01/02/2024', '05/02/2024', '10/02/2024', '12/02/2024'])
  assert.deepEqual(open.candidates, ['DD/MM/YYYY', 'MM/DD/YYYY'])
  assert.equal(open.format, null)
  const one = detectDateFormat(['01/02/2024'])
  assert.equal(one.format, null)
  assert.equal(one.candidates.length, 2)
})

test('detectDateFormat: a statement newest first is still "in order" for the right reading', () => {
  const g = detectDateFormat(['10/03/2024', '03/03/2024', '28/02/2024', '02/02/2024'])
  assert.equal(g.format, 'DD/MM/YYYY') // 28/02 can only be a day
  const h = detectDateFormat(['04/12/2024', '03/12/2024', '02/12/2024', '01/12/2024'])
  assert.deepEqual(h.candidates, ['DD/MM/YYYY', 'MM/DD/YYYY'])
})

test('detectDateFormat picks the ordered one when only one reading is monotonic', () => {
  // DD/MM: 02 Jan, 03 Feb, 04 Mar, 05 Apr (rising). MM/DD: Feb 1, Mar 2, Apr 3, May 4... also rising: choose a real zigzag.
  const g = detectDateFormat(['02/01/2024', '15/01/2024', '03/02/2024', '20/02/2024'])
  assert.equal(g.format, 'DD/MM/YYYY') // 15 and 20 can't be months
  const z = detectDateFormat(['11/01/2024', '12/01/2024', '02/02/2024', '03/02/2024'])
  assert.equal(z.format, 'DD/MM/YYYY') // MM/DD: Nov 1, Dec 1, Feb 2, Mar 2 zigzags across the year end
})

test('parseAmount reads every form', () => {
  assert.equal(parseAmount('1,234.50'), 1234.5)
  assert.equal(parseAmount('-1,299'), -1299)
  assert.equal(parseAmount('(12.00)'), -12)
  assert.equal(parseAmount('Rs. 1,299.00'), 1299)
  assert.equal(parseAmount('Rs 1,299.00'), 1299)
  assert.equal(parseAmount('INR -1,299.50'), -1299.5)
  assert.equal(parseAmount('USD 12.50 Dr'), -12.5)
  assert.equal(parseAmount('.50'), 0.5)
  assert.equal(parseAmount('Rs.'), null)
  assert.equal(parseAmount('₹ 1,23,456.78'), 123456.78)
  assert.equal(parseAmount('-$3.50'), -3.5)
  assert.equal(parseAmount('$-3.50'), -3.5)
  assert.equal(parseAmount('1.234,56', ','), 1234.56)
  assert.equal(parseAmount('12,50', ','), 12.5)
  assert.equal(parseAmount('250.00 Dr'), -250)
  assert.equal(parseAmount('250.00 Cr'), 250)
  assert.equal(parseAmount('12.00-'), -12)
  assert.equal(parseAmount('INR 40'), 40)
  assert.equal(parseAmount(''), null)
  assert.equal(parseAmount('n/a'), null)
  assert.equal(parseAmount('1.2.3'), null)
})

test('guessDecimal sees 1.234,56 and 12,50 but not 1,234', () => {
  assert.equal(guessDecimal(['1.234,56', '12,50']), ',')
  assert.equal(guessDecimal(['1,234.56', '12.50']), '.')
  assert.equal(guessDecimal(['1,234', '2,500']), '.')
})

test('plain cells are joined and the row ends in CRLF', () => {
  assert.equal(csvRow(['a', 'b', 'c']), 'a,b,c\r\n')
})

test('commas, quotes and newlines are quoted, quotes doubled', () => {
  assert.equal(csvRow(['a,b', 'say "hi"', 'two\nlines']), '"a,b","say ""hi""","two\nlines"\r\n')
})

test('text that starts like a formula gets a quote prefix, numbers do not', () => {
  assert.equal(csvRow(['=SUM(A1)', '+1', '@cmd', '-5+2', 'ok']), "'=SUM(A1),'+1,'@cmd,'-5+2,ok\r\n")
  assert.equal(csvRow([-5, 0, 12.5, true]), '-5,0,12.5,true\r\n')
  assert.equal(csvRow(['\tx']), "'\tx\r\n")
  assert.equal(csvRow(['\rx']), "\"'\rx\"\r\n")
})

test('empty values and dates', () => {
  assert.equal(csvRow([null, undefined, '', new Date('2026-01-02T03:04:05Z')]), ',,,2026-01-02T03:04:05.000Z\r\n')
})
