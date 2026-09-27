'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * The agent screen's mirror of the wire contract (`content-factory-next-kcxz.10`).
 *
 * The server declares what `POST /agent/chat` and `/agent/threads` send in
 * `agent-parts.contract.ts`; the screen cannot import a backend module, so
 * `agent.contract.ts` repeats the constants under the same names. This holds
 * the two together: a card kind, a code or a header renamed on one side fails
 * here, not on the screen after a release.
 *
 * It also holds the screen's words to the codes: every code the wire names
 * has a sentence in both languages, so a refusal is never shown as a bare
 * identifier because nobody wrote the words for it.
 */

const root = path.resolve(__dirname, '..');
const SERVER =
  'libraries/nestjs-libraries/src/chat/capabilities/agent-parts.contract.ts';
const SCREEN = 'apps/frontend/src/components/agents/agent.contract.ts';

const MIRRORED = [
  'AGENT_STREAM_VERSION',
  'CARD_KINDS',
  'PROGRESS_PART_TYPE',
  'CAPABILITY_REFUSAL_CODES',
  'AGENT_ERROR_CODES',
  'AGENT_DOOR_ERROR_CODES',
  'AGENT_THREAD_HEADER',
  'AGENT_TIMEZONE_HEADER',
  'AGENT_THREAD_TITLE_MAX',
  // What the composer sends is what the door takes (review W1 F2, F4, F1).
  'AGENT_ATTACHMENT_MEDIA_TYPES',
  'AGENT_TEXT_ATTACHMENT_MEDIA_TYPES',
  'AGENT_ATTACHMENT_MAX_FILES',
  'AGENT_ATTACHMENT_MAX_BYTES',
  'AGENT_TEXT_ATTACHMENT_MAX_BYTES',
  'AGENT_ATTACHMENTS_TOTAL_MAX_BYTES',
  'AGENT_APPROVALS_PER_REQUEST',
  'AGENT_APPROVAL_SUMMARY_MAX',
  // The answer a question card sends for «Решите за меня» (kcxz.12).
  'AGENT_DECIDE_FOR_PERSON_KEY',
  // Where a plan card's post stands (kcxz.15).
  'PLAN_SLOT_STATES',
  // The key a question card's id rides under, and the answer names (W2 F3).
  'AGENT_CARD_ID_KEY',
];

/** Exported constants whose value is a literal, a number or a literal array. */
const exportedLiterals = (relative) => {
  const file = path.join(root, relative);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const values = {};
  const read = (node) => {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression?.(node)) {
      return read(node.expression);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(read);
    return undefined;
  };
  source.forEachChild((statement) => {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      )
    ) {
      return;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        const value = read(declaration.initializer);
        if (value !== undefined) values[declaration.name.text] = value;
      }
    }
  });
  return values;
};

describe('the agent screen mirrors the wire contract', () => {
  const server = exportedLiterals(SERVER);
  const screen = exportedLiterals(SCREEN);

  test('the server contract still declares every mirrored constant', () => {
    expect(MIRRORED.filter((name) => !(name in server))).toEqual([]);
  });

  test.each(MIRRORED)('%s is the same on both sides', (name) => {
    expect({ name, value: screen[name] }).toEqual({
      name,
      value: server[name],
    });
  });

  test('every code on the wire has words in both languages', () => {
    const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
    const { agentCopy } = loadTypeScriptModule(
      'apps/frontend/src/components/agents/agent.copy.ts'
    );
    const codes = [
      ...server.CAPABILITY_REFUSAL_CODES,
      ...server.AGENT_ERROR_CODES,
      ...server.AGENT_DOOR_ERROR_CODES,
    ].filter((code) => code !== 'IDENTITY_MISSING');
    const missing = [];
    for (const locale of ['ru', 'en']) {
      for (const code of codes) {
        const words = agentCopy[locale].error.codes[code];
        if (!words?.what || !words?.next) missing.push(`${locale}:${code}`);
      }
    }
    // `IDENTITY_MISSING` is the server's own fault, never the person's: it
    // reads as the general sentence on purpose.
    expect(missing).toEqual([]);
  });
});
