'use strict';

/**
 * Отказ виден там, где он случился (`content-factory-next-fn33.131`).
 *
 * 05.09.2026 владелец нашёл материал на вкладке «Бриф», нажал «Взять как
 * доказательство» и запустил генерацию. Строитель контекста отбросил все
 * десять взятых фрагментов как неподтверждённые (`rejected: [{reason:
 * 'UNVERIFIED'}]`, статус UNAVAILABLE, политика ALLOW_USER_ONLY) — это
 * решение продукта и оно не меняется: взятое поиском становится
 * доказательством только после подтверждения человеком на витрине «Откуда
 * факты». Пробел был в другом: окно поста об этом молчало, и пост без единого
 * факта ничем не отличался от поста, собранного вообще без материала.
 *
 * Здесь проверяется, что число отброшенных доезжает до клиента и что окно
 * называет его словами и ведёт на следующий шаг.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { cleanup, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const h = React.createElement;

const STORE = 'apps/frontend/src/components/new-launch/store.ts';
const MANAGE = 'apps/frontend/src/components/new-launch/manage.modal.tsx';
const NOTE =
  'apps/frontend/src/components/new-launch/unverified-evidence.note.tsx';

/** Хранилище в одиночку: предмет здесь — разбор конверта, а не окно. */
function loadStore() {
  const filename = path.join(repositoryRoot, STORE);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const mocks = {
    zustand: { create: () => () => ({}) },
    dayjs: () => ({}),
    react: { createRef: () => ({ current: null }) },
    '@contentfactory/frontend/components/new-launch/providers/post-comment.enum':
      { PostComment: { ALL: 'ALL' } },
    '@contentfactory/frontend/components/layout/set.timezone': {
      newDayjs: () => ({}),
    },
  };
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    (request) => mocks[request] || {},
    loaded
  );
  return loaded.exports;
}

const envelopeWithRejected = (rejected) => ({
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'UNAVAILABLE',
  generationPolicy: 'ALLOW_USER_ONLY',
  errorCode: null,
  builtAt: '2026-09-05T10:00:00.000Z',
  expiresAt: '2026-09-06T10:00:00.000Z',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  evidence: [],
  rejected,
  renderedCharacterCount: 0,
  selectionHash: 'selection-1',
  brandProfileVersionId: null,
});

const binding = (store) =>
  store.parseServerContentProvenance({
    contentContextSnapshotId: 'context-1',
    brandProfileVersionId: null,
    brandProfileSelection: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
    contentContextStatus: 'UNAVAILABLE',
    generationPolicy: 'ALLOW_USER_ONLY',
    selectionHash: 'selection-1',
  });

afterEach(cleanup);

describe('the window says which taken fragments never made it into the text', () => {
  test('the merged context carries how many were dropped as unconfirmed', () => {
    const store = loadStore();

    const merged = store.mergeServerContentContextEnvelope(
      binding(store),
      envelopeWithRejected([
        { itemId: 'evidence-1', reason: 'UNVERIFIED' },
        { itemId: 'evidence-2', reason: 'UNVERIFIED' },
      ])
    );

    expect(merged).not.toBeNull();
    expect(merged.unverifiedCount).toBe(2);
  });

  test('a rejection for another reason is not counted as unconfirmed', () => {
    const store = loadStore();

    const merged = store.mergeServerContentContextEnvelope(
      binding(store),
      envelopeWithRejected([{ itemId: 'evidence-1', reason: 'OVER_BUDGET' }])
    );

    expect(merged.unverifiedCount).toBe(0);
  });

  test('the note counts the fragments in Russian and names the next step', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(h(UnverifiedEvidenceNote, { count: 2, locale: 'ru' }));

    const note = screen.getByTestId('unverified-evidence-note');
    expect(note.textContent).toContain('2');
    expect(note.textContent).toMatch(/не подтвержден|не подтверждён/i);

    const link = screen.getByRole('link', { name: /откуда факты/i });
    expect(link.getAttribute('href')).toBe('/content?tab=provenance');
    // Окно поста держит несохранённый черновик: уход по ссылке потерял бы его.
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('one fragment reads as one, not as «1 фрагментов»', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(h(UnverifiedEvidenceNote, { count: 1, locale: 'ru' }));

    expect(screen.getByTestId('unverified-evidence-note').textContent).toContain(
      '1 взятый фрагмент пока не подтверждён'
    );
  });

  test('the same note reads in English for everybody else', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(h(UnverifiedEvidenceNote, { count: 3, locale: 'en' }));

    const note = screen.getByTestId('unverified-evidence-note');
    expect(note.textContent).toMatch(/3 .*not confirmed/i);
    expect(screen.getByRole('link', { name: /facts/i })).toBeTruthy();
  });

  test('nothing was dropped — nothing is said', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    const { container } = render(
      h(UnverifiedEvidenceNote, { count: 0, locale: 'ru' })
    );

    expect(container.innerHTML).toBe('');
  });

  test('the window mounts the note with the count the context reported', () => {
    const manage = read(MANAGE)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    expect(manage).toContain('<UnverifiedEvidenceNote');
    expect(manage).toMatch(/unverifiedCount/);
  });
});
