require('reflect-metadata');

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
/**
 * The row matcher comes from the shared helper, not from a copy here.
 *
 * This suite kept its own, and on 2026-08-25 a space stopped holding exactly
 * one avatar: the repository started addressing a profile by the compound
 * unique `{ organizationId_id: { organizationId, id } }`. The shared helper was
 * taught to read that as two conditions; this copy went on reading it as one
 * plain field, matched no row, and turned every write in the suite into
 * `P2025 not found`. Eight tests — activation atomicity, the immutable
 * snapshot, the serializable pin — went red together and stayed that way.
 *
 * The transaction machinery below is this suite's own and stays: forced P2034
 * conflicts and a commit revision are what it exists to exercise, and the
 * shared helper does not model them. Only the one decision that drifted is
 * shared.
 */
const {
  clone,
  matches,
  sortRows,
} = require('./helpers/voice-memory-prisma.cjs');

const commonSources = {
  // The real role helper, not a stand-in: it holds the one ranking the product
  // has, and a stub here would be a second copy of it.
  '@contentfactory/nestjs-libraries/user/organization.roles':
    'libraries/nestjs-libraries/src/user/organization.roles.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types':
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.types.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation':
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository':
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.repository.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.context.service.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.service':
    'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.service.ts',
  '@contentfactory/nestjs-libraries/content-intelligence/contracts':
    'libraries/nestjs-libraries/src/content-intelligence/contracts.ts',
  '@contentfactory/nestjs-libraries/dtos/content-intelligence/brand-profile.dto':
    'libraries/nestjs-libraries/src/dtos/content-intelligence/brand-profile.dto.ts',
};

const prismaMocks = {
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
    PrismaRepository: class PrismaRepository {},
    PrismaTransaction: class PrismaTransaction {},
  },
};

function forbidModelAndNetworkImports(request) {
  if (
    /(openai|ai\.usage|undici|axios|node-fetch|fetch\.gateway)/i.test(request)
  ) {
    throw new Error(
      `manual brand-profile path imported forbidden dependency: ${request}`
    );
  }
  return undefined;
}

const loaded = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.service.ts',
  prismaMocks,
  { sources: commonSources, resolve: forbidModelAndNetworkImports }
);
const { BrandProfileService } = loaded;
const { BrandProfileRepository } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.repository.ts',
  prismaMocks,
  { sources: commonSources, resolve: forbidModelAndNetworkImports }
);
const { BrandProfileContextService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.context.service.ts',
  prismaMocks,
  { sources: commonSources, resolve: forbidModelAndNetworkImports }
);

const validContent = {
  project: {
    name: 'Контент Фабрика',
    oneLineDescription: 'Помогает командам выпускать проверяемый контент.',
    mission: 'Делать знания пригодными для публикации.',
    offerings: ['Контентный конвейер'],
    audiences: [{ name: 'Редакционные команды', need: 'Надёжный черновик' }],
    positioning: 'Контент с видимым происхождением.',
    contentGoals: ['Объяснять продукт'],
  },
  voice: {
    defaultLanguage: 'ru',
    allowedLanguages: ['ru', 'en'],
    traits: [{ name: 'Ясный', guidance: 'Короткие конкретные предложения.' }],
    pointOfView: 'company_we',
    formality: 'neutral',
    sentenceStyle: 'Без канцелярита.',
    ctaStyle: 'Одно понятное действие.',
    emojiPolicy: 'restrained',
    hashtagPolicy: 'none',
  },
  lexicon: {
    preferred: [
      { term: 'черновик', guidance: 'Показывает границу результата.' },
    ],
    avoid: [{ term: 'магия', replacement: 'автоматизация', reason: 'Точнее.' }],
  },
  guardrails: {
    prohibitedTopics: ['Непроверенные персональные данные'],
    prohibitedClaims: ['Гарантированный результат'],
    requiredPhrases: ['Проверьте перед публикацией'],
  },
  examples: [
    {
      kind: 'on_brand',
      text: 'Сначала проверим источник, затем подготовим черновик.',
    },
  ],
  platformOverrides: [
    {
      provider: 'linkedin',
      formality: 'formal',
      avoidAdd: [{ term: 'срочно' }],
      prohibitedClaimsAdd: ['Лучший на рынке'],
    },
  ],
};

