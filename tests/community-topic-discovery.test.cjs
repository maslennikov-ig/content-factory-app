require('reflect-metadata');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const diagnostics = [];
const { CommunityTopicDiscoveryService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/community-topic-discovery.service.ts',
  { '@nestjs/common': { Injectable: () => (target) => target, Optional: () => () => {},
    Logger: class { warn(value) { diagnostics.push(value); } } } }
);
const NOW = new Date('2026-10-01T12:00:00Z');
const DATE = '2026-09-30T12:00:00Z';
const hn = (id, overrides = {}) => ({ id, type: 'story', title: 'Temporal new workflow', url: `https://example.org/story/${id}`,
  time: Date.parse(DATE) / 1000, score: id, descendants: 2, ...overrides });
const gh = (id, overrides = {}) => ({ html_url: `https://github.com/public/repo/issues/${id}`, title: 'Temporal issue',
  body: 'Temporal workflow details', created_at: DATE, comments: id, ...overrides });
const atom = (id, overrides = {}) => `<entry><id>${overrides.id || `http://arxiv.org/abs/2610.${String(id).padStart(5, '0')}v1`}</id><title>${overrides.title ?? 'Temporal learning'}</title><summary>Temporal workflow analysis</summary>${overrides.date === null ? '' : `<published>${overrides.date || DATE}</published>`}<updated>${DATE}</updated></entry>`;
function storeFor(clock, alwaysAdmit = false) {
  const data = new Map();
  return { data,
    get: jest.fn(async (key) => { const entry = data.get(key); return entry && entry.until > clock().getTime() ? entry.value : null; }),
    set: jest.fn(async (key, value, px, duration, nx) => {
      const entry = data.get(key);
      if (!alwaysAdmit && nx === 'NX' && entry?.until > clock().getTime()) return null;
      data.set(key, { value, until: clock().getTime() + duration }); return 'OK';
    }),
  };
}
function stand({ stories = [hn(1), hn(2, { score: 100 })], issues = [gh(1), gh(2, { comments: 99 })],
  entries = [atom(1), atom(2, { date: '2026-10-01T01:00:00Z' })], response, resolver, options = {}, store, alwaysAdmit = false } = {}) {
  let time = NOW.getTime();
  const now = () => new Date(time);
  const admission = store === null ? undefined : store || storeFor(now, alwaysAdmit);
  const reads = [];
  const fetcher = jest.fn(async (address, init) => {
    reads.push({ url: new URL(address), init });
    const overridden = response?.(address, init);
    if (overridden) return overridden;
    const url = new URL(address);
    if (url.pathname.endsWith('newstories.json')) return new Response(JSON.stringify(stories.map((item) => item.id)), { headers: { 'content-type': 'application/json' } });
    if (url.pathname.includes('/item/')) {
      const id = Number(url.pathname.match(/item\/(\d+)/)[1]);
      return new Response(JSON.stringify(stories.find((item) => item.id === id)), { headers: { 'content-type': 'application/json' } });
    }
    if (url.hostname === 'api.github.com') return new Response(JSON.stringify({ items: issues }), { headers: { 'content-type': 'application/json' } });
    return new Response(`<feed xmlns="http://www.w3.org/2005/Atom">${entries.join('')}</feed>`, { headers: { 'content-type': 'application/atom+xml' } });
  });
  const collector = new CommunityTopicDiscoveryService(admission, { fetcher,
    resolver: resolver || (async () => [{ address: '93.184.216.34', family: 4 }]), now, ...options });
  return { collector, store: admission, fetcher, reads, advance: (ms) => { time += ms; }, now };
}
const environment = ['RESEARCH_GLOBAL_KILL_SWITCH', 'RESEARCH_TENANT_KILL_SWITCHES', 'RESEARCH_PROVIDER_KILL_SWITCHES', 'SOURCE_DENIED_DOMAINS'];
let saved;
beforeEach(() => { saved = Object.fromEntries(environment.map((key) => [key, process.env[key]])); environment.forEach((key) => delete process.env[key]); diagnostics.length = 0; });
afterEach(() => { environment.forEach((key) => { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }); });

