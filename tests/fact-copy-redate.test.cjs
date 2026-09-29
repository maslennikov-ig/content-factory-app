'use strict';

/**
 * «Свежо до» after the walk review (owner 29.09.2026, F1): «Копировать и
 * поправить» of a fact whose day is over copies it without that day — the
 * copy holds until the person names a new day — and a day still ahead is
 * copied as it is; the new day is named to the agent, and `facts.add` sets it
 * on a known fact in work (`redateFact`), never on a retracted one. Through
 * the real `ContentFactService` over the real `ContentFactRepository`.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const CONTEXT = 'libraries/nestjs-libraries/src/content-intelligence/context';
const mocks = {
  '@nestjs/common': { Injectable: () => (target) => target, Inject: () => () => undefined, Optional: () => () => undefined },
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class {},
    PrismaTransaction: class {},
  },
};
const { ContentFactService } = loadTypeScriptModule(`${CONTEXT}/content-fact.service.ts`, mocks);
const { ContentFactRepository } = loadTypeScriptModule(`${CONTEXT}/content-fact.repository.ts`, mocks);

const serviceOver = (rows) => {
  const matches = (row, where) =>
    Object.entries(where).every(([key, want]) => {
      const have = row[key] ?? null;
      if (want && typeof want === 'object' && !(want instanceof Date)) {
        if (Array.isArray(want.notIn)) return !want.notIn.includes(have);
        return have !== want.not;
      }
      return have === want;
    });
  const client = {
    contentFact: {
      findFirst: async ({ where }) => {
        const row = rows.find((one) => matches(one, where));
        return row ? { ...row, evidenceLinks: [] } : null;
      },
      updateMany: async ({ where, data }) => {
        const found = rows.filter((one) => matches(one, where));
        for (const row of found) Object.assign(row, data);
        return { count: found.length };
      },
      upsert: async ({ create }) => {
        const row = { id: `copy-${rows.length}`, ...create };
        rows.push(row);
        return row;
      },
    },
  };
  return new ContentFactService(
    new ContentFactRepository({ model: client }, { model: { $transaction: async (work) => work(client) } })
  );
};

const fact = (row) => ({
  organizationId: 'org-1',
  claimKey: 'скидка|осень',
  language: 'ru',
  temporalKind: 'CURRENT',
  effectiveFrom: null,
  effectiveTo: null,
  status: 'VERIFIED',
  verifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  ...row,
});

describe('«Копировать и поправить» and «Свежо до»', () => {
  test('a day already over is not copied: the copy holds until a new day is named', async () => {
    const rows = [fact({ id: 'old', statement: 'Скидка 10%', freshUntil: new Date('2020-01-31T20:59:59.999Z') })];
    await serviceOver(rows).copyFact('org-1', 'user-1', 'old', { statement: 'Скидка 15%' });
    const copy = rows.find((row) => row.supersedesFactId === 'old');
    expect(copy.freshUntil).toBeNull();
    expect(copy.temporalKind).toBe('TIMELESS');
    expect(copy.status).toBe('VERIFIED');
    expect(rows[0].status).toBe('SUPERSEDED');
  });

  test('a day still ahead is copied as it is', async () => {
    const ahead = new Date('2099-12-31T20:59:59.999Z');
    const rows = [fact({ id: 'old', statement: 'Скидка 10%', freshUntil: ahead })];
    await serviceOver(rows).copyFact('org-1', 'user-1', 'old', { statement: 'Скидка 15%' });
    const copy = rows.find((row) => row.supersedesFactId === 'old');
    expect(copy.freshUntil).toEqual(ahead);
    expect(copy.temporalKind).toBe('CURRENT');
  });
});

describe('a new day named to the agent for a known fact', () => {
  const input = (freshUntil) => ({
    claimKey: 'скидка|осень',
    statement: 'Скидка 10%',
    language: 'ru',
    valueText: 'Скидка 10%',
    temporalKind: freshUntil ? 'CURRENT' : 'TIMELESS',
    ...(freshUntil ? { freshUntil } : {}),
  });

  test('a fact in work takes the new day', async () => {
    const rows = [];
    const service = serviceOver(rows);
    // Seeded under the key the service computes for the statement.
    const record = service.factRecord(input('2099-10-31T20:59:59.999Z'));
    rows.push(fact({ id: 'f1', statement: 'Скидка 10%', dedupeKey: record.dedupeKey, freshUntil: null, temporalKind: 'TIMELESS' }));
    const added = await service.addFact('org-1', 'user-1', input('2099-10-31T20:59:59.999Z'));
    expect(added).toMatchObject({ existed: true, redated: true });
    expect(rows[0].freshUntil).toEqual(new Date('2099-10-31T20:59:59.999Z'));
    expect(rows[0].temporalKind).toBe('CURRENT');
  });

  test('a retracted fact keeps its own day', async () => {
    const rows = [];
    const service = serviceOver(rows);
    const record = service.factRecord(input('2099-10-31T20:59:59.999Z'));
    rows.push(fact({ id: 'f1', statement: 'Скидка 10%', dedupeKey: record.dedupeKey, status: 'RETRACTED', freshUntil: null }));
    const added = await service.addFact('org-1', 'user-1', input('2099-10-31T20:59:59.999Z'));
    expect(added.existed).toBe(true);
    expect(added.redated).toBeUndefined();
    expect(rows[0].freshUntil).toBeNull();
  });

  test('the description sends the person to the agent, not to the copy, for a new day', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'libraries/nestjs-libraries/src/chat/capabilities/catalogue/fact.capabilities.ts'),
      'utf8'
    );
    expect(source).toContain('A new day for a known fact is this same call');
    expect(source).not.toMatch(/new date for a known fact is a correction/);
  });
});
