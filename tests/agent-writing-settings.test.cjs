'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { act, cleanup, fireEvent, render, screen, waitFor } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { WritingSettingsCard } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.writing-settings-card.tsx');
const { readQuestion, readMessageBlocks, withoutRepeatedQuestionLines } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy;
const current = { lengthPolicy: 'channel', lengthRange: { idealMin: 500, idealMax: 1000, hardMax: 1500 }, emojiLevel: 'medium', hashtagPolicy: 'none', linkPolicy: 'end', ctaKind: 'auto' };
const proposed = { ...current, lengthPolicy: 'range', lengthRange: { idealMin: 600, idealMax: 1100, hardMax: 1600 }, emojiLevel: 'few' };
const payload = { kind: 'writing-settings', question: 'Применить?', reason: 'Для краткости', current, proposed, channel: { id: 'c1', name: 'Новости', provider: 'telegram' }, canDecideForPerson: false, cardId: 'card1' };
const question = readQuestion('piece_adapt', payload, null);
afterEach(cleanup);
const show = async (props = {}) => { const answers = []; await act(async () => { render(React.createElement(WritingSettingsCard, { question, words: words.ru, busy: false, onAnswer: answer => answers.push(answer), ...props })); }); await waitFor(() => expect(document.querySelector('[data-agent-card="writing-settings"]')).not.toBeNull()); return answers; };
test('parses the native payload and submits only valid edited settings for the post', async () => {
  expect(question).toMatchObject({ kind: 'writing-settings', current, proposed, cardId: 'card1' });
  const answers = await show();
  expect(screen.getByText('Для краткости')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Желаемый максимум, знаков'), { target: { value: '400' } });
  expect(screen.getByRole('button', { name: 'Применить к посту' }).disabled).toBe(true);
  const invalidField = screen.getByLabelText('Желаемый максимум, знаков');
  expect(invalidField.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(invalidField.getAttribute('aria-describedby')).textContent).toContain('Проверьте диапазон');
  fireEvent.change(screen.getByLabelText('Желаемый максимум, знаков'), { target: { value: '1200' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Применить к посту' })));
  expect(answers).toEqual([{ action: 'apply', settings: { ...proposed, lengthRange: { ...proposed.lengthRange, idealMax: 1200 } } }]);
});
test('keeping defaults is explicit and does not submit proposed values', async () => {
  const answers = await show();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Оставить настройки канала' })));
  expect(answers).toEqual([{ action: 'keep-channel' }]);
});
test('persisted confirmation survives reload and deduplicates the old suspended card', async () => {
  const accepted = { ...proposed, lengthRange: { ...proposed.lengthRange, idealMax: 1200 } };
  const data = { capability: 'piece.adapt', stage: 'writing-settings-confirmed', question: { ...payload, scope: 'drafts', maxCharacters: 2000 }, answer: { action: 'apply', settings: accepted } };
  const saved = readMessageBlocks({ id: 'saved', role: 'assistant', parts: [{ type: 'data-progress', data }, { type: 'tool-piece_adapt', state: 'output-error', toolCallId: 'call1', title: 'Adapt', errorText: 'failed' }] });
  const old = { type: 'question', key: 'old', toolName: 'piece_adapt', title: null, runId: 'run1', toolCallId: 'call1', question };
  const groups = withoutRepeatedQuestionLines([[old], saved]);
  expect(groups[0]).toHaveLength(0);
  const retained = groups[1].find(block => block.type === 'question');
  expect(retained).toMatchObject({ runId: null, writingConfirmed: true, history: { writingAnswer: data.answer } });
  await show({ question: retained.question, words: words.en, readOnly: true, history: retained.history });
  expect(screen.getByText('Settings applied to this material')).toBeTruthy();
  expect(screen.getByText(/600–1200/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Apply to material' })).toBeNull();
});
test('platform limit blocks every range field and a too-long proposal can be edited', async () => {
  const bounded = readQuestion('piece_adapt', { ...payload, scope: 'drafts', maxCharacters: 1400 }, null);
  await show({ question: bounded });
  expect(screen.getByText('Предел площадки: 1400 знаков.')).toBeTruthy();
  expect(screen.getByText(/если получится серия/)).toBeTruthy();
  const apply = screen.getByRole('button', { name: 'Применить к материалу' });
  expect(apply.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Жёсткий максимум, знаков'), { target: { value: '1300' } });
  expect(apply.disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('Минимум, знаков'), { target: { value: '1500' } });
  expect(apply.disabled).toBe(true);
});
test('relative length does not present the retained baseline range as a chosen limit', async () => {
  const relative = readQuestion('piece_adapt', { ...payload, maxCharacters: 2000, proposed: { ...proposed, lengthPolicy: 'shorter' } }, null);
  await show({ question: relative, readOnly: true });
  expect(screen.queryByText(/600–1100/)).toBeNull();
  expect(screen.getByText('Предел площадки: 2000 знаков.')).toBeTruthy();
});
test('malformed payload is not treated as a generic answerable question', () => {
  expect(readQuestion('piece_adapt', { ...payload, proposed: { ...proposed, emojiLevel: 'unknown' } }, null).kind).toBe('writing-settings-invalid');
});
test('busy and failed cards keep the draft available without sending', async () => {
  const answers = await show({ busy: true, failure: true });
  expect(screen.getByRole('button', { name: 'Применить к посту' }).disabled).toBe(true);
  expect(screen.getByText(words.ru.question.answerFailed)).toBeTruthy();
  expect(answers).toEqual([]);
});
test('persisted keep-channel confirmation is shown after reload without inventing an applied range', async () => {
  const data = { capability: 'piece.adapt', stage: 'writing-settings-confirmed', question: payload, answer: { action: 'keep-channel' } };
  const [block] = readMessageBlocks({ id: 'saved', role: 'assistant', parts: [{ type: 'data-progress', data }] });
  await show({ question: block.question, readOnly: true, history: block.history });
  expect(screen.getByText('Оставлены настройки канала')).toBeTruthy();
  expect(screen.queryByText('Применены настройки для поста')).toBeNull();
});