test('missing or unavailable Redis fails closed without outbound requests', async () => {
  for (const store of [null, { get: async () => { throw new Error('redis://private:secret'); }, set: async () => 'OK' }]) {
    const s = stand({ store });
    expect(await s.collector.check('org-a', 'Temporal', 30)).toEqual({ disabled: false, items: [] });
    expect(s.fetcher).not.toHaveBeenCalled();
  }
  expect(diagnostics.join(' ')).not.toContain('secret');
});
test('real metadata ranks inside providers then interleaves without comparing votes across platforms', async () => {
  const s = stand();
  const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(result.items.map((item) => item.externalId)).toEqual([
    'https://example.org/story/2', 'https://github.com/public/repo/issues/2', 'https://arxiv.org/abs/2610.00002v1',
    'https://example.org/story/1', 'https://github.com/public/repo/issues/1', 'https://arxiv.org/abs/2610.00001v1',
  ]);
  expect(result.items[0].reason.ru).toContain('100 баллов');
  expect(result.items[1].reason.ru).toContain('99 комментариев');
  expect(result.items[2].reason.en).toContain('unknown');
  expect(result.items.every((item) => item.publishedAt instanceof Date)).toBe(true);
  expect(result.items[2]).not.toHaveProperty('engagement');
  const github = s.reads.find((row) => row.url.hostname === 'api.github.com');
  expect(github.url.searchParams.get('q')).toBe('temporal is:issue is:public in:title,body created:2026-09-01..2026-10-01');
  expect(github.url.searchParams.get('sort')).toBe('comments');
  expect(s.reads.every((row) => row.init.redirect === 'manual' && row.init.dispatcher && row.init.signal)).toBe(true);
  expect(s.reads.every((row) => !JSON.stringify(row.init.headers).match(/authorization|api.key/i))).toBe(true);
});
test('undated, future, old, deleted, wrong-topic, PR, private, malformed and duplicate rows are excluded', async () => {
  const stories = [hn(1), hn(2, { deleted: true }), hn(3, { dead: true }), hn(4, { type: 'comment' }),
    hn(5, { time: undefined }), hn(6, { time: Date.parse('2026-10-02') / 1000 }), hn(7, { time: Date.parse('2026-01-01') / 1000 }),
    hn(8, { title: 'Unrelated apples' }), hn(9, { url: 'http://example.org/insecure' }), hn(10, { url: 'https://127.0.0.1/private' }),
    hn(11, { url: 'https://example.org/story/1#tracking' }), hn(12, { score: null })];
  const issues = [gh(1), gh(2, { created_at: null }), gh(3, { pull_request: {} }), gh(4, { repository: { private: true } }),
    gh(5, { comments: undefined }), gh(6, { html_url: 'https://github.com/public/repo/pull/6' })];
  const entries = [atom(1), atom(2, { date: null }), atom(3, { date: '2026-10-02' }), atom(4, { date: '2026-01-01' }),
    atom(5, { id: 'https://arxiv.org/pdf/2610.00005' })];
  const result = await stand({ stories, issues, entries }).collector.check('org-a', 'Temporal', 30);
  expect(result.items.map((item) => item.sourceUrl)).toEqual(['https://example.org/story/1', 'https://github.com/public/repo/issues/1', 'https://arxiv.org/abs/2610.00001v1']);
});
test('HN has one list, at most twenty story reads, no comment expansion; final selection is capped', async () => {
  const s = stand({ stories: Array.from({ length: 40 }, (_, i) => hn(i + 1)),
    issues: Array.from({ length: 40 }, (_, i) => gh(i + 1)), entries: Array.from({ length: 20 }, (_, i) => atom(i + 1)) });
  const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(result.items).toHaveLength(20);
  expect(s.reads).toHaveLength(23);
  expect(s.reads.filter((row) => row.url.pathname.includes('/item/'))).toHaveLength(20);
  expect(s.reads.filter((row) => row.url.hostname === 'api.github.com')).toHaveLength(1);
  expect(s.reads.filter((row) => row.url.hostname === 'export.arxiv.org')).toHaveLength(1);
});
test('15-minute tenant/topic/window cache returns fromCache and cannot be corrupted by a consumer', async () => {
  const s = stand();
  const first = await s.collector.check('org-a', 'Temporal', 30);
  first.items[0].title = 'corrupted'; first.items[0].publishedAt.setFullYear(1990);
  const cached = await s.collector.check('org-a', 'Temporal', 30);
  expect(cached.fromCache).toBe(true); expect(cached.items[0].title).not.toBe('corrupted'); expect(s.reads).toHaveLength(5);
  expect((await s.collector.check('org-b', 'Temporal', 30)).fromCache).toBeUndefined();
  expect((await s.collector.check('org-a', 'Temporal workflows', 30)).fromCache).toBeUndefined();
  expect((await s.collector.check('org-a', 'Temporal', 7)).fromCache).toBeUndefined();
  // Pacing refusals are not cached as factual empty results.
  s.advance(61_000);
  expect((await s.collector.check('org-b', 'Temporal', 30)).items).toHaveLength(6);
  s.advance(15 * 60_000);
  expect((await s.collector.check('org-a', 'Temporal', 30)).fromCache).toBeUndefined();
});
test('bounded cache evicts old tenant keys rather than growing indefinitely', async () => {
  const s = stand({ alwaysAdmit: true, stories: [], issues: [], entries: [] });
  for (let index = 0; index < 101; index++) await s.collector.check(`org-${index}`, 'Temporal', 30);
  expect((await s.collector.check('org-100', 'Temporal', 30)).fromCache).toBe(true);
  expect((await s.collector.check('org-0', 'Temporal', 30)).fromCache).toBeUndefined();
});
test('shared leases block a second process/tenant, GH for >=60s and arXiv for >=3s', async () => {
  const first = stand(); await first.collector.check('org-a', 'Temporal', 30);
  const second = stand({ store: first.store });
  expect((await second.collector.check('org-b', 'Temporal', 30)).items).toHaveLength(0); expect(second.reads).toHaveLength(0);
  first.advance(3_001); second.advance(3_001);
  expect((await second.collector.check('org-b', 'Temporal', 30)).items).toHaveLength(0);
  first.advance(28_000); second.advance(28_000);
  await second.collector.check('org-b', 'Temporal', 30);
  expect(second.reads.some((row) => row.url.hostname === 'api.github.com')).toBe(false);
  expect(second.reads.some((row) => row.url.hostname === 'export.arxiv.org')).toBe(true);
});
test.each(['403', '429'])('HTTP %s sets shared Retry-After/reset backoff and keeps successful providers', async (status) => {
  const until = Math.floor(NOW.getTime() / 1000) + 2 * 60 * 60;
  const s = stand({ response: (address) => address.includes('api.github.com') ? new Response('secret provider detail',
    { status: Number(status), headers: { 'retry-after': '3700', 'x-ratelimit-reset': String(until) } }) : undefined });
  const first = await s.collector.check('org-a', 'Temporal', 30);
  expect(first.items).toHaveLength(4);
  expect(diagnostics.join(' ')).toContain('COMMUNITY_RATE_LIMITED'); expect(diagnostics.join(' ')).not.toContain('secret');
  s.advance(60 * 60_000); await s.collector.check('org-b', 'Temporal', 30);
  expect(s.reads.filter((row) => row.url.hostname === 'api.github.com')).toHaveLength(1);
});
test('HN rate limiting stops the batch immediately while arXiv/GitHub remain available', async () => {
  const s = stand({ response: (address) => address.includes('/item/') ? new Response('', { status: 429,
    headers: { 'retry-after': '3600' } }) : undefined });
  const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(s.reads.filter((row) => row.url.pathname.includes('/item/'))).toHaveLength(1);
  expect(result.items).toHaveLength(4);
});
test('global and tenant switches deny even cached results without outbound', async () => {
  const s = stand(); await s.collector.check('org-a', 'Temporal', 30);
  process.env.RESEARCH_GLOBAL_KILL_SWITCH = 'true';
  expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
  delete process.env.RESEARCH_GLOBAL_KILL_SWITCH; process.env.RESEARCH_TENANT_KILL_SWITCHES = 'org-a';
  expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0); expect(s.reads).toHaveLength(5);
});
test('provider switches and denied domains apply to metadata requests and candidate links', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'github'; process.env.SOURCE_DENIED_DOMAINS = 'arxiv.org,example.org';
  const s = stand(); const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(result.items).toHaveLength(0);
  expect(s.reads.every((row) => row.url.hostname === 'hacker-news.firebaseio.com')).toBe(true);
  expect(s.reads).toHaveLength(3);
});
test('private DNS and redirects are refused before following another hop', async () => {
  const privateDns = stand({ resolver: async () => [{ address: '127.0.0.1', family: 4 }] });
  expect((await privateDns.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0); expect(privateDns.reads).toHaveLength(0);
  const redirect = stand({ response: () => new Response('', { status: 302, headers: { location: 'https://127.0.0.1/private' } }) });
  expect((await redirect.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0); expect(redirect.reads).toHaveLength(3);
  expect(diagnostics.join(' ')).toContain('REDIRECT_UNSAFE');
});
test('stream bytes and declared length are bounded; malformed JSON is sanitized', async () => {
  for (const response of [() => new Response('x'.repeat(256 * 1024 + 1), { headers: { 'content-type': 'application/json' } }),
    () => new Response('', { headers: { 'content-type': 'application/json', 'content-length': '900000' } }),
    () => new Response('secret malformed payload', { headers: { 'content-type': 'application/json' } })]) {
    const s = stand({ response }); expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
  }
  expect(diagnostics.join(' ')).not.toContain('secret');
});
test('Atom rejects DTD/entities, >20 entries and excessive nesting', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'github,hackernews';
  for (const xml of ['<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed><entry>&x;</entry></feed>',
    `<feed>${Array.from({ length: 21 }, (_, i) => atom(i + 1)).join('')}</feed>`, `<feed>${'<x>'.repeat(40)}${'</x>'.repeat(40)}</feed>`]) {
    const s = stand({ response: () => new Response(xml, { headers: { 'content-type': 'application/atom+xml' } }) });
    expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
  }
});
test('request deadline aborts slow fetch without starting an unbounded retry', async () => {
  const signals = [];
  const s = stand({ options: { requestMs: 10, wallMs: 20 }, response: (address, init) => {
    signals.push(init.signal); return new Promise((resolve) => setTimeout(() => resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })), 40));
  } });
  expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
  expect(signals.every((signal) => signal.aborted)).toBe(true); expect(signals.length).toBeLessThanOrEqual(3);
  await new Promise((resolve) => setTimeout(resolve, 45));
});
test('query syntax is lexicalized and empty/oversized topics cause no request', async () => {
  const s = stand(); await s.collector.check('org-a', 'Temporal is:private -is:issue', 30);
  expect(s.reads.find((row) => row.url.hostname === 'api.github.com').url.searchParams.get('q')).toBe('temporal is private is issue is:issue is:public in:title,body created:2026-09-01..2026-10-01');
  const refused = stand(); await refused.collector.check('org-a', 'x'.repeat(301), 30); await refused.collector.check('org-a', '', 30);
  expect(refused.reads).toHaveLength(0);
});


