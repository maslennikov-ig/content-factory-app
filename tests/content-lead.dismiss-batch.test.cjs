require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `ContentLeadRepository.dismissLeads` (`kcxz.45`, round-3 review): the
 * chat's batch «Не надо» is all or nothing, in one transaction on the
 * repository the screen's door uses. An already-declined lead is a no-op; a
 * taken one, or one of another workspace, refuses the batch; a lead taken
 * between the read and the write rolls everything back.
 */
const { ContentLeadRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/content-lead.repository.ts',
  {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
      PrismaTransaction: class PrismaTransaction {},
    },
  },
  { sources: { './errors': 'libraries/nestjs-libraries/src/content-intelligence/leads/errors.ts' } }
);

const NOW = new Date('2026-09-29T10:00:00.000Z');

/** Lead rows behind a Prisma-shaped client, with a rolling-back `$transaction`. */
const world = (seed, { beforeUpdate } = {}) => {
  let rows = seed.map((row) => ({ organizationId: 'org-1', ...row }));
  const matches = (row, where) =>
    Object.entries(where).every(([key, want]) =>
      want && typeof want === 'object' && Array.isArray(want.in) ? want.in.includes(row[key]) : row[key] === want
    );
  const contentLead = {
    findMany: async ({ where }) => rows.filter((row) => matches(row, where)).map(({ id, status }) => ({ id, status })),
    updateMany: async ({ where, data }) => {
      beforeUpdate?.(rows);
      const found = rows.filter((row) => matches(row, where));
      for (const row of found) Object.assign(row, data);
      return { count: found.length };
    },
  };
  const transaction = {
    model: {
      $transaction: async (work) => {
        const saved = rows.map((row) => ({ ...row }));
        try {
          return await work({ contentLead });
        } catch (error) {
          rows = saved;
          throw error;
        }
      },
    },
  };
  const repository = new ContentLeadRepository({ model: { contentLead } }, transaction);
  return { repository, status: (id) => rows.find((row) => row.id === id)?.status };
};

const seed = () => [
  { id: 'a', status: 'NEW' },
  { id: 'b', status: 'NEW' },
  { id: 'c', status: 'DISMISSED' },
  { id: 't', status: 'ACCEPTED' },
  { id: 'x', status: 'NEW', organizationId: 'org-2' },
];

describe('dismissLeads — all or nothing', () => {
  test('declines every new lead; an already-declined one is a no-op', async () => {
    const { repository, status } = world(seed());
    await expect(repository.dismissLeads('org-1', ['a', 'c', 'b'], 'user-1', NOW)).resolves.toEqual({
      dismissed: ['a', 'b'],
      alreadyDismissed: ['c'],
    });
    expect(['a', 'b', 'c'].map(status)).toEqual(['DISMISSED', 'DISMISSED', 'DISMISSED']);
  });

  test('a batch of already-declined leads changes nothing and succeeds', async () => {
    const { repository } = world(seed());
    await expect(repository.dismissLeads('org-1', ['c'], 'user-1', NOW)).resolves.toEqual({
      dismissed: [],
      alreadyDismissed: ['c'],
    });
  });

  test('a taken lead, or one of another workspace, refuses the batch; nothing declined', async () => {
    const taken = world(seed());
    await expect(taken.repository.dismissLeads('org-1', ['a', 't'], 'user-1', NOW)).rejects.toMatchObject({
      code: 'LEAD_NOT_NEW',
    });
    expect(taken.status('a')).toBe('NEW');
    const foreign = world(seed());
    await expect(foreign.repository.dismissLeads('org-1', ['a', 'x'], 'user-1', NOW)).rejects.toMatchObject({
      code: 'LEAD_NOT_FOUND',
    });
    expect(foreign.status('a')).toBe('NEW');
    expect(foreign.status('x')).toBe('NEW');
  });

  test('a lead taken on the screen between the read and the write rolls the whole batch back', async () => {
    const { repository, status } = world(seed(), {
      beforeUpdate: (rows) => {
        rows.find((row) => row.id === 'b').status = 'ACCEPTED';
      },
    });
    await expect(repository.dismissLeads('org-1', ['a', 'b'], 'user-1', NOW)).rejects.toMatchObject({
      code: 'LEAD_NOT_NEW',
    });
    // Rolled back: «a» was not declined either (and the concurrent take was
    // the other transaction's, outside this rollback's fake).
    expect(status('a')).toBe('NEW');
  });
});
