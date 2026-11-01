'use strict';
const { RunnableLambda } = require('@langchain/core/runnables');
const { zodResponseFormat } = require('openai/helpers/zod');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const build = response => {
  const calls = [], schemas = [], prompts = [];
  const { AgentGraphService } = loadWithMocks('libraries/nestjs-libraries/src/agent/agent.graph.service.ts', {
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': { PostsService: class {} },
    '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class {} },
    '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: { createStorage: () => ({}) } },
    '@contentfactory/nestjs-libraries/openai/ai.clients': { getChatModel: async (_org, _temp, maxOutputTokens, role) => {
      calls.push({ role, maxOutputTokens });
      return { withStructuredOutput: schema => {
        schemas.push({ role, schema });
        return RunnableLambda.from(async prompt => {
          prompts.push({ role, text: String(prompt) });
          const output = role === 'review' ? { status: 'passed', missingRequirements: [], unsupportedClaims: [] } : response;
          schema.parse(output);
          return output;
        });
      } };
    } },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
    '@contentfactory/nestjs-libraries/openai/web.research.service': { WebResearchService: class {} },
    '@contentfactory/nestjs-libraries/content-intelligence/context/content-context.service': { ContentContextService: class {} },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service': { BrandProfileContextService: class {} },
    '@contentfactory/nestjs-libraries/content-intelligence/source-registry/source-registry.service': { ContentSourceRegistryService: class {} },
  });
  const service = new AgentGraphService({}, {}, {}, {}, {}, {}, null, null);
  service.aiUsage = { executeAiOperation: async (_org, _op, callback) => callback() };
  return { service, calls, schemas, prompts };
};
const state = presentation => ({
  orgId: 'test-org', language: 'ru', format: 'one_long', tone: 'personal', hook: 'Важный хук',
  messages: [{ content: 'Подготовь материал, сохрани все темы.' }], popularPosts: [], researchAvailable: false,
  intake: { version: 'intake-hints/v3', presentation,
    core: 'Первая тема: факты. Вторая тема: изменения. Третья тема: кампания. '.repeat(100),
    contextMaterial: 'Ответ автора: для меня главное надёжность.',
    request: { version: 'intake-request/v1', goal: 'Сохранить все темы', requestedOutputs: ['Публикации'], constraints: {} },
    material: [{ statement: 'Точная деталь источника. '.repeat(100) }],
    brief: { thesis: 'Обновления', position: null, disagreement: null, audience: 'Читатели' },
    channel: { providerIdentifier: 'telegram', integrationId: 'channel', maxLength: 4096,
      writingProfile: { lengthPolicy: 'auto' } },
  },
});
const posts = count => Array.from({ length: count }, (_, index) => ({ content: `Тема ${index + 1}`, usedCitationIds: [] }));

test.each([['auto', 1], ['auto', 2], ['auto', 5], ['series', 2], ['series', 5]])(
  '%s permits %s ordered post(s) with no array nesting', async (presentation, count) => {
    const output = posts(count), built = build({ content: output }), original = state(presentation);
    const generated = await built.service.generateContent(original);
    expect(generated.content.map(row => row.content)).toEqual(output.map(row => row.content));
    const schema = built.schemas[0].schema;
    expect(() => zodResponseFormat(schema, 'series')).not.toThrow();
    expect(schema.safeParse({ content: posts(1) }).success).toBe(presentation === 'auto');
    expect(schema.safeParse({ content: [] }).success).toBe(false);
    expect(schema.safeParse({ content: posts(7) }).success).toBe(true);
    const fixed = await built.service.fixArray({ ...original, ...generated });
    expect(fixed.content).toHaveLength(count);
    expect(fixed.content.every(row => typeof row.content === 'string')).toBe(true);
    expect(fixed.content.map(row => row.content)).toEqual(output.map(row => row.content));
    expect(built.calls.map(call => call.role)).toEqual(['adapt', 'review']);
    const prompt = built.prompts.find(call => call.role === 'adapt').text;
    expect(prompt).toContain('combine related announcements');
    expect(prompt).toContain('4096 characters');
    expect(prompt).toContain('сохрани все темы');
    expect(prompt).toContain('Ответ автора: для меня главное надёжность.');
  }
);

test('series output budget follows all material, not one channel maximum or four post lengths', async () => {
  const built = build({ content: posts(2) }), input = state('auto');
  await built.service.generateContent(input);
  const full = input.intake.core.length + input.intake.contextMaterial.length +
    input.intake.material[0].statement.length + JSON.stringify(input.intake.request).length;
  expect(full).toBeGreaterThan(input.intake.channel.maxLength);
  expect(built.calls[0].maxOutputTokens).toBe(Math.max(512, Math.ceil(full * 1.25) + 256));
  expect(built.calls[0].maxOutputTokens).toBeGreaterThan(Math.ceil(4096 * 1.25) + 256);
});