function activeV2AutoPostData(organizationId, brandProfileVersionId) {
  return {
    organizationId,
    title: 'Draft-only rule',
    content: null,
    onSlot: false,
    syncLast: false,
    url: 'https://example.com/feed',
    lastUrl: '',
    active: true,
    addPicture: false,
    generateContent: true,
    researchEnabled: false,
    language: 'ru',
    contentSourceId: null,
    brandProfileVersionId,
    workflowVersion: 2,
    requiresAttention: false,
    integrations: '[]',
    deletedAt: null,
  };
}

class InMemoryBrandPrisma {
  constructor() {
    this.state = {
      profiles: [],
      versions: [],
      audits: [],
      autoPosts: [],
    };
    this.auditFailure = null;
    this.id = 0;
    this.commitRevision = 0;
    this.forcedSerializableConflicts = 0;
    this.serializableAttempts = 0;
    this.beforeAutoPostFindMany = null;
    this.model = this.makeClient(() => this.state);
    this.transaction = {
      model: {
        $transaction: async (work, options) => {
          const startedAtRevision = this.commitRevision;
          if (options?.isolationLevel === 'Serializable') {
            this.serializableAttempts += 1;
          }
          const draft = clone(this.state);
          const result = await work(this.makeClient(() => draft));
          if (
            options?.isolationLevel === 'Serializable' &&
            (startedAtRevision !== this.commitRevision ||
              this.forcedSerializableConflicts > 0)
          ) {
            if (this.forcedSerializableConflicts > 0) {
              this.forcedSerializableConflicts -= 1;
            }
            throw Object.assign(new Error('serialization conflict'), {
              code: 'P2034',
            });
          }
          this.state = draft;
          this.commitRevision += 1;
          return result;
        },
      },
    };
  }

  nextId(prefix) {
    this.id += 1;
    return `${prefix}-${this.id}`;
  }

  makeClient(readState) {
    const create = (collection, prefix, data) => {
      const row = {
        id: data.id || this.nextId(prefix),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...clone(data),
      };
      readState()[collection].push(row);
      return clone(row);
    };
    const update = (collection, where, data) => {
      const row = readState()[collection].find((item) => matches(item, where));
      if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
      for (const [key, value] of Object.entries(clone(data))) {
        row[key] =
          value && typeof value === 'object' && 'increment' in value
            ? row[key] + value.increment
            : value;
      }
      row.updatedAt = new Date();
      return clone(row);
    };
    const find = (collection, where) =>
      clone(
        readState()[collection].find((item) => matches(item, where)) || null
      );
    const findMany = (collection, where) =>
      clone(readState()[collection].filter((item) => matches(item, where)));
    // Written once for both collections. The version copy was here already; the
    // profile one arrived when a space gained a second avatar and activation
    // had to clear `isDefault` on the others, and a second hand-rolled copy of
    // the same loop is how the two would come to disagree.
    const updateMany = (collection, where, data) => {
      const rows = readState()[collection].filter((item) =>
        matches(item, where)
      );
      for (const row of rows) update(collection, { id: row.id }, data);
      return { count: rows.length };
    };

    return {
      projectBrandProfile: {
        findUnique: ({ where }) => find('profiles', where),
        /**
         * `orderBy` is honoured, not ignored.
         *
         * The repository asks for `DEFAULT_AVATAR_FIRST` — the space's default
         * avatar, then the oldest — because a space may now hold several and
         * "whichever the planner reaches first" is not an answer. A fake that
         * drops the clause always returns the row inserted first, so the choice
         * the product makes here simply would not exist in this suite, and a
         * regression to an unordered read would pass.
         */
        findFirst: ({ where, orderBy, include }) => {
          const profile = sortRows(findMany('profiles', where), orderBy)[0] || null;
          if (!profile || !include?.activeVersion) return profile;
          profile.activeVersion = profile.activeVersionId
            ? find('versions', {
                organizationId: profile.organizationId,
                id: profile.activeVersionId,
              })
            : null;
          return profile;
        },
        create: ({ data }) => create('profiles', 'profile', data),
        upsert: ({ where, create: createData }) =>
          find('profiles', where) || create('profiles', 'profile', createData),
        update: ({ where, data }) => update('profiles', where, data),
        updateMany: ({ where, data }) => updateMany('profiles', where, data),
      },
      projectBrandProfileVersion: {
        findFirst: ({ where, orderBy, include }) => {
          const rows = findMany('versions', where);
          if (orderBy?.versionNumber === 'desc') {
            rows.sort((a, b) => b.versionNumber - a.versionNumber);
          }
          const version = rows[0] || null;
          if (!version || !include?.profile) return version;
          version.profile = find('profiles', {
            organizationId: version.organizationId,
            id: version.profileId,
          });
          return version;
        },
        findMany: ({ where, orderBy }) => {
          const rows = findMany('versions', where);
          if (orderBy?.versionNumber === 'desc') {
            rows.sort((a, b) => b.versionNumber - a.versionNumber);
          }
          return rows;
        },
        create: ({ data }) => create('versions', 'version', data),
        updateMany: ({ where, data }) => updateMany('versions', where, data),
      },
      brandProfileAuditEvent: {
        create: ({ data }) => {
          if (this.auditFailure) throw this.auditFailure;
          return create('audits', 'audit', data);
        },
      },
      autoPost: {
        findMany: async ({ where }) => {
          if (this.beforeAutoPostFindMany) {
            await this.beforeAutoPostFindMany();
          }
          return findMany('autoPosts', where);
        },
        create: ({ data }) => create('autoPosts', 'autopost', data),
      },
    };
  }
}

