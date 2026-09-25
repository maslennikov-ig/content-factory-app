'use strict';
require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence';
let responses, modelCalls;
const mocks = {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async (_org, _temp, _limit, role) => ({ withStructuredOutput: () => ({
      invoke: async (prompt) => {
        modelCalls.push({ role, prompt });
        const value = responses.shift();
        if (value instanceof Error) throw value;
        if (!value) throw new Error('Unexpected model call');
        return value;
      },
    }) }),
  },
  '@contentfactory/nestjs-libraries/agent/agent.graph.service': { AgentGraphService: class {} },
  '@contentfactory/nestjs-libraries/integrations/integration.manager': { IntegrationManager: class {} },
  '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
  '../brief/content-brief.repository': { ContentBriefRepository: class {} },
  '../search/text-search.service': { TextSearchService: class {} },
  './piece.repository': { PieceRepository: class {} },
};
const { IntakeService } = loadWithMocks(`${base}/intake/intake.service.ts`, mocks);
const { PieceService } = loadWithMocks(`${base}/pieces/piece.service.ts`, {
  ...mocks, '../intake/intake.service': { IntakeService },
});
const url = 'https://example.org/study';
const excerpt = 'Productivity remained the same or improved in the majority of workplaces.';
let piece, repo, research, intake, service, snapshots, storage;
beforeEach(() => {
  modelCalls = [];
  responses = [
    { verdicts: [], findings: [{ statement: 'Производительность сохранилась или выросла.', evidenceId: 'ev-study', quote: excerpt }] },
    { text: 'Мне важен результат работы. Исследование показывает, что производительность сохранилась или выросла.' },
  ];
  piece = { id: 'p', organizationId: 'org', kind: 'CORE', archivedAt: null,
    title: 'Рабочая неделя', body: 'Мне важен результат работы.',
    brief: { version: 'piece-core/v1', answers: [], personText: 'Мне важен результат работы.',
      authorNumbers: false, questions: { round: 1, items: [], answered: [] }, customMetadata: 'keep',
      brief: { inputKind: 'thought', thesis: 'Мне важен результат работы.', position: 'Результат важнее часов.',
        goal: null, disagreement: null, audience: null, origins: {}, facts: [], ungrounded: [] } },
  };
  repo = { getPiece: jest.fn(async (org, id) => org === 'org' && id === 'p' ? JSON.parse(JSON.stringify(piece)) : null),
    acceptCoreReview: jest.fn(async (_org, _id, snapshot, body, title, brief) => {
      if (snapshot.body !== piece.body || JSON.stringify(snapshot.brief) !== JSON.stringify(piece.brief)) throw new Error('stale');
      Object.assign(piece, { body, title, brief }); return { body, title };
    }),
  };
  const usage = { executeAiOperation: async (_org, _op, callback) => callback() };
  research = { research: jest.fn(async () => ({ provider: 'exa', facts: [{ text: excerpt, sourceUrl: url }],
    sources: [{ url, title: 'Study', provider: 'exa' }] })) };
  intake = new IntakeService({}, research, {
    acceptSearchResult: async () => ({ evidenceId: 'ev-study', url, title: 'Study', excerpt }),
  }, {}, {}, {}, {}, {}, {}, usage);
  storage = new Map();
  snapshots = { get: async key => storage.get(key), set: async (key, value) => storage.set(key, value), del: async key => storage.delete(key) };
  service = new PieceService(repo, {}, {}, undefined, () => null, usage, {}, null, null, null, intake, snapshots);
});
const start = (input = { confirmWebSpend: true }) =>
  service.researchCore('org', 'p', 'user', input, 'ru');
const accept = (preview, selectedKeys = preview.facts.filter(f => f.selected).map(f => f.factKey)) =>
  service.acceptCoreResearch('org', 'p', 'user', { snapshotKey: preview.snapshotKey, selectedKeys });

