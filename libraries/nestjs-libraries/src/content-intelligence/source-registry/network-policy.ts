import dns from 'node:dns';
import net from 'node:net';
import { SourceRegistryError } from './errors';

export type PinnedAddress = { address: string; family: 4 | 6 };
export type SourceDnsResolver = (
  hostname: string,
  timeoutMs?: number
) => Promise<PinnedAddress[]>;

type Ipv4Range = readonly [number, number];

type RegistryRange = Readonly<{ prefix: string; length: number }>;

/**
 * Accepted, reviewable source-network policy snapshot.
 *
 * The IANA registries are the source for non-global ranges. Translation,
 * transition, mapped and multicast prefixes stay denied even where an IANA
 * entry permits limited global forwarding: the source gateway accepts only
 * ordinary public unicast endpoints, not protocol gateways.
 */
export const ACCEPTED_IANA_SPECIAL_REGISTRY = Object.freeze({
  version: '2026-08-20',
  sources: Object.freeze([
    'https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml',
    'https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml',
  ]),
  ipv4Deny: Object.freeze<RegistryRange[]>([
    { prefix: '0.0.0.0', length: 8 },
    { prefix: '10.0.0.0', length: 8 },
    { prefix: '100.64.0.0', length: 10 },
    { prefix: '127.0.0.0', length: 8 },
    { prefix: '169.254.0.0', length: 16 },
    { prefix: '172.16.0.0', length: 12 },
    { prefix: '192.0.0.0', length: 24 },
    { prefix: '192.0.2.0', length: 24 },
    { prefix: '192.88.99.0', length: 24 },
    { prefix: '192.168.0.0', length: 16 },
    { prefix: '198.18.0.0', length: 15 },
    { prefix: '198.51.100.0', length: 24 },
    { prefix: '203.0.113.0', length: 24 },
    { prefix: '224.0.0.0', length: 4 },
    { prefix: '240.0.0.0', length: 4 },
  ]),
  ipv6Deny: Object.freeze<RegistryRange[]>([
    { prefix: '::', length: 128 },
    { prefix: '::', length: 96 },
    { prefix: '::1', length: 128 },
    { prefix: '::ffff:0:0', length: 96 },
    { prefix: '::ffff:0:0:0', length: 96 },
    { prefix: '64:ff9b::', length: 96 },
    { prefix: '64:ff9b:1::', length: 48 },
    { prefix: '100::', length: 64 },
    { prefix: '100:0:0:1::', length: 64 },
    { prefix: '2001::', length: 23 },
    { prefix: '2001:db8::', length: 32 },
    { prefix: '2002::', length: 16 },
    { prefix: '3fff::', length: 20 },
    { prefix: '5f00::', length: 16 },
    { prefix: 'fc00::', length: 7 },
    { prefix: 'fe80::', length: 10 },
    { prefix: 'ff00::', length: 8 },
  ]),
});

const blockedIpv4: Ipv4Range[] = ACCEPTED_IANA_SPECIAL_REGISTRY.ipv4Deny.map(
  ({ prefix, length }) => [ipv4Number(prefix), length]
);

const blockedIpv6: ReadonlyArray<readonly [bigint, number]> =
  ACCEPTED_IANA_SPECIAL_REGISTRY.ipv6Deny.map(({ prefix, length }) => [
    ipv6Number(prefix),
    length,
  ]);

function ipv4Number(address: string): number {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    throw new Error('Invalid IPv4 address');
  }
  return (
    ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]
  );
}

function normalizeIpv6Parts(address: string): number[] {
  const raw = address.toLowerCase().split('%', 1)[0];
  if (raw.includes('.')) {
    const lastColon = raw.lastIndexOf(':');
    if (lastColon < 0) throw new Error('Invalid embedded IPv4 address');
    const ipv4 = ipv4Number(raw.slice(lastColon + 1));
    address = `${raw.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(
      16
    )}:${(ipv4 & 0xffff).toString(16)}`;
  } else {
    address = raw;
  }

  if ((address.match(/::/g) || []).length > 1) {
    throw new Error('Invalid IPv6 address');
  }
  const [leftRaw, rightRaw] = address.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const omitted = address.includes('::') ? 8 - left.length - right.length : 0;
  if (omitted < 0 || (!address.includes('::') && left.length !== 8)) {
    throw new Error('Invalid IPv6 address');
  }
  const parts = [...left, ...Array(omitted).fill('0'), ...right].map((part) => {
    if (!/^[0-9a-f]{1,4}$/.test(part)) throw new Error('Invalid IPv6 address');
    return Number.parseInt(part, 16);
  });
  if (parts.length !== 8) throw new Error('Invalid IPv6 address');
  return parts;
}