function createHarness() {
  const prisma = new InMemoryBrandPrisma();
  const repository = new BrandProfileRepository(
    { model: prisma.model },
    prisma.transaction
  );
  const context = new BrandProfileContextService(repository);
  const service = new BrandProfileService(repository, context);
  return { prisma, repository, context, service };
}

function statusOf(error) {
  return typeof error?.getStatus === 'function' ? error.getStatus() : undefined;
}

function codeOf(error) {
  const response =
    typeof error?.getResponse === 'function' ? error.getResponse() : undefined;
  return response?.code || response?.message?.code;
}

test('RED/GREEN: draft saves use tenant scope, optimistic revision and no model path', async () => {
  const { prisma, service } = createHarness();
  const first = await service.createDraft('org-a', 'user-admin', {
    label: 'Основной голос',
    content: validContent,
  });

  assert.equal(first.revision, 1);
  assert.equal(first.lifecycle, 'DRAFT');
  assert.equal(prisma.state.profiles[0].activeVersionId, null);
  assert.deepEqual(
    prisma.state.audits.map((event) => event.action),
    ['DRAFT_CREATED']
  );
  assert.equal('aiUsageRecord' in prisma.model, false);

  const saved = await service.updateDraft('org-a', 'user-admin', first.id, {
    expectedRevision: 1,
    label: 'Уточнённый голос',
    content: {
      ...validContent,
      project: { ...validContent.project, name: 'CF' },
    },
  });
  assert.equal(saved.revision, 2);

  await assert.rejects(
    service.updateDraft('org-a', 'user-admin', first.id, {
      expectedRevision: 1,
      content: validContent,
    }),
    (error) =>
      statusOf(error) === 409 &&
      codeOf(error) === 'BRAND_PROFILE_REVISION_CONFLICT'
  );
  await assert.rejects(
    service.updateDraft('org-b', 'user-admin', first.id, {
      expectedRevision: 2,
      content: validContent,
    }),
    (error) => statusOf(error) === 404
  );
  assert.equal(prisma.state.versions[0].revision, 2);
});

