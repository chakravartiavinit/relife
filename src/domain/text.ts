/**
 * URLs without their query string or fragment. Error messages from signed APIs (Binance) carry timestamps and
 * request signatures in the query; they are noise to read and should not be kept or shown.
 */
export const hideUrlQuery = (text: string) => text.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1')

/** First letter upper case, for titles that start with an id ("github sync is failing"). */
export const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
