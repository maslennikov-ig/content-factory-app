require('reflect-metadata');

// Jest-only, like `content-fact-copy-guard.test.cjs` beside it: no fallback to
// node's own native test runner.
const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * The one rule `content-factory-next-odb8.3` cannot lose: a declined lead
 * stays declined.
 *
 * The team-lead brief names this exact guarantee: «отказ, который продукт
 * ЗАПОМИНАЕТ и учитывает дальше» — a lead a person has already said "not now"
 * to must not come back merely because the same feed serves the same item
 * again on the next check. The mechanism is `(organizationId, subscriptionId,
 * externalId)` being unique on `ContentLead` and `upsertLeads` inserting with
 * `skipDuplicates: true` rather than an upsert that would touch the existing
 * row's `status`. This test exercises `ContentLeadRepository.upsertLeads` —
 * the real Prisma call shape, against a fake client — the same pattern
 * `content-fact-copy-guard.test.cjs` uses for its own repository.
 */

const { ContentLeadRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
  },
  {
    sources: {
      './errors':
        'libraries/nestjs-libraries/src/content-intelligence/leads/errors.ts',
    },
  }
);

const ORG_ID = 'org-a';
const SUBSCRIPTION_ID = 'sub-a';

/**
 * A fake `contentLead.createMany` that behaves like Postgres does under the
 * real unique index: `skipDuplicates: true` means a row already on
 * `(organizationId, subscriptionId, externalId)` is left byte-for-byte as it
 * is, and only genuinely new rows get created — every new row `NEW`, the
 * real column default.
 */
function makeClient(seed) {
  const rows = new Map(seed.map((row) => [row.externalId, { ...row }]));
  let nextId = rows.size + 1;
  const createManyCalls = [];

  const client = {
    contentLead: {
      createMany: async ({ data, skipDuplicates }) => {
        createManyCalls.push({ data, skipDuplicates });
        let created = 0;
        for (const item of data) {
          if (skipDuplicates && rows.has(item.externalId)) continue;
          rows.set(item.externalId, {
            id: `lead-${nextId++}`,
            status: 'NEW',
            ...item,
          });
          created += 1;
        }
        return { count: created };
      },
    },
  };

  return { client, rows, createManyCalls };
}

function makeRepository(client) {
  return new ContentLeadRepository(
    { model: client },
    { model: { $transaction: async (work) => work(client) } }
  );
}

const item = (externalId, title) => ({
  externalId,
  title,
  excerpt: null,
  sourceUrl: `https://example.com/${externalId}`,
  publishedAt: null,
  reasonRu: 'причина',
  reasonEn: 'reason',
});

test('a lead already DISMISSED is not recreated or reset when the same item reappears', async () => {
  const { client, rows } = makeClient([
    {
      externalId: 'item-1',
      title: 'Старый заголовок',
      status: 'DISMISSED',
      dismissedAt: new Date('2026-08-20T00:00:00.000Z'),
      dismissedByUserId: 'user-a',
    },
  ]);
  const repository = makeRepository(client);

  const { created } = await repository.upsertLeads(ORG_ID, SUBSCRIPTION_ID, [
    item('item-1', 'Заголовок пришёл снова'),
    item('item-2', 'Второй, действительно новый'),
  ]);

  // Only the genuinely new item was created.
  assert.equal(created, 1);
  assert.equal(rows.size, 2);

  // The declined lead is untouched: same status, same dismissal record, same
  // title it was declined under — nothing about it was overwritten.
  const stillDismissed = rows.get('item-1');
  assert.equal(stillDismissed.status, 'DISMISSED');
  assert.equal(stillDismissed.dismissedByUserId, 'user-a');
  assert.equal(stillDismissed.title, 'Старый заголовок');

  // The new item is a fresh NEW row, not reusing item-1's identity.
  const fresh = rows.get('item-2');
  assert.equal(fresh.status, 'NEW');
});

test('an empty check produces no call at all — nothing to falsely "confirm" as unchanged', async () => {
  const { client, createManyCalls } = makeClient([]);
  const repository = makeRepository(client);

  const { created } = await repository.upsertLeads(ORG_ID, SUBSCRIPTION_ID, []);

  assert.equal(created, 0);
  assert.equal(createManyCalls.length, 0);
});
