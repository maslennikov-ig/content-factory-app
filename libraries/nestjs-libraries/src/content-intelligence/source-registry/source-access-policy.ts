import { SourceRegistryError } from './errors';

export const ROBOTS_BUDGETS = Object.freeze({
  bytes: 512 * 1024,
  lines: 10_000,
  lineCharacters: 4_096,
});

const unreserved = /^[A-Za-z0-9._~-]$/u;

function normalizedOctets(value: string, rule: boolean): string[] {
  const octets: string[] = [];
  for (let index = 0; index < value.length; ) {
    const character = value[index];
    if (
      character === '%' &&
      /^[0-9A-Fa-f]{2}$/u.test(value.slice(index + 1, index + 3))
    ) {
      const byte = Number.parseInt(value.slice(index + 1, index + 3), 16);
      const decoded = String.fromCharCode(byte);
      octets.push(
        unreserved.test(decoded)
          ? decoded
          : `%${byte.toString(16).padStart(2, '0').toUpperCase()}`
      );
      index += 3;
      continue;
    }
    const codePoint = value.codePointAt(index) as number;
    const literal = String.fromCodePoint(codePoint);
    if (rule && (literal === '*' || literal === '$')) octets.push(literal);
    else if (!rule && (literal === '*' || literal === '$')) {
      octets.push(`%${codePoint.toString(16).padStart(2, '0').toUpperCase()}`);
    } else if (codePoint <= 0x7f) octets.push(literal);
    else {
      for (const byte of new TextEncoder().encode(literal)) {
        octets.push(`%${byte.toString(16).padStart(2, '0').toUpperCase()}`);
      }
    }
    index += literal.length;
  }
  return octets;
}

function robotsRuleMatches(rulePath: string, requestPath: string): boolean {
  const pattern = normalizedOctets(rulePath, true);
  const anchored = pattern.at(-1) === '$';
  if (anchored) pattern.pop();
  const path = normalizedOctets(requestPath, false);
  let patternIndex = 0;
  let pathIndex = 0;
  let starIndex = -1;
  let starMatch = 0;
  while (pathIndex < path.length) {
    if (patternIndex === pattern.length) return !anchored;
    if (pattern[patternIndex] === path[pathIndex]) {
      patternIndex += 1;
      pathIndex += 1;
    } else if (pattern[patternIndex] === '*') {
      starIndex = patternIndex;
      patternIndex += 1;
      starMatch = pathIndex;
    } else if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      starMatch += 1;
      pathIndex = starMatch;
    } else return false;
  }
  while (pattern[patternIndex] === '*') patternIndex += 1;
  return patternIndex === pattern.length || !anchored;
}

function ruleSpecificity(rulePath: string): number {
  const octets = normalizedOctets(rulePath, true);
  if (octets.at(-1) === '$') octets.pop();
  return octets.filter((octet) => octet !== '*').length;
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/gu, '');
}

export function parseDeniedDomains(value?: string): string[] {
  return [
    ...new Set((value || '').split(',').map(normalizeDomain).filter(Boolean)),
  ].sort();
}

export function assertDomainAllowed(
  url: string,
  deniedDomains: string[]
): void {
  const hostname = normalizeDomain(
    new URL(url).hostname.replace(/^\[|\]$/gu, '')
  );
  if (
    deniedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    )
  ) {
    throw new SourceRegistryError(
      'TERMS_DENIED',
      'Source domain is denied by operator policy',
      403
    );
  }
}

export function robotsUrlFor(sourceUrl: string): string {
  const parsed = new URL(sourceUrl);
  return `${parsed.origin}/robots.txt`;
}

export function assertRobotsAllowed(body: Buffer, sourceUrl: string): void {
  if (body.length > ROBOTS_BUDGETS.bytes) {
    throw new SourceRegistryError(
      'ROBOTS_DISALLOWED',
      'Robots policy exceeds limits',
      409
    );
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  const lines = text.split(/\r?\n/u);
  if (
    lines.length > ROBOTS_BUDGETS.lines ||
    lines.some((line) => line.length > ROBOTS_BUDGETS.lineCharacters)
  ) {
    throw new SourceRegistryError(
      'ROBOTS_DISALLOWED',
      'Robots policy exceeds limits',
      409
    );
  }
  const groups: Array<{
    agents: string[];
    rules: Array<{ allow: boolean; path: string }>;
  }> = [];
  let group: (typeof groups)[number] | undefined;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/u, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === 'user-agent') {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((name === 'allow' || name === 'disallow') && group) {
      group.rules.push({ allow: name === 'allow', path: value });
    }
  }
  const exact = groups.filter((candidate) =>
    candidate.agents.includes('contentfactorysourceregistry')
  );
  const applicable = exact.length
    ? exact
    : groups.filter((candidate) => candidate.agents.includes('*'));
  const path = `${new URL(sourceUrl).pathname}${new URL(sourceUrl).search}`;
  const matches = applicable
    .flatMap((candidate) => candidate.rules)
    .filter((rule) => rule.path && robotsRuleMatches(rule.path, path));
  matches.sort(
    (a, b) =>
      ruleSpecificity(b.path) - ruleSpecificity(a.path) ||
      Number(b.allow) - Number(a.allow)
  );
  if (matches[0] && !matches[0].allow) {
    throw new SourceRegistryError(
      'ROBOTS_DISALLOWED',
      'Robots policy disallows this source',
      409
    );
  }
}