test('activation publishes immutable content, moves the pointer and audits atomically', async () => {
  const { prisma, service } = createHarness();
  const draft = await service.createDraft('org-a', 'admin-a', {
    label: 'Voice',
    content: validContent,
  });
  const before = clone(prisma.state);
  prisma.auditFailure = new Error('audit unavailable');

  await assert.rejects(
    service.activateVersion('org-a', 'admin-a', draft.id),
    /audit unavailable/
  );
  assert.deepEqual(
    prisma.state,
    before,
    'transaction must roll back version and pointer'
  );

  prisma.auditFailure = null;
  const activated = await service.activateVersion('org-a', 'admin-a', draft.id);
  assert.equal(activated.version.lifecycle, 'PUBLISHED');
  assert.equal(activated.profile.activeVersionId, draft.id);
  assert.equal(activated.version.publishedByUserId, 'admin-a');
  assert.equal(prisma.state.audits.at(-1).action, 'VERSION_ACTIVATED');

  const eventsBeforeRetry = prisma.state.audits.length;
  await service.activateVersion('org-a', 'admin-a', draft.id);
  assert.equal(
    prisma.state.audits.length,
    eventsBeforeRetry,
    'retry is idempotent'
  );

  await assert.rejects(
    service.updateDraft('org-a', 'admin-a', draft.id, {
      expectedRevision: 1,
      content: validContent,
    }),
    (error) =>
      statusOf(error) === 409 &&
      codeOf(error) === 'BRAND_PROFILE_VERSION_IMMUTABLE'
  );
});

test('tampered persisted content is unavailable before activation and on every runtime resolution', async () => {
  const { prisma, service } = createHarness();
  const draft = await service.createDraft('org-a', 'admin-a', {
    label: 'Integrity protected',
    content: validContent,
  });
  const auditCountBeforeTamper = prisma.state.audits.length;
  prisma.state.versions[0].content.project.name = '';
  prisma.state.versions[0].content.project.unexpected =
    'tamper must not downgrade to validation';

  await assert.rejects(
    service.activateVersion('org-a', 'admin-a', draft.id),
    (error) =>
      statusOf(error) === 409 &&
      codeOf(error) === 'BRAND_PROFILE_VERSION_UNAVAILABLE'
  );
  assert.equal(prisma.state.profiles[0].activeVersionId, null);
  assert.equal(prisma.state.versions[0].lifecycle, 'DRAFT');
  assert.equal(prisma.state.audits.length, auditCountBeforeTamper);

  await service.updateDraft('org-a', 'admin-a', draft.id, {
    expectedRevision: 1,
    content: validContent,
  });
  await service.activateVersion('org-a', 'admin-a', draft.id);
  prisma.state.versions[0].content.project.name = 'Published tamper';
  const stateBeforeRead = clone(prisma.state);

  for (const selection of [
    { mode: 'active' },
    { mode: 'version', versionId: draft.id },
  ]) {
    await assert.rejects(
      service.resolveContext('org-a', selection),
      (error) =>
        statusOf(error) === 409 &&
        codeOf(error) === 'BRAND_PROFILE_VERSION_UNAVAILABLE'
    );
  }
  assert.deepEqual(prisma.state, stateBeforeRead);
});

test('clone-to-edit preserves published snapshot and creates a new revision lineage', async () => {
  const { prisma, service } = createHarness();
  const original = await service.createDraft('org-a', 'admin-a', {
    label: 'v1',
    content: validContent,
  });
  await service.activateVersion('org-a', 'admin-a', original.id);
  const publishedBefore = clone(prisma.state.versions[0]);

  const cloneDraft = await service.cloneVersion(
    'org-a',
    'admin-a',
    original.id
  );
  assert.equal(cloneDraft.lifecycle, 'DRAFT');
  assert.equal(cloneDraft.parentVersionId, original.id);
  assert.equal(cloneDraft.versionNumber, 2);
  assert.deepEqual(prisma.state.versions[0], publishedBefore);
});

