'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const questions = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/domain-questions.ts', {
  '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service': { PieceService: class PieceService {} },
});

const long = 'Дословный вопрос '.repeat(50);
const original = { key: 'position', question: long, suggested: 'Вариант 6', options: Array.from({ length: 7 }, (_, i) => `Вариант ${i + 1}`), ownOption: 'Вариант 7', why: 'Почему '.repeat(70) };
const second = { key: 'ask-1', question: 'Как это произошло лично у вас?', suggested: null };
const detail = () => ({ piece: { id: 'piece-1', title: 'Материал' }, core: { text: 'Сохранённая суть', questions: { round: 1, items: [original, second], answered: [] } }, adaptations: [] });
const card = () => questions.createDomainQuestionCard({ kind: 'piece', pieceId: 'piece-1', revision: questions.domainQuestionRevision(detail(), { kind: 'piece' }) }, [original, second], 'Ответьте на вопросы');

test('interactive questions preserve exact wording, full choices and stable keys independently of preview limits', () => {
  const shown = card();
  expect(shown.questions[0].question).toBe(long);
  expect(shown.questions[0].options.map(option => option.label)).toEqual(original.options);
  expect(shown.questions[0]).toMatchObject({ key: 'position', ownOption: 'Вариант 7', suggested: 'Вариант 6', why: original.why, selectionMode: 'single' });
  expect(shown.questions[0].options[5].recommended).toBe(true);
  expect(shown.activeKey).toBe('position');
});

test('a partial answer is saved in the next native card, with stable batch and a new active key', () => {
  const start = card();
  const next = questions.mergeDomainQuestionAnswers(start, { answers: [{ key: 'position', mode: 'choice', optionIds: ['option-6'] }] });
  expect(next.batchId).toBe(start.batchId);
  expect(next.activeKey).toBe('ask-1');
  expect(next.answers).toEqual([{ key: 'position', mode: 'choice', optionIds: ['option-6'], text: 'Вариант 6' }]);
  expect(questions.domainQuestionsComplete(next)).toBe(false);
  const done = questions.mergeDomainQuestionAnswers(JSON.parse(JSON.stringify(next)), { answers: [{ key: 'ask-1', mode: 'custom', text: '  Мои слова дословно.  ' }] });
  expect(done.answers[1].text).toBe('  Мои слова дословно.  ');
  expect(questions.domainQuestionsComplete(done)).toBe(true);
});

test('unanswered questions never become implicit delegation and custom-option labels are not accepted as facts', () => {
  expect(() => questions.mergeDomainQuestionAnswers(card(), { answers: [] })).toThrow();
  expect(() => questions.mergeDomainQuestionAnswers(card(), { answers: [{ key: 'position', mode: 'choice', optionIds: ['option-7'] }] })).toThrow();
  expect(() => questions.mergeDomainQuestionAnswers(card(), { answers: [{ key: 'position', mode: 'custom', text: '  ВАРИАНТ 7  ' }] })).toThrow();
  expect(() => questions.mergeDomainQuestionAnswers(card(), { answers: [{ key: 'position', mode: 'choice', optionIds: ['option-1', 'option-2'] }] })).toThrow();
  expect(() => questions.mergeDomainQuestionAnswers(card(), { answers: [{ key: 'foreign', mode: 'delegate' }] })).toThrow();
  const delegated = questions.mergeDomainQuestionAnswers(card(), { decideForPerson: true });
  expect(delegated.answers.map(answer => answer.mode)).toEqual(['delegate', 'delegate']);
  expect(questions.domainQuestionsComplete(delegated)).toBe(true);
});

test('an authoritative manual revision change is refused without consuming the stored answers', async () => {
  const pending = questions.mergeDomainQuestionAnswers(card(), { answers: [{ key: 'position', mode: 'custom', text: 'Моя позиция' }] });
  const changed = detail();
  changed.core.text = 'Ручная правка';
  await expect(questions.assertDomainQuestionCurrent({ organizationId: 'org-1', language: 'ru', service: () => ({ detail: async () => changed }) }, pending)).rejects.toMatchObject({ code: 'AGENT_QUESTION_STALE' });
  expect(pending.answers[0].text).toBe('Моя позиция');
});

const { loadRegistry, requestContextFor, servicesFrom, executeTool } = require('./helpers/agent-capabilities.cjs');
const registry = loadRegistry();
const build = (id, services) => registry.buildCapabilityTool(registry.CAPABILITY_CATALOGUE.find(capability => capability.id === id), {
  services: servicesFrom(services), language: 'ru', entrance: 'chat',
});