test('recorded search → digest → saved findings → writer; continuation never repeats paid search', async () => {
  const preview = await start();
  expect(preview.version).toBe('piece-research/v2');
  expect(preview.level).toBe('standard');
  expect(preview.input).toBe(piece.body);
  expect(preview.facts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'found', quote: excerpt, sourceUrl: url, selected: true })]));
  expect(modelCalls.map(c => c.role)).toEqual(['review']);
  expect(repo.acceptCoreReview).not.toHaveBeenCalled();
  await accept(preview);
  expect(research.research).toHaveBeenCalledTimes(1);
  expect(research.research).toHaveBeenCalledWith('org', 'Мне важен результат работы.', { language: 'ru', level: 'standard' });
  expect(modelCalls.map(c => c.role)).toEqual(['review', 'draft']);
  expect(modelCalls[1].prompt).toContain('Мне важен результат работы.');
  expect(modelCalls[1].prompt).toContain('Производительность сохранилась или выросла.');
  expect(piece.body).toContain('Исследование показывает');
  expect(piece.brief.customMetadata).toBe('keep');
  expect(piece.brief.authorNumbers).toBe(false);
  expect(piece.brief.questions.items).toEqual([]);
  await expect(accept(preview)).rejects.toMatchObject({ code: 'PIECE_RESEARCH_EXPIRED' });
  expect(research.research).toHaveBeenCalledTimes(1);
});

test('deep research carries an optional direction as a wish into search and digest', async () => {
  const direction = 'Свежие цифры за 2026 год';
  const preview = await start({ confirmWebSpend: true, level: 'deep', direction });

  expect(preview).toEqual(expect.objectContaining({
    version: 'piece-research/v2',
    level: 'deep',
    direction,
  }));
  expect(research.research).toHaveBeenCalledWith(
    'org',
    expect.stringMatching(/не считать фактом[\s\S]*Свежие цифры за 2026 год/i),
    { language: 'ru', level: 'deep' }
  );
  expect(modelCalls[0].prompt).toContain(direction);
  expect(modelCalls[0].prompt).toMatch(/^PROMPT VERSION: research-digest\/v2\n/);
  expect(modelCalls[0].prompt).toMatch(/пожелание|wish/i);
  expect(modelCalls[0].prompt).toMatch(/не считать фактом|never treat it as a fact/i);
});

/**
 * Дополнение сути перестало быть коротким (`content-factory-next-97dq.2`).
 *
 * Владелец, 18.09.2026: «Довольно много всего нашло, но пост как будто не
 * сильно увеличился». Отмеченных строк было тринадцать, до сути доехало шесть,
 * и держало их не качество находок, а правило 4 («три предложения — нормальная
 * суть»), написанное для ПЕРВОЙ сути и молча применявшееся к дополнению.
 */
test('enrichment prompt lifts the short-core rule and asks a sentence per selected support', async () => {
  const preview = await start();
  await accept(preview);
  const prompt = modelCalls[1].prompt;

  expect(prompt).toContain('PROMPT VERSION: core-write/v15');
  expect(prompt).toContain('A separate rule about enrichment');
  expect(prompt).toContain('gets a sentence of its own');
  expect(prompt).toContain('carry its number, date, name and unit over verbatim');
  expect(prompt).toContain('that does not serve the claim does not enter the text at all');
  expect(prompt).toContain(
    'An enrichment never has new numbers, examples, advice or steps'
  );
  // Правило 11 остаётся: дополнение не спорит с автором.
  expect(prompt).toContain('the core holds the person’s position and never argues with it');
  // И существующая суть по-прежнему приезжает огороженным блоком.
  expect(prompt).toContain('THE EXISTING CORE');
  expect(prompt).toContain('Мне важен результат работы.');
});

/**
 * Отмеченное — ещё не подтверждённое (`content-factory-next-97dq.14`, P3).
 *
 * Строка-поправка, которую источник подтвердил не целиком, приходит в суть
 * `selected: true` и `verified: false`. До версии `core-write/v6` она проходила
 * `isOwnOrConfirmed` и печаталась под «факты подтверждённые» — и тут же второй
 * раз под «взято из ресерча», — тогда как квитанция в тот же миг называла её в
 * `ungrounded`. Промпт и квитанция обязаны говорить о ней одно и то же.
 */
