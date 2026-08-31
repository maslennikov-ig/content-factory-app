import { XMLParser } from 'fast-xml-parser';
import { parse } from 'parse5';
import { SourceRegistryError } from './errors';

export type ParsedSourceEvidence = {
  excerpt: string;
  locator: Record<string, string | number | null>;
  structuredData?: Record<string, unknown>;
};

export type ParsedSourcePayload = {
  title: string | null;
  text: string;
  parser: 'bounded-html' | 'bounded-xml';
  parserVersion: '1';
  publishedAt?: Date | null;
  externalIdentity?: string | null;
  evidence: ParsedSourceEvidence[];
  rssTtlMinutes?: number | null;
};

export type SourceParserBudgets = {
  textCharacters: number;
  xmlDepth: number;
  xmlAttributes: number;
  xmlItems: number;
  xmlFieldCharacters: number;
  htmlNodes: number;
  htmlDepth: number;
};

const defaults: SourceParserBudgets = {
  textCharacters: 2_000_000,
  xmlDepth: 64,
  xmlAttributes: 64,
  xmlItems: 500,
  xmlFieldCharacters: 256 * 1024,
  htmlNodes: 50_000,
  htmlDepth: 128,
};

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function preflightMarkup(
  source: string,
  kind: 'HTML' | 'XML',
  budgets: SourceParserBudgets
) {
  let tokens = 0;
  let depth = 0;
  let items = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) !== 60) continue;
    const end = source.indexOf('>', index + 1);
    if (end < 0) break;
    tokens += 1;
    const maxTokens =
      kind === 'HTML'
        ? budgets.htmlNodes
        : budgets.htmlNodes + budgets.xmlItems * 20;
    if (tokens > maxTokens) {
      throw new SourceRegistryError(
        kind === 'XML' ? 'XML_POLICY' : 'PARSE_FAILED',
        `${kind} exceeds token limits`,
        422
      );
    }
    const token = source.slice(index + 1, Math.min(end, index + 8_192)).trim();
    const closing = token.startsWith('/');
    const declaration = token.startsWith('!') || token.startsWith('?');
    const selfClosing = token.endsWith('/');
    if (
      kind === 'XML' &&
      /^(?:[\w.-]+:)?(?:item|entry)(?:\s|$)/iu.test(token)
    ) {
      items += 1;
      if (items > budgets.xmlItems)
        throw new SourceRegistryError(
          'XML_POLICY',
          'Feed contains too many items',
          422
        );
    }
    if (!declaration) {
      if (closing) depth = Math.max(0, depth - 1);
      else if (!selfClosing) depth += 1;
      const limit = kind === 'HTML' ? budgets.htmlDepth : budgets.xmlDepth;
      if (depth > limit)
        throw new SourceRegistryError(
          kind === 'XML' ? 'XML_POLICY' : 'PARSE_FAILED',
          `${kind} is nested too deeply`,
          422
        );
    }
    index = end;
  }
}

function parseHtmlPayload(
  source: string,
  budgets: SourceParserBudgets
): ParsedSourcePayload {
  preflightMarkup(source, 'HTML', budgets);
  let document: any;
  try {
    document = parse(source);
  } catch {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'HTML could not be parsed',
      422
    );
  }
  const hidden = new Set(['script', 'style', 'template', 'noscript']);
  const fragments: string[] = [];
  const titleFragments: string[] = [];
  let nodes = 0;

  const walk = (
    node: any,
    depth: number,
    ignored: boolean,
    inTitle: boolean
  ) => {
    nodes += 1;
    if (nodes > budgets.htmlNodes || depth > budgets.htmlDepth) {
      throw new SourceRegistryError(
        'PARSE_FAILED',
        'HTML exceeds structural limits',
        422
      );
    }
    const name = String(node.nodeName || '').toLowerCase();
    const nextIgnored = ignored || hidden.has(name);
    const nextTitle = inTitle || name === 'title';
    if (
      !nextIgnored &&
      node.nodeName === '#text' &&
      typeof node.value === 'string'
    ) {
      if (nextTitle) titleFragments.push(node.value);
      else fragments.push(node.value);
    }
    for (const child of node.childNodes || []) {
      walk(child, depth + 1, nextIgnored, nextTitle);
    }
  };
  walk(document, 0, false, false);
  const text = normalizeText(fragments.join(' '));
  if (text.length > budgets.textCharacters) {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'HTML text exceeds limits',
      422
    );
  }
  const title = normalizeText(titleFragments.join(' ')) || null;
  return {
    title,
    text,
    parser: 'bounded-html',
    parserVersion: '1',
    evidence: text
      ? [{ excerpt: text.slice(0, 4_096), locator: { kind: 'document' } }]
      : [],
  };
}

