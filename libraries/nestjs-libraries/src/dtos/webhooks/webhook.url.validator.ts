import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

export function isBlockedIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);

  if ([a, b].some((n) => Number.isNaN(n))) return true;

  return (
    a === 0 ||                       // 0.0.0.0/8
    a === 10 ||                      // 10.0.0.0/8
    a === 127 ||                     // 127.0.0.0/8
    (a === 169 && b === 254) ||      // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||      // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    a >= 224                         // multicast/reserved
  );
}

export function isBlockedIPv6(ip: string): boolean {
  let normalized: string;
  try { normalized = new URL(`https://[${ip}]/`).hostname.slice(1, -1).toLowerCase(); }
  catch { return true; }
  // WHATWG URL canonicalizes ::ffff:127.0.0.1 to ::ffff:7f00:1.
  // Check the embedded IPv4 after normalization in both the preflight and DNS pin.
  const mapped = normalized.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return isBlockedIPv4(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
  }
  const first = parseInt(normalized.split(':')[0] || '0', 16);

  return (
    normalized === '::1' ||          // loopback
    normalized === '::' ||           // unspecified
    (first & 0xffc0) === 0xfe80 ||   // all of link-local fe80::/10
    (first & 0xffc0) === 0xfec0 ||   // deprecated site-local fec0::/10
    (first & 0xfe00) === 0xfc00 ||   // unique local fc00::/7
    (first & 0xff00) === 0xff00      // multicast
  );
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIPv4(ip);
  }
  if (version === 6) {
    // IPv4-mapped IPv6 (::ffff:a.b.c.d) — extract and check as IPv4
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
      return isBlockedIPv4(mapped[1]);
    }
    return isBlockedIPv6(ip);
  }
  return true;
}

export async function isSafePublicHttpsUrl(value: unknown): Promise<boolean> {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  if (!parsed.hostname) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (hostname === 'localhost') {
    return false;
  }

  // If user supplied a literal IP directly, validate it immediately
  const literalIpVersion = net.isIP(hostname);
  if (literalIpVersion) {
    return !isBlockedIp(hostname);
  }

  try {
    const records = await dns.lookup(hostname, { all: true });

    if (!records.length) {
      return false;
    }

    for (const record of records) {
      if (isBlockedIp(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: 'IsSafeWebhookUrl', async: true })
export class IsSafeWebhookUrlConstraint implements ValidatorConstraintInterface {
  async validate(value: unknown, _args: ValidationArguments): Promise<boolean> {
    return isSafePublicHttpsUrl(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'URL must be a public HTTPS URL and must not resolve to localhost, private, loopback, or link-local addresses';
  }
}

export function IsSafeWebhookUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsSafeWebhookUrlConstraint,
    });
  };
}
