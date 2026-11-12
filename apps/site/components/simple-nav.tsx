import { Wordmark } from './wordmark'
import { NAME } from '@/lib/site'

/** Header for the pages that aren't the landing page. */
export function SimpleNav() {
  return (
    <header className="nav">
      <div className="wrap">
        <a href="/" aria-label={`${NAME} home`}><Wordmark /></a>
        <a href="/#waitlist" className="btn secondary sm">Join the waitlist</a>
      </div>
    </header>
  )
}
