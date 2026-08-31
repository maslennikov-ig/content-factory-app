'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const files = {
  generator: 'apps/frontend/src/components/launches/generator/generator.tsx',
  editor: 'apps/frontend/src/components/new-launch/editor.tsx',
  manage: 'apps/frontend/src/components/new-launch/manage.modal.tsx',
  modal: 'apps/frontend/src/components/new-launch/add.edit.modal.tsx',
  store: 'apps/frontend/src/components/new-launch/store.ts',
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

function loadEditorSummary(language = 'en') {
  const filename = path.join(root, files.editor);
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
          declaration.name.text === 'ContentIntelligenceContextSummary'
      )
  );
  expect(statement).toBeDefined();
  const isolated = `
    import React from 'react';
    const useVariables = () => ({ language: ${JSON.stringify(language)} });
    const useT = () => (_key, fallback) => fallback;
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
  return loaded.exports.ContentIntelligenceContextSummary;
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
    expect(source('editor')).toMatch(/\/copilot\/research/);
    expect(source('editor')).toMatch(/parseServerContentContextEnvelope/);
    expect(source('editor')).toMatch(/researchRequestRef/);
    expect(source('editor')).toMatch(/setGlobalValueCitationIds/);
    expect(source('editor')).toMatch(/clearAllValueCitationIds/);
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
    expect(source('editor')).toMatch(/CONTENT_EVIDENCE_REQUIRED/);
    expect(source('editor')).toMatch(/role=["']alert["']/);
    expect(source('editor')).toMatch(/Applied brand profile/);
    expect(source('editor')).toMatch(/Neutral voice/);
    expect(source('editor')).toMatch(/expiresAt/);
    expect(source('editor')).not.toMatch(
      /provider.*contentContextSnapshotId/is
    );
  });

  test('renders READY provenance with context expiry and grounded draft copy', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Summary = loadEditorSummary('en');
    const html = renderToStaticMarkup(
      React.createElement(Summary, {
        provenance: {
          ...resolvedBinding,
          errorCode: null,
          expiresAt: '2026-08-21T10:00:00.000Z',
          validationStatus: 'VALID',
          availableCitations: [],
        },
        loadState: 'ready',
        failure: null,
      })
    );
    expect(html).toContain('Context expires:');
    expect(html).toContain('Grounded output can be saved as a draft only.');
    expect(html).not.toContain('Fresh until');
  });

  test('renders neutral user-only provenance without grounded language', () => {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Summary = loadEditorSummary('ru');
    const html = renderToStaticMarkup(
      React.createElement(Summary, {
        provenance: {
          contentContextSnapshotId: 'context-neutral',
          brandProfileVersionId: null,
          brandProfileSelection: {
            mode: 'neutral_fallback',
            reason: 'NO_PROFILE',
          },
          contentContextStatus: 'UNAVAILABLE',
          generationPolicy: 'ALLOW_USER_ONLY',
          selectionHash: 'selection-neutral',
          errorCode: null,
          expiresAt: '2026-08-21T10:00:00.000Z',
          availableCitations: [],
        },
        loadState: 'ready',
        failure: null,
      })
    );
    expect(html).toContain('Срок действия контекста:');
    expect(html).toContain(
      'В черновик можно сохранить только материалы пользователя.'
    );
    expect(html).not.toContain('Grounded output');
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