test('resolver distinguishes neutral modes and rejects missing, foreign, draft and deactivated versions', async () => {
  const { service } = createHarness();
  assert.deepEqual(await service.resolveContext('org-a', undefined), {
    schemaVersion: 'brand-profile-context/v1',
    selection: 'legacy_none',
    applied: { mode: 'neutral_fallback', reason: 'legacy_request' },
    warnings: [],
  });
  assert.equal(
    (await service.resolveContext('org-a', { mode: 'active' })).applied.reason,
    'no_active_profile'
  );
  assert.equal(
    (await service.resolveContext('org-a', { mode: 'none' })).applied.reason,
    'explicit_none'
  );
  await assert.rejects(
    service.resolveContext('org-a', { mode: 'version' }),
    (error) =>
      statusOf(error) === 400 &&
      codeOf(error) === 'BRAND_PROFILE_SELECTION_INVALID'
  );

  const draftA = await service.createDraft('org-a', 'admin-a', {
    label: 'A',
    content: validContent,
  });
  const draftB = await service.createDraft('org-b', 'admin-b', {
    label: 'B',
    content: validContent,
  });

  for (const versionId of ['missing', draftA.id, draftB.id]) {
    await assert.rejects(
      service.resolveContext('org-a', { mode: 'version', versionId }),
      (error) =>
        statusOf(error) === 409 &&
        codeOf(error) === 'BRAND_PROFILE_VERSION_UNAVAILABLE'
    );
  }

  await service.activateVersion('org-a', 'admin-a', draftA.id);
  const resolved = await service.resolveContext(
    'org-a',
    { mode: 'version', versionId: draftA.id },
    'linkedin'
  );
  assert.equal(resolved.applied.mode, 'profile');
  assert.equal(resolved.applied.versionId, draftA.id);
  assert.equal(resolved.effectiveVoice.formality, 'formal');
  assert.deepEqual(resolved.effectiveVoice.guardrails.prohibitedClaims, [
    'Гарантированный результат',
    'Лучший на рынке',
  ]);

  await service.deactivate('org-a', 'admin-a');
  await assert.rejects(
    service.resolveContext('org-a', { mode: 'version', versionId: draftA.id }),
    (error) =>
      statusOf(error) === 409 &&
      codeOf(error) === 'BRAND_PROFILE_VERSION_UNAVAILABLE'
  );
});

/**
 * Выученное на правках доезжает до голоса — и только своего пространства.
 *
 * До 05.09.2026 `fn33.28.19` копил правила в `ProjectBrandProfile.learnedRules`
 * и показывал их на экране аватара, а сборщик голоса о колонке не знал: аватар
 * «учился», черновик не менялся. Здесь огорожены обе половины ответа — что
 * правила попадают в `effectiveVoice`, и что читаются они из строки профиля,
 * которую репозиторий уже привёз с `organizationId` в условии.
 *
 * Изоляция проверяется не заглядыванием в `where`, а результатом: у `org-a`
 * профиль заведён первым, поэтому чтение без арендатора вернуло бы его строку
 * обоим. `org-b`, получающий своё правило, — это и есть доказательство.
 */
