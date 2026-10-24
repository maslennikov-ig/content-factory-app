'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/agents/question-fixture' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: dom.window[key] });
global.self = dom.window;
global.requestAnimationFrame = callback => setTimeout(callback, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const cards = loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.ru;
const h = React.createElement;
afterEach(() => { cleanup(); window.sessionStorage.clear(); });

const manualPayload = () => ({
  kind: 'domain-questions', batchId: 'manual-batch', question: 'Уточните исходный материал',
  source: { kind: 'piece', pieceId: 'piece-fixture', revision: 'manual-revision' },
  activeKey: 'angle', canDecideForPerson: true, cardId: 'a'.repeat(32), answers: [],
  questions: [{ key: 'angle', question: 'Какую мысль нужно объяснить?\n' + 'Полная формулировка без сокращений. '.repeat(14),
    selectionMode: 'single', canDecideForPerson: true, ownOption: 'Уточню своими словами',
    options: Array.from({ length: 7 }, (_, index) => ({ id: `option-${index}`, label: `Вариант ${index}: ` + 'Подробное исходное пояснение. '.repeat(12), ...(index === 5 ? { recommended: true } : {}) })) },
    { key: 'experience', question: 'Какой собственный пример добавить?', options: [], selectionMode: 'single', canDecideForPerson: true }],
});

test('manual questions retain exact long wording, every ordered stable option and explicit delegation', () => {
  const payload = manualPayload();
  const parsed = contract.readQuestion('piece_create', payload, null);
  const { question: text, ...rest } = payload;
  expect(parsed).toEqual({ ...rest, text });
});

test('the original own-option opens an empty custom field and never submits its label as fact', async () => {
  const { DomainQuestionCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.domain-question-card.tsx');
  const payload = manualPayload();
  payload.questions[0].options.push({ id: 'own-source', label: payload.questions[0].ownOption });
  const answers = [];
  render(h(DomainQuestionCard, { question: contract.readQuestion('piece_create', payload, null), busy: false, words, onAnswer: data => answers.push(data) }));
  fireEvent.click(within(document.body).getByRole('radio', { name: payload.questions[0].ownOption }));
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe('');
  expect(within(document.body).getByRole('button', { name: words.question.send }).disabled).toBe(true);
  expect(answers).toEqual([]);
});

test('explicit whole-batch delegation cannot be submitted twice while native resume is pending', async () => {
  const { DomainQuestionCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.domain-question-card.tsx');
  const onAnswer = jest.fn(() => new Promise(() => undefined));
  render(h(DomainQuestionCard, { question: contract.readQuestion('piece_create', manualPayload(), null), busy: false, words, onAnswer }));
  const button = within(document.body).getByRole('button', { name: words.question.decideRemaining });
  await act(async () => { fireEvent.click(button); fireEvent.click(button); });
  expect(onAnswer).toHaveBeenCalledTimes(1);
  expect(onAnswer).toHaveBeenCalledWith({ decideForPerson: true });
  expect(button.disabled).toBe(true);
});

test('a successful retained-source range is recoverable while a real missing source stays an error', () => {
  const range = { part: 'research_source', title: 'Сохранённая заметка', revision: 'source-v1', offset: 6, text: 'actual text', totalCharacters: 40,
    literalMatch: false, canReviseInput: true, recovery: { code: 'MATERIAL_PASSAGE_NOT_FOUND' } };
  const message = (output) => ({ id: 'source-read', role: 'assistant', parts: [{ type: 'tool-piece_read', toolCallId: 'source-call', title: 'Прочитать материал', state: 'output-available', output }] });
  expect(contract.readMessageBlocks(message({ ok: true, summary: { untrustedData: { value: range } } }))).toEqual([
    { type: 'source-range', key: 'source-read:0', sourceTitle: 'Сохранённая заметка', offset: 6, characters: 11 },
  ]);
  expect(contract.readMessageBlocks(message({ ok: false, code: 'MATERIAL_NOT_AVAILABLE' }))[0]).toMatchObject({ type: 'error', code: 'MATERIAL_NOT_AVAILABLE' });
  expect(contract.recoverableMaterialRange({ ok: true, summary: { untrustedData: { value: { ...range, text: '' } } } })).toBeNull();
});

test('native multi-selection sends the selected option ids once and keeps all descriptions', async () => {
  const question = contract.readQuestion('ask_user', { question: 'Какие темы оставить?', selectionMode: 'multiple', options: [
    { id: 'cases', label: 'Кейсы', description: 'Только подтверждённые примеры' }, { id: 'practice', label: 'Практика' },
  ], cardId: 'b'.repeat(32) }, null);
  expect(question.selectionMode).toBe('multiple');
  const answers = [];
  render(h(cards.QuestionCard, { question, title: null, answered: false, busy: false, words, onAnswer: data => answers.push(data) }));
  fireEvent.click(within(document.body).getByRole('checkbox', { name: /Кейсы/ }));
  fireEvent.click(within(document.body).getByRole('checkbox', { name: /Практика/ }));
  const submit = within(document.body).getByRole('button', { name: words.question.send });
  await act(async () => { fireEvent.click(submit); fireEvent.click(submit); });
  expect(answers).toEqual([{ answer: ['cases', 'practice'] }]);
  expect(document.body.textContent).toContain('Только подтверждённые примеры');
});

test('an approval without action details cannot authorize a generic action and offers a refresh', async () => {
  const answers = [];
  const refresh = jest.fn();
  render(h(cards.ApprovalCard, { title: null, reason: null, toolName: 'skill', irreversible: false, state: 'asked', busy: false,
    onAnswer: answer => answers.push(answer), onRefresh: refresh, words }));
  expect(within(document.body).queryByRole('button', { name: words.approval.yes })).toBeNull();
  expect(document.body.textContent).not.toContain(words.approval.fallbackAction);
  expect(document.body.textContent).not.toContain('Отменить можно потом');
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.approval.refresh })));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(answers).toEqual([]);
});

