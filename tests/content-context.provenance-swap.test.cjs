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

const { writeContentContextDraftProvenance } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts',
  {
    './content-context.errors': {
      ContentContextError: class ContentContextError extends Error {},
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
