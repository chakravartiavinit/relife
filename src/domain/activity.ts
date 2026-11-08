// What you do on your laptop, sorted into a few kinds of time. Pure rules: the same site, app and title
// always land in the same bucket. Segments come from the browser extension and the Mac app watcher.

export const ACTIVITY_KINDS = ['learning', 'work', 'entertainment', 'social', 'communication', 'shopping', 'news', 'other'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const KIND_INFO: Record<ActivityKind, { label: string; better: 'up' | 'down' | 'none' }> = {
  learning: { label: 'Learning', better: 'up' },
  work: { label: 'Deep work', better: 'up' },
  entertainment: { label: 'Entertainment', better: 'down' },
  social: { label: 'Social media', better: 'down' },
  communication: { label: 'Messages & email', better: 'none' },
  shopping: { label: 'Shopping', better: 'down' },
  news: { label: 'News', better: 'none' },
  other: { label: 'Other', better: 'none' },
}

const DOMAINS: [ActivityKind, RegExp][] = [
  ['learning', /(^|\.)(100xdevs\.com|boot\.dev|udemy\.com|coursera\.org|edx\.org|frontendmasters\.com|egghead\.io|khanacademy\.org|leetcode\.com|neetcode\.io|codeforces\.com|codechef\.com|atcoder\.jp|hackerrank\.com|geeksforgeeks\.org|freecodecamp\.org|educative\.io|scrimba\.com|pluralsight\.com|udacity\.com|brilliant\.org|duolingo\.com|developer\.mozilla\.org|roadmap\.sh|kaggle\.com|nptel\.ac\.in|swayam\.gov\.in|takeuforward\.org|exercism\.org|codecademy\.com|datacamp\.com|arxiv\.org)$/],
  ['work', /(^|\.)(github\.com|gitlab\.com|stackoverflow\.com|vercel\.com|linear\.app|notion\.so|figma\.com|docs\.google\.com|sheets\.google\.com|jira\.com|atlassian\.net|localhost|127\.0\.0\.1|chatgpt\.com|claude\.ai|aws\.amazon\.com|console\.cloud\.google\.com|supabase\.com|npmjs\.com|nextjs\.org|react\.dev|tailwindcss\.com)$/],
  ['social', /(^|\.)(x\.com|twitter\.com|instagram\.com|facebook\.com|reddit\.com|linkedin\.com|threads\.net|snapchat\.com|pinterest\.com|tumblr\.com|quora\.com)$/],
  ['entertainment', /(^|\.)(netflix\.com|primevideo\.com|hotstar\.com|jiocinema\.com|twitch\.tv|spotify\.com|music\.youtube\.com|disneyplus\.com|crunchyroll\.com|9gag\.com|imdb\.com|sonyliv\.com|zee5\.com|mxplayer\.in|chess\.com|lichess\.org)$/],
  ['communication', /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|web\.whatsapp\.com|web\.telegram\.org|slack\.com|discord\.com|teams\.microsoft\.com|meet\.google\.com|zoom\.us)$/],
  ['shopping', /(^|\.)(amazon\.(in|com)|flipkart\.com|myntra\.com|blinkit\.com|zepto\.com|swiggy\.com|zomato\.com|ajio\.com|nykaa\.com|meesho\.com|bigbasket\.com)$/],
  ['news', /(^|\.)(news\.ycombinator\.com|bbc\.(com|co\.uk)|nytimes\.com|theverge\.com|techcrunch\.com|thehindu\.com|ndtv\.com|indianexpress\.com|economictimes\.indiatimes\.com|moneycontrol\.com|medium\.com|substack\.com)$/],
]

const APPS: [ActivityKind, RegExp][] = [
  ['work', /^(code|cursor|visual studio code|xcode|terminal|iterm2?|warp|ghostty|kitty|alacritty|webstorm|intellij idea|pycharm|android studio|sublime text|zed|nova|figma|linear|notion|obsidian|postman|insomnia|docker desktop|tableplus|datagrip|github desktop|claude|chatgpt|keynote|pages|numbers|microsoft (word|excel|powerpoint))$/i],
  ['communication', /^(slack|discord|telegram|whatsapp|messages|mail|microsoft outlook|zoom\.us|microsoft teams|facetime|signal)$/i],
  ['entertainment', /^(spotify|music|tv|vlc|iina|netflix|steam|apple tv|podcasts|photo booth)$/i],
  ['learning', /^(anki|kindle|books|duolingo)$/i],
]

