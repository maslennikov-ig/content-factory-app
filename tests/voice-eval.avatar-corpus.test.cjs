'use strict';

/**
 * Чей корпус читает стенд.
 *
 * До 26.08.2026 вопроса не было: пространство означало одного автора, и
 * `corpora.cjs` читал по `organizationId`. С `pl1.26` в пространстве живут
 * трое, и тот же самый код собрал бы три корпуса в один — усреднённого автора,
 * ровно тот дефект, который из продукта убрали. Отказ был бы заметен; здесь
 * отказа нет, есть тихо неверное число, и оно доходит до отчёта как число.
 *
 * Отсюда четыре вещи, за которыми смотрит этот набор.
 *
 * 1. Выборка образцов идёт по аватару, и `avatarId IS NULL` достаётся только
 *    аватару по умолчанию — то же правило, что у `VoiceSampleRepository.
 *    listActive`. Разойдутся — стенд померит корпус, которого продукт не
 *    разбирал.
 * 2. Профиль читается по идентификатору аватара. Порядок «сначала по
 *    умолчанию» отвечал бы про чужой голос, о каком корпусе ни спроси.
 * 3. Аватар опознаётся по имени, и ни одна неоднозначность не разрешается
 *    молча: нет имени в записи, нет такого аватара, есть два — отказ.
 * 4. Кэш одного аватара не отдаётся другому. Имя корпуса в заголовке отчёта
 *    берётся из реестра, а не из кэша, поэтому подмена невидима.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REGISTRY = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'voice-eval-corpora-')),
  'corpora.json'
);

fs.writeFileSync(
  REGISTRY,
  JSON.stringify({
    first: { organizationId: 'org-1', avatar: 'Первый', language: 'ru' },
    second: { organizationId: 'org-1', avatar: 'Второй', language: 'ru' },
    nameless: { organizationId: 'org-1', language: 'ru' },
  })
);

process.env.VOICE_EVAL_CORPORA = REGISTRY;

/**
 * Постгрес, отвечающий по заранее назначенному сценарию и запоминающий, о чём
 * его спросили. Проверяется именно вопрос: ответ на неверный вопрос выглядит
 * так же убедительно, как на верный.
 */
const asked = [];
let answers = [];

jest.mock('pg', () => ({
  Client: class {
    constructor(config) {
      this.config = config;
    }
    async connect() {}
    async query(text, values) {
      asked.push({ text, values });
      const next = answers.shift();
      return next ?? { rows: [] };
    }
    async end() {}
  },
}));

const corpora = require('../scripts/evidence/voice-eval/corpora.cjs');

const AVATARS = {
  first: { id: 'avatar-1', name: 'Первый', isDefault: true },
  second: { id: 'avatar-2', name: 'Второй', isDefault: false },
};

/** Ответы на четыре запроса `pull`: аватар, образцы, профиль, настройки. */
const pullAnswers = (avatar, samples = []) => [
  { rows: [avatar] },
  { rows: samples },
  { rows: [{ id: 'version-9', label: 'v9', versionNumber: 9, content: {} }] },
  { rows: [{ provider: 'openrouter' }] },
];

const cacheFile = () =>
  path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'voice-eval-cache-')),
    'corpus.json'
  );

beforeEach(() => {
  asked.length = 0;
  answers = [];
});

describe('выборка образцов', () => {
  it('спрашивает про аватар, а не про пространство', async () => {
    answers = pullAnswers(AVATARS.second, [{ id: 's-1', text: 'раз' }]);

    const pulled = await corpora.load('second', cacheFile());

    const samples = asked[1];
    expect(samples.text).toMatch(/"avatarId" = \$2/);
    expect(samples.values).toEqual(['org-1', 'avatar-2', false]);
    expect(pulled.corpus.avatarId).toBe('avatar-2');
    expect(pulled.corpus.avatarIsDefault).toBe(false);
  });

  it('отдаёт тексты без аватара только аватару по умолчанию', async () => {
    answers = pullAnswers(AVATARS.first);
    await corpora.load('first', cacheFile());
    expect(asked[1].text).toMatch(/"avatarId" is null and \$3/);
    expect(asked[1].values[2]).toBe(true);

    asked.length = 0;
    answers = pullAnswers(AVATARS.second);
    await corpora.load('second', cacheFile());
    expect(asked[1].values[2]).toBe(false);
  });

  it('держит порядок, от которого зависит разбиение на обучающую и отложенную', async () => {
    answers = pullAnswers(AVATARS.first);
    await corpora.load('first', cacheFile());
    expect(asked[1].text).toMatch(/order by "createdAt", id/);
  });
});

