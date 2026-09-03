const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * `content-factory-next-p3gq`. Declining an agency wrote `approved: false`
 * and then looked the agency up through a query that asks for
 * `approved: true`, so the decline email went to `undefined`. The approve
 * branch never showed it: there the flag and the filter agree.
 *
 * The Prisma model is a fake that honours `where.approved` the way the real
 * one does, so the test fails on the query, not on a stub that ignores it.
 */
const agencies = new Map();

const model = {
  socialMediaAgency: {
    update: async ({ where, data }) => {
      const record = agencies.get(where.id);
      Object.assign(record, data);
      return record;
    },
    findFirst: async ({ where }) => {
      for (const record of agencies.values()) {
        if (where.id !== undefined && record.id !== where.id) continue;
        if (where.approved !== undefined && record.approved !== where.approved)
          continue;
        if (where.deletedAt === null && record.deletedAt) continue;
        return { ...record, user: record.user, logo: null, niches: [] };
      }
      return null;
    },
  },
};

const injectable = { Injectable: () => (target) => target };

const { AgenciesRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/agencies/agencies.repository.ts',
  {
    '@nestjs/common': injectable,
    '@prisma/client': {},
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {},
    '@contentfactory/nestjs-libraries/dtos/agencies/create.agency.dto': {},
  }
);

const { AgenciesService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/agencies/agencies.service.ts',
  {
    '@nestjs/common': injectable,
    '@prisma/client': {},
    '@contentfactory/nestjs-libraries/database/prisma/agencies/agencies.repository': {},
    '@contentfactory/nestjs-libraries/dtos/agencies/create.agency.dto': {},
    '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service': {},
  },
  {
    sources: {
      '@contentfactory/nestjs-libraries/locale/backend-strings':
        'libraries/nestjs-libraries/src/locale/backend-strings.ts',
      '@contentfactory/nestjs-libraries/emails/email.template':
        'libraries/nestjs-libraries/src/emails/email.template.ts',
    },
  }
);

const seed = (approved) => {
  agencies.clear();
  agencies.set('agency-1', {
    id: 'agency-1',
    name: 'Пустынная лаборатория',
    slug: 'desert-lab',
    approved,
    deletedAt: null,
    user: { email: 'owner@agency.example', language: 'ru' },
  });
};

const service = (sent) =>
  new AgenciesService(new AgenciesRepository({ model }, { model }), {
    sendEmail: async (to, subject, html, replyTo, locale) => {
      sent.push({ to, subject, html, locale });
    },
  });

test('a declined agency still gets its email, in its owner language, naming it', async () => {
  seed(null);
  const sent = [];

  await service(sent).approveOrDecline('admin@instance', 'decline', 'agency-1');

  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe('owner@agency.example');
  expect(sent[0].locale).toBe('ru');
  expect(sent[0].subject).toContain('Пустынная лаборатория');
  expect(agencies.get('agency-1').approved).toBe(false);
});

test('an approved agency gets its email the same way', async () => {
  seed(null);
  const sent = [];

  await service(sent).approveOrDecline('admin@instance', 'approve', 'agency-1');

  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe('owner@agency.example');
  expect(sent[0].subject).toContain('Пустынная лаборатория');
  expect(agencies.get('agency-1').approved).toBe(true);
});
