import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { URL } from 'node:url'

export interface LookupAddress {
  address: string
  family: 4 | 6
}

export type LookupImpl = (hostname: string, options: { all: true }) => Promise<LookupAddress[]>

const lookupHost: LookupImpl = async (hostname, options) => {
  const results = await dnsLookup(hostname, options)
  return results.map(result => {
    if (result.family !== 4 && result.family !== 6) throw new Error('Unexpected DNS address family.')
    return { address: result.address, family: result.family }
  })
}

function parseIpv4(address: string): number | null {
  const octets = address.split('.')
  if (octets.length !== 4) return null
  const values = octets.map(value => Number(value))
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null
  return (((values[0] * 256 + values[1]) * 256 + values[2]) * 256 + values[3]) >>> 0
}

function ipv4InRange(address: number, start: number, end: number): boolean {
  return address >= start && address <= end
}

function parseIpv6(address: string): bigint | null {
  const value = address.toLowerCase().split('%')[0]
  if (!value || value.includes('%')) return null
  const halves = value.split('::')
  if (halves.length > 2) return null
  const parseParts = (part: string): number[] | null => {
    if (!part) return []
    const parts = part.split(':')
    const result: number[] = []
    for (const item of parts) {
      if (item.includes('.')) {
        const ipv4 = parseIpv4(item)
        if (ipv4 === null) return null
        result.push(ipv4 >>> 16, ipv4 & 0xffff)
      } else if (/^[0-9a-f]{1,4}$/.test(item)) {
        result.push(Number.parseInt(item, 16))
      } else {
        return null
      }
    }
    return result
  }
  const left = parseParts(halves[0])
  const right = parseParts(halves[1] ?? '')
  if (!left || !right || (halves.length === 1 ? left.length !== 8 : left.length + right.length >= 8)) return null
  const groups = halves.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
  return groups.reduce((result, group) => (result << 16n) | BigInt(group), 0n)
}

function ipv6InRange(address: bigint, prefix: bigint, bits: number): boolean {
  const shift = 128n - BigInt(bits)
  return (address >> shift) === (prefix >> shift)
}

function isBlockedIpv4(address: string): boolean {
  const value = parseIpv4(address)
  if (value === null) return true
  return [
    [0x00000000, 0x00ffffff], // "this" network
    [0x0a000000, 0x0affffff], // private
    [0x64400000, 0x647fffff], // shared address space / CGNAT
    [0x7f000000, 0x7fffffff], // loopback
    [0xa9fe0000, 0xa9feffff], // link-local
    [0xac100000, 0xac1fffff], // private
    [0xc0000000, 0xc00000ff], // IETF protocol assignments
    [0xc0000200, 0xc00002ff], // documentation
    [0xc01fc400, 0xc01fc4ff], // AS112
    [0xc034c100, 0xc034c1ff], // AMT
    [0xc0586300, 0xc05863ff], // deprecated 6to4 relay anycast
    [0xc0a80000, 0xc0a8ffff], // private
    [0xc0af3000, 0xc0af30ff], // AS112
    [0xc6120000, 0xc613ffff], // benchmarking
    [0xc6336400, 0xc63364ff], // documentation
    [0xcb007100, 0xcb0071ff], // documentation
    [0xe0000000, 0xefffffff], // multicast
    [0xf0000000, 0xffffffff], // reserved/future use
  ].some(([start, end]) => ipv4InRange(value, start, end))
}

function isBlockedIpv6(address: string): boolean {
  const value = parseIpv6(address)
  if (value === null) return true
  const blockedRanges: Array<[string, number]> = [
    ['::', 96], // unspecified, IPv4-compatible, and other legacy special addresses
    ['::ffff:0:0', 96], // IPv4-mapped (also catches mapped private/loopback values)
    ['64:ff9b::', 96], // well-known IPv4/IPv6 translation
    ['64:ff9b:1::', 48], // IPv4/IPv6 translation
    ['100::', 64], // discard-only
    ['100:0:0:1::', 64], // dummy IPv6 prefix (RFC 9780)
    ['2001::', 23], // IETF protocol assignments: Teredo, AMT, AS112-v6, benchmarking, ORCHID/ORCHIDv2, DRiP
    ['2001:db8::', 32], // documentation
    ['2002::', 16], // 6to4 transition
    ['2620:4f:8000::', 48], // direct delegation AS112 service
    ['3fff::', 20], // documentation
    ['5f00::', 16], // segment routing (SRv6) SIDs
    ['fc00::', 7], // unique local
    ['fe80::', 10], // link-local
    ['fec0::', 10], // deprecated site-local
    ['ff00::', 8], // multicast
  ]
  return blockedRanges.some(([prefix, bits]) => {
    const parsedPrefix = parseIpv6(prefix)
    return parsedPrefix !== null && ipv6InRange(value, parsedPrefix, bits)
  })
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return true
}

export function normalizeBaseUrl(baseUrl: string | undefined, subdomain: string | undefined): string {
  if (baseUrl === undefined && subdomain) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(subdomain)) {
      throw new Error('Zendesk base URL is invalid.')
    }
  }

  const configured = baseUrl ?? (subdomain ? `https://${subdomain}.zendesk.com` : '')
  if (!configured) return ''
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new Error('Zendesk base URL is invalid.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('Zendesk base URL is invalid.')
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function isSafeLookupResult(value: unknown): value is LookupAddress {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<LookupAddress>
  if (typeof result.address !== 'string' || (result.family !== 4 && result.family !== 6)) return false
  return isIP(result.address) === result.family && !isBlockedAddress(result.address)
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.replace(/\.+$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === 'localhost.localdomain'
    || normalized.endsWith('.localhost.localdomain')
    || normalized === 'local'
    || normalized.endsWith('.local')
    || normalized === 'ip6-localhost'
    || normalized === 'ip6-loopback'
    || normalized === 'ip6-allnodes'
    || normalized === 'ip6-allrouters'
    || normalized === 'broadcasthost'
}

export async function assertSafeUrl(url: URL, lookupImpl: LookupImpl = lookupHost): Promise<void> {
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('Zendesk URL host is not allowed.')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!hostname || isLocalHostname(hostname)) {
    throw new Error('Zendesk URL host is not allowed.')
  }
  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error('Zendesk URL host is not allowed.')
    return
  }
  let results: LookupAddress[]
  try {
    results = await lookupImpl(hostname, { all: true })
  } catch {
    throw new Error('Zendesk URL host could not be verified.')
  }
  if (!Array.isArray(results) || !results.length || results.some(result => !isSafeLookupResult(result))) {
    throw new Error('Zendesk URL host is not allowed.')
  }
}