function ipv6Number(address: string): bigint {
  return normalizeIpv6Parts(address).reduce(
    (value, part) => (value << BigInt(16)) | BigInt(part),
    BigInt(0)
  );
}

function inIpv4Range(address: number, [base, prefix]: Ipv4Range): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) >>> 0 === (base & mask) >>> 0;
}

function inIpv6Range(
  address: bigint,
  [base, prefix]: readonly [bigint, number]
): boolean {
  const shift = BigInt(128 - prefix);
  return address >> shift === base >> shift;
}

export function isPublicGlobalAddress(address: string): boolean {
  const family = net.isIP(address);
  try {
    if (family === 4) {
      const value = ipv4Number(address);
      return !blockedIpv4.some((range) => inIpv4Range(value, range));
    }
    if (family === 6) {
      const value = ipv6Number(address);
      return !blockedIpv6.some((range) => inIpv6Range(value, range));
    }
  } catch {
    return false;
  }
  return false;
}

export function canonicalizeSourceUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    throw new SourceRegistryError('INVALID_URL', 'Source URL is invalid');
  }
  if (parsed.protocol !== 'https:') {
    throw new SourceRegistryError(
      'UNSUPPORTED_PROTOCOL',
      'Only HTTPS sources are supported'
    );
  }
  if (!parsed.hostname) {
    throw new SourceRegistryError('INVALID_URL', 'Source URL has no hostname');
  }
  if (parsed.username || parsed.password) {
    throw new SourceRegistryError(
      'URL_CREDENTIALS',
      'Credentials are not allowed in source URLs'
    );
  }
  if (parsed.port && parsed.port !== '443') {
    throw new SourceRegistryError(
      'UNSUPPORTED_PORT',
      'Only the default HTTPS port is supported'
    );
  }
  parsed.hash = '';
  return new URL(parsed.toString()).toString();
}

export function redactSourceUrl(input: string): string {
  const parsed = new URL(canonicalizeSourceUrl(input));
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

export const systemSourceDnsResolver: SourceDnsResolver = async (
  hostname,
  timeoutMs = 2_000
) => {
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(
      () =>
        reject(new SourceRegistryError('TIMEOUT', 'DNS lookup timed out', 504)),
      timeoutMs
    );
    timer.unref?.();
  });
  let records: dns.LookupAddress[];
  try {
    records = await Promise.race([
      dns.promises.lookup(hostname, { all: true, verbatim: true }),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof SourceRegistryError) throw error;
    throw new SourceRegistryError(
      'DNS_UNSAFE',
      'Source hostname could not be resolved'
    );
  }
  const normalized = records.map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
  if (
    normalized.length === 0 ||
    normalized.some(
      ({ address, family }) =>
        (family !== 4 && family !== 6) || !isPublicGlobalAddress(address)
    )
  ) {
    throw new SourceRegistryError(
      'DNS_UNSAFE',
      'Source hostname is not globally reachable'
    );
  }
  return normalized;
};

export async function resolvePublicSourceHop(
  url: string,
  resolver: SourceDnsResolver = systemSourceDnsResolver,
  timeoutMs = 2_000
): Promise<{ url: string; hostname: string; addresses: PinnedAddress[] }> {
  const canonical = canonicalizeSourceUrl(url);
  const parsed = new URL(canonical);
  const hostname = parsed.hostname.replace(/^\[|\]$/gu, '');
  if (net.isIP(hostname)) {
    if (!isPublicGlobalAddress(hostname)) {
      throw new SourceRegistryError(
        'DNS_UNSAFE',
        'Source address is not globally reachable'
      );
    }
    return {
      url: canonical,
      hostname,
      addresses: [{ address: hostname, family: net.isIP(hostname) as 4 | 6 }],
    };
  }
  const addresses = await resolver(hostname, timeoutMs);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicGlobalAddress(address))
  ) {
    throw new SourceRegistryError(
      'DNS_UNSAFE',
      'Source hostname is not globally reachable'
    );
  }
  return { url: canonical, hostname, addresses };
}