test('stalled response stream is aborted and cancelled within the request budget', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'github,hackernews';
  const cancelled = jest.fn();
  const s = stand({ options: { requestMs: 10 }, response: () => new Response(new ReadableStream({ cancel: cancelled }),
    { headers: { 'content-type': 'application/atom+xml' } }) });
  expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
  expect(cancelled).toHaveBeenCalledTimes(1);
});


test('oversized Retry-After and reset headers retain finite PX-safe shared backoff', async () => {
  const s = stand({ response: (address) => address.includes('api.github.com') ? new Response('', { status: 429,
    headers: { 'retry-after': '9'.repeat(400), 'x-ratelimit-reset': '9'.repeat(300) } }) : undefined });
  await s.collector.check('org-a', 'Temporal', 30);
  const write = s.store.set.mock.calls.find(([key]) => key.endsWith('github:backoff'));
  expect(write).toBeDefined();
  expect(Number(write[1])).toBe(8_640_000_000_000_000);
  expect(write[2]).toBe('PX');
  expect(Number.isSafeInteger(write[3]) && write[3] > 0).toBe(true);
  s.advance(24 * 60 * 60_000);
  await s.collector.check('org-b', 'Temporal', 30);
  expect(s.reads.filter((row) => row.url.hostname === 'api.github.com')).toHaveLength(1);
});

