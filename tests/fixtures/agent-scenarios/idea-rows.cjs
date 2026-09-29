'use strict';

/**
 * The «Откуда идеи» rows the idea scenarios start from (`kcxz.23`), in the
 * shape of the Prisma tables `ContentLeadRepository` reads (`world.cjs`,
 * `leadTables`): a feed and a topic of this workspace, one feed of another,
 * two new leads of the feed and one lead of the other workspace. The scenario
 * clock is 2026-09-27 10:00 UTC.
 */
const subscription = (row) => ({
  organizationId: 'org-1',
  kind: 'RSS',
  query: null,
  state: 'ACTIVE',
  checkIntervalMinutes: 1440,
  lastCheckedAt: '2026-09-27T06:00:00.000Z',
  lastErrorCode: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
  linkedAutoPostId: null,
  ...row,
});

const lead = (row) => ({
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  excerpt: null,
  publishedAt: '2026-09-26T08:00:00.000Z',
  observedAt: '2026-09-27T06:00:00.000Z',
  reasonRu: 'Свежая запись в ленте vc.ru.',
  reasonEn: 'A fresh item in the vc.ru feed.',
  status: 'NEW',
  dismissedAt: null,
  acceptedAt: null,
  ...row,
});

const ideaRows = (overrides = {}) => ({
  subscriptions: [
    subscription({ id: 'sub-1', displayName: 'vc.ru', canonicalUrl: 'https://vc.ru/rss' }),
    subscription({
      id: 'sub-2',
      kind: 'TOPIC',
      displayName: 'Налоги малого бизнеса',
      canonicalUrl: 'topic://налоги малого бизнеса',
      query: 'Налоги малого бизнеса',
      createdAt: '2026-09-02T09:00:00.000Z',
    }),
    subscription({
      id: 'sub-foreign',
      organizationId: 'org-2',
      displayName: 'Чужая лента',
      canonicalUrl: 'https://other.example/rss',
    }),
  ],
  leads: [
    lead({
      id: 'lead-1',
      externalId: 'https://vc.ru/a/1',
      title: 'Созвоны без повестки: что показало исследование',
      excerpt: 'Команды тратят на созвоны до трети недели.',
      sourceUrl: 'https://vc.ru/a/1',
    }),
    lead({
      id: 'lead-2',
      externalId: 'https://vc.ru/a/2',
      title: 'Удалёнка и найм: итоги квартала',
      sourceUrl: 'https://vc.ru/a/2',
      observedAt: '2026-09-27T05:00:00.000Z',
    }),
    lead({
      id: 'lead-foreign',
      organizationId: 'org-2',
      subscriptionId: 'sub-foreign',
      externalId: 'https://other.example/x',
      title: 'Чужой повод',
      sourceUrl: 'https://other.example/x',
    }),
  ],
  ...overrides,
});

module.exports = { ideaRows };
