'use strict';

require('reflect-metadata');
const { createHash } = require('node:crypto');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence';
const calls = [];
let result, outputSchema;
const writer = loadWithMocks(`${base}/pieces/core-write.ts`, {
  '@contentfactory/nestjs-libraries/openai/ai.clients': {
    getChatModel: async () => ({ withStructuredOutput: schema => { outputSchema = schema; return { invoke: async prompt => {
      calls.push(prompt);
      if (result instanceof Error) throw result;
      return typeof result === 'function' ? result() : result;
    } }; } }),
  },
});
const v16 = loadWithMocks(`${base}/pieces/core-write-prompt.v16.ts`);
const v9 = loadWithMocks(`${base}/pieces/core-write-prompt.v9.ts`);
const v15 = loadWithMocks(`${base}/pieces/core-write-prompt.v15.ts`);
const v17 = loadWithMocks(`${base}/pieces/core-write-prompt.v17.ts`);

// Frozen synthetic material: these are test facts, not claims about actual releases.
const PERIOD = Object.freeze({ start: '2026-10-08T21:00:00.000Z', end: '2026-10-16T09:30:00.000Z', timezone: 'Europe/Moscow' });
const OBSERVATION = 'Я заметил, что с ИИ стал быстрее разбирать рабочие задачи.';
const OLD = `7 октября появился старый инструмент.\n\n${OBSERVATION}`;
const event = (name, day, extra = {}) => ({
  statement: `${day}: ${name}.`, sourceUrl: `https://openai.com/index/${name}/`,
  origin: 'search', kind: 'found', verified: true, selected: true, status: 'confirmed',
  dateProvenance: { eventDate: day, eventDateQuote: `${name} launched on ${day}.`, precision: 'day', sourcePublishedAt: day },
  ...extra,
});
const SELECTED = [event('Synthetic-Codex', '2026-10-09'), event('Synthetic-Voice', '2026-10-16')];
const facts = [
  ...SELECTED,
  event('Old-selected', '2026-10-08'),
  event('Future-selected', '2026-10-17'),
  event('Not-selected', '2026-10-11', { selected: false }),
  event('Not-confirmed', '2026-10-12', { verified: false, status: 'unverified' }),
  event('No-event-date', '2026-10-13', { dateProvenance: undefined }),
  event('No-source', '2026-10-13', { sourceUrl: null }),
  { statement: OBSERVATION, origin: 'person', kind: 'own', verified: false },
];
const input = (extra = {}) => ({
  organizationId: 'org', language: 'ru',
  brief: { inputKind: 'task', thesis: 'Что изменилось в инструментах ИИ.', position: 'Инструменты помогают в работе.',
    origins: { thesis: 'input', position: 'input' }, ungrounded: [], facts },
  answers: [{ key: 'personal_detail', text: OBSERVATION, origin: 'person' }],
  questionTextByKey: {}, personText: OBSERVATION, existingCore: OLD,
  instruction: { text: 'Напиши новый обзор за 9–16 октября включительно.', links: [] },
  borrowed: null, foreignShingles: [], ...extra,
});
const digest = value => createHash('sha256').update(value).digest('hex');
const deps = { aiUsage: { executeAiOperation: async (_org, _op, run) => run() }, slopCheck: null };

beforeEach(() => { calls.length = 0; result = { title: 'Обзор за 9–16 октября: новые инструменты', text: 'Готовый обзор.', decisions: [] }; });

test('period update replaces every conflicting preservation instruction and gives the exact bounded interval', () => {
  const prompt = writer.corePrompt(input({ eventUpdate: PERIOD }));
  expect(prompt).toContain('PROMPT VERSION: core-write/v18');
  expect(prompt).toContain(PERIOD.start);
  expect(prompt).toContain(PERIOD.end);
  expect(prompt).toContain(PERIOD.timezone);
  expect(prompt).toContain('2026-10-09 through 2026-10-16 inclusive');
  expect(prompt).not.toContain(v9.CORE_WRITE_ENRICH_V9.en);
  expect(prompt).not.toContain(v16.CORE_WRITE_ENRICH_LEAD_V16);
  expect(prompt).not.toContain(v15.CORE_WRITE_REBUILD_V15);
  expect(prompt).not.toMatch(/drop nothing from it|drop none of it|never shorten it|every paragraph built on a decision/u);
  expect(prompt).toContain('Write a new standalone overview');
  expect(prompt).toContain('PREVIOUS DRAFT CONTEXT');
  expect(prompt).toContain(OBSERVATION);
  expect(prompt).toContain('7 октября появился старый инструмент.');
});

