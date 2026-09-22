const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * Coherence guard: one role, one primitive, one word (`97dq.39`).
 *
 * The tenth walk (22.09.2026) found the path «вход → заготовка → адаптация →
 * публикация» built from four disclosures, three overflow menus, four delete
 * confirmations and four names for one card
 * (`.codex/stages/content-factory-next-97dq/evidence/walk-2026-09-22-tenth/coherence-audit.md`).
 * Every one of those started as a second hand-written copy of a decision that
 * already had an owner. `docs/design/component-authoring-rules.md`, section
 * «Согласованность», states the rules; this file holds them.
 *
 * Same ledger form as `tests/design.guard.test.cjs`: each rule names the files
 * that already break it, a file outside the list is a new offence and fails,
 * and the list is checked the other way too — a file that got cleaner must
 * leave the list (or lower its count) in the same commit, or the allowance
 * outlives the problem and the next author inherits permission nobody granted.
 *
 * Ledgers that count rather than list («section labels», «touch target»,
 * «inline copy») are exact: the number may only go down, and when it does the
 * ledger goes down with it.
 *
 * The files under `content-intelligence/pieces/` are named here as they stand
 * on 22.09.2026. That folder is being rewritten in its own stream (option A,
 * the adaptation workspace); when it lands, its entries shrink here with it.
 */

const APP = 'apps/frontend/src';
const COMPONENTS = `${APP}/components`;

const walk = (directory, accept) =>
  fs
    .readdirSync(path.join(repositoryRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) return walk(relative, accept);
      return accept(entry.name) ? [relative] : [];
    })
    .sort();

const read = (file) => fs.readFileSync(path.join(repositoryRoot, file), 'utf8');

const isTsx = (name) => /\.tsx$/.test(name);
const isTsOrTsx = (name) => /\.tsx?$/.test(name);
const isCopy = (name) => /\.copy\.ts$/.test(name);

/** `{ file: count }` for every file where the pattern occurs at least once. */
const countPerFile = (files, pattern) => {
  const counts = {};
  for (const file of files) {
    const hits = read(file).match(new RegExp(pattern.source, 'g'));
    if (hits && hits.length) counts[file] = hits.length;
  }
  return counts;
};

/** A list ledger: who breaks the rule now, against who is allowed to. */
const listDrift = (offending, allowed) => ({
  added: offending.filter((file) => !allowed.includes(file)).sort(),
  stale: allowed.filter((file) => !offending.includes(file)).sort(),
});

/** A count ledger: a file may only lose occurrences, and the ledger follows. */
const countDrift = (actual, ledger) => ({
  grown: Object.keys(actual)
    .filter((file) => actual[file] > (ledger[file] ?? 0))
    .map((file) => `${file}: ${ledger[file] ?? 0} → ${actual[file]}`)
    .sort(),
  shrunk: Object.keys(ledger)
    .filter((file) => (actual[file] ?? 0) < ledger[file])
    .map((file) => `${file}: ${ledger[file]} → ${actual[file] ?? 0}`)
    .sort(),
});

/* -------------------------------------------------------------------------
 * 1. One disclosure
 * ---------------------------------------------------------------------- */

/**
 * A native `<details>` or a direction glyph (▸ ▾ ▴) standing in for the
 * `Disclosure` chevron. Glyphs are caught in copy files too: `'Ещё ▾'` puts the
 * arrow into the words, where no primitive can own it.
 */
const DISCLOSURE_PATTERN = /<details\b|[▸▾▴]/;

const DISCLOSURE_ALLOWED = [
  'apps/frontend/src/components/content-intelligence/content-facts.container.tsx',
  'apps/frontend/src/components/help/help-disclosure.tsx',
  'apps/frontend/src/components/help/help.copy.ts',
  'apps/frontend/src/components/new-launch/provenance.line.tsx',
];

const disclosureFiles = () =>
  walk(COMPONENTS, (name) => isTsx(name) || isCopy(name)).filter(
    (file) => file !== `${COMPONENTS}/ui/disclosure.tsx`
  );

/* -------------------------------------------------------------------------
 * 2. Section label is a component
 * ---------------------------------------------------------------------- */

const SECTION_LABEL_PATTERN = /cf-label-sm uppercase/;
const SECTION_LABEL_OWNER = `${COMPONENTS}/ui/section-label.tsx`;