function validateXmlStructure(source: string, budgets: SourceParserBudgets) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(source)) {
    throw new SourceRegistryError(
      'XML_POLICY',
      'DTD and entities are not allowed',
      422
    );
  }
  preflightMarkup(source, 'XML', budgets);

  let depth = 0;
  const tokenPattern = /<[^>]+>/gu;
  for (
    let match = tokenPattern.exec(source);
    match;
    match = tokenPattern.exec(source)
  ) {
    const token = match[0];
    if (/^<\?|^<!|^<\//u.test(token)) {
      if (/^<\//u.test(token)) depth = Math.max(0, depth - 1);
      continue;
    }
    const attributes = token.match(/\s+[\w:.-]+\s*=/gu) || [];
    if (attributes.length > budgets.xmlAttributes) {
      throw new SourceRegistryError(
        'XML_POLICY',
        'XML element has too many attributes',
        422
      );
    }
    if (!/\/>$/u.test(token)) {
      depth += 1;
      if (depth > budgets.xmlDepth) {
        throw new SourceRegistryError(
          'XML_POLICY',
          'XML is nested too deeply',
          422
        );
      }
    }
  }
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (Array.isArray(value)) return value.map(valueText).join(' ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['#text'] === 'string') return record['#text'];
    return Object.values(record).map(valueText).join(' ');
  }
  return '';
}

function firstValue(record: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    const value = normalizeText(valueText(record[key]));
    if (value) return value;
  }
  return '';
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
}

function parseXmlPayload(
  source: string,
  budgets: SourceParserBudgets
): ParsedSourcePayload {
  validateXmlStructure(source, budgets);
  let parsed: any;
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      processEntities: false,
      allowBooleanAttributes: false,
      parseTagValue: false,
      trimValues: true,
    }).parse(source);
  } catch {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'Feed XML could not be parsed',
      422
    );
  }

  const root = parsed?.rss?.channel || parsed?.feed;
  if (!root || typeof root !== 'object') {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'Payload is not RSS or Atom',
      422
    );
  }
  const rawItems = root.item ?? root.entry ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  const title = firstValue(root, 'title') || null;
  const evidence: ParsedSourceEvidence[] = [];
  const textParts: string[] = [];
  let publishedAt: Date | null = null;
  let externalIdentity: string | null = null;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    for (const value of Object.values(item)) {
      if (valueText(value).length > budgets.xmlFieldCharacters) {
        throw new SourceRegistryError(
          'XML_POLICY',
          'Feed field exceeds limits',
          422
        );
      }
    }
    const itemTitle = firstValue(item, 'title');
    const itemText = firstValue(
      item,
      'content',
      'encoded',
      'description',
      'summary'
    );
    const excerpt = normalizeText(
      [itemTitle, itemText].filter(Boolean).join(' — ')
    );
    const identity = firstValue(item, 'id', 'guid', 'link') || null;
    const date = parseDate(firstValue(item, 'published', 'updated', 'pubDate'));
    if (!publishedAt && date) publishedAt = date;
    if (!externalIdentity && identity) externalIdentity = identity;
    if (excerpt) {
      textParts.push(excerpt);
      evidence.push({
        excerpt: excerpt.slice(0, 4_096),
        locator: { kind: 'feed-item', index, identity },
        structuredData: {
          title: itemTitle || null,
          publishedAt: date?.toISOString() || null,
        },
      });
    }
  }
  const text = normalizeText(textParts.join('\n'));
  if (text.length > budgets.textCharacters) {
    throw new SourceRegistryError(
      'XML_POLICY',
      'Feed text exceeds limits',
      422
    );
  }
  return {
    title,
    text,
    parser: 'bounded-xml',
    parserVersion: '1',
    publishedAt,
    externalIdentity,
    evidence,
    rssTtlMinutes: (() => {
      const value = Number(firstValue(root, 'ttl'));
      return Number.isFinite(value) && value >= 0 ? value : null;
    })(),
  };
}

export function parseSourcePayload(
  kind: 'URL' | 'RSS',
  body: Buffer,
  metadata: { contentType: string; charset?: string | null },
  overrides: Partial<SourceParserBudgets> = {}
): ParsedSourcePayload {
  const budgets = { ...defaults, ...overrides };
  const charset = (metadata.charset || 'utf-8').toLowerCase();
  if (
    !['utf-8', 'utf8', 'us-ascii', 'iso-8859-1', 'windows-1252'].includes(
      charset
    )
  ) {
    throw new SourceRegistryError(
      'UNSUPPORTED_CONTENT_TYPE',
      'Source charset is not supported',
      415
    );
  }
  let source: string;
  try {
    source = new TextDecoder(charset).decode(body);
  } catch {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'Source text could not be decoded',
      422
    );
  }
  return kind === 'RSS'
    ? parseXmlPayload(source, budgets)
    : parseHtmlPayload(source, budgets);
}