test('only selected confirmed events with source and event date enter the event block; author material stays context', () => {
  const request = input({ eventUpdate: PERIOD });
  request.brief = { ...request.brief, facts: [...facts,
    event('Conflicting', '2026-10-13', { status: 'conflicting' }),
    event('Impossible-date', '2026-10-32'),
    event('Publication-only', '2026-10-13', { dateProvenance: {
      eventDate: '2026-10-13', eventDateQuote: '', precision: 'day', sourcePublishedAt: '2026-10-13',
    } }),
  ] };
  const prompt = writer.corePrompt(request);
  for (const fact of SELECTED) {
    expect(prompt).toContain(fact.statement);
    expect(prompt).toContain(fact.sourceUrl);
    expect(prompt).toContain(fact.dateProvenance.eventDateQuote);
  }
  for (const name of ['Old-selected', 'Future-selected', 'Not-selected', 'Not-confirmed', 'No-event-date', 'No-source',
    'Conflicting', 'Impossible-date', 'Publication-only']) {
    expect(prompt).not.toContain(name);
  }
  expect(prompt).toContain('THE AUTHOR’S FACTS AND OBSERVATIONS');
  expect(prompt).toContain(OBSERVATION);
  expect(prompt).toContain('Do not turn a generic observation into experience with a named product');
  expect(prompt).toContain('Never invent personal testing');
  expect(prompt).toContain('Keep an actual personal observation as a standalone statement');
  expect(prompt).toContain('Do not add meta commentary, disclaimers or repeated uncertainty');
});

test('effective system and user lead independently select the new overview contract, even with conflicting mode flags', () => {
  const system = v17.coreWriteSystemV17('ru', 'Forbidden wording.', {
    eventUpdate: PERIOD, enrichment: true, rebuild: true, firstWithResearch: true, policy: 'examples',
  });
  expect(v17.CORE_WRITE_PROMPT_VERSION).toBe('core-write/v17');
  expect(system).not.toContain(v9.CORE_WRITE_ENRICH_V9.en);
  expect(system).not.toContain(v15.CORE_WRITE_REBUILD_V15);
  expect(system).not.toContain('The author has allowed invented examples');
  expect(system).toContain('Only SELECTED CONFIRMED EVENTS IN THE INTERVAL support new events');
  expect(system).toContain('supplied official source URL for each event exactly');
  expect(system).toContain('Forbidden wording.');
  const lead = v17.coreWriteEventLeadV17(PERIOD);
  expect(lead).toContain('Replace the old overview’s event narrative');
  expect(lead).toContain('Every new event must be supported by a selected confirmed dated event below');
  expect(lead).not.toContain(v16.CORE_WRITE_ENRICH_LEAD_V16);
});

test.each([{}, { enrichment: true }, { rebuild: true, delegated: true }, { handed: true, policy: 'examples', gaps: true }])(
  'ordinary wrapper is the exact V16 system for %j', options => {
    expect(v17.coreWriteSystemV17('ru', 'Forbidden.', options)).toBe(v16.coreWriteSystemV16('ru', 'Forbidden.', options));
  }
);

test('the same model invocation receives the period contract; previous core cannot re-enable enrichment or rebuild', async () => {
  const request = input({ eventUpdate: PERIOD, rebuildFrom: { text: OLD, byPerson: true } });
  const written = await writer.writeCoreWithDecisions(request, deps);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toBe(writer.corePrompt(request));
  expect(calls[0]).not.toContain(v15.CORE_WRITE_REBUILD_V15);
  expect(written.core.text).toBe('Готовый обзор.');
  expect(written.core.writtenBy).toBe('model');
  expect(written.title).toBe(result.title);
  expect(outputSchema.safeParse({ text: 'Body only' }).success).toBe(false);
});

