'use strict';
const { loadCapabilityModule, loadRegistry, IDENTITY, servicesFrom, requestContextFor } = require('./helpers/agent-capabilities.cjs');
const start = jest.fn(), resume = jest.fn();
const { pieceAdapt, pieceSeriesResume } = loadCapabilityModule('catalogue/adaptation.capabilities.ts', { mocks: {
  '../../conductor/native-adaptation-series': { startNativeAdaptationSeries: start, resumeNativeAdaptationSeries: resume },
} });
const channel = { id: 'c1', name: 'Channel', providerIdentifier: 'telegram' };
const result = count => ({ status: 'success', runId: 'native-run', result: { kind: 'adaptation', seriesId: 'series',
  channel: { id: 'c1', name: 'Channel', provider: 'telegram' }, parts: Array.from({ length: count }, (_, i) => ({ adaptationId: `a${i}`, postId: `p${i}` })) } });
const setup = count => {
  const parts = [], pieces = { prepareAdapt: jest.fn(async (_org, pieceId, request) => ({ pieceId, request, channel })),
    adaptPlanMode: jest.fn(() => { throw Error('Draft series must not enter autopilot'); }),
    detail: jest.fn(async () => ({ core: { brief: { facts: [] } }, adaptations: Array.from({ length: count }, (_, i) => ({ id: `a${i}`, body: `Saved ${i}`, integrationId: 'c1' })) })) };
  const signal = new AbortController().signal;
  const ctx = { ...IDENTITY, entrance: 'chat', nativeToolCallId: 'native-call', mastra: { getStorage: () => undefined }, requestContext: {}, abortSignal: signal,
    service: servicesFrom({ PieceService: pieces }), suspend: jest.fn() };
  return { ctx, pieces, parts, emit: async part => parts.push(part) };
};
beforeEach(() => { start.mockReset(); resume.mockReset(); });

test.each([1, 2, 5])('auto persists/readbacks %i separate posts and emits ordered cards', async count => {
  const f = setup(count); start.mockResolvedValue(result(count));
  const saved = await pieceAdapt.run(f.ctx, { pieceId: 'piece', channelId: 'c1', presentation: 'auto' }, f.emit);
  expect(saved.parts).toHaveLength(count); expect(saved.state).toBe('draft');
  expect(saved.parts.map(p => p.adaptationId)).toEqual(result(count).result.parts.map(p => p.adaptationId));
  expect(saved.savedResult.text).toBe('Saved 0');
  const cards = [pieceAdapt.cardOf(saved), ...f.parts.filter(p => p.kind === 'adaptation').map(p => p.data)];
  expect(cards.map(p => p.series.index).sort()).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  expect(start.mock.calls[0][1].presentation).toBe('auto');
  expect(start.mock.calls[0][4]).toBe(f.ctx.abortSignal);
  expect(f.pieces.adaptPlanMode).not.toHaveBeenCalled();
});

