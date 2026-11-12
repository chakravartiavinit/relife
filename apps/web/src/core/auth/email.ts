import { mode } from './mode'

// Cloud sign-in by emailed one-time code (6 digits, 10-minute expiry, 5 attempts, sent with Resend) is a later phase
// (plan §2, §6). The RELIFE_MODE switch is in place, loopback trust is off in cloud mode, and `pairings.method = 'email'`
// is reserved. Until the email path exists, cloud mode signs in by pairing only, like self-host on another device.

export const emailSignInAvailable = () => false

export function startEmailSignIn(_email: string): never {
  throw new Error(mode() === 'cloud' ? 'Email sign-in is not available yet.' : 'Email sign-in is only for cloud mode.')
}