test('a resolved voice carries what the avatar learned, and only from its own space', async () => {
  const { prisma, service } = createHarness();
  const draftA = await service.createDraft('org-a', 'admin-a', {
    label: 'A',
    content: validContent,
  });
  await service.activateVersion('org-a', 'admin-a', draftA.id);
  const draftB = await service.createDraft('org-b', 'admin-b', {
    label: 'B',
    content: validContent,
  });
  await service.activateVersion('org-b', 'admin-b', draftB.id);

  const profileOf = (organizationId) =>
    prisma.state.profiles.find((row) => row.organizationId === organizationId);
  const learnedAt = '2026-09-05T10:00:00.000Z';

  profileOf('org-a').learnedRules = {
    version: 1,
    lastRunAt: learnedAt,
    rules: [
      { id: 'rule-1', text: 'Убирай вводные слова.', learnedAt, pairs: 6 },
      { id: 'rule-2', text: 'Ставь цифру вместо оценки.', learnedAt, pairs: 5 },
      // Строка без текста — то, что может лежать в `Json?` после чужой правки
      // руками. Разбор её выбрасывает, а не роняет генерацию.
      { id: 'rule-3', text: '   ', learnedAt, pairs: 5 },
    ],
  };
  profileOf('org-b').learnedRules = {
    version: 1,
    lastRunAt: learnedAt,
    rules: [
      { id: 'rule-9', text: 'Правило чужого пространства.', learnedAt, pairs: 5 },
    ],
  };

  const expected = ['Убирай вводные слова.', 'Ставь цифру вместо оценки.'];
  const active = await service.resolveContext('org-a', { mode: 'active' });
  assert.deepEqual(active.effectiveVoice.learnedRules, expected);

  const pinned = await service.resolveContext('org-a', {
    mode: 'version',
    versionId: draftA.id,
  });
  assert.deepEqual(pinned.effectiveVoice.learnedRules, expected);

  const foreign = await service.resolveContext('org-b', { mode: 'active' });
  assert.deepEqual(foreign.effectiveVoice.learnedRules, [
    'Правило чужого пространства.',
  ]);

  // Аватар, который ничему не научился, отдаёт ровно прежний голос: ключа нет,
  // и слепок снимка контекста не меняется ни у одного существующего профиля.
  profileOf('org-a').learnedRules = null;
  const bare = await service.resolveContext('org-a', { mode: 'active' });
  assert.equal('learnedRules' in bare.effectiveVoice, false);
  assert.equal(bare.effectiveVoice.formality, 'neutral');
});

test('incomplete activation fails before persistence and exact soft-deactivate audit is atomic', async () => {
  const { prisma, service } = createHarness();
  const incomplete = clone(validContent);
  incomplete.project.audiences = [];
  const draft = await service.createDraft('org-a', 'admin-a', {
    content: incomplete,
  });
  const auditCount = prisma.state.audits.length;
  await assert.rejects(
    service.activateVersion('org-a', 'admin-a', draft.id),
    (error) =>
      statusOf(error) === 422 &&
      codeOf(error) === 'BRAND_PROFILE_VALIDATION_FAILED'
  );
  assert.equal(prisma.state.profiles[0].activeVersionId, null);
  assert.equal(prisma.state.audits.length, auditCount);

  await service.updateDraft('org-a', 'admin-a', draft.id, {
    expectedRevision: 1,
    content: validContent,
  });
  await service.activateVersion('org-a', 'admin-a', draft.id);

  const beforeFailedAudit = clone(prisma.state);
  prisma.auditFailure = new Error('deactivate audit unavailable');
  await assert.rejects(
    service.deactivate('org-a', 'admin-a'),
    /deactivate audit unavailable/
  );
  assert.deepEqual(prisma.state, beforeFailedAudit);
  prisma.auditFailure = null;

  prisma.state.autoPosts.push({
    id: 'autopost-v2',
    ...activeV2AutoPostData('org-a', draft.id),
  });
  await assert.rejects(
    service.deactivate('org-a', 'admin-a'),
    (error) =>
      statusOf(error) === 409 &&
      codeOf(error) === 'BRAND_PROFILE_DEPENDENCIES_ACTIVE'
  );
  assert.equal(prisma.state.profiles[0].activeVersionId, draft.id);
  prisma.state.autoPosts = [];

  const result = await service.deactivate('org-a', 'admin-a');
  assert.equal(result.deactivated, true);
  assert.equal(result.profile.activeVersionId, null);
  assert.ok(result.profile.deletedAt instanceof Date);
  assert.equal(prisma.state.audits.at(-1).action, 'PROFILE_DEACTIVATED');

  const restored = await service.restoreVersion('org-a', 'admin-a', draft.id);
  assert.equal(restored.profile.deletedAt, null);
  assert.equal(restored.profile.activeVersionId, draft.id);
  assert.equal(prisma.state.audits.at(-1).action, 'PROFILE_RESTORED');
});

