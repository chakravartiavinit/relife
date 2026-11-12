import {
  Award, Brain, Check, ChevronDown, Code, Command, Flame, Gift, HeartPulse, LockKeyhole, Medal, Moon, Palette, ServerCog, ShieldCheck,
  Snowflake, Sparkles, Star, Users, Wallet,
} from 'lucide-react'
import { Capsule } from '@/components/capsule'
import { HeroVisual } from '@/components/hero-visual'
import { Showcase, type Panel } from '@/components/showcase'
import { WaitlistForm } from '@/components/waitlist-form'
import { Wordmark } from '@/components/wordmark'
import { contactEmail, licenseLabel, repoUrl } from '@/lib/config'
import { DESCRIPTION, NAME, siteUrl } from '@/lib/site'

const AREAS = [
  { name: 'Health', icon: HeartPulse, color: 'var(--cat-health)', text: 'Sleep, steps, water, medicines' },
  { name: 'Mind', icon: Brain, color: 'var(--cat-mind)', text: 'Mood, focus, reading' },
  { name: 'Skills', icon: Code, color: 'var(--cat-skills)', text: 'Commits, contests, courses' },
  { name: 'Wealth', icon: Wallet, color: 'var(--cat-wealth)', text: 'Spending, subscriptions, portfolio' },
  { name: 'Hobbies', icon: Palette, color: 'var(--cat-hobbies)', text: 'Shows, games, music' },
  { name: 'People', icon: Users, color: 'var(--cat-relationships)', text: "Who you haven't called in a while" },
]

// Public connectors only. The logged-in shopping scrapers are personal-use by design and stay off the wall.
const WALL: { title: string; color: string; items: [string, string?][] }[] = [
  { title: 'Health & sleep', color: 'var(--cat-health)', items: [['Oura'], ['WHOOP'], ['Withings'], ['Apple Health']] },
  { title: 'Workouts', color: 'var(--cat-health)', items: [['Strava', 'strava.svg'], ['Hevy', 'hevy.svg']] },
  { title: 'Focus & time', color: 'var(--cat-mind)', items: [['Google Calendar', 'googlecalendar.svg'], ['RescueTime', 'rescuetime.svg'], ['Toggl Track', 'toggl.svg'], ['Todoist', 'todoist.svg']] },
  { title: 'Code & contests', color: 'var(--cat-skills)', items: [['GitHub', 'github.svg'], ['WakaTime', 'wakatime.svg'], ['Codeforces', 'codeforces.png'], ['CodeChef', 'codechef.svg'], ['LeetCode', 'leetcode.svg']] },
  { title: 'Learning & reading', color: 'var(--cat-mind)', items: [['Duolingo', 'duolingo.svg'], ['Anki', 'anki.svg'], ['Open Library', 'openlibrary.png'], ['Monkeytype', 'monkeytype.svg']] },
  { title: 'Games & media', color: 'var(--cat-hobbies)', items: [['Lichess', 'lichess.svg'], ['Chess.com', 'chessdotcom.svg'], ['Steam', 'steam.svg'], ['Last.fm', 'lastfm.svg'], ['Letterboxd', 'letterboxd.svg']] },
  { title: 'Money', color: 'var(--cat-wealth)', items: [['Binance', 'binance.svg']] },
  { title: 'AI models', color: 'var(--pill)', items: [['OpenAI', 'openai.svg'], ['Anthropic', 'anthropic.svg'], ['Gemini', 'gemini.svg'], ['OpenRouter', 'openrouter.svg'], ['Ollama', 'ollama.svg']] },
  { title: 'Messaging', color: 'var(--pill)', items: [['Telegram', 'telegram.svg']] },
]