test('native series preparation receives the full server-resolved request separately from the short wish', async () => {
  const f = setup(1), currentAuthorRequest = 'Уточнения автора. '.repeat(50) + 'Доступно только до пятницы.';
  f.ctx.resolveAuthorRequest = async () => ({messageId:'original', text:currentAuthorRequest});
  start.mockResolvedValue(result(1));
  await pieceAdapt.run(f.ctx, {pieceId:'piece',channelId:'c1',presentation:'auto',wish:'Коротко'}, f.emit);
  expect(f.pieces.prepareAdapt.mock.calls[0][4]).toEqual({currentAuthorRequest});
  expect(f.pieces.prepareAdapt.mock.calls[0][2].overrides.wish).toBe('Коротко');
  expect(start.mock.calls[0][1].presentation).toBe('auto');
});
test('native series checkpoint receives the author-question skip flag', async () => {
  const f = setup(1); start.mockResolvedValue(result(1));
  await pieceAdapt.run(f.ctx, {pieceId:'piece',channelId:'c1',presentation:'auto',skipInterview:true}, f.emit);
  expect(f.pieces.prepareAdapt.mock.calls[0][2].skipInterview).toBe(true);
  expect(start.mock.calls[0][1].plan.request.skipInterview).toBe(true);
});
test('generation failure reports no retained generation or save recovery', async () => {
  const f = setup(0); start.mockResolvedValue({ status: 'incomplete', nativeStatus: 'failed', generated: false, runId: 'bad-run', saved: false });
  const output = await pieceAdapt.run(f.ctx, { pieceId: 'piece', channelId: 'c1', presentation: 'series' }, f.emit);
  const summary = pieceAdapt.summarize(output);
  expect(summary.generated).toBe(false); expect(summary.recovery).toBeUndefined();
  expect(summary.instruction).not.toContain('Generation is retained'); expect(pieceAdapt.cardOf(output)).toBeNull();
});
test('retained generation returns a save-only recovery and no draft card', async () => {
  const f = setup(0); start.mockResolvedValue({ status: 'pending', nativeStatus: 'suspended', generated: true, runId: 'save-run', saved: false });
  const output = await pieceAdapt.run(f.ctx, { pieceId: 'piece', channelId: 'c1', presentation: 'auto' }, f.emit);
  expect(pieceAdapt.summarize(output).recovery).toMatchObject({ capability: 'piece.series.resume', runId: 'save-run' });
  expect(pieceAdapt.cardOf(output)).toBeNull();
});
test('save-only tool forwards Stop and emits the saved sequence without invoking generation', async () => {
  const f = setup(2); resume.mockResolvedValue(result(2));
  const saved = await pieceSeriesResume.run(f.ctx, { pieceId: 'piece', runId: 'native-run' }, f.emit);
  expect(saved.state).toBe('draft'); expect(f.parts).toHaveLength(2); expect(start).not.toHaveBeenCalled();
  expect(resume.mock.calls[0][4]).toBe(f.ctx.abortSignal);
});
test('native adapter forwards its host, request context and tool-call identity', async () => {
  const registry = loadRegistry(), f = setup(0), requestContext = requestContextFor(registry);
  const cap = { ...pieceSeriesResume, id: 'test.native', risk: 'read', run: async ctx => ({ host: ctx.mastra === f.ctx.mastra,
    request: ctx.requestContext?.get(registry.CAPABILITY_CONTEXT_KEYS.userId) === IDENTITY.userId, call: ctx.nativeToolCallId }), summarize: value => value };
  const tool = registry.buildCapabilityTool(cap, { services: f.ctx.service, language: 'ru', entrance: 'chat' });
  const output = await tool.execute({ pieceId: 'piece', runId: 'native-run' }, { requestContext, mastra: f.ctx.mastra, agent: { toolCallId: 'the-call' } });
  expect(output.summary).toEqual({ host: true, request: true, call: 'the-call' });
});

test('actual saved count and writer-supplied explanation survive normal and save-only tool summaries', async () => {
  const reason = 'Я объединил темы в четыре самостоятельных поста для удобства чтения.';
  const complete = result(4); complete.result.presentationReason = reason;
  const f = setup(4); start.mockResolvedValue(complete);
  const saved = await pieceAdapt.run(f.ctx, { pieceId: 'piece', channelId: 'c1', presentation: 'auto' }, f.emit);
  const summary = pieceAdapt.summarize(saved);
  expect(summary.savedPostCount).toBe(4);
  expect(JSON.stringify(summary.presentationReason)).toContain(reason);
  expect(typeof summary.presentationReason).toBe('object');
  resume.mockResolvedValue(complete);
  const recovered = await pieceSeriesResume.run(f.ctx, { pieceId: 'piece', runId: 'native-run' }, f.emit);
  expect(pieceSeriesResume.summarize(recovered).savedPostCount).toBe(4);
  expect(JSON.stringify(pieceSeriesResume.summarize(recovered).presentationReason)).toContain(reason);
  const old = result(2); resume.mockResolvedValue(old);
  const legacy = pieceSeriesResume.summarize(await pieceSeriesResume.run(f.ctx, { pieceId: 'piece', runId: 'old-run' }, f.emit));
  expect(legacy.savedPostCount).toBe(2); expect(legacy.presentationReason).toBeUndefined();
  resume.mockResolvedValue({ status: 'pending', runId: 'pending-run', generated: true, saved: false });
  const pending = pieceSeriesResume.summarize(await pieceSeriesResume.run(f.ctx, { pieceId: 'piece', runId: 'pending-run' }, f.emit));
  expect(pending.saved).toBe(false); expect(pending.savedPostCount).toBeUndefined();
});