test('a manual custom draft survives a rejected submit and remount without becoming delegation', async () => {
  const { DomainQuestionCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.domain-question-card.tsx');
  const question = contract.readQuestion('piece_create', manualPayload(), null);
  const onAnswer = jest.fn(async () => { throw new Error('MATERIAL_STALE'); });
  const props = { question, busy: false, words, draftStorageKey: 'owned-person:thread:batch', onAnswer };
  const mounted = render(h(DomainQuestionCard, props));
  expect(document.querySelectorAll('[data-question-option]').length).toBe(7);
  expect(within(document.body).getByRole('button', { name: words.question.send }).disabled).toBe(true);
  fireEvent.click(within(document.body).getByRole('radio', { name: words.question.ownAnswer }));
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: 'Мой точный ответ\nи важная вторая строка' } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  expect(onAnswer).toHaveBeenCalledWith({ answers: [{ key: 'angle', mode: 'custom', text: 'Мой точный ответ\nи важная вторая строка' }] });
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe('Мой точный ответ\nи важная вторая строка');
  expect(within(document.body).getByRole('button', { name: words.question.send }).disabled).toBe(false);
  mounted.unmount();
  render(h(DomainQuestionCard, props));
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe('Мой точный ответ\nи важная вторая строка');
});

test('a confirmed stale-question refusal names the cause and current-piece action while retaining the exact draft', async () => {
  const { DomainQuestionCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.domain-question-card.tsx');
  const question = contract.readQuestion('piece_create', manualPayload(), null);
  const onAnswer = jest.fn(async () => { throw new Error(JSON.stringify({ code: 'AGENT_QUESTION_STALE' })); });
  render(h(DomainQuestionCard, { question, busy: false, words, draftStorageKey: 'owned-stale-question', onAnswer }));
  fireEvent.click(within(document.body).getByRole('radio', { name: words.question.ownAnswer }));
  const text = 'Мой точный неотправленный ответ\nпосле ручной правки материала';
  fireEvent.change(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }), { target: { value: text } });
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  expect(document.body.textContent).toContain(words.error.codes.AGENT_QUESTION_STALE.what);
  expect(document.body.textContent).toContain(words.error.codes.AGENT_QUESTION_STALE.next);
  expect(document.body.textContent).not.toContain(words.question.answerFailed);
  expect(within(document.body).getByRole('textbox', { name: words.question.ownAnswer }).value).toBe(text);
  expect(within(document.body).getByRole('button', { name: words.question.send }).disabled).toBe(true);
  expect(within(document.body).getByRole('link', { name: words.card.openOnScreen }).getAttribute('href')).toBe(contract.artifactHref({ kind: 'piece', id: question.source.pieceId }));
  expect(onAnswer).toHaveBeenCalledTimes(1);
});

test('accepted manual answers remain visible and only an explicit remaining-batch delegation submits', async () => {
  const { DomainQuestionCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.domain-question-card.tsx');
  const payload = manualPayload();
  payload.answers = [{ key: 'angle', mode: 'choice', optionIds: ['option-5'], text: payload.questions[0].options[5].label }];
  payload.activeKey = 'experience';
  const answers = [];
  render(h(DomainQuestionCard, { question: contract.readQuestion('piece_create', payload, null), busy: false, words,
    onAnswer: data => answers.push(data) }));
  expect(document.body.textContent).toContain(payload.answers[0].text);
  await act(async () => fireEvent.click(within(document.body).getByRole('radio', { name: words.question.decide })));
  expect(answers).toEqual([]);
  await act(async () => fireEvent.click(within(document.body).getByRole('button', { name: words.question.send })));
  expect(answers).toEqual([{ answers: [{ key: 'experience', mode: 'delegate' }] }]);
});