/** Hand-typed `cf-label-sm uppercase` per file, 22.09.2026. Only decreases. */
const SECTION_LABEL_LEDGER = {
  'apps/frontend/src/app/(stand)/interface-review/page.tsx': 4,
  'apps/frontend/src/components/brand-voice/draft-gap-note.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-analysis.screen.tsx': 7,
  'apps/frontend/src/components/brand-voice/voice-avatar-create.dialog.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-avatars.screen.tsx': 4,
  'apps/frontend/src/components/brand-voice/voice-brief.container.tsx': 4,
  'apps/frontend/src/components/brand-voice/voice-brief.screen.tsx': 3,
  'apps/frontend/src/components/brand-voice/voice-learning.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-materials.screen.tsx': 3,
  'apps/frontend/src/components/brand-voice/voice-passport.screen.tsx': 5,
  'apps/frontend/src/components/brand-voice/voice-paths.screen.tsx': 5,
  'apps/frontend/src/components/brand-voice/voice-proposal.screen.tsx': 5,
  'apps/frontend/src/components/brand-voice/voice-redactions.screen.tsx': 3,
  'apps/frontend/src/components/brand-voice/voice-ribbon.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-samples.screen.tsx': 10,
  'apps/frontend/src/components/brand-voice/voice-scales.screen.tsx': 4,
  'apps/frontend/src/components/brand-voice/voice-versions.screen.tsx': 7,
  'apps/frontend/src/components/brand-voice/voice-wizard.container.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-facts.container.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx': 4,
  'apps/frontend/src/components/content-intelligence/content-materials.placeholder.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-search.container.tsx': 2,
  'apps/frontend/src/components/content-intelligence/intake/intake.research.tsx': 2,
  'apps/frontend/src/components/content-intelligence/intake/intake.screen.tsx': 2,
  'apps/frontend/src/components/content-intelligence/intake/questions.card.tsx': 1,
  'apps/frontend/src/components/content-intelligence/intake/writing-profile.fields.tsx': 1,
  'apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx': 2,
  'apps/frontend/src/components/launches/post-card.parts.tsx': 1,
  'apps/frontend/src/components/public-saas/home-shots.tsx': 1,
  'apps/frontend/src/components/settings/ai-provider.component.tsx': 1,
};

/* -------------------------------------------------------------------------
 * 3. Copy lives in the copy file
 * ---------------------------------------------------------------------- */

/**
 * `locale === 'ru' ? 'Слово' : 'Word'` — a string literal chosen by locale in
 * a screen. A locale code on the right (`locale === 'en' ? 'en' : 'ru'`,
 * `'ru-RU'`) is a locale decision, not copy, and is not counted.
 */
const INLINE_COPY_PATTERN =
  /\b\w*[lL]ocale\s*===\s*['"](?:ru|en)['"]\s*\?\s*['"`](?!(?:ru|en)(?:-[A-Z]{2})?['"`])/;

const INLINE_COPY_ROOTS = [
  `${COMPONENTS}/content-intelligence`,
  `${COMPONENTS}/channels`,
];

/** Inline locale ternaries per file, 22.09.2026. Only decreases. */
const INLINE_COPY_LEDGER = {
  'apps/frontend/src/components/channels/channel-screen.tsx': 6,
  'apps/frontend/src/components/content-intelligence/content-facts.adapter.ts': 1,
  'apps/frontend/src/components/content-intelligence/content-facts.review-scene.tsx': 1,
  'apps/frontend/src/components/content-intelligence/pieces/piece-questions.tsx': 1,
};

const inlineCopyFiles = () =>
  INLINE_COPY_ROOTS.flatMap((root) =>
    walk(root, (name) => isTsOrTsx(name) && !isCopy(name))
  );

/**
 * Keys nobody reads. A dead key is how the same sentence ends up in two
 * places: the copy file keeps the old one, a screen inlines the new one, and
 * the next author edits the wrong copy. Computed against the tree of
 * 22.09.2026; a key that comes back into use, or is deleted, leaves the list.
 */
const COPY_FILES = [
  `${COMPONENTS}/content-intelligence/pieces/pieces.copy.ts`,
  `${COMPONENTS}/content-intelligence/intake/intake.copy.ts`,
];

