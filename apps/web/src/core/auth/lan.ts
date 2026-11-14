import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

// What this machine looks like from the network, for "Use on your phone": its private IPv4 addresses and whether it runs in Docker.

const PRIVATE = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/

/** Non-internal IPv4 addresses in 10/8, 172.16/12 or 192.168/16, on any interface. */
export function lanIps(): string[] {
  const ips: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && PRIVATE.test(a.address) && !ips.includes(a.address)) ips.push(a.address)
  }
  return ips
}

/** A container's own address is not one a phone can reach. */
export const inDocker = () => existsSync('/.dockerenv')