// A YouTube video counts as learning when its title or channel reads like a lesson.
const LESSON = /\b(tutorial|course|lecture|lesson|class|bootcamp|crash course|explained|how to|learn|beginners?|full stack|dsa|leetcode|algorithms?|data structures?|system design|interview|javascript|typescript|react|next\.?js|node\.?js|python|java\b|c\+\+|rust|golang|docker|kubernetes|aws|devops|sql|database|machine learning|deep learning|llm|ai engineer|maths?|physics|chemistry|calculus|statistics|economics|finance|investing|cohort|week \d+|chapter \d+|part \d+ of)\b/i
const LESSON_CHANNELS = /\b(freecodecamp|harkirat|100xdevs|striver|take u forward|neetcode|fireship|traversy|web dev simplified|the net ninja|cs50|mit opencourseware|khan academy|3blue1brown|veritasium|kunal kushwaha|apna college|code with harry|hitesh|chai aur code|primeagen|theo|ben awad|computerphile|two minute papers|andrej karpathy|stanford|nptel|gate smashers|abdul bari|tech with tim|corey schafer|sentdex)\b/i

export type Segment = { app?: string | null; domain?: string | null; title?: string | null; channel?: string | null }

/** Library item types: what each is called and what time on it counts as. */
export const LIBRARY = {
  course: { label: 'Course', plural: 'Courses', counts: 'learning' },
  book: { label: 'Book', plural: 'Books', counts: 'learning' },
  show: { label: 'Show or anime', plural: 'Shows & anime', counts: 'entertainment' },
  video: { label: 'Video series', plural: 'Video series', counts: 'learning' },
  other: { label: 'Other', plural: 'Other', counts: 'other' },
} as const satisfies Record<string, { label: string; plural: string; counts: ActivityKind }>
export type LibraryKind = keyof typeof LIBRARY

/** Your rules win (site → kind; a parent domain covers its subdomains), then the built-in ones. */
/** Rules for Mac apps live next to site rules, keyed by app name. */
export const appKey = (app: string) => `app:${app.trim().toLowerCase()}`

export function classify(s: Segment, rules?: Map<string, ActivityKind>): ActivityKind {
  const domain = (s.domain ?? '').toLowerCase().replace(/^www\./, '')
  if (rules?.size && domain) {
    for (let d = domain; d.includes('.'); d = d.slice(d.indexOf('.') + 1)) {
      const k = rules.get(d)
      if (k) return k
    }
  }
  if (domain === 'youtube.com' || domain === 'm.youtube.com' || domain === 'youtu.be') {
    const text = `${s.title ?? ''} ${s.channel ?? ''}`
    return LESSON.test(text) || LESSON_CHANNELS.test(text) ? 'learning' : 'entertainment'
  }
  if (domain) return DOMAINS.find(([, re]) => re.test(domain))?.[0] ?? 'other'
  const app = (s.app ?? '').trim()
  const own = app && rules?.get(appKey(app))
  if (own) return own
  return APPS.find(([, re]) => re.test(app))?.[0] ?? 'other'
}

/** Browsers the extension already covers; the Mac watcher skips them so time isn't counted twice. */
export const BROWSER_APPS = /^(google chrome|chrome|arc|brave browser|microsoft edge|chromium|vivaldi|opera)$/i

/**
 * A page or window title as people would say it, or null when it says nothing beyond the site itself:
 * "(402) Episode 4 - YouTube" → "Episode 4"; "(5) YouTube" → null; "WhatsApp" on whatsapp → null.
 */
export function pageTitle(title: string | null | undefined, place: string) {
  let t = (title ?? '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s[-–|·]\s(YouTube|Google Docs|Google Sheets|Gmail|X|Twitter|Reddit|LinkedIn|Instagram|Facebook|GitHub)$/i, '').trim()
  const site = place.toLowerCase().replace(/^www\./, '').split('.').slice(-2)[0] ?? ''
  if (t.length < 3 || t.toLowerCase() === site || t.toLowerCase() === place.toLowerCase()) return null
  if (t.length > 140) t = `${t.slice(0, 139)}…`
  return t
}
