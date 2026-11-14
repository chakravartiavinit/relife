import assert from 'node:assert/strict'
import { test } from 'node:test'
import { builtinRule } from './categorize'

const cat = (s: string) => builtinRule(s.toLowerCase())?.category ?? 'Uncategorized'

test('a card bill paid from the bank is a transfer, however the bank words it', () => {
  for (const d of ['CC BILL PAYMENT HDFC', 'CREDIT CARD BILL PAYMENT', 'creditcard bill pay', 'BILLPAY CC BILL 4512', 'CREDIT CARD PAYMENT BANK', 'CREDIT CARD AUTOPAY HDFC']) assert.equal(cat(d), 'Transfers', d)
})

test('a shop that says card payment, or a word that only ends in cc, is still spending', () => {
  for (const d of ['CARD PAYMENT TO TESCO', 'ACC BILL PAYMENT ELECTRO', 'CCBILL.COM', 'PAYMENT TO SBICARD SHOP']) assert.notEqual(cat(d), 'Transfers', d)
})
