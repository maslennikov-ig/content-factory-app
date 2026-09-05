'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const i18next = require('i18next');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');

/*
 * The freshness date goes through the product's own reader-format helper
 * (`content-factory-next-fn33.87`), so the harness below loads the real one
 * rather than a lookalike: the assertion is about the notation a person set,
 * and a stub would only be asserting itself.
 */
const { formatDateTimeForReader } = loadTypeScriptModule(
  'apps/frontend/src/components/launches/helpers/isuscitizen.utils.tsx'
);
global.__formatDateTimeForReader = formatDateTimeForReader;
// Слова строки происхождения живут двумя языками в своём файле, как у
// голосовых экранов: русское число выбирает слово из трёх, а ключ i18next
// такого выбора не даёт.
const { composeCopy, resolveComposeLocale } = loadTypeScriptModule(
  'apps/frontend/src/components/new-launch/compose.copy.ts'
);
global.__composeCopy = composeCopy;
global.__resolveComposeLocale = resolveComposeLocale;
const files = {
  generator: 'apps/frontend/src/components/launches/generator/generator.tsx',
  editor: 'apps/frontend/src/components/new-launch/editor.tsx',
  manage: 'apps/frontend/src/components/new-launch/manage.modal.tsx',
  modal: 'apps/frontend/src/components/new-launch/add.edit.modal.tsx',
  store: 'apps/frontend/src/components/new-launch/store.ts',
  provenance: 'apps/frontend/src/components/new-launch/provenance.line.tsx',
  composeCopy: 'apps/frontend/src/components/new-launch/compose.copy.ts',
  review:
    'apps/frontend/src/app/(stand)/interface-review/content-intelligence/consumer/page.tsx',
};

const source = (name) => fs.readFileSync(path.join(root, files[name]), 'utf8');

function loadStore() {
  const filename = path.join(root, files.store);
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
      {
        PostComment: { ALL: 'ALL' },
      },
    '@contentfactory/frontend/components/layout/set.timezone': {
      newDayjs: () => ({}),
    },
  };
  const localRequire = (request) => mocks[request] || {};
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    localRequire,
    loaded
  );
  return loaded.exports;
}

/**
 * Строка происхождения, вынутая из своего файла и запущенная в одиночку.
 *
 * До 04.09.2026 то же самое делалось с панелью `ContentIntelligenceContextSummary`
 * в `editor.tsx`. Панель ушла с первого экрана вместе с лентой аватара:
 * владелец решил, что окно даёт только полезное, а происхождение поста —
 * это одна строка с «Подробнее». Проверяется здесь ровно то, что
 * проверялось: состояние словами, дата в формате настроек, ни одного ISO и
 * ни одного значения перечисления на экране.
 */
