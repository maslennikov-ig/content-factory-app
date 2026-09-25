'use strict';

/**
 * Every instruction Content Factory sends to a model is English
 * (`content-factory-next-97dq.97`, owner request of 25.09.2026: «проверь,
 * что у нас все промпты для него на английском языке»). The model still
 * writes in the content language, and the prompt names it.
 *
 * One test per prompt that used to switch to Russian for a Russian input. Each
 * builds the prompt for a Russian input and asserts that no Cyrillic is left
 * once the data is taken out: the person's words, a stored post, the
 * catalogue of forbidden phrases. No model calls.
 */

require('reflect-metadata');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { cyrillicOutsideData } = require('./helpers/prompt-language.cjs');

const ci = 'libraries/nestjs-libraries/src/content-intelligence';
const bv = `${ci}/brand-voice`;

const { forbiddenPhrasesFor, forbiddenPhrasesRule } = loadTypeScriptModule(
  `${ci}/text-quality/forbidden-phrases.ts`
);
const FORBIDDEN_RU = forbiddenPhrasesFor('ru');

describe('prompts are English for a Russian input (97dq.97)', () => {
  test('forbidden phrases: English lead-in, the catalogue stays Russian', () => {
    const rule = forbiddenPhrasesRule('ru');
    expect(rule.startsWith('do not use any turn of phrase from this list: ')).toBe(true);
    expect(rule).toContain(FORBIDDEN_RU[0]);
    expect(cyrillicOutsideData(rule, FORBIDDEN_RU)).toEqual([]);
  });

  test('core-write/v14: system, block titles, repair lines and the output language', () => {
    const coreWrite = loadWithMocks(`${ci}/pieces/core-write.ts`, {
      '@contentfactory/nestjs-libraries/openai/ai.clients': { getChatModel: async () => null },
    });
    const v14 = loadWithMocks(`${ci}/pieces/core-write-prompt.v14.ts`);
    const fact = (statement, extra = {}) => ({
      statement, sourceUrl: null, factId: null, evidenceId: null,
      origin: 'input', kind: 'own', verified: false, status: 'unverified', ...extra,
    });
    const input = {
      organizationId: 'org',
      language: 'ru',
      personText: 'Я заметил, что команда пишет в чат меньше, когда задачи лежат на общей доске.',
      addedMaterial: [],
      instruction: { text: 'Хочу написать пост о выступлении.', links: ['https://example.org/talk'] },
      brief: {
        inputKind: 'thought',
        thesis: 'Общая доска снимает вопросы о статусе.',
        position: 'Я заметил, что чат затихает.',
        disagreement: 'Не всем командам это подходит.',
        audience: 'Руководители команд.',
        origins: { thesis: 'model', position: 'input', audience: 'avatar' },
        ungrounded: [],
        facts: [
          fact('Созвонов стало вдвое меньше.'),
          fact('Исландский эксперимент охватил 2 500 человек.', { origin: 'search', kind: 'found', selected: true }),
        ],
      },
      answers: [
        { key: 'ask-1', question: 'Что изменилось?', text: 'Вопросы о статусе отпали.', origin: 'person', step: 'core' },
        { key: 'ask-2', question: 'Для кого текст?', text: 'Для руководителей.', origin: 'model', step: 'core' },
      ],
      delegated: [{ key: 'ask-3', question: 'Какой был случай?', authorMaterial: true }],
      questionTextByKey: {},
      borrowed: { topic: 'Комиссии площадок', angle: 'Продавцам хуже', structure: ['площадки подняли комиссии'], claims: ['Правила меняются'] },
      foreignShingles: [],
      rebuildFrom: { text: 'Прежняя суть.', byPerson: true },
    };
    const prompt = coreWrite.corePrompt(input);
    expect(prompt).toContain('PROMPT VERSION: core-write/v14');
    expect(prompt).toContain('write the core and every decision in Russian');
    expect(prompt).toContain(v14.CORE_WRITE_BLOCK_TITLES_V14.person);
    expect(cyrillicOutsideData(prompt, FORBIDDEN_RU)).toEqual([]);

    const enrichment = coreWrite.corePrompt({ ...input, rebuildFrom: null, existingCore: 'Готовая суть.' });
    expect(enrichment).toContain(v14.CORE_WRITE_ENRICH_LEAD_V14);
    expect(enrichment).toContain(v14.CORE_WRITE_BLOCK_TITLES_V14.existing);
    expect(cyrillicOutsideData(enrichment, FORBIDDEN_RU)).toEqual([]);

    expect(cyrillicOutsideData(v14.CORE_WRITE_REPAIR_V14)).toEqual([]);
    expect(cyrillicOutsideData(v14.CORE_WRITE_META_REPAIR_V14)).toEqual([]);
  });

  test('post length trim: English instructions, the post named Russian', () => {
    const postLength = loadTypeScriptModule(`${bv}/post-length.ts`);
    const text =
      'Мы сократили созвоны вдвое: 12 встреч в неделю стали шестью. Подробности на https://example.org/table. '.repeat(6);
    const check = postLength.checkPostLength(text, { median: 300, low: 200, high: 420 });
    const keep = postLength.protectedFragments(text);
    const prompt = postLength.buildLengthTrimPrompt({ text, check, locale: 'ru', keep });
    expect(prompt).toContain('The post is in Russian; return it in Russian');
    expect(cyrillicOutsideData(prompt, [text, ...keep])).toEqual([]);
  });

  test('voice assist: both system messages are English', () => {
    const service = loadWithMocks(`${bv}/voice-assist.service.ts`, {
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getOpenAiClient: async () => null,
        getModelForRole: async () => 'model',
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
    });
    expect(service.VOICE_ASSIST_SYSTEM).toMatch(/^You explain numbers/u);
    expect(service.VOICE_LEARN_SYSTEM).toMatch(/^You name the author/u);
    expect(cyrillicOutsideData(service.VOICE_ASSIST_SYSTEM)).toEqual([]);
    expect(cyrillicOutsideData(service.VOICE_LEARN_SYSTEM)).toEqual([]);
  });

  test('voice assist map/reduce V2: English instructions, output in Russian', () => {
    const pipeline = loadTypeScriptModule(`${bv}/assist.pipeline.ts`);
    const analyzer = loadTypeScriptModule(`${bv}/analyzer.ts`);
    const corpus = Array.from({ length: 14 }, (unused, index) => ({
      code: `smp-${index}`,
      text:
        `Я думал, что успеем к четвергу ${index}. Не успели, и врать тут незачем. ` +
        'Прогнал шесть релизов через стенд, дважды по 89 баллов. Поставщика поменяли — старый ' +
        'срывал сроки третий месяц подряд. Пишите в комментарии, как у вас.',
      language: 'ru',
      contentHash: `hash-${index}`,
    }));
    const measured = analyzer.analyzeBrandVoice(corpus, { language: 'ru' });
    const map = pipeline.mapPromptV2(corpus[0], measured, 'ru');
    expect(map).toContain('Write every claim in Russian');
    expect(cyrillicOutsideData(map, [corpus[0].text])).toEqual([]);

    const observation = {
      ref: 'smp-0#1', sampleCode: 'smp-0', field: 'TONE', metric: 'sentenceLength',
      quote: 'Не успели, и врать тут незачем.', claim: 'Автор пишет короткими фразами.',
    };
    const reduce = pipeline.reducePromptV2([observation], 'ru', measured.postHabits, measured.postLayout);
    expect(reduce).toContain('Write every field, every topic and the portrait in Russian');
    expect(reduce).toContain('PORTRAIT.');
    expect(cyrillicOutsideData(reduce, [observation.quote, observation.claim])).toEqual([]);
  });

  test('learning from edits: English headings, the rules named Russian', () => {
    const learning = loadTypeScriptModule(`${bv}/voice-learning.ts`);
    const prompt = learning.buildLearnPrompt(
      [{ proposedText: 'В целом, мы поменяли поставщика.', sentText: 'Поставщика поменяли.' }],
      [{ id: 'rule-1', text: 'Не начинай с вводных слов.', learnedAt: '2026-09-01T00:00:00.000Z', pairs: 5 }],
      'ru'
    );
    expect(prompt).toContain('PROPOSED: ');
    expect(prompt).toContain('written in Russian — the language of the pairs');
    const open = prompt.indexOf(learning.PAIR_FENCE_OPEN);
    const close = prompt.indexOf(learning.PAIR_FENCE_CLOSE);
    const outside = prompt.slice(0, open) + prompt.slice(close);
    expect(cyrillicOutsideData(outside)).toEqual([]);
  });
});
