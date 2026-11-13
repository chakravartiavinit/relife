import type { Signal } from './patterns'

// Shopping-basket analysis: what you buy, grouped into everyday categories. Pure: no DB, no React.
// Apps don't send a product category with past orders, so items are classified by their name.

export type ItemCategory =
  | 'Fruits & vegetables' | 'Dairy & eggs' | 'Bakery & breakfast' | 'Staples & cooking' | 'Snacks & sweets'
  | 'Water' | 'Drinks' | 'Meat & seafood' | 'Frozen & ready to eat' | 'Personal care' | 'Household & cleaning'
  | 'Health & pharmacy' | 'Baby & pets' | 'Electronics & appliances' | 'Books' | 'Sports & fitness' | 'Eating out' | 'Home & lifestyle' | 'Other'

// First match wins, so specific words come before broad ones (e.g. "peanut butter" is breakfast, not dairy).
// Words match with or without a plural ending ("bag" finds "Garbage Bags").
const w = (words: string) => new RegExp(`\\b(?:${words})(?:e?s)?\\b`, 'i')
const RULES: [ItemCategory, RegExp][] = [
  ['Baby & pets', w('diaper|baby|wipes for baby|pedigree|whiskas|cat food|dog food|pet food|pet treat|pet shampoo|cat litter')],
  ['Personal care', w('hair colou?r|hair dye|hair serum|under eye|eye cream|retinol|niacinamide|shower cap|shower gel|cleanser|make ?up|remover|shaver|comb|hair clip|nail cutter|nasal|cetaphil|cerave|nivea|shampoo|conditioner|soap|body wash|face ?wash|cream|lotion|toothpaste|toothbrush|deo|deodorant|perfume|razor|shaving|sunscreen|serum|moisturi[sz]er|lip balm|hair oil|cotton|tissue paper|face mask')],
  ['Health & pharmacy', w('pain relief|volini|moov|iodex|tablet|capsule|syrup|paracetamol|dolo|crocin|vitamin|ors|bandage|band-aid|antiseptic|dettol liquid|thermometer|protein powder|whey|supplement|sanitary|pads?|tampon')],
  ['Household & cleaning', w('freshener|toilet roll|toilet paper|face tissue|tissue|bowl set|detergent|surf|ariel|tide|vim|dishwash|cleaner|harpic|lizol|colin|phenyl|garbage bag|bin bag|aluminium foil|cling|scrub|sponge|mop|broom|battery|bulb|candle|matchbox|agarbatti|air freshener|mosquito|good knight|all ?out|kitchen towel|napkin')],
  ['Sports & fitness', w('dumbbell|kettlebell|barbell|weight plate|skipping rope|jump rope|yoga mat|resistance band|hand grip|grip strengthener|push ?up bar|pull ?up bar|ab roller|gym glove|shaker|badminton|shuttlecock|racket|racquet|cricket bat|football|basketball|tennis ball|cycle|bicycle')],
  ['Electronics & appliances', w('headphone|earphone|earbud|airpods|neckband|speaker|soundbar|camera|dji|gopro|action cam|smartphone|iphone|mobile phone|laptop|macbook|tablet|ipad|kindle|smart ?watch|smartband|charger|charging cable|usb|type-c|power bank|adapter|ssd|hard drive|hard disk|pendrive|pen drive|memory card|sd card|keyboard|mouse|monitor|router|television|smart tv|trimmer|shaver|hair dryer|straightener|iron box|mixer|grinder|kettle|air fryer|induction|vacuum|fan|heater|purifier|projector|console|controller|joystick|playstation|xbox|gpu|graphics card|processor|motherboard|printer|webcam|microphone|tripod|gimbal')],
  ['Home & lifestyle', w('pen|pencil|notebook|diary|stapler|cardboard box|bubble wrap|tape|sticker|gift wrap|wrapping paper|party cup|paper cup|slipper|sandal|shoe|sock|vest|brief|t-?shirt|track pant|jean|bag|trolley|bouquet|flower|rose|gaana premium|gift card|sports bottle|plastic bottle|steel bottle|lunch box|tiffin|hanger|towel|idli maker|storage jar|container|weighing scale|kitchen scale|case cover|phone case|bedsheet|bed sheet|blanket|fleece|pillow|curtain|cushion|mattress|lamp|stand|organi[sz]er')],
  ['Meat & seafood', w('chicken|mutton|fish|prawn|egg curry|meat|salami|sausage|keema|seafood')],
  ['Frozen & ready to eat', w('frozen|ready to eat|ready-to-eat|nuggets|fries|momos?|pizza|burger|paratha|instant|maggi|noodles|cup noodles|yippee|pasta sauce|ice ?cream|kulfi')],
  ['Water', w('packaged water|drinking water|mineral water|bisleri|aquafina|kinley|water bottle|water can')],
  ['Drinks', w('cola|coke|pepsi|sprite|thums up|fanta|limca|soda|juice|red bull|monster|energy drink|cold coffee|iced tea|coconut water|tender coconut|tonic|lassi|buttermilk|chaas|smoothie|tea|coffee|nescafe|bru')],
  ['Bakery & breakfast', w('bread|bun|pav|cake|croissant|rusk|muffin|cookie|cookies|biscuit|oats|muesli|corn ?flakes|granola|peanut butter|jam|honey|nutella|spread')],
  ['Dairy & eggs', w('milk|curd|dahi|paneer|cheese|butter|ghee|cream cheese|yogurt|yoghurt|egg|eggs|khoa|tofu')],
  ['Snacks & sweets', w('chips|lays|kurkure|bingo|doritos|pringles|namkeen|bhujia|mixture|popcorn|nachos|chocolate|dairy milk|kitkat|5 star|snickers|candy|toffee|sweet|mithai|laddoo|ladoo|barfi|gulab jamun|rasgulla|wafer|makhana|peanut|cashew|almond|nuts|dry fruit|trail mix|protein bar')],
  ['Staples & cooking', w('mishri|atta|flour|maida|besan|rice|basmati|dal|daal|toor|moong|chana|rajma|oil|salt|sugar|jaggery|gud|masala|spice|turmeric|haldi|chilli|jeera|cumin|coriander powder|garam|sauce|ketchup|vinegar|seasoning|pickle|achar|poha|suji|rava|sooji|vermicelli|soya')],
  ['Fruits & vegetables', w('curry leaves|kadi patta|muskmelon|kharbooj|apple|banana|mango|orange|grapes|papaya|pomegranate|watermelon|melon|kiwi|pear|guava|lemon|lime|onion|potato|tomato|garlic|ginger|chilli green|green chilli|capsicum|carrot|cucumber|cabbage|cauliflower|broccoli|spinach|palak|methi|coriander|dhaniya|mint|pudina|beans|peas|okra|bhindi|brinjal|baingan|beetroot|radish|mushroom|sweet corn|corn|avocado|berries|strawberry|blueberr|fruit|vegetable|sabzi|salad')],
]

