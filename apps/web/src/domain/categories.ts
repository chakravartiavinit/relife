// Life categories. Kept out of db/schema.ts so client components can import the list
// without pulling drizzle-orm into the browser bundle.
export const CATEGORIES = ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'] as const
export type Category = (typeof CATEGORIES)[number]