test('DatabaseModule missing-Redis binding cannot grant community network admission', async () => {
  const before = process.env.REDIS_URL;
  try {
    delete process.env.REDIS_URL;
    const redis = loadTypeScriptModule('libraries/nestjs-libraries/src/redis/redis.service.ts', {
      ioredis: { Redis: class { constructor() { throw new Error('real Redis/network forbidden'); } } },
    });
    expect(redis.ioRedis).toBeInstanceOf(redis.MockRedis);
    const recorded = stand();
    // Only substitute constructor options, keeping the real admission/check
    // implementation. The production factory and its missing-Redis binding
    // below execute from the actual DatabaseModule source.
    class RecordedCollector extends CommunityTopicDiscoveryService {
      constructor(store) { super(store, { fetcher: recorded.fetcher, now: recorded.now,
        resolver: async () => [{ address: '93.184.216.34', family: 4 }] }); }
    }
    let metadata;
    const imports = new Proxy({}, { get: (target, name) => {
      if (!(name in target)) target[name] = class ModuleDependency {};
      return target[name];
    } });
    loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/database.module.ts', {}, {
      resolve: (request) => {
        if (request === '@nestjs/common') return {
          Global: () => (target) => target,
          Module: (definition) => (target) => { metadata = definition; return target; },
        };
        if (request === '@contentfactory/nestjs-libraries/redis/redis.service') return redis;
        if (request === '@contentfactory/nestjs-libraries/content-intelligence/leads/community-topic-discovery.service')
          return { CommunityTopicDiscoveryService: RecordedCollector };
        if (request === '@contentfactory/nestjs-libraries/openai/web.research.service')
          return { WebResearchService: class {}, RESEARCH_QUOTA_STORE: 'RESEARCH_QUOTA_STORE' };
        if (request.startsWith('@contentfactory/') || request === './prisma.service') return imports;
        return undefined;
      },
    });
    const quotaBinding = metadata.providers.find((provider) => provider?.provide === 'RESEARCH_QUOTA_STORE');
    expect(quotaBinding.useValue).toBe(redis.ioRedis);
    const factory = metadata.providers.find((provider) => provider?.provide === RecordedCollector);
    expect(factory.inject).toEqual(['RESEARCH_QUOTA_STORE']);
    const collector = factory.useFactory(quotaBinding.useValue);
    expect((await collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
    expect((await collector.check('org-b', 'Temporal', 30)).items).toHaveLength(0);
    expect(recorded.fetcher).not.toHaveBeenCalled();
    // Other quota/mock consumers retain their existing binding and counters.
    expect(await quotaBinding.useValue.incr('quota:unchanged')).toBe(1);
  } finally {
    if (before === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = before;
  }
});

test('malformed repeated opening brackets are bounded before metadata cleaning', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'hackernews,arxiv';
  const s = stand({ issues: [gh(1, { body: '<p>Temporal workflow details</p>' }),
    gh(2, { body: '<'.repeat(120_000) })] });
  const original = String.prototype.replace;
  const inspected = [];
  const replace = jest.spyOn(String.prototype, 'replace').mockImplementation(function (pattern, replacement) {
    if (pattern instanceof RegExp && pattern.source === '<[^>]*>') {
      const length = String(this).length;
      inspected.push(length);
      // Instrument the dangerous operation rather than asserting wall time:
      // fail before running its quadratic scan on an unbounded field.
      if (length > 2_000) throw new Error('COMMUNITY_UNBOUNDED_TEXT_INPUT');
    }
    return original.call(this, pattern, replacement);
  });
  let result;
  try { result = await s.collector.check('org-a', 'Temporal', 30); }
  finally { replace.mockRestore(); }
  expect(result.items).toHaveLength(2);
  expect(result.items.find((item) => item.sourceUrl.endsWith('/1')).excerpt).toBe('Temporal workflow details');
  expect(result.items.every((item) => (item.excerpt || '').length <= 2_000)).toBe(true);
  expect(Math.max(...inspected)).toBeLessThanOrEqual(2_000);
});

