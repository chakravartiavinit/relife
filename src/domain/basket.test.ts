import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categorize, categoryVsAverage, topItems, type BasketLine } from './basket'
import { itemsFromBlinkit, itemsFromZepto } from '../connectors/shop/extract'

test('categorize sorts everyday items', () => {
  assert.equal(categorize('Amul Taaza Toned Milk'), 'Dairy & eggs')
  assert.equal(categorize("Lay's India's Magic Masala Chips"), 'Snacks & sweets')
  assert.equal(categorize('Coca-Cola Soft Drink (Coke)'), 'Drinks')
  assert.equal(categorize('Onion (Pyaz)'), 'Fruits & vegetables')
  assert.equal(categorize('Aashirvaad Atta'), 'Staples & cooking')
  assert.equal(categorize('Surf Excel Matic Liquid Detergent'), 'Household & cleaning')
  assert.equal(categorize('Pintola Peanut Butter'), 'Bakery & breakfast')
  assert.equal(categorize('Fanta | Orange Sparkling Soft Drink Pet Bottle'), 'Drinks') // PET plastic, not pets
  assert.equal(categorize('Pedigree Adult Dog Food'), 'Baby & pets')
  assert.equal(categorize('SONY WH-1000XM5 Wireless Noise Cancelling Headphones'), 'Electronics & appliances')
  assert.equal(categorize('PHILIPS BHD356/10 Hair Dryer', 'HairDryer'), 'Electronics & appliances')
  assert.equal(categorize('Designing Distributed Systems', 'Book'), 'Books')
  assert.equal(categorize('Kore PVC Hex Dumbbells Pack of 2'), 'Sports & fitness')
  assert.equal(categorize('Cycle Pure Agarbatti'), 'Household & cleaning')
  assert.equal(categorize('Femora Glass Kitchen Storage Jar With Lid'), 'Home & lifestyle')
  assert.equal(categorize('Mystery thing'), 'Other')
})

test('categoryVsAverage flags categories well over their 3-month average', () => {
  const l = (month: string, category: BasketLine['category'], spend: number): BasketLine => ({ date: `${month}-10`, month, hour: 20, platform: 'zepto', name: category, qty: 1, spend, category })
  const lines = [l('2026-08', 'Snacks & sweets', 500), l('2026-09', 'Snacks & sweets', 700), l('2026-10', 'Snacks & sweets', 600), l('2026-11', 'Snacks & sweets', 1400),
    l('2026-08', 'Dairy & eggs', 900), l('2026-09', 'Dairy & eggs', 900), l('2026-10', 'Dairy & eggs', 900), l('2026-11', 'Dairy & eggs', 950)]
  const r = categoryVsAverage(lines, '2026-11', ['2026-08', '2026-09', '2026-10'])
  const snacks = r.find((x) => x.category === 'Snacks & sweets')!
  assert.equal(snacks.avg, 600)
  assert.equal(snacks.over, true)
  assert.equal(r.find((x) => x.category === 'Dairy & eggs')!.over, false)
})

test('topItems groups the same product across orders', () => {
  const base = { month: '2026-11', hour: 9, platform: 'blinkit', category: 'Dairy & eggs' as const }
  const t = topItems([{ ...base, date: '2026-11-01', name: 'Amul Milk', qty: 2, spend: 60 }, { ...base, date: '2026-11-03', name: 'amul milk ', qty: 1, spend: 30 }])
  assert.deepEqual(t[0], { name: 'Amul Milk', category: 'Dairy & eggs', spend: 90, qty: 3, times: 2, platforms: ['blinkit'] })
})

test('item readers understand both apps (fake data in their shapes)', () => {
  const zepto = { pageLayout: { widgets: [{ widgetName: 'SHIPMENT_1_APP', data: { items: [{ orderProductsV2: { sectionData: [{ orderProducts: [
    { quantityOrdered: 2, quantityFulfilled: 2, totalFinalSellingPrice: 11800, storeProduct: { product: { brand: 'Amul', name: 'Amul Taaza Milk' }, productVariant: { formattedPacksize: '500 ml' } } },
  ] }] } }] } }] } }
  assert.deepEqual(itemsFromZepto([zepto]), [{ name: 'Amul Taaza Milk', qty: 2, price: 118, brand: 'Amul', pack: '500 ml' }])
  const blinkit = { response: { snippets: [
    { widget_type: 'z_v3_image_text_snippet_type_30', data: { title: { text: 'Onion' }, subtitle1: { text: '1 kg x 2' }, subtitle3: { text: '₹90' } } },
    { widget_type: 'z_v3_image_text_snippet_type_30', data: { title: { text: 'Milk' }, subtitle1: { text: '2 x 500 ml x 1' }, subtitle3: { text: '~~<regular-200|{grey-500|₹70}>~~ ₹64', is_markdown: 1 } } },
    { widget_type: 'cart_bill_item', data: { left_header: { text: 'MRP' }, right_header: { text: '₹200' } } },
  ] } }
  assert.deepEqual(itemsFromBlinkit([blinkit]), [{ name: 'Onion', qty: 2, price: 90, pack: '1 kg' }, { name: 'Milk', qty: 1, price: 64, pack: '2 x 500 ml' }])
})

test('categorize handles plurals and everyday non-food', () => {
  assert.equal(categorize('Ezee Small Garbage Bags 17 x 19 Inch'), 'Household & cleaning')
  assert.equal(categorize('Karachi Bakery Vanilla Muffins'), 'Bakery & breakfast')
  assert.equal(categorize('KACO K7 Panda Gel Pen (Black)'), 'Home & lifestyle')
  assert.equal(categorize('Nivea Men Active Clean Shower Gel'), 'Personal care')
  assert.equal(categorize('Volini Pain Relief Gel'), 'Health & pharmacy')
  assert.equal(categorize('Aquafina Packaged Water'), 'Water')
  assert.equal(categorize('Minimalist Vitamin K + Retinol Under Eye Cream'), 'Personal care')
  assert.equal(categorize('Schwarzkopf Simply Color Permanent Hair Colour 3-00'), 'Personal care')
  assert.equal(categorize('Bisleri Packaged Drinking Water Bottle'), 'Water')
  assert.equal(categorize('Coca-Cola Diet Coke Soft Drink'), 'Drinks')
})
