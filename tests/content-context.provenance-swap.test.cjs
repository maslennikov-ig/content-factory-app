'use strict';

/**
 * `content-factory-next-fn33.28.14`: у поста один снимок — значит и один след
 * происхождения.
 *
 * `writeContentContextDraftProvenance` вела запись одним `upsert` по тройке
 * (организация, пост, снимок), и подмена снимка просто заводила вторую строку.
 * У поста оставались две записи `ContentOutputContext`, обе со статусом
 * `VALID`, и прежняя продолжала утверждать, что пост собран из старого снимка
 * и проверен, — хотя `Post.contentContextSnapshotId` уже другой и отметка
 * проверки с него снята.
 *
 * На экран это не выходило: `posts.repository.ts` берёт свежую строку
 * (`take: 1`, `orderBy createdAt desc`). Но след «откуда это взялось»
 * противоречил сам себе, а внешний ключ мёртвой строки держал старый снимок от
 * удаления по сроку хранения.
 *
 * Здесь проверяется сама запись, с подменённой базой: предмет набора — какие
 * запросы уходят и в каком порядке, а не то, что стоит в настоящих таблицах
 * (это делает `post.content-context.test.cjs` против живой базы).
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { validateContentContextForDraft, writeContentContextDraftProvenance } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts',
    {
      './content-context.errors': {
        ContentContextError: class ContentContextError extends Error {
          constructor(code, status, message) {
            super(message);
            this.code = code;
            this.status = status;
          }
        },
      },
    }
  );

const ORGANIZATION = 'org-a';
const POST = 'post-compose-3';

/** Подменённый клиент, который только записывает, о чём его попросили. */
const makeClient = () => {
  const calls = [];
  const record = (name) => async (args) => {
    calls.push({ name, args });
    return { count: 0 };
  };
  return {
    calls,
    client: {
      contentOutputContext: {
        deleteMany: record('contentOutputContext.deleteMany'),
        upsert: record('contentOutputContext.upsert'),
      },
      draftEvidence: {
        deleteMany: record('draftEvidence.deleteMany'),
        createMany: record('draftEvidence.createMany'),
      },
    },
  };
};

const binding = (snapshotId, evidence = [{ evidenceId: 'E1', citationId: 'E1' }]) => ({
  contentContextSnapshotId: snapshotId,
  brandProfileVersionId: null,
  profileContentDigest: null,
  usedCitationIds: ['E1'],
  evidence,
});

const write = (client, snapshotId) =>
  writeContentContextDraftProvenance(client, {
    organizationId: ORGANIZATION,
    postId: POST,
    content: 'Текст поста',
    binding: binding(snapshotId),
  });

describe('the provenance of a post follows its snapshot', () => {
  test('writing under a new snapshot removes the row of every other one', async () => {
    const { client, calls } = makeClient();

    await write(client, 'ccs-compose-2');

    const removal = calls.find(
      (call) => call.name === 'contentOutputContext.deleteMany'
    );
    expect(removal).toBeTruthy();
    expect(removal.args.where).toEqual({
      organizationId: ORGANIZATION,
      postId: POST,
      // Именно «любой другой», а не «вот этот прежний»: имени прежнего снимка
      // здесь нет, и знать его запись не обязана.
      contentContextSnapshotId: { not: 'ccs-compose-2' },
    });
  });

  test('the row of the current snapshot is kept and rewritten, not deleted', async () => {
    const { client, calls } = makeClient();

    await write(client, 'ccs-compose-2');

    const removal = calls.findIndex(
      (call) => call.name === 'contentOutputContext.deleteMany'
    );
    const upsert = calls.findIndex(
      (call) => call.name === 'contentOutputContext.upsert'
    );
    // Сначала убрать чужие, потом записать свою: обратный порядок оставил бы
    // окно, в котором строк две. `-1` здесь означал бы, что чистки нет вовсе,
    // и «раньше» выполнилось бы само собой.
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(removal).toBeLessThan(upsert);
    expect(calls[upsert].args.where).toEqual({
      organizationId_postId_contentContextSnapshotId: {
        organizationId: ORGANIZATION,
        postId: POST,
        contentContextSnapshotId: 'ccs-compose-2',
      },
    });
    expect(calls[upsert].args.update.validationStatus).toBe('VALID');
  });

  test('the removal is scoped to one post of one workspace', async () => {
    const { client, calls } = makeClient();

    await write(client, 'ccs-compose-2');

    for (const call of calls.filter((one) => one.name.endsWith('deleteMany'))) {
      expect(call.args.where.organizationId).toBe(ORGANIZATION);
      expect(call.args.where.postId).toBe(POST);
    }
  });

  test('evidence is still cleaned the way it always was', async () => {
    // Соседний `DraftEvidence` чистился правильно и до этой правки; проверка
    // стоит, чтобы починка одного следа не сломала другой.
    const { client, calls } = makeClient();

    await write(client, 'ccs-compose-2');

    const names = calls.map((call) => call.name);
    expect(names).toContain('draftEvidence.deleteMany');
    expect(names).toContain('draftEvidence.createMany');
    expect(names.indexOf('draftEvidence.deleteMany')).toBeLessThan(
      names.indexOf('draftEvidence.createMany')
    );
  });

  test('a post with no evidence still loses the stale provenance row', async () => {
    // Чистка следа не должна зависеть от того, есть ли за постом
    // подтверждения: снимок подменили — значит прежняя строка мертва в любом
    // случае.
    const { client, calls } = makeClient();

    await writeContentContextDraftProvenance(client, {
      organizationId: ORGANIZATION,
      postId: POST,
      content: 'Текст поста',
      binding: binding('ccs-compose-2', []),
    });

    const names = calls.map((call) => call.name);
    expect(names).toContain('contentOutputContext.deleteMany');
    expect(names).toContain('contentOutputContext.upsert');
    // Пустых строк подтверждений при этом не создаётся.
    expect(names).not.toContain('draftEvidence.createMany');
  });
});

