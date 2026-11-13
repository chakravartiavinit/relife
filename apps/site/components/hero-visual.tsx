import { Brain, Check, Code, Flame, GitCommitHorizontal, HeartPulse, Palette, Snowflake, Users, Wallet } from 'lucide-react'
import { Capsule } from './capsule'

// The Today screen with mock data, built in HTML so it stays sharp and weighs nothing.
// The quest row fills once on load (CSS only); the base styles are the final, fully readable frame.
const LEVELS = [[HeartPulse, 'var(--cat-health)', 21], [Brain, 'var(--cat-mind)', 12], [Code, 'var(--cat-skills)', 16], [Wallet, 'var(--cat-wealth)', 7], [Palette, 'var(--cat-hobbies)', 8], [Users, 'var(--cat-relationships)', 6]] as const
const SYNCED = ['github', 'strava', 'hevy', 'steam', 'binance']

export function HeroVisual() {
  return (
    <div className="stage" aria-label="Preview of the Today screen with example data" role="img">
      <div className="win">
        <div className="win-bar" aria-hidden><i /><i /><i /><b>Today</b></div>
        <div className="win-body" aria-hidden>
          <div className="char">
            <div className="halftone" style={{ inset: '0 0 auto auto', width: 200, height: 130 }} />
            <div className="char-top">
              <Capsule letter="A" size="lg" />
              <div>
                <h3>Still up, Alex.</h3>
                <div className="char-meta"><span className="lv num">Lv 12</span><span>Pathfinder</span></div>
              </div>
            </div>
            <div>
              <div className="xp play"><span style={{ ['--w' as string]: '74%' }} /></div>
              <div className="xp-row num" style={{ marginTop: 8 }}><span>340 XP to Lv 13</span><b>+<span className="ticker" />&nbsp;XP today</b></div>
            </div>
            <div className="streak play">
              <Flame className="flame" size={26} strokeWidth={2.2} />
              <div><b className="num">12 day streak</b><small>Kept today</small></div>
              <span className="freeze"><Snowflake size={16} />2</span>
            </div>
            <ul className="areas-mini">
              {LEVELS.map(([Icon, c, lv]) => <li key={lv} style={{ ['--c' as string]: c }}><span><Icon size={14} strokeWidth={2.25} /></span><b className="num">Lv {lv}</b></li>)}
            </ul>
          </div>

          <div className="quests">
            <h3><span>Today&apos;s quests</span><span className="num">2 left</span></h3>
            <div className="q play done" style={{ ['--c' as string]: 'var(--good)' }}>
              <span className="rank swap"><b className="off" style={{ color: 'var(--cat-health)' }}>B</b><Check className="on" size={16} strokeWidth={3} /></span>
              <div><b>Walk 6,000 steps</b><small>You averaged 5,100 this week. One step up.</small></div>
              <span className="xpchip num">+30 XP</span>
              <div className="bar"><span style={{ ['--w' as string]: '100%' }} /></div>
            </div>
            <div className="q" style={{ ['--c' as string]: 'var(--cat-skills)' }}>
              <span className="rank">C</span>
              <div><b>Ship 3 commits</b><small>Auto from GitHub · 2 of 3</small></div>
              <span className="xpchip num">+40 XP</span>
              <div className="bar"><span style={{ ['--w' as string]: '66%' }} /></div>
            </div>
            <div className="q" style={{ ['--c' as string]: 'var(--cat-mind)' }}>
              <span className="rank">D</span>
              <div><b>Lights out by 23:30</b><small>From sleep sync</small></div>
              <span className="xpchip num">+25 XP</span>
              <div className="bar"><span style={{ ['--w' as string]: '20%' }} /></div>
            </div>
            <div className="q done" style={{ ['--c' as string]: 'var(--good)' }}>
              <span className="rank"><Check size={16} strokeWidth={3} /></span>
              <div><b>Read 20 pages</b><small>Logged at 07:40</small></div>
              <span className="xpchip num">+25 XP</span>
            </div>
          </div>
        </div>
      </div>

      <div className="float sync" aria-hidden>
        <span className="sys" style={{ ['--c' as string]: 'var(--good)' }}>Synced 2 min ago</span>
        <div className="row">{SYNCED.map((n) => <img key={n} src={`/connectors/${n}.svg`} alt="" width={22} height={22} />)}</div>
      </div>
      <div className="float note" aria-hidden>
        <span className="ic-tile"><GitCommitHorizontal size={18} /></span>
        <div><b>The System</b><p>Rough night. Walk 4,000 steps counts today.</p></div>
        <time>11:40</time>
      </div>
    </div>
  )
}

