import { cn } from '../cn'

// Logos for merchants, subscriptions and apps, matched from their name. Brand SVGs come from Simple Icons
// (CC0, public/brands); the PNG/JPG app icons there (Hotstar, SonyLIV, Canva…) are the brands' own site icons,
// for brands Simple Icons doesn't carry. Connector logos come from public/connectors. Anything unknown gets a lettered tile
// in a colour picked from its name, so every row still has a picture.

const BRANDS: [RegExp, string, boolean?][] = [
  // [name pattern, file, fills the tile (app-icon PNGs)]
  [/swiggy|instamart/i, '/brands/swiggy.svg'],
  [/zomato/i, '/connectors/zomato.svg'],
  [/blinkit/i, '/connectors/blinkit.png', true],
  [/zepto/i, '/connectors/zepto.png', true],
  [/flipkart/i, '/connectors/flipkart.png', true],
  [/makemytrip|make my trip/i, '/connectors/makemytrip.png'],
  [/amazon|prime video|audible/i, '/connectors/amazon.svg'],
  [/netflix/i, '/brands/netflix.svg'],
  [/hotstar|disney/i, '/brands/hotstar.png', true],
  [/sony ?liv/i, '/brands/sonyliv.png', true],
  [/zee ?5/i, '/brands/zee5.jpg', true],
  [/jio ?cinema/i, '/brands/jiocinema.png', true],
  [/crunchyroll/i, '/brands/crunchyroll.svg'],
  [/hbo|\bmax\b/i, '/brands/hbomax.svg'],
  [/twitch/i, '/brands/twitch.svg'],
  [/tidal/i, '/brands/tidal.svg'],
  [/deezer/i, '/brands/deezer.svg'],
  [/gaana/i, '/brands/gaana.png', true],
  [/wynk/i, '/brands/wynk.png', true],
  [/playstation|ps plus/i, '/brands/playstation.svg'],
  [/steam/i, '/brands/steam.svg'],
  [/icloud/i, '/brands/icloud.svg'],
  [/spotify/i, '/brands/spotify.svg'],
  [/youtube/i, '/brands/youtube.svg'],
  [/apple music/i, '/brands/applemusic.svg'],
  [/apple|icloud|app store/i, '/brands/apple.svg'],
  [/google drive/i, '/brands/googledrive.svg'],
  [/google pay|gpay/i, '/brands/googlepay.svg'],
  [/google|gemini/i, '/brands/google.svg'],
  [/claude/i, '/brands/claude.svg'],
  [/anthropic/i, '/brands/anthropic.svg'],
  [/perplexity/i, '/brands/perplexity.svg'],
  [/microsoft|office 365|m365|xbox|onedrive/i, '/brands/microsoft.png', true],
  [/adobe|photoshop|lightroom/i, '/brands/adobe.png', true],
  [/canva/i, '/brands/canva.jpg', true],
  [/linkedin/i, '/brands/linkedin.png', true],
  [/grammarly/i, '/brands/grammarly.svg'],
  [/1password/i, '/brands/1password.svg'],
  [/bitwarden/i, '/brands/bitwarden.svg'],
  [/proton/i, '/brands/proton.svg'],
  [/nordvpn/i, '/brands/nordvpn.svg'],
  [/expressvpn/i, '/brands/expressvpn.svg'],
  [/todoist/i, '/brands/todoist.svg'],
  [/evernote/i, '/brands/evernote.svg'],
  [/obsidian/i, '/brands/obsidian.svg'],
  [/raycast/i, '/brands/raycast.svg'],
  [/setapp/i, '/brands/setapp.svg'],
  [/jetbrains|intellij|webstorm|pycharm/i, '/brands/jetbrains.svg'],
  [/linear/i, '/brands/linear.svg'],
  [/framer/i, '/brands/framer.svg'],
  [/webflow/i, '/brands/webflow.svg'],
  [/\bwix\b/i, '/brands/wix.svg'],
  [/supabase/i, '/brands/supabase.svg'],
  [/netlify/i, '/brands/netlify.svg'],
  [/digitalocean/i, '/brands/digitalocean.svg'],
  [/godaddy/i, '/brands/godaddy.svg'],
  [/namecheap/i, '/brands/namecheap.svg'],
  [/hostinger/i, '/brands/hostinger.svg'],
  [/zoom/i, '/brands/zoom.svg'],
  [/headspace/i, '/brands/headspace.svg'],
  [/strava/i, '/brands/strava.svg'],
  [/tradingview/i, '/brands/tradingview.svg'],
  [/chatgpt|openai/i, '/connectors/openai.svg'],
  [/notion/i, '/brands/notion.svg'],
  [/figma/i, '/brands/figma.svg'],
  [/discord/i, '/brands/discord.svg'],
  [/uber/i, '/brands/uber.svg'],
  [/airtel/i, '/brands/airtel.svg'],
  [/\bjio\b/i, '/brands/jio.svg'],
  [/dropbox/i, '/brands/dropbox.svg'],
  [/duolingo/i, '/brands/duolingo.svg'],
  [/^x\b|twitter/i, '/brands/x.svg'],
  [/zerodha|kite/i, '/brands/zerodha.svg'],
  [/paytm/i, '/brands/paytm.svg'],
  [/phonepe/i, '/brands/phonepe.svg'],
  [/bigbasket/i, '/brands/bigbasket.svg'],
  [/starbucks/i, '/brands/starbucks.svg'],
  [/mcdonald/i, '/brands/mcdonalds.svg'],
  [/\bkfc\b/i, '/brands/kfc.svg'],
  [/airbnb/i, '/brands/airbnb.svg'],
  [/medium/i, '/brands/medium.svg'],
  [/substack/i, '/brands/substack.svg'],
  [/patreon/i, '/brands/patreon.svg'],
  [/github/i, '/brands/github.svg'],
  [/^cursor$/i, '/brands/cursor.svg'],
  [/gitlab/i, '/brands/gitlab.svg'],
  [/vercel/i, '/brands/vercel.svg'],
  [/cloudflare/i, '/brands/cloudflare.svg'],
  [/tinder/i, '/brands/tinder.svg'],
  [/coursera/i, '/brands/coursera.svg'],
  [/udemy/i, '/brands/udemy.svg'],
  [/binance/i, '/connectors/binance.svg'],
  [/lichess/i, '/connectors/lichess.svg'],
  [/codeforces/i, '/connectors/codeforces.png'],
  [/codechef/i, '/connectors/codechef.svg'],
  [/atcoder/i, '/connectors/atcoder.png', true],
  [/chess\.com|chesscom/i, '/connectors/chessdotcom.svg'],
  [/leetcode/i, '/connectors/leetcode.svg'],
  [/strava/i, '/connectors/strava.svg'],
  [/toggl/i, '/connectors/toggl.svg'],
  [/rescuetime/i, '/connectors/rescuetime.svg'],
  [/hevy/i, '/connectors/hevy.svg'],
  [/codewars/i, '/connectors/codewars.svg'],
  [/letterboxd/i, '/connectors/letterboxd.svg'],
  [/anki\b/i, '/connectors/anki.svg'],
  [/wakatime/i, '/connectors/wakatime.svg'],
  [/monkeytype/i, '/connectors/monkeytype.svg'],
  [/duolingo/i, '/connectors/duolingo.svg'],
  [/todoist/i, '/connectors/todoist.svg'],
  [/last\.?fm/i, '/connectors/lastfm.svg'],
  [/gmail/i, '/connectors/gmail.svg'],
  [/telegram/i, '/connectors/telegram.svg'],
]