test('a partly confirmed correction stands once, and never in the confirmed block', () => {
  const { corePrompt } = loadWithMocks(`${base}/pieces/core-write.ts`, mocks);
  const brief = {
    inputKind: 'thought', thesis: 'Сокращённая неделя работает.', position: null,
    disagreement: null, audience: null, origins: {},
    ungrounded: ['Эксперимент охватил около 2 500 человек'],
    facts: [
      { statement: 'Эксперимент охватил около 2 500 человек', sourceUrl: url, factId: null,
        evidenceId: 'ev-study', origin: 'search', kind: 'own', status: 'unverified',
        verified: false, selected: true, correction: { original: '25 тысяч', replacement: 'около 2 500' } },
      { statement: 'Производительность сохранилась или выросла', sourceUrl: url, factId: null,
        evidenceId: 'ev-study', origin: 'search', kind: 'found', status: 'confirmed',
        verified: true, selected: true },
    ],
  };

  const prompt = corePrompt({ organizationId: 'org', language: 'ru', brief, answers: [],
    questionTextByKey: {}, personText: 'Мне важен результат работы.', borrowed: null,
    foreignShingles: [] });

  expect(prompt).toContain('PROMPT VERSION: core-write/v15');
  expect(prompt.split('\n').filter((line) => line.includes('около 2 500'))).toEqual([
    'taken from research (not verified): Эксперимент охватил около 2 500 человек',
  ]);
  expect(prompt).toContain(
    'confirmed facts: Производительность сохранилась или выросла'
  );
});

/* -------------------------------------------------------------------------
 * Первая суть с ресерчем (`content-factory-next-97dq.22`, версия `core-write/v7`)
 * ---------------------------------------------------------------------- */

const { corePrompt: buildCorePrompt } = loadWithMocks(`${base}/pieces/core-write.ts`, mocks);
/** Промпт сути на одном брифе: сборщик чистый, модель здесь не нужна. */
const promptOf = (input) =>
  buildCorePrompt({
    organizationId: 'org', language: 'ru', answers: [], questionTextByKey: {},
    borrowed: null, foreignShingles: [], ...input,
  });

const icelandBrief = (facts) => ({
  inputKind: 'thought',
  thesis: 'Сокращение рабочего времени повышает производительность.',
  position: 'Считаю это доказанным фактом.',
  disagreement: null, audience: null, origins: {},
  ungrounded: facts.filter((fact) => !fact.verified).map((fact) => fact.statement),
  facts,
});
const ownUnverified = {
  statement: 'Исландский эксперимент охватил 25 тысяч человек.',
  sourceUrl: null, factId: null, evidenceId: null, origin: 'input', kind: 'own',
  status: 'unverified', verified: false,
  note: 'Источник сообщает, что участвовали более 2500 человек, а не 25 тысяч.',
};
const foundConfirmed = {
  statement: 'В двух исследованиях участвовали более 2500 сотрудников.',
  sourceUrl: url, factId: null, evidenceId: 'ev-study', origin: 'search', kind: 'found',
  status: 'confirmed', verified: true, selected: true,
};
const personText = 'Исландский эксперимент охватил 25 тысяч человек, а производительность выросла на 40%.';

/**
 * Своё число, которое поиск опроверг, больше не «подтверждено»
 * (`content-factory-next-97dq.22`, P1).
 *
 * Девятый заход 22.09.2026, мысль про исландскую четырёхдневку: строка
 * приходила `origin: 'input'`, `status: 'unverified'`, с заметкой источника — и
 * печаталась под «факты подтверждённые», хотя квитанция в тот же миг называла
 * её в `ungrounded`.
 */
test('an own number the search did not confirm leaves the confirmed block and keeps its note', () => {
  const prompt = promptOf({ brief: icelandBrief([ownUnverified, foundConfirmed]), personText });

  expect(prompt).toContain('PROMPT VERSION: core-write/v15');
  expect(prompt.split('\n').filter((line) => line.includes('25 тысяч человек.'))).toEqual([
    'not confirmed by search: Исландский эксперимент охватил 25 тысяч человек. — Источник сообщает, что участвовали более 2500 человек, а не 25 тысяч.',
  ]);
  // И модели сказано, что с этим числом делать, а не оставлено на догадку.
  expect(prompt).toContain('exception to the rule about verbatim numbers');
  expect(prompt).toContain('do not write the number at all and leave the person’s thought without the figure');
});