test('GitHub selects fresh title/body matches before high-comment stale/comment-only rows consume its single page', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'hackernews,arxiv';
  const old = Array.from({ length: 20 }, (_, index) => gh(index + 1, { comments: 2500, created_at: '2020-01-01T00:00:00Z' }));
  const commentOnly = Array.from({ length: 20 }, (_, index) => gh(index + 21, { comments: 2000,
    title: 'Unrelated apples', body: 'General coordination log', searchableComments: 'Temporal' }));
  const recent = gh(99, { comments: 12, title: 'Temporal fresh workflow issue', created_at: DATE });
  // Both boundary days are admitted upstream, but exact publication times
  // still belong to the collector: no old partial-day or future row can pass.
  const boundaryOld = gh(100, { comments: 30, created_at: '2026-09-01T00:00:00Z' });
  const future = gh(101, { comments: 40, created_at: '2026-10-01T23:59:59Z' });
  const s = stand({ response: (address) => {
    const q = new URL(address).searchParams.get('q') || '';
    const dateRange = q.match(/(?:^|\s)created:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})(?:\s|$)/u);
    const titleAndBodyOnly = /(?:^|\s)in:title,body(?:\s|$)/u.test(q);
    const rows = [...old, ...commentOnly, recent, boundaryOld, future].filter((row) => {
      const day = row.created_at.slice(0, 10);
      return (!dateRange || (day >= dateRange[1] && day <= dateRange[2])) &&
        /temporal/i.test(`${row.title} ${row.body} ${titleAndBodyOnly ? '' : row.searchableComments || ''}`);
    }).sort((a, b) => b.comments - a.comments).slice(0, 20);
    return new Response(JSON.stringify({ items: rows }), { headers: { 'content-type': 'application/json' } });
  } });
  const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(result.items.map((item) => item.sourceUrl)).toEqual(['https://github.com/public/repo/issues/99']);
  expect(result.items[0].publishedAt.toISOString()).toBe(new Date(DATE).toISOString());
  expect(result.items[0].reason.en).toContain('12 comments');
  expect(s.reads).toHaveLength(1);
});

