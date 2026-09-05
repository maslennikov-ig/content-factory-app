'use strict';

/**
 * «Взято из поиска» — пометка вместо отказа (`content-factory-next-ec48.2`).
 *
 * До 05.09.2026 найденное поиском в текст не попадало вовсе: строитель
 * контекста отбрасывал его как `UNVERIFIED`, и платная проверка
 * (`docs/product/material-quality-check-2026-09-05.md`) показала, что из пяти
 * постов ни один не опёрся на материал. Владелец решил в тот же день: брать
 * такое можно, но называть — «взято из поиска», а не «не проверено».
 *
 * Отсюда три места, где слово должно появиться, и одно, где старое слово
 * должно остаться: записка окна поста говорит про вошедшее в текст, ярлык у
 * элемента списка материала говорит, откуда он, витрина «Откуда факты»
 * говорит, что подтверждения ещё нет, а прежняя записка про неподтверждённое
 * остаётся ровно для тех отказов, которые всё ещё случаются.
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
const NOTE =
  'apps/frontend/src/components/new-launch/unverified-evidence.note.tsx';
const MARK = 'apps/frontend/src/components/new-launch/search-evidence.mark.tsx';
const EDITOR = 'apps/frontend/src/components/new-launch/editor.tsx';
const MANAGE = 'apps/frontend/src/components/new-launch/manage.modal.tsx';
const SHOWCASE =
  'apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx';
const SEARCH_PANEL =
  'apps/frontend/src/components/content-intelligence/content-search.container.tsx';
const LOCALES =
  'libraries/react-shared-libraries/src/translation/locales';

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

const evidenceItem = (citationId, provenance) => ({
  citationId,
  evidenceId: `evidence-${citationId}`,
  sourceSnapshotId: `snapshot-${citationId}`,
  title: `Заголовок ${citationId}`,
  retrievedAt: '2026-09-05T09:00:00.000Z',
  exposure: 'PUBLIC',
  ...(provenance ? { provenance } : {}),
});

const envelopeWith = (evidence) => ({
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'context-1',
  status: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  errorCode: null,
  builtAt: '2026-09-05T10:00:00.000Z',
  expiresAt: '2026-09-06T10:00:00.000Z',
  profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
  facts: [],
  evidence,
  rejected: [],
  renderedCharacterCount: 0,
  selectionHash: 'selection-1',
  brandProfileVersionId: null,
});

const binding = (store) =>
  store.parseServerContentProvenance({
    contentContextSnapshotId: 'context-1',
    brandProfileVersionId: null,
    brandProfileSelection: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
    contentContextStatus: 'READY',
    generationPolicy: 'ALLOW_GROUNDED',
    selectionHash: 'selection-1',
  });

afterEach(cleanup);

describe('the context says which of its material came from a web search', () => {
  test('evidence marked SEARCH is counted apart from the rest', () => {
    const store = loadStore();

    const merged = store.mergeServerContentContextEnvelope(
      binding(store),
      envelopeWith([
        evidenceItem('E1', 'SEARCH'),
        evidenceItem('E2', 'SEARCH'),
        evidenceItem('E3', 'CONFIRMED'),
      ])
    );

    expect(merged).not.toBeNull();
    expect(merged.searchEvidenceCount).toBe(2);
  });

  test('evidence without the field is confirmed, as the contract says', () => {
    const store = loadStore();

    const merged = store.mergeServerContentContextEnvelope(
      binding(store),
      envelopeWith([evidenceItem('E1'), evidenceItem('E2')])
    );

    expect(merged.searchEvidenceCount).toBe(0);
    for (const citation of merged.availableCitations) {
      expect(citation.provenance).toBe('CONFIRMED');
    }
  });

  test('the citation of a searched fragment carries its origin', () => {
    const store = loadStore();

    const merged = store.mergeServerContentContextEnvelope(
      binding(store),
      envelopeWith([evidenceItem('E1', 'SEARCH'), evidenceItem('E2')])
    );

    const byId = Object.fromEntries(
      merged.availableCitations.map((item) => [item.citationId, item])
    );
    expect(byId.E1.provenance).toBe('SEARCH');
    expect(byId.E2.provenance).toBe('CONFIRMED');
  });

  test('an unreadable value never destroys the envelope, it reads as confirmed', () => {
    const store = loadStore();

    const merged = store.mergeServerContentContextEnvelope(
      binding(store),
      envelopeWith([evidenceItem('E1', 'WHATEVER')])
    );

    expect(merged).not.toBeNull();
    expect(merged.searchEvidenceCount).toBe(0);
  });
});

describe('the post window says what went into the text and how it is marked', () => {
  test('the note counts the searched fragments in Russian and names the next step', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(h(UnverifiedEvidenceNote, { searchCount: 3, locale: 'ru' }));

    const note = screen.getByTestId('search-evidence-note');
    expect(note.textContent).toContain('3');
    expect(note.textContent).toMatch(/взят[а-яё]* из поиска/i);
    expect(note.textContent).toMatch(/вошл[а-яё]* в текст/i);

    // Ссылки на витрину у этой записки нет (рецензия ec48, P2-1): находка,
    // сохранённая генератором, ни к какому факту не привязана и на «Откуда
    // факты» не показывается. Следующий шаг — список материала этого окна.
    expect(note.textContent).toContain('ярлыком «Взято из поиска»');
    expect(note.querySelector('a')).toBeNull();
  });

  test('one fragment reads as one, not as «1 фрагментов»', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(h(UnverifiedEvidenceNote, { searchCount: 1, locale: 'ru' }));

    const note = screen.getByTestId('search-evidence-note').textContent;
    expect(note).toContain('1 фрагмент взят из поиска');
    expect(note).not.toMatch(/1 фрагмент[аов]/);
  });

  test('the same note reads in English for everybody else', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(h(UnverifiedEvidenceNote, { searchCount: 2, locale: 'en' }));

    const note = screen.getByTestId('search-evidence-note');
    expect(note.textContent).toMatch(/2 fragments came from web search/i);
    expect(note.textContent).toMatch(/from web search/i);
  });

  test('the old note keeps speaking only for the refusals that are left', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    render(
      h(UnverifiedEvidenceNote, { count: 2, searchCount: 0, locale: 'ru' })
    );

    expect(screen.getByTestId('unverified-evidence-note')).toBeTruthy();
    expect(screen.queryByTestId('search-evidence-note')).toBeNull();
  });

  test('nothing taken and nothing refused — nothing is said', () => {
    const { UnverifiedEvidenceNote } = loadTypeScriptModule(NOTE);

    const { container } = render(
      h(UnverifiedEvidenceNote, { count: 0, searchCount: 0, locale: 'ru' })
    );

    expect(container.innerHTML).toBe('');
  });

  test('the window hands the note the number the context reported', () => {
    const manage = read(MANAGE)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    expect(manage).toMatch(/searchCount=\{[^}]*searchEvidenceCount/);
  });
});

describe('the material list of the post window marks what came from a search', () => {
  test('the mark is a stamped monospaced marker, not a sentence', () => {
    const { SearchEvidenceMark } = loadTypeScriptModule(MARK);

    const { container } = render(
      h(SearchEvidenceMark, { label: 'Взято из поиска' })
    );

    const mark = container.querySelector('.cf-label-sm');
    expect(mark).not.toBeNull();
    expect(mark.textContent).toContain('Взято из поиска');
    // Только токены `cf-*`: ни одного hex-литерала и ни одной сырой палитры.
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  test('the citation list mounts the mark for a searched citation', () => {
    const editor = read(EDITOR)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    expect(editor).toContain('<SearchEvidenceMark');
    expect(editor).toMatch(/provenance === 'SEARCH'/);
    expect(editor).toMatch(
      /t\('citation_from_search', 'From web search'\)/
    );
  });

  test('the word of the mark exists in all sixteen locales', () => {
    const folder = path.join(repositoryRoot, LOCALES);
    const missing = [];
    for (const locale of fs.readdirSync(folder)) {
      const strings = JSON.parse(
        fs.readFileSync(path.join(folder, locale, 'translation.json'), 'utf8')
      );
      const value = strings.citation_from_search;
      if (typeof value !== 'string' || !value.trim()) {
        missing.push(locale);
      }
    }
    expect(missing).toEqual([]);
    const ru = JSON.parse(
      fs.readFileSync(path.join(folder, 'ru', 'translation.json'), 'utf8')
    );
    expect(ru.citation_from_search).toMatch(/поиска/i);
  });
});

describe('the showcase says a searched fragment is not confirmed yet', () => {
  const showcase = loadTypeScriptModule(SHOWCASE);

  const searchedFact = (needsLook) =>
    Object.freeze({
      id: 'fact-search',
      claimKey: 'спрос|регион',
      topic: 'спрос',
      topicLabel: 'Спрос',
      statement: 'Спрос в регионе вырос на 4%.',
      language: 'ru',
      temporalKind: 'DATED',
      freshUntil: null,
      status: 'ACTIVE',
      supersedesFactId: null,
      createdAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T10:00:00.000Z',
      createdByName: 'Ирина',
      grounding: {
        method: 'SEARCH_RESULT',
        evidenceId: 'evidence-1',
        excerpt: null,
        sourceLabel: null,
        sourceUrl: 'https://example.org/report',
        observedAt: '2026-09-05T09:00:00.000Z',
      },
      needsLook,
      evidence: [],
    });

  const renderRow = (fact, locale) =>
    render(
      h(showcase.FactRowView, {
        fact,
        locale,
        t: showcase.factsShowcaseCopy[locale],
        busy: false,
        canWrite: true,
        expanded: false,
        onToggleExcerpt: () => {},
        onRetract: () => {},
        onRestore: () => {},
        onCopy: () => {},
        onConfirm: () => {},
      })
    );

  test('a search-grounded row with no accepted assessment is signed', () => {
    const { container } = renderRow(searchedFact(true), 'ru');

    expect(container.textContent).toContain('Взято из поиска, не подтверждено');
  });

  test('the same row says it in English', () => {
    const { container } = renderRow(searchedFact(true), 'en');

    expect(container.textContent).toContain('From web search, not confirmed');
  });

  test('once it is confirmed the signature goes away', () => {
    const { container } = renderRow(searchedFact(false), 'ru');

    expect(container.textContent).not.toContain('не подтверждено');
  });
});

describe('the search panel promises the text, not the refusal', () => {
  test('the panel no longer says the fragment stays out', () => {
    const panel = read(SEARCH_PANEL);

    expect(panel).not.toContain('не считается подтверждённым');
    expect(panel).not.toContain('does not count as confirmed');
  });

  test('it names the mark the fragment will carry, and what confirming buys', () => {
    const panel = read(SEARCH_PANEL);

    expect(panel).toMatch(/пойдёт в текст с пометкой «взято из поиска»/);
    expect(panel).toMatch(/повышает доверие/);
    expect(panel).toMatch(/marked “from web search”|marked «from web search»|marked "from web search"/i);
  });
});