/** The shop's own product type (Flipkart's vertical) settles gadgets and appliances the name alone might miss. */
const GADGET_KIND = /phone|handset|headphone|headset|speaker|camera|laptop|tablet|watch|charger|cable|appliance|dryer|trimmer|shaver|monitor|keyboard|mouse|television|router|storage|drive|console|printer|projector|computer/i

export function categorize(name: string, kind?: string): ItemCategory {
  if (kind && /^book$/i.test(kind)) return 'Books'
  if (kind && GADGET_KIND.test(kind)) return 'Electronics & appliances'
  return RULES.find(([, re]) => re.test(name))?.[0] ?? 'Other'
}

/** Things that tend to be impulse buys, for the "watch out" notes. */
export const IMPULSE: ItemCategory[] = ['Snacks & sweets', 'Drinks', 'Frozen & ready to eat'] // water is a need, not an impulse

export type BasketLine = { date: string; month: string; hour: number; platform: string; name: string; qty: number; spend: number; category: ItemCategory }

/** Same product across orders: "Amul Taaza Toned Milk" and "amul taaza toned milk " group together. */
export const itemKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

/** Spend per category per month, for a stacked chart. */
export function byCategoryMonth(lines: BasketLine[]) {
  const m = new Map<string, Map<ItemCategory, number>>()
  for (const l of lines) {
    const row = m.get(l.month) ?? m.set(l.month, new Map()).get(l.month)!
    row.set(l.category, (row.get(l.category) ?? 0) + l.spend)
  }
  return m
}

/**
 * This month's spend per category against the average of the three months before it. A category is
 * flagged when it's at least 20% and ₹300 over that average.
 */