test('native create resumes the same saved piece across partial answers and applies one complete manual batch', async () => {
  const saved = detail();
  const intake = jest.fn(async function* () {
    yield {name: 'piece', pieceId: 'piece-1', code: 'cnt-1'};
    yield {name: 'questions', questions: [original, second]};
  });
  const prepareAnswer = jest.fn(async (_org, pieceId, request) => ({pieceId, request, core: saved.core}));
  const answer = jest.fn(async function* (_org, plan) {
    saved.core = {...saved.core, text: 'Суть с личной позицией и без выдуманного эпизода.',
      questions: {round: 2, items: [], answered: [{field: 'position', text: plan.request.answers[0].text, origin: 'person'}, {field: 'facts', key: 'ask-1', text: '', origin: 'model'}]}};
    yield {name: 'piece', pieceId: 'piece-1', code: 'cnt-1', core: saved.core};
    yield {name: 'questions', questions: []};
  });
  const services = {IntakeService: {prepare: async () => ({}), run: intake}, PieceService: {detail: async () => saved, prepareAnswer, answer}};
  const tool = build('piece.create', services);
  const input = {text: 'Напиши материал и черновик Telegram', research: 'none'};
  const first = await executeTool(tool, input, {requestContext: requestContextFor(registry)});
  expect(first.output).toBeUndefined();
  expect(first.suspended[0]).toMatchObject({kind: 'domain-questions', activeKey: 'position', answers: []});
  expect(first.parts.find(part => part.type === 'data-piece').data.id).toBe('piece-1');
  const partial = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: JSON.parse(JSON.stringify(first.suspended[0])),
    resumeData: {answers: [{key: 'position', mode: 'custom', text: '  Мои личные слова  '}]}});
  expect(partial.output).toBeUndefined();
  expect(partial.suspended[0]).toMatchObject({activeKey: 'ask-1', answers: [{key: 'position', text: '  Мои личные слова  '}]});
  expect(prepareAnswer).not.toHaveBeenCalled();
  expect(answer).not.toHaveBeenCalled();
  const result = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: JSON.parse(JSON.stringify(partial.suspended[0])),
    resumeData: {answers: [{key: 'ask-1', mode: 'delegate'}]}});
  expect(result.output).toMatchObject({ok: true, summary: {pieceId: 'piece-1', questions: 0}});
  expect(intake).toHaveBeenCalledTimes(1);
  expect(prepareAnswer).toHaveBeenCalledTimes(1);
  expect(prepareAnswer.mock.calls[0][2]).toEqual({answers: [{field: 'position', text: '  Мои личные слова  '}]});
  expect(answer).toHaveBeenCalledTimes(1);
  expect(result.output.summary.leftToAuthor).toEqual([second.question]);
});

test('native piece.answer launches exact pending questions and cannot use model-supplied answers', async () => {
  const prepareAnswer = jest.fn();
  const opened = await executeTool(build('piece.answer', {PieceService: {detail: async () => detail(), prepareAnswer}}),
    {pieceId: 'piece-1', answers: [{questionId: 'position', text: 'Слова модели не ответ человека'}], decide: ['ask-1']},
    {requestContext: requestContextFor(registry)});
  expect(opened.output).toBeUndefined();
  expect(opened.suspended[0]).toMatchObject({answers: [], activeKey: 'position'});
  expect(prepareAnswer).not.toHaveBeenCalled();
});

test('native adaptation saves human answers one at a time and preserves confirmed/model provenance in its one batch', async () => {
  const saved = detail();
  const prepareAdapt = jest.fn(async (_org, pieceId, request) => ({pieceId, request}));
  const adapt = jest.fn(async function* (_org, plan) {
    yield {name: 'adapt-started', channel: {id: 'channel-1', name: 'Telegram', providerIdentifier: 'telegram'}};
    if (!plan.request.answers && !plan.request.skipInterview) {
      yield {name: 'questions', questions: [original, second]};
      return;
    }
    saved.adaptations.push({id: 'adaptation-1', integrationId: 'channel-1', body: 'Сохранённый пост'});
    yield {name: 'adaptation', adaptation: {id: 'adaptation-1', state: 'draft'}};
  });
  const tool = build('piece.adapt', {PieceService: {detail: async () => saved, adaptPlanMode: async () => 'draft', prepareAdapt, adapt}});
  const input = {pieceId: 'piece-1', channelId: 'channel-1'};
  const first = await executeTool(tool, input, {requestContext: requestContextFor(registry)});
  expect(first.suspended[0].questions[0].options).toHaveLength(7);
  const partial = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: first.suspended[0],
    resumeData: {answers: [{key: 'position', mode: 'confirmed'}]}});
  expect(prepareAdapt).toHaveBeenCalledTimes(1);
  const final = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: JSON.parse(JSON.stringify(partial.suspended[0])),
    resumeData: {answers: [{key: 'ask-1', mode: 'delegate'}]}});
  expect(final.output).toMatchObject({ok: true, summary: {adaptationId: 'adaptation-1'}});
  expect(prepareAdapt).toHaveBeenCalledTimes(2);
  expect(prepareAdapt.mock.calls[1][2]).toMatchObject({answers: [{key: 'position', text: 'Вариант 6', origin: 'confirmed'}], decideKeys: ['ask-1']});
});

