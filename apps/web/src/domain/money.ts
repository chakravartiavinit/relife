const fmts = new Map<string, Intl.NumberFormat>()

/** en-IN grouping (1,23,456.00) for INR; currency symbol for everything else. */
export function formatMoney(amount: number, currency = 'INR', opts: { compact?: boolean; sign?: boolean; decimals?: number } = {}) {
  const decimals = opts.decimals ?? (opts.compact ? 1 : Math.abs(amount) >= 1000 ? 0 : 2)
  const key = `${currency}|${opts.compact}|${opts.sign}|${decimals}`
  let f = fmts.get(key)
  if (!f) {
    const isCrypto = !isIsoCurrency(currency)
    f = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      ...(isCrypto ? {} : { style: 'currency', currency }),
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    })
    fmts.set(key, f)
  }
  const s = f.format(amount)
  return isIsoCurrency(currency) ? s : `${s} ${currency}`
}

export function formatNumber(n: number, decimals = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(n)
}

const ISO = new Set(Intl.supportedValuesOf?.('currency') ?? ['INR', 'USD', 'EUR', 'GBP'])
export function isIsoCurrency(c: string) { return ISO.has(c.toUpperCase()) }

/** Stablecoins valued at 1 USD. */
export const USD_STABLES = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD', 'USDP', 'USD'])
