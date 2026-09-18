const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * The word «модель» is not the product's word.
 *
 * Owner, 18.09.2026: «мы иногда используем слово „модель“, многие люди не
 * знают… что мы поняли». In the interface the product speaks about its own
 * work as «мы», names the performer «ИИ» where it has to be named (failures
 * above all), and keeps «модель» only where a person really picks one — the AI
 * provider settings. This guard reads string literals, not comments: an
 * identifier, a prompt or a note for a developer may say «модель» freely.
 */

const root = path.resolve(__dirname, '..');
const components = path.join(root, 'apps/frontend/src/components');

/** Settings screens where a person literally chooses a model. */
const ALLOWED_FILES = [
  /apps\/frontend\/src\/components\/settings\/ai-provider/,
  /apps\/frontend\/src\/components\/settings\/admin-ai/,
  /apps\/frontend\/src\/components\/admin\/admin-ai/,
];

/**
 * Inline copy that does not live in a `*.copy.ts` module. Scanned by name so
 * the guard covers the screens the wave actually rewrote.
 */
const INLINE_FILES = [
  'apps/frontend/src/components/content-intelligence/pieces/piece-questions.tsx',
  'apps/frontend/src/components/content-intelligence/pieces/pieces.review-scene.tsx',
  'apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx',
  'apps/frontend/src/components/content-intelligence/intake/intake.review-scene.tsx',
  'apps/frontend/src/components/content-intelligence/intake/writing-profile.fields.tsx',
  'apps/frontend/src/components/content-intelligence/content-search.container.tsx',
  'apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx',
  'apps/frontend/src/components/channels/channel-writing-profile.tsx',
  'apps/frontend/src/components/brand-voice/voice-brief.adapter.ts',
];

/**
 * Named exceptions, kept explicit so the list can only shrink. Matching is by
 * a distinctive fragment rather than a line number: a line moves with any edit
 * above it, and a stale number would quietly stop guarding anything.
 *
 * Only the help answer about the provider settings is here — it explains the
 * «модель на роль» field a person really fills in. The backend review files of
 * this wave (`pieces/review*.ts`, `pieces/adaptation-review.ts`,
 * `pieces/adaptation-web-review.ts`, `pieces/piece.service.ts`,
 * `openai/web.research.service.ts`) belong to another stream and are outside
 * this scan entirely.
 */
const ALLOWLIST = [
  {
    file: 'apps/frontend/src/components/help/help.copy.ts',
    contains: 'Где ключи ИИ и что такое «модель на роль»?',
  },
  {
    file: 'apps/frontend/src/components/help/help.copy.ts',
    contains: '«Модель на роль» — какая модель отвечает за какой вид работы',
  },
];

const allowed = (hit) =>
  ALLOWLIST.some(
    (entry) => entry.file === hit.file && hit.text.includes(entry.contains)
  );

const collectCopyModules = (directory, found = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) collectCopyModules(absolute, found);
    else if (entry.isFile() && entry.name.endsWith('.copy.ts')) found.push(absolute);
  }
  return found;
};

const scanned = [
  ...collectCopyModules(components),
  ...INLINE_FILES.map((relative) => path.join(root, relative)),
]
  .map((absolute) => path.relative(root, absolute).split(path.sep).join('/'))
  .filter((relative) => !ALLOWED_FILES.some((allowed) => allowed.test(relative)))
  .sort();

const MODEL_WORD = /модел/i;

/** Every string literal of a module, with its 1-based line. */
const stringLiterals = (relative) => {
  const filename = path.join(root, relative);
  const source = ts.createSourceFile(
    filename,
    fs.readFileSync(filename, 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
    /\.tsx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const literals = [];
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      literals.push({
        text: node.text,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return literals;
};

const hits = scanned.flatMap((relative) =>
  stringLiterals(relative)
    .filter((literal) => MODEL_WORD.test(literal.text))
    .map((literal) => ({ ...literal, file: relative }))
);

describe('the product does not say «модель» to a person', () => {
  test('no copy string outside the provider settings uses the word', () => {
    const failures = hits
      .filter((hit) => !allowed(hit))
      .map((hit) => `${hit.file}:${hit.line}`);
    expect(failures).toEqual([]);
  });

  test('every allowlisted exception still exists', () => {
    const stale = ALLOWLIST.filter(
      (entry) =>
        !hits.some(
          (hit) => hit.file === entry.file && hit.text.includes(entry.contains)
        )
    ).map((entry) => `${entry.file}: ${entry.contains}`);
    expect(stale).toEqual([]);
  });

  test('the scan actually reads something', () => {
    expect(scanned.length).toBeGreaterThan(10);
  });
});