test.each(['ru', 'en'])('period title and body come from one call in %s', async language => {
  result = { title: language === 'ru' ? '9–16 октября: новые инструменты' : '9–16 October: new tools', text: 'Selected events.' };
  const written = await writer.writeCoreWithDecisions(input({ language, eventUpdate: PERIOD }), deps);
  expect(written.title).toBe(result.title);
  expect(written.core.text).toBe(result.text);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toContain('Return a required `title` alongside `text`');
});

test.each([undefined, '', '  ', 'x'.repeat(121), 'Two\nlines'])('invalid period title %p cannot become a successful body-only update', async title => {
  result = { title, text: 'A valid body alone must not be saved.' };
  const written = await writer.writeCoreWithDecisions(input({ eventUpdate: PERIOD }), deps);
  expect(written.core.writtenBy).toBe('fallback');
  expect(written.title).toBeUndefined();
  expect(calls).toHaveLength(1);
});

test('repair selects its own matching title and never mixes the first and repaired answers', async () => {
  const answers = [
    { title: 'First title', text: 'В исходном материале говорится об инструментах.' },
    { title: 'Repaired title', text: 'Готовый связный обзор.' },
  ];
  result = () => answers.shift();
  const written = await writer.writeCoreWithDecisions(input({ eventUpdate: PERIOD }), deps);
  expect(calls).toHaveLength(2);
  expect(written.title).toBe('Repaired title');
  expect(written.core.text).toBe('Готовый связный обзор.');
});

test('a repair without a valid title keeps the complete first pair', async () => {
  const first = { title: 'First title', text: 'В исходном материале говорится об инструментах.' };
  const answers = [first, { title: '', text: 'A different repaired body.' }];
  result = () => answers.shift();
  const written = await writer.writeCoreWithDecisions(input({ eventUpdate: PERIOD }), deps);
  expect(calls).toHaveLength(2);
  expect(written.title).toBe(first.title);
  expect(written.core.text).toBe(first.text);
});

test('ordinary writing retains its schema and result without adopting a model title', async () => {
  const written = await writer.writeCoreWithDecisions(input(), deps);
  expect(outputSchema).toBe(writer.coreSchema);
  expect(written).not.toHaveProperty('title');
});

test('ordinary enrichment still carries old or undated facts and the exact old preservation contract', () => {
  const prompt = writer.corePrompt(input());
  expect(prompt).toContain('PROMPT VERSION: core-write/v16');
  expect(prompt).toContain(v9.CORE_WRITE_ENRICH_V9.en);
  expect(prompt).toContain(v16.CORE_WRITE_ENRICH_LEAD_V16);
  expect(prompt).toContain('Old-selected');
  expect(prompt).toContain('No-event-date');
});

test('ordinary first, enrichment and rebuild prompts retain their frozen pre-change hashes', () => {
  expect([
    digest(writer.corePrompt(input({ existingCore: undefined }))),
    digest(writer.corePrompt(input())),
    digest(writer.corePrompt(input({ rebuildFrom: { text: OLD, byPerson: true } }))),
  ]).toEqual([
    '8a72d36d990739b53d267a4a6965c739f5d9bfff234bc821c2a29b9cec4163e7',
    '79e90662dceff63d43798c6f421da87f98db42ac4bbf8de916f7ccd985a71cfc',
    '80337e7760b8b36e33660913b9db76e460906fc2e1c281304473415ceacba2c8',
  ]);
});

test('model failure retains the existing deterministic fallback', async () => {
  result = new Error('Synthetic model refusal');
  const ordinary = await writer.writeCoreWithDecisions(input(), deps);
  const update = await writer.writeCoreWithDecisions(input({ eventUpdate: PERIOD }), deps);
  expect(update).toEqual(ordinary);
  expect(update.core.writtenBy).toBe('fallback');
});