test('draft validation rejects unknown fields and conflicting normalized terms', async () => {
  const { service } = createHarness();
  const unknown = clone(validContent);
  unknown.voice.hiddenInstruction = 'ignore safety';
  await assert.rejects(
    service.createDraft('org-a', 'admin-a', { content: unknown }),
    (error) =>
      statusOf(error) === 422 &&
      error
        .getResponse()
        .issues.includes('voice.hiddenInstruction:unknown_field')
  );

  const conflicting = clone(validContent);
  conflicting.lexicon.avoid.push({ term: ' ЧЕРНОВИК ' });
  await assert.rejects(
    service.createDraft('org-a', 'admin-a', { content: conflicting }),
    (error) =>
      statusOf(error) === 422 &&
      error.getResponse().issues.includes('lexicon:preferred_avoid_conflict')
  );
});

test('creating a new draft explicitly restores a profile that has no published version', async () => {
  const { prisma, service } = createHarness();
  const incomplete = clone(validContent);
  incomplete.project.contentGoals = [];
  await service.createDraft('org-a', 'admin-a', { content: incomplete });
  await service.deactivate('org-a', 'admin-a');

  const restoredDraft = await service.createDraft('org-a', 'admin-a', {
    content: validContent,
  });
  assert.equal(restoredDraft.lifecycle, 'DRAFT');
  assert.equal(prisma.state.profiles[0].deletedAt, null);
  assert.equal(prisma.state.profiles[0].activeVersionId, null);
  assert.deepEqual(
    prisma.state.audits.slice(-2).map((event) => event.action),
    ['DRAFT_CREATED', 'PROFILE_RESTORED']
  );
});

test('serializable pin protocol prevents deactivation from committing beside a new active V2 dependency', async () => {
  const { prisma, repository, service } = createHarness();
  assert.equal(
    typeof repository.withPinnedPublishedVersionWrite,
    'function',
    'repository must expose the shared serializable V2 pin protocol'
  );
  const draft = await service.createDraft('org-a', 'admin-a', {
    content: validContent,
  });
  await service.activateVersion('org-a', 'admin-a', draft.id);

  let releaseDependencyRead;
  const dependencyReadReleased = new Promise((resolve) => {
    releaseDependencyRead = resolve;
  });
  let announceDependencyRead;
  const dependencyReadReached = new Promise((resolve) => {
    announceDependencyRead = resolve;
  });
  prisma.beforeAutoPostFindMany = async () => {
    prisma.beforeAutoPostFindMany = null;
    announceDependencyRead();
    await dependencyReadReleased;
  };

  const deactivation = service.deactivate('org-a', 'admin-a');
  await dependencyReadReached;
  await repository.withPinnedPublishedVersionWrite(
    'org-a',
    draft.id,
    async (transaction, version) =>
      transaction.autoPost.create({
        data: activeV2AutoPostData('org-a', version.id),
      })
  );
  releaseDependencyRead();

  await assert.rejects(
    deactivation,
    (error) =>
      statusOf(error) === 409 &&
      codeOf(error) === 'BRAND_PROFILE_DEPENDENCIES_ACTIVE'
  );
  assert.equal(prisma.state.profiles[0].deletedAt, null);
  assert.equal(prisma.state.profiles[0].activeVersionId, draft.id);
  assert.equal(prisma.state.autoPosts.length, 1);
});

test('serializable pin protocol retries P2034 only within its bounded budget', async () => {
  const { prisma, repository, service } = createHarness();
  assert.equal(typeof repository.withPinnedPublishedVersionWrite, 'function');
  const draft = await service.createDraft('org-a', 'admin-a', {
    content: validContent,
  });
  await service.activateVersion('org-a', 'admin-a', draft.id);
  prisma.forcedSerializableConflicts = 10;
  const attemptsBefore = prisma.serializableAttempts;

  await assert.rejects(
    repository.withPinnedPublishedVersionWrite(
      'org-a',
      draft.id,
      async (transaction, version) =>
        transaction.autoPost.create({
          data: activeV2AutoPostData('org-a', version.id),
        })
    ),
    (error) => error?.code === 'P2034'
  );
  assert.equal(prisma.serializableAttempts - attemptsBefore, 3);
  assert.equal(prisma.state.autoPosts.length, 0);
});

