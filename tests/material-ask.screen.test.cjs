'use strict';

/**
 * «Материала мало» on screen (`content-factory-next-97dq.98`).
 *
 * One quiet line, the questions each with its reason, a field per question,
 * one action and «Не нужно». Unanswered questions change nothing; the words
 * are equal in RU and EN, and every «?» has a name of its own.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/content/pieces/piece-1',
});
for (const key of ['window', 'document', 'navigator'])
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/content-intelligence/pieces';
const { MaterialAsk, approximateLength } = loadTypeScriptModule(`${base}/material-ask.tsx`);
const { readMaterialAsk } = loadTypeScriptModule(`${base}/pieces.adapter.ts`);
const { piecesCopy } = loadTypeScriptModule(`${base}/pieces.copy.ts`);

afterEach(cleanup);

const ASK = {
  adaptationId: 'ad-1',
  length: 367,
  min: 500,
  questions: [
    { key: 'ask-1', question: 'Что именно изменилось?', suggested: null, why: 'чтобы показать, как это выглядело на деле' },
    { key: 'ask-2', question: 'Сколько времени это освободило?', suggested: null, why: 'число делает пост конкретным' },
  ],
};

const KEYS = [
  'materialAskLabel',
  'materialAskNotice',
  'materialAskNoticeHint',
  'materialAskNoticeHintLabel',
  'materialAskPlaceholder',
  'materialAskUse',
  'materialAskUsing',
  'materialAskUseHint',
  'materialAskUseHintLabel',
  'materialAskDismiss',
  'materialAskFailed',
];

describe('the words are equal in both languages', () => {
  test.each(KEYS)('%s exists in RU and EN, in the same form', (key) => {
    const ru = piecesCopy.ru[key];
    const en = piecesCopy.en[key];
    expect(typeof ru).toBe(typeof en);
    const read = (value) => (typeof value === 'function' ? value(370, 500) : value);
    expect(read(ru).trim()).not.toBe('');
    expect(read(en).trim()).not.toBe('');
    expect(read(en)).not.toMatch(/[А-Яа-яЁё]/u);
  });

  test('the notice says the numbers, the offer and that it is optional', () => {
    expect(piecesCopy.ru.materialAskNotice(370, 500)).toBe(
      'Материала на ~370 знаков, канал ждёт от 500. Можно ответить на вопросы ниже — пост станет полнее. Необязательно.'
    );
    expect(piecesCopy.en.materialAskNotice(370, 500)).toBe(
      'There is material for ~370 characters; the channel expects 500 or more. You can answer the questions below to make the post fuller. Optional.'
    );
  });

  test('«~370»: the length is rounded to tens, a short one is left as it is', () => {
    expect(approximateLength(367)).toBe(370);
    expect(approximateLength(364)).toBe(360);
    expect(approximateLength(87)).toBe(87);
  });
});

describe('the reader of the page', () => {
  test('a well-formed ask is read; anything half-read is none', () => {
    expect(readMaterialAsk(ASK)).toEqual(ASK);
    expect(readMaterialAsk(null)).toBeNull();
    expect(readMaterialAsk({ ...ASK, adaptationId: '' })).toBeNull();
    expect(readMaterialAsk({ ...ASK, min: 300 })).toBeNull();
    expect(
      readMaterialAsk({ ...ASK, questions: [{ key: 'ask-1', question: 'Без причины?' }] })
    ).toBeNull();
  });
});

describe('MaterialAsk', () => {
  const mount = (props = {}) => {
    const calls = { use: [], dismiss: 0 };
    const view = render(
      React.createElement(MaterialAsk, {
        locale: 'ru',
        ask: ASK,
        onUse: async (answers) => {
          calls.use.push(answers);
          return props.useOk ?? true;
        },
        onDismiss: async () => {
          calls.dismiss += 1;
          return true;
        },
        ...props,
      })
    );
    return { calls, view };
  };

  test('one line of notice, each question with its reason and its own field', () => {
    const { view } = mount();
    const notice = screen.getByText(piecesCopy.ru.materialAskNotice(370, 500));
    expect(notice.tagName).toBe('P');
    for (const question of ASK.questions) {
      const field = screen.getByLabelText(question.question);
      expect(field.tagName).toBe('TEXTAREA');
      const reason = screen.getByText(question.why);
      expect(field.getAttribute('aria-describedby')).toBe(reason.id);
    }
    // Both «?» carry names of their own.
    expect(screen.getByRole('button', { name: piecesCopy.ru.materialAskNoticeHintLabel })).toBeTruthy();
    expect(screen.getByRole('button', { name: piecesCopy.ru.materialAskUseHintLabel })).toBeTruthy();
    // Quiet: no badge, no panel, no heading.
    expect(view.container.querySelector('h2, h3, h4, [data-status]')).toBeNull();
  });

  test('nothing to send until something is answered; only answered questions go', async () => {
    const { calls } = mount();
    const use = screen.getByRole('button', { name: piecesCopy.ru.materialAskUse });
    expect(use.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(ASK.questions[1].question), {
      target: { value: '  Два часа в неделю.  ' },
    });
    expect(use.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(use);
    });
    expect(calls.use).toEqual([[{ key: 'ask-2', text: 'Два часа в неделю.' }]]);
  });

  test('«Не нужно» closes without answers', async () => {
    const { calls } = mount();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: piecesCopy.ru.materialAskDismiss }));
    });
    expect(calls.dismiss).toBe(1);
    expect(calls.use).toEqual([]);
  });

  test('a failure keeps the answers and says so', async () => {
    mount({ useOk: false });
    const field = screen.getByLabelText(ASK.questions[0].question);
    fireEvent.change(field, { target: { value: 'Утро стало тихим.' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: piecesCopy.ru.materialAskUse }));
    });
    expect(screen.getByRole('alert').textContent).toBe(piecesCopy.ru.materialAskFailed);
    expect(field.value).toBe('Утро стало тихим.');
  });

  test('disabled while a rewrite runs', () => {
    mount({ disabled: true });
    expect(screen.getByRole('button', { name: piecesCopy.ru.materialAskDismiss }).disabled).toBe(true);
    expect(screen.getByLabelText(ASK.questions[0].question).disabled).toBe(true);
  });

  test('EN renders the same block in English', () => {
    render(
      React.createElement(MaterialAsk, {
        locale: 'en',
        ask: ASK,
        onUse: async () => true,
        onDismiss: async () => true,
      })
    );
    expect(screen.getByText(piecesCopy.en.materialAskNotice(370, 500))).toBeTruthy();
    expect(screen.getByRole('button', { name: piecesCopy.en.materialAskDismiss })).toBeTruthy();
  });
});
