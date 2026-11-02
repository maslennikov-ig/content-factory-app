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

const lengthOptions = [
  { id: 'brief', label: 'Короткая новость', description: 'Один факт и его значение для читателя.', lengthRange: { idealMin: 300, idealMax: 600, hardMax: 800 }, recommended: false },
  { id: 'explained', label: 'Новость с контекстом', description: 'Добавим причину и конкретный пример.', lengthRange: { idealMin: 900, idealMax: 1400, hardMax: 1800 }, recommended: true },
];
const optionsQuestion = () => readQuestion('piece_adapt', { ...payload, lengthOptions }, null);
test('task-specific options select the recommendation without sending, then apply the chosen range', async () => {
  const tailored = optionsQuestion();
  expect(tailored.lengthOptions).toEqual(lengthOptions);
  const answers = await show({ question: tailored });
  expect(screen.getByRole('radio', { name: /Новость с контекстом/ }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByLabelText('Желаемый максимум, знаков').value).toBe('1400');
  expect(answers).toEqual([]);
  expect(screen.queryByLabelText('Длина')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: /Короткая новость/ }));
  expect(screen.getByLabelText('Желаемый максимум, знаков').value).toBe('600');
  fireEvent.change(screen.getByLabelText('Желаемый максимум, знаков'), { target: { value: '700' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Применить объём' })));
  expect(answers).toEqual([{ action: 'apply', settings: { ...proposed, lengthPolicy: 'range', lengthRange: { idealMin: 300, idealMax: 700, hardMax: 800 } } }]);
});
test('option keyboard selection is reversible, and channel defaults remain an explicit secondary fallback', async () => {
  const answers = await show({ question: optionsQuestion(), words: words.en });
  const recommended = screen.getByRole('radio', { name: /Новость с контекстом/ });
  recommended.focus();
  fireEvent.keyDown(recommended, { key: 'ArrowUp' });
  expect(screen.getByRole('radio', { name: /Короткая новость/ }).getAttribute('aria-checked')).toBe('true');
  expect(answers).toEqual([]);
  expect(screen.queryByRole('button', { name: 'Keep channel settings' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Channel settings' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keep channel settings' })));
  expect(answers).toEqual([{ action: 'keep-channel' }]);
});
test('edited option survives send failure and a reload without reverting to the recommendation', async () => {
  const draftStorageKey = 'writing-options-reload';
  window.sessionStorage.removeItem(draftStorageKey);
  await show({ question: optionsQuestion(), draftStorageKey, onAnswer: () => Promise.reject(new Error('offline')) });
  fireEvent.click(screen.getByRole('radio', { name: /Короткая новость/ }));
  fireEvent.change(screen.getByLabelText('Желаемый максимум, знаков'), { target: { value: '750' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Применить объём' })));
  expect(screen.getByText(words.ru.question.answerFailed)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Применить объём' }).disabled).toBe(false);
  cleanup();
  const answers = await show({ question: optionsQuestion(), draftStorageKey });
  expect(screen.getByLabelText('Желаемый максимум, знаков').value).toBe('750');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Применить объём' })));
  expect(answers[0].settings.lengthRange).toEqual({ idealMin: 300, idealMax: 750, hardMax: 800 });
  expect(window.sessionStorage.getItem(draftStorageKey)).toBeNull();
});
test('option history shows accepted edited values and no live controls', async () => {
  const accepted = { ...proposed, lengthRange: { idealMin: 300, idealMax: 750, hardMax: 800 } };
  await show({ question: optionsQuestion(), readOnly: true, history: { writingAnswer: { action: 'apply', settings: accepted } } });
  expect(screen.getByText(/300–750/)).toBeTruthy();
  expect(screen.queryByText(/600–1100/)).toBeNull();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Применить объём' })).toBeNull();
});
test('invalid options cannot silently become a legacy approval card', () => {
  for (const invalidOptions of [[], [lengthOptions[0]], [lengthOptions[0], lengthOptions[0]], lengthOptions.map(option => ({ ...option, recommended: true }))]) {
    expect(readQuestion('piece_adapt', { ...payload, lengthOptions: invalidOptions }, null).kind).toBe('writing-settings-invalid');
  }
});
test('busy option cards lock choices and numeric edits without sending', async () => {
  const answers = await show({ question: optionsQuestion(), busy: true });
  expect(screen.getByRole('button', { name: 'Применить объём' }).disabled).toBe(true);
  for (const choice of screen.getAllByRole('radio')) expect(choice.disabled).toBe(true);
  expect(screen.getByLabelText('Желаемый максимум, знаков').disabled).toBe(true);
  expect(answers).toEqual([]);
});
test('an agent recommendation label is not repeated by a second recommendation marker', async () => {
  for (const [locale, label] of [['ru', 'Новость с контекстом (рекомендую)'], ['en', 'Context (recommended)']]) {
    const tailored = readQuestion('piece_adapt', { ...payload, lengthOptions: lengthOptions.map(option => option.recommended ? { ...option, label } : option) }, null);
    await show({ question: tailored, words: words[locale] });
    expect(screen.getByRole('radio', { name: new RegExp(label.split(' (')[0]) })).toBeTruthy();
    expect(screen.queryByText(locale === 'ru' ? 'Рекомендую' : 'Recommended')).toBeNull();
    cleanup();
  }
});