/** Подтверждённое своё остаётся подтверждённым: §9.5 карты раздела в силе. */
test('an own row the search confirmed still stands in the confirmed block', () => {
  const confirmedOwn = {
    ...ownUnverified,
    statement: 'Эксперимент шёл с 2015 по 2019 год.',
    status: 'confirmed', verified: true, sourceUrl: url, note: null,
  };
  const prompt = promptOf({ brief: icelandBrief([confirmedOwn]), personText });

  expect(prompt).toContain('PROMPT VERSION: core-write/v15');
  expect(prompt).toContain('confirmed facts: Эксперимент шёл с 2015 по 2019 год.');
  expect(prompt).not.toContain('not confirmed by search');
});

/**
 * Первая суть с ресерчем несёт свои опоры (`content-factory-next-97dq.22`).
 *
 * `core-write/v5` снял правило 4 только с дополнения, а находки приезжают и на
 * входе: суть пишется первый раз, шестнадцать отмеченных опор стоят в брифе, и
 * правило 4 («три предложения — нормальная суть») побеждало их все.
 */
test('the first core with research lifts the short-core rule; without research it does not', () => {
  const withResearch = promptOf({ brief: icelandBrief([ownUnverified, foundConfirmed]), personText });

  expect(withResearch).toContain('A separate rule about research supports: this is a first core, and its research has already been brought in');
  expect(withResearch).toContain('gets a sentence of its own');
  expect(withResearch).toContain('that does not serve the claim does not enter the text at all');
  // Правила дополнения сюда не приезжают: существующей сути нет.
  expect(withResearch).not.toContain('this is an ENRICHMENT of a core that is already written');
  expect(withResearch).not.toContain('THE EXISTING CORE');

  const withoutResearch = promptOf({ brief: icelandBrief([ownUnverified]), personText });

  // `core-write/v11` (`97dq.56`): правила короткой сути больше нет вовсе —
  // суть развивает каждый ответ и цель и без ресерча.
  expect(withoutResearch).toContain('4) develop what was said instead of shrinking it');
  expect(withoutResearch).not.toContain('three sentences is a normal core');
  expect(withoutResearch).not.toContain('A separate rule about research supports');
  // Блок неподтверждённого от наличия ресерча не зависит.
  expect(withoutResearch).toContain('not confirmed by search');
});

/**
 * Мысль, к которой ничего не искали, судится ровно текстом `core-write/v6`.
 *
 * Своё слово без вердикта поиска — опора: `status` ставит ресерч, и его
 * отсутствие значит «не ходили», а не «не подтвердилось».
 */
test('a thought with no research keeps the v6 text word for word', () => {
  const prompt = promptOf({
    brief: icelandBrief([
      { statement: 'Мы сократили неделю до четырёх дней.', sourceUrl: null, factId: null,
        evidenceId: null, origin: 'input', kind: 'own', verified: false },
    ]),
    personText: 'Мы сократили неделю до четырёх дней.',
  });

  expect(prompt).toContain('PROMPT VERSION: core-write/v15');
  expect(prompt).toContain('confirmed facts: Мы сократили неделю до четырёх дней.');
  expect(prompt).not.toContain('not confirmed by search');
  expect(prompt).not.toContain('A separate rule about research supports');
  expect(prompt).not.toContain('A separate rule about enrichment');
  expect(prompt).toContain('4) develop what was said instead of shrinking it');
  expect(prompt).not.toContain('A separate rule about the source material blocks');
});

/**
 * Суть по чужому посту получает правило о его блоках (`content-factory-next-97dq.21`,
 * переписано в `97dq.24`).
 *
 * Стенд 22.09.2026: с разбором v6 в бриф пришли пять утверждений и четыре шага
 * строения, а модель вернула одну фразу — позицию человека, потому что ни одно
 * правило не говорило, что с блоками чужого поста делать. Правило v7 велело
 * «пересказать как предмет спора» — и десятый заход (`cnt-23`) получил
 * рецензию: «Чужой пост связывает… автор поста пишет». Правило v8 говорит
 * обратное: чужой пост — материал для своего текста, и отсылок к нему в сути
 * нет. Подписи блоков тоже больше не называют «чужой пост»: модель повторяла
 * подпись в тексте. Правило стоит только когда есть что взять; тема и угол
 * сами по себе его не включают.
 */