describe('профиль и действующая версия', () => {
  it('читает профиль по аватару, а не первым по умолчанию', async () => {
    answers = pullAnswers(AVATARS.second);

    await corpora.load('second', cacheFile());

    const profile = asked[2];
    expect(profile.values).toEqual(['avatar-2']);
    expect(profile.text).not.toMatch(/isDefault/);
  });

  it('свежесть проверяется у того же аватара', async () => {
    const cache = cacheFile();
    fs.writeFileSync(
      cache,
      JSON.stringify({
        corpus: { organizationId: 'org-1', avatar: 'Второй' },
        profile: { id: 'version-9' },
        samples: [{ id: 's-2', text: 'свой' }],
      })
    );
    answers = [
      { rows: [AVATARS.second] },
      { rows: [{ activeVersionId: 'version-9' }] },
    ];

    const loaded = await corpora.load('second', cache);

    // Версия совпала — кэш взят как есть, база больше не спрашивалась.
    expect(loaded.samples).toEqual([{ id: 's-2', text: 'свой' }]);
    expect(asked).toHaveLength(2);
    expect(asked[1].values).toEqual(['avatar-2']);
  });

  it('перечитывает корпус, когда голос этого аватара пересобран', async () => {
    const cache = cacheFile();
    fs.writeFileSync(
      cache,
      JSON.stringify({
        corpus: { organizationId: 'org-1', avatar: 'Второй' },
        profile: { id: 'version-8' },
        samples: [{ id: 'старый', text: 'старый голос' }],
      })
    );
    answers = [
      { rows: [AVATARS.second] },
      { rows: [{ activeVersionId: 'version-9' }] },
      ...pullAnswers(AVATARS.second, [{ id: 's-2', text: 'свой' }]),
    ];

    const loaded = await corpora.load('second', cache);

    expect(loaded.profile.id).toBe('version-9');
    expect(loaded.samples).toEqual([{ id: 's-2', text: 'свой' }]);
  });
});

describe('опознание аватара', () => {
  it('отказывает записи корпуса без имени аватара', async () => {
    answers = [];
    await expect(corpora.load('nameless', cacheFile())).rejects.toThrow(
      /names no avatar/
    );
    expect(asked).toHaveLength(0);
  });

  it('отказывает, когда такого аватара нет', async () => {
    answers = [{ rows: [] }];
    await expect(corpora.load('first', cacheFile())).rejects.toThrow(
      /no avatar named "Первый"/
    );
  });

  it('отказывает, когда имя носят двое', async () => {
    answers = [{ rows: [AVATARS.first, { ...AVATARS.second, name: 'Первый' }] }];
    await expect(corpora.load('first', cacheFile())).rejects.toThrow(
      /2 avatars named "Первый"/
    );
  });
});

describe('кэш', () => {
  it('не отдаёт корпус одного аватара за корпус другого', async () => {
    const cache = cacheFile();
    fs.writeFileSync(
      cache,
      JSON.stringify({
        corpus: { organizationId: 'org-1', avatar: 'Первый' },
        profile: { id: 'version-9' },
        samples: [{ id: 'чужой', text: 'чужой текст' }],
      })
    );
    answers = pullAnswers(AVATARS.second, [{ id: 's-2', text: 'свой' }]);

    const loaded = await corpora.load('second', cache);

    expect(loaded.samples).toEqual([{ id: 's-2', text: 'свой' }]);
    expect(loaded.corpus.avatar).toBe('Второй');
  });

  it('перечитывает кэш, снятый до того, как корпус стал принадлежать аватару', async () => {
    const cache = cacheFile();
    fs.writeFileSync(
      cache,
      JSON.stringify({
        corpus: { organizationId: 'org-1' },
        profile: { id: 'version-9' },
        samples: [{ id: 'усреднённый', text: 'три корпуса в одном' }],
      })
    );
    answers = pullAnswers(AVATARS.first, [{ id: 's-1', text: 'свой' }]);

    const loaded = await corpora.load('first', cache);

    expect(loaded.samples).toEqual([{ id: 's-1', text: 'свой' }]);
  });

  it('не ходит в базу, когда офлайн-пересчёт держит кэш того же аватара', async () => {
    const cache = cacheFile();
    fs.writeFileSync(
      cache,
      JSON.stringify({
        corpus: { organizationId: 'org-1', avatar: 'Первый' },
        profile: { id: 'version-9' },
        samples: [{ id: 's-1', text: 'свой' }],
      })
    );

    const loaded = await corpora.load('first', cache, { offline: true });

    expect(loaded.samples).toHaveLength(1);
    expect(asked).toHaveLength(0);
  });

  it('офлайн-пересчёт всё равно не берёт кэш чужого аватара', async () => {
    const cache = cacheFile();
    fs.writeFileSync(
      cache,
      JSON.stringify({
        corpus: { organizationId: 'org-1', avatar: 'Первый' },
        profile: { id: 'version-9' },
        samples: [{ id: 'чужой', text: 'чужой текст' }],
      })
    );
    answers = pullAnswers(AVATARS.second, [{ id: 's-2', text: 'свой' }]);

    const loaded = await corpora.load('second', cache, { offline: true });

    expect(loaded.samples).toEqual([{ id: 's-2', text: 'свой' }]);
  });
});