const FAQ: [string, string][] = [
  ['Is it free?', 'Self-hosting is meant to be free (it is coming soon). ReLife Cloud pricing comes later. Joining the waitlist costs nothing and commits you to nothing.'],
  ['Which devices does it run on?', 'A Mac app, a Chrome extension, an iPhone and Android web app, and the web dashboard. Scan once to connect them all to the same account.'],
  ['What is The System?', 'The part that issues your daily quests. It looks at what is slipping and what you want to improve, sets a target near what you usually do, and rates it E to S. Code works out every number; the AI only words the nudge.'],
  ['Do I need to code?', 'Not with ReLife Cloud. Self-hosting needs a terminal today.'],
  ['Which AI does it use?', 'Your pick: OpenAI, Anthropic, Gemini, OpenRouter, or a local model through Ollama. You can also turn AI off. The quests still work.'],
  ['Is my data private?', 'Your data lives on your machine with your own database. Nothing syncs until you connect a source, keys are encrypted at rest, and when you use an AI model it gets a short summary, never your raw rows. This waitlist stores only your email and the choices you make in the form.'],
  ['Does it work outside India?', `Yes. Some details are India-first (rupees, a few order apps), but ${NAME} is written for everyone, and currency and time zone are settings.`],
  ['When can I get in?', 'We invite people in order, in small batches, by email. Friends who confirm through your link move you up the line.'],
]

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mini">{children}</div>
}