export function brandFor(name: string) {
  const hit = BRANDS.find(([re]) => re.test(name))
  return hit ? { src: hit[1], fill: !!hit[2] } : null
}

/** A stable hue from a name, for lettered tiles. */
function hue(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

const SIZE = { sm: 'size-8 rounded-[9px] text-[13px]', md: 'size-10 rounded-[11px] text-[15px]', lg: 'size-16 rounded-[18px] text-[22px]' }
const GLYPH = { sm: 'size-[18px]', md: 'size-[22px]', lg: 'size-9' }

/** Merchant or brand logo on a white tile, or a lettered tile when the brand is unknown. */
export function BrandLogo({ name, size = 'sm', className }: { name: string; size?: keyof typeof SIZE; className?: string }) {
  const b = brandFor(name)
  if (b) {
    return (
      <span aria-hidden className={cn('grid shrink-0 place-items-center overflow-hidden bg-white shadow-[0_0_0_1px_oklch(0_0_0/0.1)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.1)]', SIZE[size], className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG/PNG files */}
        <img src={b.src} alt="" className={cn('outline-none', b.fill ? 'size-full object-cover' : cn(GLYPH[size], 'object-contain'))} />
      </span>
    )
  }
  const h = hue(name.trim().toLowerCase())
  const letter = (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center font-display font-bold text-[oklch(0.42_0.11_var(--h))] bg-[oklch(0.93_0.045_var(--h))] dark:text-[oklch(0.85_0.08_var(--h))] dark:bg-[oklch(0.33_0.06_var(--h))]', SIZE[size], className)}
      style={{ '--h': h } as React.CSSProperties}
    >
      {letter}
    </span>
  )
}
