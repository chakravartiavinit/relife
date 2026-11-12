import { ImageResponse } from 'next/og'
import { NAME } from '@/lib/site'

export const alt = `${NAME}: level up your real life`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Rendered at build time. Values mirror packages/tokens (ImageResponse can't read CSS variables).
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#f8fafc', position: 'relative' }}>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: '#1b1b1b', letterSpacing: -1 }}>{NAME}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 104, fontWeight: 800, color: '#1b1b1b', letterSpacing: -4, lineHeight: 1 }}>Level up</div>
          <div style={{ display: 'flex', fontSize: 104, fontWeight: 800, color: '#2f6fb8', letterSpacing: -4, lineHeight: 1.05 }}>your real life.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 26px', borderRadius: 20, background: '#fff', boxShadow: '0 8px 30px rgba(40,70,110,.18)', fontSize: 30, color: '#1b1b1b' }}>
            <div style={{ display: 'flex', width: 34, height: 34, borderRadius: 17, border: '3px solid #4a9be8', color: '#4a9be8', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>B</div>
            Walk 6,000 steps · +30 XP
          </div>
          <div style={{ display: 'flex', width: 300, height: 14, borderRadius: 7, background: '#e4e9ef' }}><div style={{ display: 'flex', width: 210, height: 14, borderRadius: 7, background: '#4a9be8' }} /></div>
        </div>
      </div>
    ),
    size,
  )
}