test.each(['auto', 'series', undefined])('current author request contributes to existing output budget (%s)', async presentation => {
  const response = { content: presentation ? posts(presentation === 'series' ? 2 : 1) : { content: 'Готово' } };
  const built = build(response), input = state(presentation);
  input.intake.core = 'Короткая суть';
  delete input.intake.contextMaterial;
  delete input.intake.request;
  delete input.intake.material;
  input.intake.currentAuthorRequest = 'Сохрани существенную деталь и точное условие. '.repeat(35);
  await built.service.generateContent(input);
  expect(built.calls[0].maxOutputTokens).toBeGreaterThanOrEqual(input.intake.currentAuthorRequest.length);
  expect(built.prompts[0].text).toContain(input.intake.currentAuthorRequest);
});

test.each(['auto', 'series', undefined])(
  'later author additions have output room even with a short old core (%s)', async presentation => {
    const post = { content: 'Готовый текст', usedCitationIds: [] };
    const content = presentation === 'series' ? [post, { ...post, content: 'Продолжение' }] : presentation ? [post] : post;
    const built = build({ content });
    const input = state(presentation);
    input.intake.core = 'Прежнее мнение: полезно.';
    delete input.intake.contextMaterial;
    delete input.intake.request;
    delete input.intake.material;
    const text = 'Важны не только возможности, но и ограничения, условия применения и реальная экономия времени. '.repeat(25);
    input.intake.authorAdditions = [{ text, addedAt: '2026-10-31T12:00:00Z' }];
    const generated = await built.service.generateContent(input);
    // Output room must reflect actual new material, not just the tiny old core.
    expect(built.calls[0].maxOutputTokens).toBeGreaterThanOrEqual(text.length);
    expect(built.prompts[0].text).toContain(text);
    if (presentation) expect(built.prompts[0].text).toContain('4096 characters');
    await built.service.fixArray({ ...input, ...generated });
    const reviewed = built.prompts.find(call => call.role === 'review').text;
    expect(JSON.parse(reviewed.slice(reviewed.indexOf('Human: ') + 7)).hardCharacterLimit).toBe(4096);
    expect(built.calls.map(call => call.role)).toEqual(['adapt', 'review']);
  }
);

test('the existing review checks the first hook and each series part against the real cap', async () => {
  const built = build({ content: [{ content: 'x'.repeat(4090) }, { content: 'y'.repeat(4100) }] });
  const input = state('series');
  const generated = await built.service.generateContent(input);
  const output = await built.service.fixArray({ ...input, ...generated });
  expect(output.content).toHaveLength(2);
  expect(output.adaptationCoverage.missingRequirements).toEqual(expect.arrayContaining([
    expect.stringContaining('Текст 1:'), expect.stringContaining('Текст 2:'),
  ]));
  expect(built.calls.map(call => call.role)).toEqual(['adapt', 'review']);
});

test('legacy one-post mode remains a single object until the existing fixArray', async () => {
  const built = build({ content: { content: 'Один пост', usedCitationIds: [] } });
  const input = state(undefined);
  const generated = await built.service.generateContent(input);
  expect(Array.isArray(generated.content)).toBe(false);
  expect(built.schemas[0].schema.safeParse({ content: posts(1) }).success).toBe(false);
  const fixed = await built.service.fixArray({ ...input, ...generated });
  expect(fixed.content).toEqual([generated.content]);
});

test('the same structured writer supplies a brief public format explanation, separate from posts and without another call', async () => {
  const reason = 'Я разделил обзор на два поста, чтобы сохранить подробности при лимите канала.';
  const built = build({ content: posts(2), presentationReason: reason }), input = state('auto');
  input.intake.currentAuthorRequest = 'Сохрани заготовку и посты; не теряй авторскую позицию.';
  const { START, END } = require('@langchain/langgraph');
  const generated = await built.service.constructor.state()
    .addNode('write', built.service.generateContent.bind(built.service))
    .addNode('review', built.service.fixArray.bind(built.service))
    .addEdge(START, 'write').addEdge('write', 'review').addEdge('review', END).compile().invoke(input);
  expect(generated.presentationReason).toBe(reason);
  expect(generated.content.every(item => !item.content.includes(reason))).toBe(true);
  const writerPrompt = built.prompts.find(call => call.role === 'adapt').text;
  expect(writerPrompt).toContain(input.intake.currentAuthorRequest);
  expect(writerPrompt).toContain('The application saves the generated content after this stage');
  expect(writerPrompt).toContain('Do not claim ability, success or failure to save or publish');
  expect(built.calls.map(call => call.role)).toEqual(['adapt', 'review']);
  expect(() => zodResponseFormat(built.schemas[0].schema, 'series')).not.toThrow();
  expect(built.schemas[0].schema.safeParse({ content: posts(2), presentationReason: null }).success).toBe(true);
});