test('explicit native read ask/deny restrictions override the ordinary safe-read default', () => {
  const tool = build('piece.open', {});
  for (const policy of ['ask', 'deny']) {
    const requestContext = requestContextFor(registry);
    requestContext.set('controller', {getState: () => ({permissionRules: {tools: {piece_open: policy}, categories: {}}})});
    expect(tool.requireApproval({pieceId: 'piece-1'}, {requestContext})).toBe(true);
    expect(tool.requireApproval({pieceId: 'piece-1'}, {requestContext: Object.fromEntries(requestContext.entries())})).toBe(true);
  }
  const requestContext = requestContextFor(registry);
  requestContext.set('controller', {state: {permissionRules: {tools: {piece_open: 'allow'}, categories: {read: 'ask'}}}});
  expect(tool.requireApproval({pieceId: 'piece-1'}, {requestContext})).toBe(false);
});

test.each(['piece.create.from-research', 'piece.core.rebuild'])('%s asks saved questions and never repeats the original operation per answer', async id => {
  const saved = detail();
  const select = jest.fn(async function* () {
    yield {name: 'piece', pieceId: 'piece-1', code: 'cnt-1'};
    yield {name: 'questions', questions: [original, second]};
  });
  const rebuild = jest.fn(async () => ({revisions: 2}));
  const answer = jest.fn(async function* () {
    saved.core.questions.items = [];
    yield {name: 'piece', pieceId: 'piece-1', code: 'cnt-1', core: saved.core};
  });
  const services = {IntakeService: {selectResearchForModel: select}, PieceService: {detail: async () => saved, rebuildCore: rebuild,
    prepareAnswer: async (_org, pieceId, request) => ({pieceId, request, core: saved.core}), answer}};
  const input = id === 'piece.core.rebuild' ? {pieceId: 'piece-1'} : {snapshotKey: 'saved-intake', factKeys: ['fact-1']};
  const tool = build(id, services);
  const first = await executeTool(tool, input, {requestContext: requestContextFor(registry)});
  expect(first.suspended[0].questions[0].question).toBe(long);
  const completed = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: first.suspended[0], resumeData: {decideForPerson: true}});
  expect(completed.output).toMatchObject({ok: true, summary: {pieceId: 'piece-1'}});
  expect(answer).toHaveBeenCalledTimes(1);
  expect(id === 'piece.core.rebuild' ? rebuild : select).toHaveBeenCalledTimes(1);
});

test.each([false, true])('saved optional adaptation material questions apply one batch (delegate all: %s)', async delegateAll => {
  const saved = detail();
  saved.core.questions.items = [];
  saved.channels = [{integrationId: 'channel-1', materialAsk: {adaptationId: 'adaptation-1', questions: [original, second]}}];
  const qualityReview = { status: 'partial', missingRequirements: ['Уточнить охват.'], unsupportedClaims: [], reviews: 1, repaired: false };
  const adapt = jest.fn(async function* () {
    const id = saved.adaptations.length ? 'adaptation-2' : 'adaptation-1';
    saved.adaptations.push({id, integrationId: 'channel-1', body: 'Сохранённый пост'});
    yield {name: 'adaptation', qualityReview, adaptation: {id, state: 'draft'}};
  });
  const materialQuestions = jest.fn(async (_org, _piece, _channel, input) => {
    saved.channels[0].materialAsk = null;
    return {state: input.dismiss ? 'dismissed' : 'answered'};
  });
  const rebuildCore = jest.fn(async () => {saved.core.text = 'Суть с новым материалом'; return {revisions: 1};});
  const tool = build('piece.adapt', {PieceService: {detail: async () => saved, adaptPlanMode: async () => 'draft',
    prepareAdapt: async (_org, pieceId, request) => ({pieceId, request}), adapt, materialQuestions, rebuildCore}});
  const input = {pieceId: 'piece-1', channelId: 'channel-1'};
  const first = await executeTool(tool, input, {requestContext: requestContextFor(registry)});
  expect(first.suspended[0]).toMatchObject({kind: 'domain-questions', continuation: {operation: 'adaptation-material', result: { qualityReview }}});
  expect(first.parts.find(part => part.type === 'data-adaptation')?.data.qualityReview.untrustedData.value).toEqual(qualityReview);
  expect(first.suspended[0].questions[0].options).toHaveLength(7);
  let pending = first.suspended[0];
  if (!delegateAll) {
    const partial = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: pending,
      resumeData: {answers: [{key: 'position', mode: 'custom', text: 'Мой реальный материал'}]}});
    pending = partial.suspended[0];
    expect(materialQuestions).not.toHaveBeenCalled();
    expect(rebuildCore).not.toHaveBeenCalled();
  }
  const final = await executeTool(tool, input, {requestContext: requestContextFor(registry), suspendPayload: pending, resumeData: {decideForPerson: true}});
  expect(final.output).toMatchObject({ok: true, summary: {adaptationId: delegateAll ? 'adaptation-1' : 'adaptation-2', qualityReview: { untrustedData: { value: qualityReview } }}});
  expect(materialQuestions).toHaveBeenCalledTimes(1);
  expect(materialQuestions.mock.calls[0][3]).toEqual(delegateAll ? {adaptationId: 'adaptation-1', dismiss: true}
    : {adaptationId: 'adaptation-1', answers: [{key: 'position', text: 'Мой реальный материал'}]});
  expect(rebuildCore).toHaveBeenCalledTimes(delegateAll ? 0 : 1);
  expect(adapt).toHaveBeenCalledTimes(delegateAll ? 1 : 2);
});