function loadProvenanceLine(language = 'en') {
  // The helper reads the interface language, which is where the notation comes
  // from — not the browser's locale.
  i18next.resolvedLanguage = language;
  const filename = path.join(root, files.provenance);
  const contents = fs.readFileSync(filename, 'utf8');
  const parsed = ts.createSourceFile(
    filename,
    contents,
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TSX
  );
  const statement = parsed.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === 'ProvenanceLine'
      )
  );
  expect(statement).toBeDefined();
  const isolated = `
    import React from 'react';
    import dayjs from 'dayjs';
    const useVariables = () => ({ language: ${JSON.stringify(language)} });
    const useT = () => (_key, fallback) => fallback;
    // The panel writes the freshness date in the format chosen in Settings.
    // Under Node there is no localStorage, so the switch is pinned to the
    // non-US format the assertions below read.
    const isUSCitizen = () => false;
    const formatDateTimeForReader = global.__formatDateTimeForReader;
    const composeCopy = global.__composeCopy;
    const resolveComposeLocale = global.__resolveComposeLocale;
    ${statement.getText(parsed)}
  `;
  const compiled = ts.transpileModule(isolated, {
    fileName: filename,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(
    loaded.exports,
    require,
    loaded
  );
  return loaded.exports.ProvenanceLine;
}

const resolvedBinding = Object.freeze({
  contentContextSnapshotId: 'context-1',
  brandProfileVersionId: 'profile-version-4',
  brandProfileSelection: Object.freeze({
    mode: 'resolved',
    versionId: 'profile-version-4',
    versionNumber: 4,
    contentDigest: 'digest-4',
  }),
  contentContextStatus: 'READY',
  generationPolicy: 'ALLOW_GROUNDED',
  selectionHash: 'selection-1',
});

const finalOutput = (binding = resolvedBinding) => ({
  ...binding,
  content: [{ content: 'Generated copy', usedCitationIds: ['F1'] }],
});

const splitNdjson = (events) => {
  const encoded = `${events
    .map((event) => JSON.stringify(event))
    .join('\n')}\n`;
  return [encoded.slice(0, 7), encoded.slice(7, 31), encoded.slice(31)];
};

describe('Content intelligence frontend consumer contract', () => {
  test('starts RED until all assigned production files exist and typecheck', () => {
    for (const file of Object.values(files)) {
      expect(fs.existsSync(path.join(root, file))).toBe(true);
      const result = ts.transpileModule(
        fs.readFileSync(path.join(root, file), 'utf8'),
        {
          fileName: file,
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            target: ts.ScriptTarget.ES2021,
          },
          reportDiagnostics: true,
        }
      );
      expect(result.diagnostics || []).toHaveLength(0);
    }
  });

  test('accepts only a server-issued generator binding and rejects mismatches', () => {
    const { parseServerContentProvenance } = loadStore();
    expect(typeof parseServerContentProvenance).toBe('function');

    const binding = parseServerContentProvenance({
      contentContextSnapshotId: 'context-1',
      brandProfileVersionId: 'profile-version-4',
      brandProfileSelection: {
        mode: 'resolved',
        versionId: 'profile-version-4',
        versionNumber: 4,
        contentDigest: 'digest-4',
      },
      contentContextStatus: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      selectionHash: 'selection-1',
    });
    expect(binding).toMatchObject({
      contentContextSnapshotId: 'context-1',
      brandProfileVersionId: 'profile-version-4',
      contentContextStatus: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      selectionHash: 'selection-1',
    });
    expect(
      parseServerContentProvenance({
        url: 'https://example.test/not-authority',
        provider: 'browser',
      })
    ).toBeNull();
    expect(
      parseServerContentProvenance({
        ...binding,
        brandProfileVersionId: 'different-version',
      })
    ).toBeNull();
  });

  test('rejects split generator output missing the final canonical binding', () => {
    const { createGeneratorNdjsonConsumer } = loadStore();
    expect(typeof createGeneratorNdjsonConsumer).toBe('function');
    const consumer = createGeneratorNdjsonConsumer();
    expect(() => {
      for (const chunk of splitNdjson([
        { name: 'content-context', data: { output: resolvedBinding } },
        { name: 'complete', data: { output: finalOutput({}) } },
      ])) {
        consumer.push(chunk);
      }
      consumer.finish();
    }).toThrow(/final content context/i);
  });

  test('rejects split generator output with a malformed final binding', () => {
    const { createGeneratorNdjsonConsumer } = loadStore();
    expect(typeof createGeneratorNdjsonConsumer).toBe('function');
    const consumer = createGeneratorNdjsonConsumer();
    expect(() => {
      for (const chunk of splitNdjson([
        { name: 'content-context', data: { output: resolvedBinding } },
        {
          name: 'complete',
          data: {
            output: finalOutput({
              ...resolvedBinding,
              selectionHash: '',
            }),
          },
        },
      ])) {
        consumer.push(chunk);
      }
      consumer.finish();
    }).toThrow(/final content context/i);
  });

  test('rejects split generator output when the final profile binding changes', () => {
    const { createGeneratorNdjsonConsumer } = loadStore();
    expect(typeof createGeneratorNdjsonConsumer).toBe('function');
    const consumer = createGeneratorNdjsonConsumer();
    expect(() => {
      for (const chunk of splitNdjson([
        { name: 'content-context', data: { output: resolvedBinding } },
        {
          name: 'complete',
          data: {
            output: finalOutput({
              ...resolvedBinding,
              brandProfileVersionId: 'profile-version-5',
              brandProfileSelection: {
                mode: 'resolved',
                versionId: 'profile-version-5',
                versionNumber: 5,
                contentDigest: 'digest-5',
              },
            }),
          },
        },
      ])) {
        consumer.push(chunk);
      }
      consumer.finish();
    }).toThrow(/changed during generation/i);
  });

  test('merges display metadata only from the matching immutable context envelope', () => {
    const { mergeServerContentContextEnvelope, parseServerContentProvenance } =
      loadStore();
    const binding = parseServerContentProvenance({
      contentContextSnapshotId: 'context-1',
      brandProfileVersionId: null,
      brandProfileSelection: {
        mode: 'neutral_fallback',
        reason: 'NO_PROFILE',
      },
      contentContextStatus: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      selectionHash: 'selection-1',
    });
    const envelope = {
      contractVersion: 'content-context/v1',
      contentContextSnapshotId: 'context-1',
      status: 'READY',
      generationPolicy: 'ALLOW_GROUNDED',
      errorCode: null,
      builtAt: '2026-08-20T10:00:00.000Z',
      expiresAt: '2026-08-21T10:00:00.000Z',
      profile: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
      facts: [
        {
          citationId: 'F1',
          factId: 'fact-1',
          statement: 'A verified fact',
          temporalKind: 'CURRENT',
          verifiedAt: '2026-08-20T09:00:00.000Z',
          freshUntil: '2026-08-21T09:00:00.000Z',
          evidenceCitationIds: ['E1'],
        },
      ],
      evidence: [
        {
          citationId: 'E1',
          evidenceId: 'evidence-1',
          sourceSnapshotId: 'snapshot-1',
          title: 'Product handbook',
          excerpt: 'Verified excerpt',
          url: null,
          exposure: 'INTERNAL_ONLY',
          publishedAt: null,
          retrievedAt: '2026-08-20T09:30:00.000Z',
        },
      ],
      rejected: [],
      renderedCharacterCount: 32,
      selectionHash: 'selection-1',
      brandProfileVersionId: null,
    };

    expect(mergeServerContentContextEnvelope(binding, envelope)).toMatchObject({
      expiresAt: '2026-08-21T10:00:00.000Z',
      availableCitations: [
        { citationId: 'F1', kind: 'FACT', label: 'A verified fact' },
        {
          citationId: 'E1',
          kind: 'EVIDENCE',
          label: 'Product handbook',
          retrievedAt: '2026-08-20T09:30:00.000Z',
        },
      ],
    });
    expect(
      mergeServerContentContextEnvelope(binding, {
        ...envelope,
        contentContextSnapshotId: 'other-context',
      })
    ).toBeNull();
  });

  test('carries exact generator and editor provenance into per-item draft save', () => {
    expect(source('generator')).toMatch(/createGeneratorNdjsonConsumer/);
    expect(source('generator')).toMatch(/const usedCitationIds/);
    expect(source('generator')).toMatch(/usedCitationIds,/);
    expect(source('generator')).toMatch(/contentIntelligenceProvenance=/);
    // Исследование ушло из окна поста: платное исследование начинается в
    // разделе «Контент» (решение владельца 04.09.2026). Дверь на сервере
    // осталась — окно её больше не зовёт.
    expect(source('editor')).not.toMatch(/\/copilot\/research/);
    expect(source('editor')).not.toMatch(/researchRequestRef/);
    expect(source('editor')).toMatch(/setGlobalValueCitationIds/);
    expect(source('manage')).toMatch(
      /contentContextSnapshotId:\s*contentIntelligenceProvenance\.contentContextSnapshotId/
    );
    expect(source('manage')).toMatch(
      /brandProfileVersionId:\s*contentIntelligenceProvenance\.brandProfileVersionId/
    );
    expect(source('manage')).toMatch(
      /usedCitationIds:\s*value\.usedCitationIds/
    );
  });

  test('rehydrates only server-returned binding metadata and fails closed visibly', () => {
    expect(source('modal')).toMatch(/outputContext/);
    expect(source('modal')).toMatch(/setContentIntelligenceProvenance/);
    // Отказ виден, но не в редакторе: причину печатает строка у самой
    // кнопки (`compose-block-reason.tsx`), а происхождение — одна строка.
    expect(source('manage')).toMatch(/ComposeBlockReasonNote/);
    expect(source('provenance')).toMatch(/expiresAt/);
    expect(source('provenance')).toMatch(/brandProfileSelection/);
    expect(source('editor')).not.toMatch(
      /provider.*contentContextSnapshotId/is
    );
  });

  test("renders one line of provenance with the count and the reader's date", () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Line = loadProvenanceLine('en');
    const html = renderToStaticMarkup(
      React.createElement(Line, {
        provenance: {
          ...resolvedBinding,
          errorCode: null,
          expiresAt: '2026-08-21T10:00:00.000Z',
          profileLabel: 'Editorial voice',
          validationStatus: 'VALID',
          availableCitations: [],
        },
        confirmationCount: 3,
      })
    );
    // Одно предложение: из скольких подтверждений собран пост и чей это голос.
    expect(html).toContain('Assembled from 3 confirmations');
    expect(html).toContain('written by the ');
    expect(html).toContain('Editorial voice');
    // Подробности — под «Подробнее», и только там.
    expect(html).toContain('Details');
    expect(html).toContain('The context is gathered and verified.');
    // `content-factory-next-fn33.87`: дата в формате, выбранном в настройках.
    expect(html).toContain('08/21/2026');
    // Ни значения перечисления, ни ISO-даты на поверхности письма.
    expect(html).not.toContain('READY');
    expect(html).not.toContain('2026-08-21T10:00:00.000Z');
  });

  test('says nothing at all about a post that carries no context', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Line = loadProvenanceLine('ru');
    // Обычный пост человек написал сам. Пустая строка «происхождения нет»
    // читалась бы как отчёт о проверке, которой не было.
    expect(
      renderToStaticMarkup(React.createElement(Line, { provenance: null }))
    ).toBe('');
  });

  test('counts confirmations in Russian, and says nothing it cannot count', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Line = loadProvenanceLine('ru');
    const provenance = {
      contentContextSnapshotId: 'context-neutral',
      brandProfileVersionId: null,
      brandProfileSelection: { mode: 'neutral_fallback', reason: 'NO_PROFILE' },
      contentContextStatus: 'UNAVAILABLE',
      generationPolicy: 'ALLOW_USER_ONLY',
      selectionHash: 'selection-neutral',
      errorCode: null,
      expiresAt: '2026-08-21T10:00:00.000Z',
      availableCitations: [],
    };

    const one = renderToStaticMarkup(
      React.createElement(Line, { provenance, confirmationCount: 1 })
    );
    expect(one).toContain('Собрано из 1 подтверждения');
    expect(one).toContain('пишет нейтральный стиль');

    const three = renderToStaticMarkup(
      React.createElement(Line, { provenance, confirmationCount: 3 })
    );
    expect(three).toContain('Собрано из 3 подтверждений');

    // Подтверждений за коробками нет — числа тоже нет.
    const unknown = renderToStaticMarkup(
      React.createElement(Line, { provenance })
    );
    expect(unknown).toContain('Собрано из подтверждений');
    expect(unknown).toContain(
      'Контекста пока нет: подтверждённых источников не найдено.'
    );
    expect(unknown).not.toContain('UNAVAILABLE');
  });

  test('keeps the browser-review route synthetic and network/persistence free', () => {
    expect(source('review')).toMatch(/data-review-source="synthetic"/);
    expect(source('review')).toMatch(/data-review-network="disabled"/);
    expect(source('review')).toMatch(/data-review-persistence="disabled"/);
    expect(source('review')).toMatch(/ContentIntelligenceContextSummary/);
    expect(source('review')).toMatch(/ContentIntelligenceCitationSelector/);
    expect(source('review')).not.toMatch(/useFetch|useSWR|fetch\(/);
  });
});
