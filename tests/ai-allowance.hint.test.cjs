'use strict';

/**
 * `content-factory-next-fn33.28.3`: the line that says how much AI is left,
 * beside the button that spends it.
 *
 * Three things are worth holding. The three answers the door can give each
 * read as their own sentence — a counted allowance, a workspace key with no
 * ceiling, and nothing left — and «nothing left» borrows the wording the
 * server's own 429 refusal already uses, so a person never meets two
 * sentences for one refusal. Waiting and failing say so instead of printing a
 * number nobody computed. And an unreadable answer never becomes a made-up
 * remainder.
 */

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const SOURCE = 'apps/frontend/src/components/ui/allowance-hint.tsx';

const translations = {
  ai_allowance_loading: 'Считаем остаток…',
  ai_allowance_workspace_key: 'Ключ пространства: лимита нет',
  ai_allowance_unknown: 'Остаток сейчас не показать.',
  ai_usage_exhausted: 'Лимит включённого AI исчерпан.',
  ai_allowance_included: 'Осталось {{remaining}} из {{limit}} до {{date}}',
  ai_allowance_unavailable:
    'ИИ ещё не подключён: нет ни включённого лимита, ни ключа пространства. Настроить может администратор в «Настройки → AI».',
  ai_allowance_none:
    'У этого пространства нет включённого лимита ИИ. Администратор может подключить тариф или выбрать ключ пространства в «Настройки → AI».',
};

/** i18next's own substitution, in the one shape this component uses. */
const translate = (key, fallback, values) => {
  const template = translations[key] ?? fallback ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template
  );
};

const swrCalls = [];
let swrAnswer = { data: undefined, error: undefined, isLoading: true };

function loadHint() {
  const filename = path.join(root, SOURCE);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

  const mocks = {
    swr: {
      __esModule: true,
      default: (key, loader) => {
        swrCalls.push({ key, loader });
        return swrAnswer;
      },
    },
    '@contentfactory/helpers/utils/custom.fetch': {
      useFetch: () => async () => ({ json: async () => ({}) }),
    },
    '@contentfactory/react/helpers/variable.context': {
      useVariables: () => ({ language: 'ru' }),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => translate,
    },
  };

  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const hint = loadHint();

const render = (state) =>
  renderToStaticMarkup(
    React.createElement(hint.AllowanceHintView, { state, language: 'ru' })
  );

describe('the allowance line', () => {
  test('a counted allowance reads as a remainder, a total and a date', () => {
    const markup = render({
      status: 'included',
      remaining: 7,
      limit: 10,
      resetsAt: '2026-10-04T00:00:00.000Z',
    });

    expect(markup).toContain('Осталось 7 из 10 до 4 октября');
  });

  test('a workspace key says it has no counted limit instead of a number', () => {
    const markup = render({ status: 'workspace_key' });

    expect(markup).toContain('Ключ пространства: лимита нет');
    expect(markup).not.toMatch(/\d/);
  });

  test('an exhausted allowance uses the wording of the server refusal', () => {
    const settings = fs.readFileSync(
      path.join(
        root,
        'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
      ),
      'utf8'
    );

    expect(render({ status: 'exhausted' })).toContain(
      translations.ai_usage_exhausted
    );
    // The same key the settings screen and the 429 path already show.
    expect(JSON.parse(settings).ai_usage_exhausted).toEqual(
      expect.stringContaining('исчерпан')
    );
  });

  /**
   * `content-factory-next-fn33.28.9`: свежее пространство ничего не тратило.
   *
   * Раньше `remaining <= 0 || limit <= 0` сваливались в одну строку, и человек,
   * не нажавший ни одной платной кнопки, читал «Лимит включённого AI
   * исчерпан». Исчерпание — это про потраченное; когда тратить было нечего,
   * надо сказать, чего нет и куда идти.
   */
  test('a workspace with nothing to call the model with is told exactly that', () => {
    const markup = render({ status: 'unavailable' });

    expect(markup).toContain('ИИ ещё не подключён');
    expect(markup).toContain('Настройки → AI');
    expect(markup).not.toContain('исчерпан');
  });

  test('a workspace with a key but no plan is not called exhausted either', () => {
    const markup = render({ status: 'no_allowance' });

    expect(markup).toContain('нет включённого лимита');
    expect(markup).not.toContain('исчерпан');
  });

  test('the two honest states are told quietly, not in the refusal colour', () => {
    // Ни то ни другое не отказ: человеку ничего не запретили, ему сообщают
    // положение дел. Красный здесь означал бы ошибку, которой нет.
    for (const status of ['unavailable', 'no_allowance']) {
      expect(render({ status })).toContain('text-cf-ink-muted');
      expect(render({ status })).not.toContain('text-cf-danger');
    }
    // А исчерпание — отказ, и цвет у него прежний.
    expect(render({ status: 'exhausted' })).toContain('text-cf-danger');
  });

  test('the door answer maps to the honest state, not to a spent allowance', () => {
    // Ровно то тело, которое отдал стенд свежему пространству.
    expect(hint.readAllowance({ mode: 'unavailable' })).toEqual({
      status: 'unavailable',
    });
    expect(
      hint.readAllowance({
        mode: 'included',
        used: 0,
        limit: 0,
        remaining: 0,
        resetsAt: '2026-10-04T00:00:00.000Z',
      })
    ).toEqual({ status: 'no_allowance' });
    // А потраченный лимит по-прежнему исчерпан.
    expect(
      hint.readAllowance({
        mode: 'included',
        used: 5,
        limit: 5,
        remaining: 0,
        resetsAt: '2026-10-04T00:00:00.000Z',
      })
    ).toEqual({ status: 'exhausted' });
  });

  test('waiting and failing say so rather than showing a number', () => {
    expect(render({ status: 'loading' })).toContain('Считаем остаток…');
    expect(render({ status: 'error' })).toContain('Остаток сейчас не показать.');
    expect(render({ status: 'error' })).not.toMatch(/\d/);
  });

  test('an answer that cannot be read is not turned into a remainder', () => {
    expect(hint.readAllowance(null)).toEqual({ status: 'error' });
    expect(hint.readAllowance({ mode: 'included' })).toEqual({
      status: 'error',
    });
    expect(
      hint.readAllowance({ mode: 'included', remaining: 0, limit: 5, resetsAt: 'x' })
    ).toEqual({ status: 'exhausted' });
    expect(hint.readAllowance({ mode: 'workspace_key' })).toEqual({
      status: 'workspace_key',
    });
  });

  test('the line is a caption in system tokens, with no colour of its own invented', () => {
    const source = fs.readFileSync(path.join(root, SOURCE), 'utf8');

    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(render({ status: 'workspace_key' })).toContain('cf-caption');
    expect(render({ status: 'exhausted' })).toContain('text-cf-danger');
  });

  test('the container reads the member-facing door and never blocks on it', () => {
    swrAnswer = { data: undefined, error: undefined, isLoading: true };
    const markup = renderToStaticMarkup(
      React.createElement(hint.AllowanceHint, {})
    );

    expect(hint.ALLOWANCE_API).toBe('/settings/ai/allowance');
    expect(swrCalls.at(-1).key).toBe('/settings/ai/allowance');
    expect(markup).toContain('Считаем остаток…');
  });
});