test('a foreign post with claims or structure gets the named rule about its blocks', () => {
  const brief = {
    inputKind: 'foreign_post', thesis: null,
    position: 'Я не согласен: спорить с площадкой можно, если продавцов много.',
    disagreement: null, audience: null, origins: { position: 'person' }, ungrounded: [], facts: [],
  };
  const borrowed = {
    topic: 'Комиссии маркетплейсов', angle: 'Спорить с площадками бесполезно.',
    structure: ['Открывается жалобой на рост комиссий.'],
    claims: ['Маркетплейсы повысили комиссии для продавцов.'],
  };
  const prompt = promptOf({ brief, borrowed, personText: '' });

  expect(prompt).toContain('PROMPT VERSION: core-write/v15');
  expect(prompt).toContain('A separate rule about the source material blocks');
  expect(prompt).toContain('is making their OWN text out of it');
  expect(prompt).toContain('There is enough material for several paragraphs');
  expect(prompt).toContain('what is going on per the source material (a retelling; its numbers are unverified): Маркетплейсы повысили комиссии для продавцов.');
  // Ни подпись блока, ни правило больше не зовут материал «чужим постом»:
  // модель повторяла подпись в сути («Чужой пост связывает…»).
  expect(prompt).not.toContain('что чужой пост утверждает');
  expect(prompt).not.toContain('строение чужого поста');
  expect(prompt).not.toContain('перескажи своими словами, на что он отвечает');

  const topicOnly = promptOf({ brief, borrowed: { ...borrowed, structure: [], claims: [] }, personText: '' });
  expect(topicOnly).not.toContain('A separate rule about the source material blocks');
});

/**
 * Слова человека — материал, а не готовый текст (`content-factory-next-97dq.26`).
 *
 * Десятый заход 22.09.2026, `cnt-24`: надиктованный ответ уехал в суть
 * почти дословно, с опечаткой, повтором и порядком слов устной речи. Правило
 * стоит в базе и действует всегда; подписи блоков больше не говорят
 * «дословно» — модель читала подпись как инструкцию вставить.
 */
test('the base names what is carried verbatim, what is corrected and what never changes', () => {
  const brief = {
    inputKind: 'thought', thesis: 'Мы сократили неделю.', position: null,
    disagreement: null, audience: null, origins: {}, ungrounded: [], facts: [],
  };
  const prompt = promptOf({ brief, personText: 'Мы сократили неделю до четырёх дней.' });

  expect(prompt).toContain('Carried over verbatim: the person’s numbers, names, dates, examples and distinctive expressions');
  expect(prompt).toContain('Corrected: typos and spelling');
  expect(prompt).toContain('Unchanged: the meaning, the judgements and the position');
  expect(prompt).toContain('Never paste an answer as a block and never rewrite it sentence by sentence');
  expect(prompt).toContain('THE PERSON’S WORDS (as written; material, not finished text)');
  expect(prompt).not.toContain('СЛОВА ЧЕЛОВЕКА (дословно)');
  expect(prompt).not.toContain('характерные фразы человека переноси дословно');
  // Одно правило длины: режимы его больше не отменяют.
  expect(prompt).toContain('4) develop what was said instead of shrinking it');
  expect(prompt).not.toContain('if the person gave few words, the core is short');
  expect(prompt).not.toContain('правило 4 здесь не действует');
});

test('a v1 research snapshot remains readable after v2 starts issuing previews', async () => {
  const preview = await start();
  const key = [...storage.keys()][0];
  storage.set(key, JSON.stringify({ ...JSON.parse(storage.get(key)), version: 'piece-research/v1' }));

  await expect(accept(preview)).resolves.toEqual(expect.objectContaining({ body: expect.any(String) }));
});

test('foreign actor, expired snapshot, and edited core fail without repeat search or writer', async () => {
  const preview = await start();
  await expect(service.acceptCoreResearch('org', 'p', 'other', { snapshotKey: preview.snapshotKey, selectedKeys: [] })).rejects.toMatchObject({ status: 409 });
  piece.body = 'Правка из другой вкладки.';
  await expect(accept(preview)).rejects.toMatchObject({ code: 'PIECE_RESEARCH_STALE' });
  storage.clear();
  await expect(accept(preview)).rejects.toMatchObject({ code: 'PIECE_RESEARCH_EXPIRED' });
  expect(modelCalls).toHaveLength(1);
  expect(research.research).toHaveBeenCalledTimes(1);
  expect(repo.acceptCoreReview).not.toHaveBeenCalled();
});