/**
 * «Взято из поиска» доживает до сохранения (`content-factory-next-ec48.1`,
 * решение владельца 05.09.2026).
 *
 * Строитель контекста с этого дня пускает свежую находку в черновик, но
 * проверка при сохранении читала одно и то же условие «оценка принята» и для
 * подтверждённого, и для найденного. Без этой правки человек получал бы
 * `CONTENT_CONTEXT_INVALIDATED` — «выбранное доказательство больше не
 * годится» — о материале, которого никто не трогал, ровно на том тексте,
 * который продукт сам ему и написал.
 *
 * Читается замороженная причина включения, а не текущая оценка: за пятнадцать
 * минут жизни снимка находку могли и подтвердить, и отвергнуть.
 */
describe('a draft grounded on a web find can be saved', () => {
  const NOW = new Date('2026-09-05T10:00:00.000Z');

  const searchItem = (overrides = {}) => ({
    ordinal: 1,
    citationId: 'E1',
    factId: null,
    evidenceId: 'evidence-found',
    inclusionReason: 'SEARCH_UNCONFIRMED',
    tombstone: null,
    evidence: {
      organizationId: ORGANIZATION,
      sourceSnapshotId: 'snapshot-found',
      tombstone: null,
      freshnessStatus: 'FRESH',
      freshUntil: new Date('2027-09-05T10:00:00.000Z'),
      assessment: { status: 'PROPOSED', trustTier: 'UNRATED' },
      snapshot: {
        purgedAt: null,
        kind: 'SEARCH_PROVIDER_RESULT',
        source: null,
      },
      ...overrides,
    },
  });

  const validate = (item) =>
    validateContentContextForDraft(
      {
        contentContextSnapshot: {
          findFirst: async () => ({
            id: 'ccs-search-1',
            invalidatedAt: null,
            status: 'READY',
            generationPolicy: 'ALLOW_GROUNDED',
            expiresAt: new Date('2026-09-05T10:15:00.000Z'),
            brandProfileVersionId: null,
            profileContentDigest: null,
            items: [item],
          }),
        },
      },
      {
        organizationId: ORGANIZATION,
        contentContextSnapshotId: 'ccs-search-1',
        usedCitationIds: ['E1'],
        now: NOW,
      }
    );

  test('the find the builder admitted is still admitted at save time', async () => {
    const binding = await validate(searchItem());

    expect(binding.usedCitationIds).toEqual(['E1']);
    expect(binding.evidence).toEqual([
      { evidenceId: 'evidence-found', citationId: 'E1' },
    ]);
  });

  test('a find the person refused is refused here too', async () => {
    await expect(
      validate(
        searchItem({ assessment: { status: 'REJECTED', trustTier: 'UNRATED' } })
      )
    ).rejects.toMatchObject({ code: 'CONTENT_CONTEXT_INVALIDATED' });
  });

  test('a blocked source stays blocked whatever the inclusion reason says', async () => {
    await expect(
      validate(
        searchItem({ assessment: { status: 'PROPOSED', trustTier: 'BLOCKED' } })
      )
    ).rejects.toMatchObject({ code: 'CONTENT_CONTEXT_INVALIDATED' });
  });

  test('an ordinary excerpt still needs an accepted assessment', async () => {
    const ordinary = searchItem();
    ordinary.inclusionReason = 'FACT_SUPPORT';

    await expect(validate(ordinary)).rejects.toMatchObject({
      code: 'CONTENT_CONTEXT_INVALIDATED',
    });
  });
});