test('controller exposes tenant-derived reads and protects every mutation with ADMIN policy', () => {
  const policyDecorator =
    (...handlers) =>
    (_target, _key, descriptor) => {
      Reflect.defineMetadata('check_policy', handlers, descriptor.value);
    };
  const controller = loadTypeScriptModule(
    'apps/backend/src/api/routes/brand-profile.controller.ts',
    {
      '@contentfactory/nestjs-libraries/user/org.from.request': {
        GetOrgFromRequest: () => () => undefined,
      },
      '@contentfactory/nestjs-libraries/user/user.from.request': {
        GetUserFromRequest: () => () => undefined,
      },
      '@contentfactory/backend/services/auth/permissions/permissions.ability': {
        CheckPolicies: policyDecorator,
      },
      '@contentfactory/backend/services/auth/permissions/permission.exception.class':
        {
          AuthorizationActions: { Create: 'create' },
          Sections: { ADMIN: 'admin', EDITOR: 'editor' },
        },
    },
    { sources: commonSources }
  ).BrandProfileController;

  assert.equal(
    Reflect.getMetadata('path', controller),
    '/content-intelligence/brand-profile'
  );
  for (const method of [
    'createDraft',
    'updateDraft',
    'activateVersion',
    'cloneVersion',
    'restoreVersion',
    'deactivate',
  ]) {
    assert.deepEqual(
      Reflect.getMetadata('check_policy', controller.prototype[method]),
      // `content-factory-next-fn33.90`: профиль бренда — письменная половина
      // голоса, и он ушёл редактору вместе с ним.
      [['create', 'editor']]
    );
  }
  assert.equal(
    Reflect.getMetadata('check_policy', controller.prototype.getOverview),
    undefined
  );
  assert.equal(
    Reflect.getMetadata('check_policy', controller.prototype.resolveContext),
    undefined
  );
});

test('a space with two avatars activates the one it chose, not whichever row came first', async () => {
  /**
   * `ProjectBrandProfile.organizationId` stopped being unique on 2026-08-25:
   * a space may hold several avatars, each with its own corpus and print. Two
   * things follow, and neither is visible to the compiler — the repository's
   * client is typed `Record<string, any>`.
   *
   * The read has to be ordered. `findFirst` without `DEFAULT_AVATAR_FIRST`
   * returns whatever the planner reaches first, which is stable in a fresh
   * database and not stable in a real one.
   *
   * The write has to name the row. `update({ where: { organizationId } })` is
   * no longer a unique key: against the real client it throws, and against a
   * fake that reads it as a plain field it silently updates a different
   * avatar. Both failures are the same mistake seen from two sides, and until
   * this test nothing in the repository would notice either — the suites all
   * gave a space exactly one profile, where first row and chosen row are the
   * same row.
   *
   * So: the space's default is seeded second, and the write must still land on
   * it and only on it.
   */
  const { prisma, service } = createHarness();
  const earlier = {
    id: 'profile-earlier',
    organizationId: 'org-a',
    activeVersionId: null,
    isDefault: false,
    deletedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };
  const chosen = {
    ...earlier,
    id: 'profile-chosen',
    isDefault: true,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
  };
  prisma.state.profiles.push(earlier, chosen);

  const draft = await service.createDraft('org-a', 'admin-a', {
    label: 'Второй голос',
    content: validContent,
  });
  assert.equal(
    prisma.state.versions.at(-1).profileId,
    'profile-chosen',
    'the draft belongs to the avatar the ordering chose'
  );

  await service.activateVersion('org-a', 'admin-a', draft.id);

  const byId = Object.fromEntries(
    prisma.state.profiles.map((profile) => [profile.id, profile])
  );
  assert.equal(byId['profile-chosen'].activeVersionId, draft.id);
  assert.equal(
    byId['profile-earlier'].activeVersionId,
    null,
    'the other avatar in the same space keeps its own pointer'
  );
  assert.equal(prisma.state.profiles.length, 2, 'no third profile was created');
});