test('no storage, missing explicit spend, or missing tenant piece fail before search', async () => {
  await expect(service.researchCore('org', 'p', 'user', {}, 'ru')).rejects.toMatchObject({ status: 400 });
  await expect(service.researchCore('other', 'p', 'user', { confirmWebSpend: true }, 'ru')).rejects.toMatchObject({ status: 404 });
  service.snapshots = null;
  await expect(start()).rejects.toMatchObject({ status: 503 });
  expect(research.research).not.toHaveBeenCalled();
});

test('deselected finding is not fed to writer; writer failure preserves existing core', async () => {
  const before = structuredClone(piece);
  const preview = await start();
  responses = [new Error('recorded model failure')];
  await expect(accept(preview, [])).rejects.toMatchObject({ code: 'PIECE_RESEARCH_WRITE_FAILED' });
  expect(modelCalls.at(-1).prompt).not.toContain('Производительность сохранилась или выросла.');
  expect(piece).toEqual(before);
  expect(repo.acceptCoreReview).not.toHaveBeenCalled();
});

test('accepted correction rewrites the thesis and removes settled claims from ungrounded', () => {
  const corrected = intake.selectCoreResearch(
    {
      filled: {
        brief: {
          inputKind: 'thought',
          thesis: 'Эксперимент охватил 25 тысяч человек',
          position: 'Результат важнее часов.',
          goal: null,
          disagreement: null,
          audience: null,
          origins: { thesis: 'input' },
          ungrounded: ['Эксперимент охватил 25 тысяч человек', 'Уже подтверждено'],
          facts: [
            {
              statement: 'Эксперимент охватил 25 тысяч человек',
              factKey: 'own:old',
              origin: 'input',
              kind: 'own',
              status: 'conflicting',
              verified: false,
              selected: false,
              evidenceId: 'ev-study',
              correction: { original: '25 тысяч', replacement: 'около 2 500' },
            },
            {
              statement: 'Эксперимент охватил около 2 500 человек',
              factKey: 'ev-study:fix:new',
              origin: 'search',
              kind: 'external',
              status: 'confirmed',
              verified: true,
              selected: true,
              evidenceId: 'ev-study',
              correction: { original: '25 тысяч', replacement: 'около 2 500' },
            },
            {
              statement: 'Уже подтверждено',
              factKey: 'ev-study:confirmed',
              origin: 'search',
              kind: 'found',
              status: 'confirmed',
              verified: true,
              selected: true,
            },
          ],
        },
        options: {},
      },
      evidence: [],
      extraction: null,
      urls: [],
      foreignShingles: [],
      level: 'standard',
      corrections: [
        {
          factKey: 'ev-study:fix:new',
          original: '25 тысяч',
          replacement: 'около 2 500',
          sourceUrl: url,
          quote: excerpt,
          note: 'Источник уточняет число.',
          accepted: true,
        },
      ],
      summary: null,
      correctedInput: '',
    },
    'Эксперимент охватил 25 тысяч человек',
    'ru',
    ['ev-study:fix:new', 'ev-study:confirmed']
  );

  expect(corrected.filled.brief.thesis).toBe(
    'Эксперимент охватил около 2 500 человек'
  );
  expect(corrected.filled.brief.ungrounded).toEqual([]);
});

// Вход в проверку теперь один: `reviewAdaptation` удалена вместе со своей
// полосой (`content-factory-next-97dq.14`, P3).
test('research is rejected by the review entrypoint before any paid call', async () => {
  await expect(service.reviewV2('org', 'p', undefined, { mode: 'research', confirmWebSpend: true }, 'ru')).rejects.toMatchObject({ status: 400 });
  expect(service.reviewAdaptation).toBeUndefined();
  expect(research.research).not.toHaveBeenCalled();
  expect(modelCalls).toHaveLength(0);
});