test('GitHub accepts bounded metadata pages above256KiB and below1MiB', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'hackernews,arxiv';
  const s = stand({ issues: [gh(77, { body: `Temporal issue details ${'x'.repeat(400_000)}` })] });
  const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(result.items.map((item) => item.sourceUrl)).toEqual(['https://github.com/public/repo/issues/77']);
  expect(result.items[0].excerpt.length).toBeLessThanOrEqual(2_000);
  expect(s.reads).toHaveLength(1);
  expect(diagnostics.join(' ')).not.toContain('COMMUNITY_RESPONSE_BYTES');
});
test('GitHub above1MiB still refuses the bounded stream and declared size', async () => {
  process.env.RESEARCH_PROVIDER_KILL_SWITCHES = 'hackernews,arxiv';
  for (const response of [undefined, () => new Response('', { headers: { 'content-type': 'application/json',
    'content-length': String(1024 * 1024 + 1) } })]) {
    const s = stand({ issues: [gh(77, { body: 'x'.repeat(1024 * 1024 + 1) })], response });
    expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
    expect(s.reads).toHaveLength(1);
  }
  expect(diagnostics.join(' ')).toContain('COMMUNITY_RESPONSE_BYTES');
});
test('HN and arXiv keep their256KiB stream budget', async () => {
  for (const provider of ['hackernews', 'arxiv']) {
    process.env.RESEARCH_PROVIDER_KILL_SWITCHES = ['hackernews', 'github', 'arxiv'].filter((other) => other !== provider).join(',');
    const s = stand({ response: () => new Response('x'.repeat(256 * 1024 + 1),
      { headers: { 'content-type': provider === 'arxiv' ? 'application/atom+xml' : 'application/json' } }) });
    expect((await s.collector.check('org-a', 'Temporal', 30)).items).toHaveLength(0);
    expect(s.reads).toHaveLength(1);
    expect(diagnostics.some((value) => value.includes(`${provider}: COMMUNITY_RESPONSE_BYTES`))).toBe(true);
  }
});
test('larger GitHub allowance cannot exceed shared2MiB run budget or trigger a further arXiv request', async () => {
  const s = stand({ stories: Array.from({ length: 8 }, (_, index) => hn(index + 1, { text: 'x'.repeat(200_000) })),
    issues: [gh(77, { body: 'x'.repeat(700_000) })] });
  const result = await s.collector.check('org-a', 'Temporal', 30);
  expect(result.items).toHaveLength(8);
  expect(result.items.every((item) => item.sourceUrl.startsWith('https://example.org/'))).toBe(true);
  expect(diagnostics.join(' ')).toContain('Community github: COMMUNITY_RESPONSE_BYTES');
  expect(diagnostics.join(' ')).toContain('COMMUNITY_BUDGET_RESPONSE_BYTES');
  expect(s.reads).toHaveLength(10); // HN list+8stories, then one refused GitHub page.
  expect(s.reads.some((row) => row.url.hostname === 'export.arxiv.org')).toBe(false);
});