export function categoryVsAverage(lines: BasketLine[], month: string, prevMonths: string[]) {
  const cm = byCategoryMonth(lines)
  const cats = new Set<ItemCategory>(lines.map((l) => l.category))
  return [...cats].map((c) => {
    const now = cm.get(month)?.get(c) ?? 0
    const prev = prevMonths.map((p) => cm.get(p)?.get(c) ?? 0)
    const seen = prevMonths.filter((p) => cm.has(p)).length
    const avg = seen ? prev.reduce((a, b) => a + b, 0) / seen : 0
    // "Other" isn't something you can act on, so it's never flagged.
    const over = c !== 'Other' && avg > 0 && now >= avg * 1.2 && now - avg >= 300
    return { category: c, now, avg, delta: avg ? (now - avg) / avg : null, over }
  }).filter((r) => r.now > 0 || r.avg > 0).sort((a, b) => b.now - a.now)
}

/** Items ranked by spend in a window, with how often they were bought. */
export function topItems(lines: BasketLine[]) {
  const m = new Map<string, { name: string; category: ItemCategory; spend: number; qty: number; orders: Set<string>; platforms: Set<string> }>()
  for (const l of lines) {
    const k = itemKey(l.name)
    const r = m.get(k) ?? m.set(k, { name: l.name, category: l.category, spend: 0, qty: 0, orders: new Set(), platforms: new Set() }).get(k)!
    r.spend += l.spend; r.qty += l.qty; r.orders.add(`${l.platform}:${l.date}`); r.platforms.add(l.platform)
  }
  return [...m.values()].map((r) => ({ name: r.name, category: r.category, spend: r.spend, qty: r.qty, times: r.orders.size, platforms: [...r.platforms] }))
    .sort((a, b) => b.spend - a.spend)
}

/** Categories the System may set "spend less on" quests for: impulse buys and eating out. */
export const HABIT_CATEGORIES: ItemCategory[] = [...IMPULSE, 'Eating out']

/** "Diet Coke Can | Cola Sparkling…" → "Diet Coke". ponytail: first two words; good enough to group brands. */
const habitName = (name: string) => name.split(/[|,(–—-]/)[0].trim().split(/\s+/).slice(0, 2).join(' ')

/**
 * Spending habits from order items, as daily signals for the System: one per impulse category and one per
 * impulse item bought on many separate days. `offer` is the few worth suggesting quests on (bought on at
 * least `minDays` days; top `items` by spend); the rest stay so quests already set on them can still be judged.
 * Days from the first purchase to today are zero-filled: no Diet Coke that day really is zero.
 */
export function habitSignals(lines: BasketLine[], today: string, unit: string, { minDays = 6, items = 3 } = {}) {
  const add = (m: Map<string, Map<string, number>>, k: string, d: string, v: number) => {
    const days = m.get(k) ?? m.set(k, new Map()).get(k)!
    days.set(d, (days.get(d) ?? 0) + v)
  }
  const cats = new Map<string, Map<string, number>>(), things = new Map<string, Map<string, number>>()
  const label = new Map<string, string>()
  for (const l of lines) {
    if (!HABIT_CATEGORIES.includes(l.category)) continue
    add(cats, l.category, l.date, l.spend)
    if (l.category === 'Eating out') continue // dishes vary too much to track one by one
    const name = habitName(l.name)
    const k = name.toLowerCase()
    if (!k) continue
    label.set(k, name)
    add(things, k, l.date, l.spend)
  }
  const fill = (days: Map<string, number>) => {
    const out = new Map<string, number>()
    const first = [...days.keys()].sort()[0]
    for (let d = first; d <= today; d = nextDay(d)) out.set(d, days.get(d) ?? 0)
    return out
  }
  const bought = (days: Map<string, number>) => [...days.values()].filter((v) => v > 0).length
  const base = { area: 'wealth', group: 'habit', unit, direction: 'down' as const, agg: 'sum' as const }
  const signals: (Signal & { offer: boolean })[] = []
  for (const [c, days] of cats) signals.push({ ...base, id: `habit:cat:${c}`, name: `${c} spending`, days: fill(days), offer: bought(days) >= minDays })
  const repeat = [...things].filter(([, days]) => bought(days) >= minDays)
    .sort((a, b) => sum(b[1]) - sum(a[1])).slice(0, items).map(([k]) => k)
  for (const [k, days] of things) signals.push({ ...base, id: `habit:item:${k}`, name: `${label.get(k)} spending`, days: fill(days), offer: repeat.includes(k) })
  return signals
}

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
