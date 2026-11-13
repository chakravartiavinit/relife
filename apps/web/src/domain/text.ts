/**
 * URLs without their query string or fragment. Error messages from signed APIs (Binance) carry timestamps and
 * request signatures in the query; they are noise to read and should not be kept or shown.
 */
export const hideUrlQuery = (text: string) => text.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1')

/** First letter upper case, for titles that start with an id ("github sync is failing"). */
export const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** True for absolute http(s) URLs only. Use before rendering a stored URL as a link (no javascript:, data:, ...). */
export const isWebUrl = (url: string | null | undefined): url is string => !!url && /^https?:\/\/[^\s]+$/i.test(url.trim())