test('research DTOs require explicit intent and reject invalid snapshot IDs', async () => {
  const { validate } = require('class-validator');
  const { PieceResearchDto, PieceResearchAcceptDto } = loadWithMocks('libraries/nestjs-libraries/src/dtos/content-intelligence/piece-research.dto.ts', {});
  expect(await validate(Object.assign(new PieceResearchDto(), {
    confirmWebSpend: true,
    level: 'deep',
    direction: 'Свежие цифры за 2026 год',
  }))).toHaveLength(0);
  expect(await validate(Object.assign(new PieceResearchDto(), {
    confirmWebSpend: true,
    level: 'exhaustive',
  }))).not.toHaveLength(0);
  expect(await validate(Object.assign(new PieceResearchDto(), {
    confirmWebSpend: true,
    direction: 'x'.repeat(301),
  }))).not.toHaveLength(0);
  expect(await validate(Object.assign(new PieceResearchDto(), { confirmWebSpend: true }))).toHaveLength(0);
  expect(await validate(new PieceResearchDto())).not.toHaveLength(0);
  expect(await validate(Object.assign(new PieceResearchAcceptDto(), { snapshotKey: '../other', selectedKeys: [] }))).not.toHaveLength(0);
});

/*
  `content-factory-next-97dq.19` (second-release review, P2-4): the text
  fallback strips «Автор утверждает, что…» from both sides, so a person's own
  row and someone else's row with that prefix shared one key and were both
  ticked when an old tab named one of them. One sent text is one row now.
*/
test('one text from an old tab ticks one row, the one that matches it as written', () => {
  const own = {
    statement: 'Команда выросла вдвое',
    factKey: 'own:team',
    origin: 'input',
    kind: 'own',
    status: 'conflicting',
    verified: false,
    selected: false,
    evidenceId: 'ev-team',
    correction: { original: 'вдвое', replacement: 'на треть' },
  };
  const found = {
    statement: 'Автор утверждает, что команда выросла вдвое',
    factKey: 'ev-other:found',
    origin: 'search',
    kind: 'found',
    status: 'unverified',
    verified: false,
    selected: true,
    evidenceId: 'ev-other',
  };
  const state = {
    filled: {
      brief: {
        inputKind: 'thought',
        thesis: 'Команда выросла вдвое',
        position: null,
        goal: null,
        disagreement: null,
        audience: null,
        origins: { thesis: 'input' },
        ungrounded: [],
        facts: [own, found],
      },
      options: {},
    },
    evidence: [],
    extraction: null,
    urls: [],
    foreignShingles: [],
    level: 'standard',
    corrections: [],
    summary: null,
    correctedInput: '',
  };
  const picked = intake.selectCoreResearch(state, 'Команда выросла вдвое.', 'ru', [
    'Команда выросла вдвое.',
  ]);
  const byKey = Object.fromEntries(picked.filled.brief.facts.map((fact) => [fact.factKey, fact]));
  expect(byKey['own:team'].selected).toBe(true);
  expect(byKey['ev-other:found'].selected).toBe(false);

  // Naming the prefixed row as it was printed ticks that row only.
  const other = intake.selectCoreResearch(state, 'Команда выросла вдвое.', 'ru', [
    'Автор утверждает, что команда выросла вдвое',
  ]);
  const otherByKey = Object.fromEntries(other.filled.brief.facts.map((fact) => [fact.factKey, fact]));
  expect(otherByKey['ev-other:found'].selected).toBe(true);
  expect(otherByKey['own:team'].selected).toBe(false);
});

