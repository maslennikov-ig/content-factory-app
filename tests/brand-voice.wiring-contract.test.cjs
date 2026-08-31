'use strict';

/**
 * The contract the Content section is wired through.
 *
 * One file of types and one registry beside them, so the backend and the
 * frontend of this epic can be built at the same time instead of one waiting
 * on the other. The registry is the part a test can hold: it names, for every
 * accepted screen, the routes that feed it and the props those routes fill.
 *
 * Two directions are checked, because either one alone passes while the
 * section stays broken. A screen prop no route fills is a hole the interface
 * finds at runtime; a contract field no screen draws is a promise the product
 * never keeps. Props are read out of the component's own type through the
 * TypeScript AST rather than by scanning the file for words — the mistake
 * `content-factory-next-36r` made four times was a guard that failed a file
 * for documenting the rule it kept.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const contractPath =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-wiring.contract.ts';
const screensDir = 'apps/frontend/src/components/brand-voice';

const contract = loadTypeScriptModule(contractPath);

/** Every prop a component takes, read from its declared parameter type. */
function propsOf(relativeFile, componentName) {
  const filename = path.join(root, relativeFile);
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, 'utf8'),
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TSX
  );

  let found = null;
  const visit = (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.text === componentName
    ) {
      found = node;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(source);

  if (!found) {
    throw new Error(`${componentName} not found in ${relativeFile}`);
  }

  const parameter = found.parameters[0];
  if (!parameter || !parameter.type || !ts.isTypeLiteralNode(parameter.type)) {
    throw new Error(
      `${componentName} does not declare its props as a type literal`
    );
  }

  return parameter.type.members
    .filter(ts.isPropertySignature)
    .map((member) => member.name.getText(source));
}

/** Names the contract exports as types, read the same structural way. */
function exportedTypeNames(relativeFile) {
  const filename = path.join(root, relativeFile);
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, 'utf8'),
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TS
  );

  const names = new Set();
  ts.forEachChild(source, (node) => {
    const isExported = (node.modifiers ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!isExported) return;
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      names.add(node.name.text);
    }
  });
  return names;
}

const contractTypes = exportedTypeNames(contractPath);

describe('the contract covers every accepted screen', () => {
  test('all twelve screens plus the brief are registered', () => {
    const screens = Object.values(contract.VOICE_SURFACES)
      .map((surface) => surface.screen)
      .filter(Boolean)
      .sort();

    expect(screens).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
    ]);
    expect(contract.VOICE_SURFACES.brief).toBeDefined();
  });

  test.each(
    Object.entries(contract.VOICE_SURFACES).filter(
      ([, surface]) => surface.component
    )
  )('%s draws only what the contract carries', (key, surface) => {
    const props = propsOf(
      path.join(screensDir, surface.source),
      surface.component
    );
    const served = [...surface.dataFields, ...surface.clientOnlyProps];

    // Locale is the host's, and a handler is not data. Everything else must be
    // one of the two: filled by a route, or explicitly the client's own.
    const expectedFromServer = props.filter(
      (prop) => prop !== 'locale' && !/^on[A-Z]/.test(prop)
    );

    expect([...served].sort()).toEqual([...expectedFromServer].sort());
  });

  test('every surface names a response type the contract exports', () => {
    for (const [key, surface] of Object.entries(contract.VOICE_SURFACES)) {
      for (const route of surface.routes) {
        expect(typeof route.method).toBe('string');
        expect(route.path.startsWith('/')).toBe(true);
        expect(contractTypes.has(route.response)).toBe(true);
        if (route.request) {
          expect(contractTypes.has(route.request)).toBe(true);
        }
        void key;
      }
    }
  });

  test('a screen with no component says so instead of pretending', () => {
    // Screen 04 — the analysis step — is built now, so nothing in the
    // registry is left pending. The check stays rather than being deleted:
    // a future gap (a screen accepted before its component exists) should
    // still be caught here, named, and carry a reason rather than silently
    // pass with no component and no explanation.
    const pending = Object.entries(contract.VOICE_SURFACES).filter(
      ([, surface]) => !surface.component
    );
    expect(pending).toEqual([]);

    for (const [, surface] of Object.entries(contract.VOICE_SURFACES)) {
      if (surface.pendingReason) {
        expect(typeof surface.pendingReason).toBe('string');
        expect(surface.pendingReason.length).toBeGreaterThan(20);
      }
    }
  });
});

describe('routes are distinct and stay away from the platforms', () => {
  test('no two surfaces claim the same method and path', () => {
    const seen = new Set();
    for (const surface of Object.values(contract.VOICE_SURFACES)) {
      for (const route of surface.routes) {
        const signature = `${route.method} ${route.path}`;
        expect(seen.has(signature)).toBe(false);
        seen.add(signature);
      }
    }
  });

  test('the contract imports nothing that can reach a platform', () => {
    const code = fs
      .readFileSync(path.join(root, contractPath), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

    // The rule from `docs/product/migration-map.md`, checked on imports and
    // calls rather than on words.
    expect(code).not.toMatch(/^import .*(?:PostsService|providers|integration)/m);
    expect(code).not.toMatch(/\bfetch\(|\baxios\b/);
    expect(code).not.toMatch(/\.(?:publish|schedule|deliver|send)\s*\(/);
  });
});

describe('a refusal is told apart from a shortfall', () => {
  test('every error code carries an HTTP status and a screen meaning', () => {
    const codes = Object.entries(contract.VOICE_ERROR_CODES);
    expect(codes.length).toBeGreaterThan(8);

    for (const [code, meaning] of codes) {
      expect(code).toMatch(/^(VOICE|MATERIAL|BRIEF|RADAR)_[A-Z_]+$/);
      expect(Number.isInteger(meaning.status)).toBe(true);
      expect(meaning.status).toBeGreaterThanOrEqual(400);
      expect(['error', 'restricted']).toContain(meaning.screenState);
    }
  });

  test('"not enough samples" is an outcome, never an error code', () => {
    // A shortfall says which number is missing; an error says the work could
    // not be done. Collapsing them leaves a person reading "something went
    // wrong" when the answer was "add 8 600 more characters".
    expect(contract.VOICE_ERROR_CODES.VOICE_CORPUS_INSUFFICIENT).toBeUndefined();
    expect(contract.VOICE_OUTCOMES).toContain('insufficient');
    expect(contract.VOICE_OUTCOMES).toContain('ready');
  });

  test('a model refusal is distinguishable from a shortfall', () => {
    expect(contract.VOICE_ERROR_CODES.VOICE_ASSIST_UNAVAILABLE.status).toBe(502);
    expect(contract.VOICE_ERROR_CODES.VOICE_ASSIST_UNGROUNDED.status).toBe(502);
    expect(contract.VOICE_ERROR_CODES.VOICE_FORBIDDEN).toMatchObject({
      status: 403,
      screenState: 'restricted',
    });
  });

  test('the analyser and locale pack versions travel with a measurement', () => {
    // A corridor nobody can reproduce is a number the generator obeys for no
    // stated reason.
    expect(contract.ANALYZER_VERSION).toMatch(/^brand-voice-analyzer\//);
    expect(contract.LOCALE_PACK_VERSION).toMatch(/^ru-\d{4}-\d{2}-\d{2}$/);
  });
});
