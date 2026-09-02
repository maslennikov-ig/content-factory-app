require('reflect-metadata');

// Jest-only, like `content-brief.routes.test.cjs` beside it: no fallback to
// node's own native test runner, so this suite is not one of the ones
// `tests/test-runner-boundary.test.cjs` requires `pnpm test`'s native leg
// to own exclusively.
const assert = require('node:assert/strict');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * The one rule `content-factory-next-odb8.1` cannot lose: a copied fact
 * never inherits the old fact's evidence.
 *
 * §5 of the task brief names the exact lie this guards against: «Правка на
 * месте запрещена» because a screen showing an edited statement next to an
 * unchanged citation — «source — договор, с. 4» confirming a sentence it was
 * never checked against — would look like a confirmation while confirming
 * nothing. Copying instead of editing only keeps that promise if the new row
 * genuinely starts with none of the old row's grounding. This test exercises
 * `ContentFactRepository.copyFact` — the real transaction, not a description
 * of it — against a fake Prisma client, the same pattern
 * `content-context.builder.test.cjs` already uses for this repository.
 */

const { ContentFactRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/context/content-fact.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
  },
  {
    sources: {
      './content-context.errors':
        'libraries/nestjs-libraries/src/content-intelligence/context/content-context.errors.ts',
    },
  }
);

const OLD_FACT_ID = 'fact-old';
const NEW_FACT_ID = 'fact-new';

/**
 * A previous fact that is already grounded — one accepted, supporting
 * evidence link — so a bug that "helpfully" copies evidence over has
 * something real to copy.
 */
function makeClient() {
  const evidenceCreateCalls = [];
  const upsertCalls = [];
  const oldFact = {
    id: OLD_FACT_ID,
    organizationId: 'org-a',
    claimKey: 'docks|turnaround',
    statement: 'Средний срок докового ремонта — 34 суток',
    language: 'ru',
    temporalKind: 'TIMELESS',
    effectiveFrom: null,
    effectiveTo: null,
    freshUntil: null,
    status: 'VERIFIED',
  };
  let newFact = null;

  const client = {
    contentFact: {
      findFirst: async ({ where }) => {
        if (where.id === OLD_FACT_ID) return { ...oldFact };
        if (newFact && where.id === newFact.id) return { ...newFact };
        return null;
      },
      upsert: async ({ where, create }) => {
        upsertCalls.push({ where, create });
        if (newFact) return { ...newFact };
        newFact = { id: NEW_FACT_ID, ...create };
        return { ...newFact };
      },
      updateMany: async ({ where, data }) => {
        if (where.id === OLD_FACT_ID) Object.assign(oldFact, data);
        return { count: 1 };
      },
    },
    contentFactEvidence: {
      // The old fact really is grounded — this is the row the mockup's
      // warning is about: «прежний фрагмент подтверждал прежнюю
      // формулировку». If a bug ever queries for it while building the copy,
      // this is what it would find.
      findFirst: async ({ where }) =>
        where.factId === OLD_FACT_ID && where.evidenceId === 'evidence-1'
          ? { factId: OLD_FACT_ID, evidenceId: 'evidence-1', stance: 'SUPPORTS' }
          : null,
      create: async ({ data }) => {
        evidenceCreateCalls.push(data);
        return { id: `link-${evidenceCreateCalls.length}`, ...data };
      },
    },
    sourceEvidence: {
      findFirst: async ({ where }) =>
        where.id === 'evidence-1' ? { id: 'evidence-1' } : null,
    },
  };

  return { client, oldFact, evidenceCreateCalls, upsertCalls, getNewFact: () => newFact };
}

function makeRepository(client) {
  return new ContentFactRepository(
    { model: client },
    { model: { $transaction: async (work) => work(client) } }
  );
}

test('a copy started with no evidence creates no evidence link at all — "ваше слово"', async () => {
  const { client, evidenceCreateCalls, getNewFact } = makeClient();
  const repository = makeRepository(client);

  const result = await repository.copyFact(
    'org-a',
    'user-a',
    OLD_FACT_ID,
    {
      statement: 'Средний срок докового ремонта вырос до 42 суток',
      valueText: 'Средний срок докового ремонта вырос до 42 суток',
      valueHash: 'hash-42',
      dedupeKey: 'dedupe-42',
    },
    new Date('2026-09-01T00:00:00.000Z')
  );

  assert.equal(evidenceCreateCalls.length, 0);
  assert.equal(getNewFact().id, NEW_FACT_ID);
  assert.equal(result.fact.id, NEW_FACT_ID);
  assert.equal(result.fact.supersedesFactId, OLD_FACT_ID);
  // The new row's own statement, not the old one's — copying is not editing.
  assert.equal(
    result.fact.statement,
    'Средний срок докового ремонта вырос до 42 суток'
  );
});

test('a copy that names a new evidence id links it to the NEW fact, not the old one', async () => {
  const { client, evidenceCreateCalls, getNewFact } = makeClient();
  const repository = makeRepository(client);

  await repository.copyFact(
    'org-a',
    'user-a',
    OLD_FACT_ID,
    {
      statement: 'Средний срок докового ремонта вырос до 42 суток',
      valueText: 'Средний срок докового ремонта вырос до 42 суток',
      valueHash: 'hash-42',
      dedupeKey: 'dedupe-42-evidence',
      evidenceId: 'evidence-1',
      stance: 'SUPPORTS',
    },
    new Date('2026-09-01T00:00:00.000Z')
  );

  assert.equal(evidenceCreateCalls.length, 1);
  assert.equal(evidenceCreateCalls[0].factId, getNewFact().id);
  assert.notEqual(evidenceCreateCalls[0].factId, OLD_FACT_ID);
  assert.equal(evidenceCreateCalls[0].evidenceId, 'evidence-1');
  // A person attached this on purpose; it still goes through review like any
  // other proposed link, never auto-accepted.
  assert.equal(evidenceCreateCalls[0].reviewStatus, 'PROPOSED');
});

test('the old fact is superseded, not edited: its own statement never changes', async () => {
  const { client, oldFact } = makeClient();
  const repository = makeRepository(client);

  await repository.copyFact(
    'org-a',
    'user-a',
    OLD_FACT_ID,
    {
      statement: 'Средний срок докового ремонта вырос до 42 суток',
      valueText: 'Средний срок докового ремонта вырос до 42 суток',
      valueHash: 'hash-42',
      dedupeKey: 'dedupe-42-supersede',
    },
    new Date('2026-09-01T00:00:00.000Z')
  );

  assert.equal(oldFact.status, 'SUPERSEDED');
  assert.equal(
    oldFact.statement,
    'Средний срок докового ремонта — 34 суток',
    'copyFact must never write to the old row\'s statement'
  );
});