const PANELS: Panel[] = [
  {
    id: 'dashboard', label: 'Dashboard', title: 'Dashboard', line: 'Plan, review and dig into every number.',
    visual: (
      <Frame>
        <div className="q" style={{ ['--c' as string]: 'var(--cat-health)' }}><span className="rank">B</span><div><b>Walk 6,000 steps</b><small>4,100 of 6,000</small></div><span className="xpchip num">+30 XP</span><div className="bar"><span style={{ ['--w' as string]: '68%' }} /></div></div>
        <div className="q" style={{ ['--c' as string]: 'var(--cat-skills)' }}><span className="rank">C</span><div><b>Ship 3 commits</b><small>Auto from GitHub</small></div><span className="xpchip num">+40 XP</span><div className="bar"><span style={{ ['--w' as string]: '66%' }} /></div></div>
        <div className="q" style={{ ['--c' as string]: 'var(--cat-wealth)' }}><span className="rank">A</span><div><b>Food apps: ₹600 or less</b><small>₹230 of ₹600</small></div><span className="xpchip num">+90 XP</span><div className="bar"><span style={{ ['--w' as string]: '38%' }} /></div></div>
      </Frame>
    ),
  },
  {
    id: 'mac', label: 'Mac', title: 'Mac', line: 'Your level in the menu bar. Log anything with ⌃⌥Space.',
    visual: (
      <>
        <div className="menubar" aria-hidden><span className="count"><Flame size={14} color="var(--medal-gold)" />12</span><span className="count"><Capsule color="var(--pill)" letter="" />2</span><span>Thu 9:41</span></div>
        <div className="quicklog" aria-hidden><Command size={18} color="var(--ink-3)" /><span>water 250</span><span className="kbd" style={{ marginLeft: 'auto' }}>⌃⌥Space</span></div>
        <p className="ink-2" style={{ fontSize: 14 }}>Same quick log as the dashboard and Telegram.</p>
      </>
    ),
  },
  {
    id: 'extension', label: 'Extension', title: 'Extension', line: 'Today in your toolbar, and your browsing time counted.',
    visual: (
      <>
        <div className="toolbar" aria-hidden><Capsule color="var(--pill)" letter="" /></div>
        <div className="popup" aria-hidden>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="lv num">Lv 12</span><b style={{ fontSize: 14 }}>2 quests left</b></div>
          <div className="q" style={{ ['--c' as string]: 'var(--cat-skills)', gridTemplateColumns: '1fr auto', padding: 10, margin: 0 }}><div><b style={{ fontSize: 13.5 }}>Ship 3 commits</b><small>2 of 3</small></div><span className="xpchip num">+40</span></div>
          <div className="num ink-2" style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>Deep work today</span><b style={{ color: 'var(--ink)' }}>3h 10m</b></div>
        </div>
      </>
    ),
  },
  {
    id: 'phone', label: 'Phone', title: 'Phone', line: "Check off on the go. Reminders that stop once you're done.",
    visual: (
      <div className="phone" aria-hidden>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="lv num">Lv 12</span><small className="ink-2">2 left</small></div>
          <div className="q done" style={{ ['--c' as string]: 'var(--good)' }}><span className="rank"><Check size={14} strokeWidth={3} /></span><div><b style={{ fontSize: 13 }}>Read 20 pages</b></div></div>
          <div className="q" style={{ ['--c' as string]: 'var(--cat-health)' }}><span className="rank">B</span><div><b style={{ fontSize: 13 }}>Drink 3 L water</b></div></div>
          <div className="q" style={{ ['--c' as string]: 'var(--cat-mind)' }}><span className="rank">D</span><div><b style={{ fontSize: 13 }}>Skincare · 21:00</b></div></div>
        </div>
      </div>
    ),
  },
]

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: NAME,
  description: DESCRIPTION,
  url: siteUrl,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'macOS, Web, Chrome',
  ...(licenseLabel ? { license: licenseLabel } : {}),
}

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <header className="nav">
        <div className="wrap">
          <a href="/" aria-label={`${NAME} home`}><Wordmark /></a>
          <nav className="nav-links" aria-label="Sections">
            <a href="#how">How it works</a><a href="#game">The game</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a>
          </nav>
          <a href="#waitlist" className="btn ink sm">Join the waitlist</a>
        </div>
      </header>

      <main id="main">
        <section className="hero wrap">
          <div className="capsule-row" aria-hidden>
            {AREAS.map((a) => <Capsule key={a.name} color={a.color} icon={a.icon} />)}
          </div>
          <span className="sys">System · Daily quests issued</span>
          <h1 className="display">Level up <em>your real life.</em></h1>
          <p className="lede">{NAME} pulls in your sleep, workouts, code, learning and spending, then turns them into daily quests, XP and streaks. Your data stays on your machine.</p>
          <WaitlistForm />
          <p className="proof">
            <span>Local-first</span><i aria-hidden /><span>Bring your own AI</span><i aria-hidden />
            {repoUrl ? <a href={repoUrl} style={{ textDecoration: 'underline' }}>Self-host it free</a> : <span>Self-host <span className="tag">Coming soon</span></span>}
          </p>
          <HeroVisual />
          <div className="strip">
            <span className="sys bare">Syncs on its own from</span>
            <ul>{['github', 'strava', 'hevy', 'leetcode', 'wakatime', 'steam', 'binance', 'anki', 'duolingo', 'lastfm', 'letterboxd', 'telegram'].map((n) => <li key={n}><img src={`/connectors/${n}.svg`} alt="" width={26} height={26} loading="lazy" /></li>)}</ul>
            <span className="more">+ more</span>
          </div>
        </section>

        <section id="how" className="sec wrap reveal">
          <div className="sec-head"><span className="sys">How it works</span><h2 className="display">Connect once. The System does the rest.</h2></div>
          <div className="grid g3">
            <article className="card step">
              <span className="n">01</span><h3>Connect</h3><p>Link the apps you already use. They sync in the background.</p>
              <div className="crop" aria-hidden>
                {[['github', 'GitHub', '2 min ago'], ['strava', 'Strava', '8 min ago'], ['hevy', 'Hevy', '1 h ago']].map(([i, n, w]) => (
                  <div key={i} className="chip-row"><img src={`/connectors/${i}.svg`} alt="" width={20} height={20} loading="lazy" />{n}<span className="when">{w}</span></div>
                ))}
              </div>
            </article>
            <article className="card step">
              <span className="n">02</span><h3>Play</h3><p>Each morning The System picks quests from what&apos;s slipping and what you want to improve.</p>
              <div className="crop" aria-hidden>
                <div className="q" style={{ ['--c' as string]: 'var(--cat-health)', margin: 0, background: 'var(--surface)' }}><span className="rank">B</span><div><b>Walk 6,000 steps</b><small>4,100 so far</small></div><span className="xpchip num">+30 XP</span><div className="bar"><span style={{ ['--w' as string]: '68%' }} /></div></div>
              </div>
            </article>
            <article className="card step">
              <span className="n">03</span><h3>Level up</h3><p>Your data clears quests. Earn XP, keep streaks, rank up from E to S.</p>
              <div className="crop" aria-hidden>
                <div className="ladder">{['E', 'D', 'C', 'B', 'A', 'S'].map((r, i) => <span key={r} className={i < 3 ? 'done' : i === 3 ? 'on' : ''}>{r}</span>)}</div>
                <div className="xp-row num"><span>Rank B this week</span><b>+30 XP</b></div>
              </div>
            </article>
          </div>
        </section>

        <section id="game" className="sec wrap reveal">
          <div className="sec-head"><span className="sys">The game</span><h2 className="display">A game that plays fair.</h2><p>Quests clear themselves from your data. Targets sit near your usual, so a hard day is a stretch, not a fantasy.</p></div>
          <div className="grid g3">
            <article className="feat card"><span className="tile"><Star size={22} /></span><h3>Levels and titles</h3><p>Every log, sync and cleared quest earns XP toward one level and a title that changes as you grow.</p></article>
            <article className="feat card"><span className="tile" style={{ ['--c' as string]: 'var(--cat-skills)' }}><Medal size={22} /></span><h3>The System and ranks E–S</h3><p>Each quest gets a rank for how hard it is for you, not for everyone.</p></article>
            <article className="feat card"><span className="tile" style={{ ['--c' as string]: 'var(--cat-skills)' }}><Snowflake size={22} /></span><h3>Streaks with freezes</h3><p>Miss a day? A freeze saves it.</p></article>
            <article className="feat card"><span className="tile" style={{ ['--c' as string]: 'var(--medal-gold)' }}><Gift size={22} /></span><h3>Weekly quests and chests</h3><p>Clear every daily quest in a week and a chest drops bonus XP and a freeze.</p></article>
            <article className="feat card"><span className="tile" style={{ ['--c' as string]: 'var(--medal-bronze)' }}><Award size={22} /></span><h3>Achievements</h3><p>Medals for the long game: first 7-day streak, first A-rank, a month of sleep on time.</p></article>
            <article className="feat fair card"><span className="tile"><Sparkles size={22} /></span><h3>Nothing breaks when you miss</h3><p>Miss a day and nothing breaks. The System offers a smaller step, rest, or a rethink.</p></article>
          </div>
        </section>

        <section id="areas" className="sec wrap reveal">
          <div className="sec-head center"><span className="sys">Areas</span><h2 className="display">Six stats. One character.</h2><p>Every area levels on its own and adds to one overall level, title and streak. Skip an area you don&apos;t care about.</p></div>
          <div className="grid g3">
            {AREAS.map((a) => (
              <article key={a.name} className="area card">
                <div className="halftone" style={{ ['--tone' as string]: a.color, inset: '0 0 auto auto', width: 180, height: 120, opacity: 0.22 }} />
                <div className="area-top"><Capsule color={a.color} icon={a.icon} size="lg" /><h3>{a.name}</h3></div>
                <p>{a.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="connectors" className="sec wrap reveal">
          <div className="sec-head"><span className="sys">Auto-sync</span><h2 className="display">Works with what you already use.</h2><p>Connect once and it syncs in the background. Every source shows when it last synced.</p></div>
          <div className="wall">
            {WALL.map((g) => (
              <div key={g.title}>
                <h3><span className="sys" style={{ ['--c' as string]: g.color }}>{g.title}</span></h3>
                <ul className="logos">
                  {g.items.map(([name, file]) => (
                    <li key={name} className="logo-chip">
                      {file ? <img src={`/connectors/${file}`} alt="" width={18} height={18} loading="lazy" /> : <Moon size={18} color="var(--ink-3)" aria-hidden />}
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="fine">Trademarks belong to their owners. {NAME} isn&apos;t affiliated with them.</p>
        </section>

        <section id="everywhere" className="sec wrap reveal">
          <div className="sec-head"><span className="sys">Apps</span><h2 className="display">Everywhere you are.</h2></div>
          <Showcase panels={PANELS} />
          <p className="ink-2" style={{ marginTop: 28, fontSize: 16 }}>Scan once to connect every device.</p>
        </section>

        <section id="coach" className="sec wrap reveal">
          <div className="coach">
            <div className="card chat" aria-hidden>
              <div className="chat-head"><Capsule color="var(--pill)" letter="" /><div><b>{NAME}</b><small>bot · on Telegram</small></div></div>
              <div className="chat-body">
                <div className="bubble">Morning. Four quests today: 8,000 steps (B), ship 3 commits (C), food apps under ₹600 (A), read 20 pages (D). You averaged 6,900 steps, so B is one step up.</div>
                <div className="bubble me">water 250</div>
                <div className="bubble">+250 ml logged. 1,750 to go.<div className="btns"><span>Done</span><span>Snooze 30 min</span></div></div>
              </div>
            </div>
            <div>
              <span className="sys">AI coach</span>
              <h2 className="display" style={{ marginTop: 14, fontSize: 'clamp(32px, 5vw, 50px)' }}>Your AI, your rules.</h2>
              <p className="ink-2" style={{ marginTop: 16, fontSize: 18 }}>Pick OpenAI, Anthropic, Gemini or a local model. Code works out every number; the AI only words the nudge.</p>
              <ul className="models">{['openai', 'anthropic', 'gemini', 'openrouter', 'ollama'].map((m) => <li key={m} className="logo-chip"><img src={`/connectors/${m}.svg`} alt="" width={18} height={18} loading="lazy" />{{ openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', openrouter: 'OpenRouter', ollama: 'Ollama' }[m]}</li>)}</ul>
            </div>
          </div>
        </section>

        <section id="privacy" className="sec wrap reveal">
          <div className="priv">
            <div className="halftone" aria-hidden />
            <span className="sys">Local-first</span>
            <h2 className="display">Your data lives with you.</h2>
            <p className="lead">{NAME} runs on your own machine with your own database. No ads, no tracking, nothing sold.</p>
            <div className="priv-grid">
              <div><span className="tile"><LockKeyhole size={22} /></span><h3>Nothing syncs until you connect it</h3><p>Every source shows what it reads and where it goes. Export and delete for everything.</p></div>
              <div><span className="tile"><ShieldCheck size={22} /></span><h3>Keys encrypted at rest</h3><p>Connector keys are encrypted on your machine. Use a local model and nothing leaves it.</p></div>
              <div><span className="tile"><ServerCog size={22} /></span><h3>Self-host <span className="tag on-dark">Coming soon</span></h3><p>Run it on your own Mac with your own database. A hosted option follows for people who&apos;d rather not.</p></div>
            </div>
            <p className="note">This waitlist is separate: it only stores your email and the choices you make in the form.</p>
          </div>
        </section>

        <section id="faq" className="sec wrap reveal">
          <div className="faq">
            <div className="sec-head"><span className="sys">FAQ</span><h2 className="display">Questions, answered.</h2>{contactEmail ? <p>Something else? <a href={`mailto:${contactEmail}`} style={{ textDecoration: 'underline' }}>{contactEmail}</a></p> : <p>Something else? Reply to your waitlist email.</p>}</div>
            <div>
              {FAQ.map(([q, a]) => (
                <details key={q}><summary>{q}<ChevronDown size={20} aria-hidden /></summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section id="join" className="cta wrap reveal">
          <h2 className="display">Your next level starts tomorrow morning.</h2>
          <WaitlistForm tone="cta" expanded />
          <p className="maker">Built by one person who wanted a better way to change their own life.</p>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <Wordmark height={28} />
          <nav aria-label="Footer">
            {repoUrl ? <a href={repoUrl}>GitHub</a> : null}
            <a href="/privacy">Privacy</a>
            {contactEmail ? <a href={`mailto:${contactEmail}`}>Contact</a> : null}
            {licenseLabel ? <span>License: {licenseLabel}</span> : null}
          </nav>
          <small>© {new Date().getFullYear()} {NAME}. All trademarks belong to their owners.</small>
        </div>
      </footer>
    </>
  )
}