/*
  `content-factory-next-97dq.42`, live stand 22.09.2026 run16: the core came
  out clean, but the thesis kept «…повысить производительность на 40%» — the
  correction's original («Производительность выросла на 40%») is not in the
  paraphrase, so it was never applied, and the adaptation took the thesis as
  its topic. The thesis is rebuilt from the person's corrected words.
*/
describe('the brief after accepted corrections carries no refuted number (97dq.42)', () => {
  const INPUT =
    'Исландский эксперимент с четырёхдневной рабочей неделей охватил 25 тысяч человек, длился десять лет, а производительность выросла на 40%. Я хочу представить его как доказательство.';
  const corrections = [
    { factKey: 'ev:fix:a', original: '25 тысяч человек', replacement: '2500 сотрудников', accepted: true },
    { factKey: 'ev:fix:b', original: 'десять лет', replacement: 'с 2015 года до 2019 года, около пяти лет', accepted: true },
    {
      factKey: 'ev:fix:c',
      original: 'производительность выросла на 40%',
      replacement: 'сокращение рабочих часов не привело к потере производительности',
      accepted: true,
    },
  ].map((correction) => ({ ...correction, sourceUrl: 'https://www.bbc.com/russian/news-57734712', quote: 'q', note: 'n' }));
  const twin = (correction) => ({
    statement: correction.replacement,
    factKey: correction.factKey,
    origin: 'search',
    kind: 'external',
    status: 'confirmed',
    verified: true,
    selected: true,
    evidenceId: 'ev',
    correction: { original: correction.original, replacement: correction.replacement },
  });
  const own = (correction) => ({
    statement: `Своё: ${correction.original}`,
    factKey: correction.factKey.replace('ev:fix:', 'own:'),
    origin: 'input',
    kind: 'own',
    status: 'conflicting',
    verified: false,
    selected: false,
    evidenceId: 'ev',
    correction: { original: correction.original, replacement: correction.replacement },
  });
  const state = (thesis, position) => ({
    filled: {
      brief: {
        inputKind: 'thought',
        thesis,
        position,
        goal: null,
        disagreement: null,
        audience: null,
        origins: { thesis: 'input', position: 'input' },
        ungrounded: [],
        facts: corrections.flatMap((correction) => [own(correction), twin(correction)]),
      },
      options: {},
    },
    evidence: [],
    extraction: null,
    urls: [],
    foreignShingles: [],
    level: 'standard',
    corrections,
    summary: null,
    correctedInput: '',
  });
  const keys = corrections.map((correction) => correction.factKey);

  test('a paraphrased thesis is rebuilt from the corrected words; the refuted «40%» is gone', () => {
    const run16 =
      'Исландский эксперимент с четырёхдневной рабочей неделей доказал, что такой формат способен повысить производительность на 40%.';
    const next = intake.selectCoreResearch(state(run16, null), INPUT, 'ru', keys);
    expect(next.correctedInput).toContain('2500 сотрудников');
    expect(next.filled.brief.thesis).not.toMatch(/40\s*%/u);
    expect(next.filled.brief.thesis).toContain('Исландский эксперимент');
    expect(next.filled.brief.thesis).toContain('не привело к потере производительности');
    // The origin stays the person's: these are their corrected words.
    expect(next.filled.brief.origins.thesis).toBe('input');
  });

  test('a field the corrections reach is corrected in place; a field without refuted numbers is left alone', () => {
    const next = intake.selectCoreResearch(
      state('Эксперимент длился десять лет.', 'Я считаю эксперимент доказательством.'),
      INPUT,
      'ru',
      keys
    );
    expect(next.filled.brief.thesis).toBe('Эксперимент длился с 2015 года до 2019 года, около пяти лет.');
    expect(next.filled.brief.position).toBe('Я считаю эксперимент доказательством.');
  });

  test('the position is held to the same rule', () => {
    const next = intake.selectCoreResearch(
      state('Короткая неделя работает.', 'Рост на 40% — главное доказательство.'),
      INPUT,
      'ru',
      keys
    );
    expect(next.filled.brief.position).not.toMatch(/40\s*%/u);
  });

  test('«40-часовая неделя» is not the refuted «40%»', () => {
    const next = intake.selectCoreResearch(
      state('Участников перевели с 40-часовой недели на 36-часовую.', null),
      INPUT,
      'ru',
      keys
    );
    expect(next.filled.brief.thesis).toBe('Участников перевели с 40-часовой недели на 36-часовую.');
  });

  test('a declined correction leaves the person’s number in the thesis', () => {
    const next = intake.selectCoreResearch(
      state('Производительность выросла на 40%.', null),
      INPUT,
      'ru',
      [...keys.slice(0, 2), 'own:c']
    );
    expect(next.corrections.find((correction) => correction.factKey === 'ev:fix:c').accepted).toBe(false);
    expect(next.filled.brief.thesis).toContain('40%');
  });
});