const DEAD_KEYS_ALLOWED = {
  'apps/frontend/src/components/content-intelligence/intake/intake.copy.ts': [
    'channelsHint',
    'channelsLabel',
    'factConflicting',
    'factNotFound',
    'factUnverified',
    'factVerified',
    'factsRestOn',
    'formatAuto',
    'readOnlyTitle',
    'researchColumnSource',
    'researchColumnStatus',
    'researchContinue',
    'researchExternal',
    'researchFound',
    'researchOwn',
    'researchSelectionHint',
    'researchSummaryUnverified',
    'researchTableTitle',
    'researchType',
    'researchUnverifiedDefault',
    'ungroundedLabel',
    'writingProfileAction',
    'writingProfileDefault',
  ],
  'apps/frontend/src/components/content-intelligence/pieces/pieces.copy.ts': [
    'archiveRefused',
    'chooseChannel',
    'clarifyDone',
    'clarifyLead',
    'clarifySkip',
    'deletePieceDone',
    'interviewLead',
    'laterBody',
    'laterTitle',
    'ownNumberBody',
    'ownNumberHas',
    'ownNumberLabel',
    'ownNumberNone',
    'ownNumberOptional',
    'slopAtCreation',
    'slopFound',
    'slopNoFindings',
    'slopTitle',
  ],
};

/** The property names of the `ru` object in `export const xCopy = { ru: {…} }`. */
const copyKeysOf = (file) => {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const keys = [];
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(ast) === 'ru' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (property.name) keys.push(property.name.getText(ast).replace(/['"]/g, ''));
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return keys;
};

const deadKeysOf = (file, sources) => {
  const elsewhere = sources
    .filter((source) => source.file !== file)
    .map((source) => source.text)
    .join('\n');
  return copyKeysOf(file).filter(
    (key) =>
      !new RegExp(`\\.${key}\\b|\\[['"\`]${key}['"\`]\\]`).test(elsewhere)
  );
};

/* -------------------------------------------------------------------------
 * 4. One state vocabulary
 * ---------------------------------------------------------------------- */

/**
 * A publication state turned into a word or a tone by a ternary. The mapping
 * belongs to `adaptation.cell.tsx`; a second one is how the same draft read
 * «готово» in one row and «черновик» in the next.
 */
const STATE_VOCABULARY_PATTERN =
  /\b\w*[sS]tate\s*===\s*['"](?:published|queued)['"]\s*\?/;
const STATE_VOCABULARY_OWNER = `${COMPONENTS}/content-intelligence/pieces/adaptation.cell.tsx`;

const STATE_VOCABULARY_ALLOWED = [
  'apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx',
  'apps/frontend/src/components/launches/calendar.tsx',
];

/* -------------------------------------------------------------------------
 * 5. Overlays use the layer primitives
 * ---------------------------------------------------------------------- */

/**
 * A raised surface positioned by hand — a dropdown that is not a `Popover`.
 * Both words inside one class string, in either order.
 */
const OVERLAY_PATTERN =
  /["'`][^"'`]*\babsolute\b[^"'`]*\bbg-cf-surface-raised\b[^"'`]*["'`]|["'`][^"'`]*\bbg-cf-surface-raised\b[^"'`]*\babsolute\b[^"'`]*["'`]/;
const OVERLAY_OWNER = `${COMPONENTS}/ui/layers.tsx`;

const OVERLAY_ALLOWED = [
  'apps/frontend/src/components/brand-voice/voice-ribbon.tsx',
  'apps/frontend/src/components/content-intelligence/pieces/adaptation.cell.tsx',
  'apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx',
  'apps/frontend/src/components/launches/editorial-stage.select.tsx',
  'apps/frontend/src/components/launches/repeat.component.tsx',
  'apps/frontend/src/components/launches/tags.component.tsx',
  'apps/frontend/src/components/media/image-editor/image-editor-surface.tsx',
  'apps/frontend/src/components/new-launch/manage.modal.tsx',
  'apps/frontend/src/components/new-launch/select.current.tsx',
];

/* -------------------------------------------------------------------------
 * 7. Touch target belongs to the primitive
 * ---------------------------------------------------------------------- */

const TOUCH_TARGET_PATTERN = /\[&_button\]:min-h-\[/;

/** `[&_button]:min-h-[44px]` wrappers per file, 22.09.2026. Only decreases. */
const TOUCH_TARGET_LEDGER = {
  'apps/frontend/src/components/brand-voice/voice-analysis.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-avatar.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-avatars.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-brief.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-empty.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-learning.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-materials.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-passport.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-paths.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-proposal.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-redactions.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-ribbon.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-samples.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-scales.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-versions.screen.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-section.screen.tsx': 1,
  'apps/frontend/src/components/content-intelligence/intake/intake.screen.tsx': 1,
  'apps/frontend/src/components/content-intelligence/intake/writing-profile.card.tsx': 1,
  'apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx': 1,
  'apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx': 1,
};

/* -------------------------------------------------------------------------
 * 8. Busy buttons keep width
 * ---------------------------------------------------------------------- */

const BUSY_WORD = /(saving|busy|loading|pending|submitting|deleting|running)/i;

/**
 * `<Button>{saving ? 'Сохраняем…' : 'Сохранить'}</Button>` — the label swapped
 * for a busy word, so the button changes width under the pointer. `loading` +
 * `loadingLabel` keeps the label and its width and still tells a screen reader.
 */
const findBusyLabelOffenders = (files) => {
  const offenders = [];
  for (const { file, source } of files) {
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const visit = (node) => {
      if (
        ts.isJsxElement(node) &&
        node.openingElement.tagName.getText(ast) === 'Button'
      ) {
        for (const child of node.children) {
          if (!ts.isJsxExpression(child) || !child.expression) continue;
          let expression = child.expression;
          while (ts.isParenthesizedExpression(expression)) {
            expression = expression.expression;
          }
          if (!ts.isConditionalExpression(expression)) continue;
          let condition = expression.condition;
          while (ts.isParenthesizedExpression(condition)) {
            condition = condition.expression;
          }
          const name = ts.isIdentifier(condition)
            ? condition.text
            : ts.isPropertyAccessExpression(condition)
            ? condition.name.text
            : '';
          if (BUSY_WORD.test(name)) {
            const line =
              ast.getLineAndCharacterOfPosition(child.getStart(ast)).line + 1;
            offenders.push(`${file}:${line}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return offenders.sort();
};

const BUSY_LABEL_ALLOWED = [
  'apps/frontend/src/components/brand-voice/voice-brief.container.tsx',
  'apps/frontend/src/components/content-intelligence/content-facts.container.tsx',
  'apps/frontend/src/components/content-intelligence/content-facts.showcase.tsx',
  'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx',
  'apps/frontend/src/components/media/media.component.tsx',
];

/* ---------------------------------------------------------------------- */

const offendingFiles = (files, pattern) =>
  files.filter((file) => pattern.test(read(file)));

describe('Content Factory coherence guard (97dq.39)', () => {
  test('one disclosure: no new <details> and no direction glyph in markup or copy', () => {
    for (const shape of [
      '<details className="x">',
      "label: 'Ещё ▾'",
      '<span>▸</span>',
      '{open ? "▴" : "▾"}',
    ]) {
      expect(shape).toMatch(DISCLOSURE_PATTERN);
    }
    expect('<Disclosure summary={t.more}>').not.toMatch(DISCLOSURE_PATTERN);

    expect({
      ...listDrift(
        offendingFiles(disclosureFiles(), DISCLOSURE_PATTERN),
        DISCLOSURE_ALLOWED
      ),
      fix: 'use `Disclosure` from components/ui/disclosure; a direction is an icon, never a glyph in copy',
    }).toEqual({ added: [], stale: [], fix: expect.any(String) });
  });

  test('section labels: hand-typed `cf-label-sm uppercase` only decreases', () => {
    const files = walk(APP, isTsx).filter((file) => file !== SECTION_LABEL_OWNER);
    expect({
      ...countDrift(countPerFile(files, SECTION_LABEL_PATTERN), SECTION_LABEL_LEDGER),
      fix: 'use `SectionLabel` (components/ui/section-label) or `Panel title`; lower SECTION_LABEL_LEDGER when a file gets cleaner',
    }).toEqual({ grown: [], shrunk: [], fix: expect.any(String) });
    // The owner is the one place the class pair is the rule, not the debt.
    expect(read(SECTION_LABEL_OWNER)).toMatch(SECTION_LABEL_PATTERN);
  });

  test('copy lives in the copy file: inline locale ternaries only decrease', () => {
    const pattern = new RegExp(INLINE_COPY_PATTERN.source);
    expect("locale === 'ru' ? 'Повторить' : 'Retry'").toMatch(pattern);
    expect('resolvedLocale === "en" ? `Hint: ${x}` : x').toMatch(pattern);
    expect("locale === 'en' ? 'en' : 'ru'").not.toMatch(pattern);
    expect("locale === 'ru' ? 'ru-RU' : 'en-US'").not.toMatch(pattern);

    expect({
      ...countDrift(
        countPerFile(inlineCopyFiles(), INLINE_COPY_PATTERN),
        INLINE_COPY_LEDGER
      ),
      fix: 'add the words to the section copy file and read them by key',
    }).toEqual({ grown: [], shrunk: [], fix: expect.any(String) });
  });

  test('copy files carry no dead keys beyond the grandfathered ones', () => {
    const sources = walk(APP, isTsOrTsx).map((file) => ({
      file,
      text: read(file),
    }));
    const drift = {};
    for (const file of COPY_FILES) {
      const dead = deadKeysOf(file, sources);
      const allowed = DEAD_KEYS_ALLOWED[file] ?? [];
      const { added, stale } = listDrift(dead, allowed);
      if (added.length || stale.length) drift[file] = { added, stale };
    }
    expect({
      drift,
      fix: 'read the key where the words are shown, or delete it; a key that is used again or deleted leaves DEAD_KEYS_ALLOWED',
    }).toEqual({ drift: {}, fix: expect.any(String) });
  });

  test('one state vocabulary: publication state → word only in adaptation.cell', () => {
    const pattern = new RegExp(STATE_VOCABULARY_PATTERN.source);
    expect("state === 'published' ? 'опубликовано' : x").toMatch(pattern);
    expect("row.state === 'queued' ? 'info' : 'neutral'").toMatch(pattern);
    expect("state === 'published' && show").not.toMatch(pattern);

    const files = walk(APP, isTsOrTsx).filter(
      (file) => file !== STATE_VOCABULARY_OWNER
    );
    expect({
      ...listDrift(
        offendingFiles(files, STATE_VOCABULARY_PATTERN),
        STATE_VOCABULARY_ALLOWED
      ),
      fix: 'take the word and tone from the adaptation.cell helpers',
    }).toEqual({ added: [], stale: [], fix: expect.any(String) });
  });

  test('overlays: no hand-positioned raised surface outside ui/layers', () => {
    const pattern = new RegExp(OVERLAY_PATTERN.source);
    expect('className="absolute top-full z-10 bg-cf-surface-raised"').toMatch(pattern);
    expect("'bg-cf-surface-raised shadow-menu absolute'").toMatch(pattern);
    expect('className="relative bg-cf-surface-raised"').not.toMatch(pattern);

    const files = walk(APP, isTsx).filter((file) => file !== OVERLAY_OWNER);
    expect({
      ...listDrift(offendingFiles(files, OVERLAY_PATTERN), OVERLAY_ALLOWED),
      fix: 'render the surface through `Popover` from components/ui/layers',
    }).toEqual({ added: [], stale: [], fix: expect.any(String) });
  });

  test('touch target: `[&_button]:min-h-[…]` wrappers only decrease', () => {
    expect({
      ...countDrift(
        countPerFile(walk(APP, isTsx), TOUCH_TARGET_PATTERN),
        TOUCH_TARGET_LEDGER
      ),
      fix: 'the 44px touch target belongs to the shared control, not to a wrapper at the call site',
    }).toEqual({ grown: [], shrunk: [], fix: expect.any(String) });
  });

  test('the post editor toolbar speaks the reader’s language (audit B1)', () => {
    // «Bold Text», «Underline», «Title», «Bullets» were English literals in
    // the markup of a Russian screen. The words now come from composeCopy.
    for (const file of [
      'bold.text.tsx',
      'u.text.tsx',
      'heading.component.tsx',
      'bullets.component.tsx',
    ]) {
      const source = read(`${COMPONENTS}/new-launch/${file}`);
      expect({ file, literal: /data-tooltip-content="/.test(source) }).toEqual({
        file,
        literal: false,
      });
      expect(source).toMatch(/data-tooltip-content=\{copy\.toolbar\w+\}/);
    }
    expect(read(`${COMPONENTS}/new-launch/manage.modal.tsx`)).not.toMatch(
      /<div>Settings<\/div>/
    );
  });

  test('busy buttons keep width: no busy-word ternary as a Button label', () => {
    const fixture = [
      "import { Button } from '@contentfactory/react/form/button';",
      '<Button onClick={save}>{saving ? t.saving : t.save}</Button>',
      '<Button onClick={go}>{(busy) ? a : b}</Button>',
      '<Button>{state.loading ? a : b}</Button>',
      '<Button loading={saving} loadingLabel={t.saving}>{t.save}</Button>',
      '<Button>{open ? t.hide : t.show}</Button>',
      '<span>{saving ? a : b}</span>',
    ].join('\n');
    expect(
      findBusyLabelOffenders([{ file: 'fixture.tsx', source: fixture }])
    ).toEqual(['fixture.tsx:2', 'fixture.tsx:3', 'fixture.tsx:4']);

    const offending = [
      ...new Set(
        findBusyLabelOffenders(
          walk(APP, isTsx).map((file) => ({ file, source: read(file) }))
        ).map((entry) => entry.slice(0, entry.lastIndexOf(':')))
      ),
    ].sort();
    expect({
      ...listDrift(offending, BUSY_LABEL_ALLOWED),
      fix: 'keep the label and pass `loading` + `loadingLabel` to Button',
    }).toEqual({ added: [], stale: [], fix: expect.any(String) });
  });
});
