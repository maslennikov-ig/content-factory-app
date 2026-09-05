const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

/**
 * Style guard for the desert-lab design system.
 *
 * This draws a line rather than demanding the inherited debt be paid off in one
 * go. Each rule carries the exact list of files that already break it; a file
 * outside that list is a new violation and fails the build.
 *
 * The ledger is checked in both directions. A file that stops violating must be
 * removed from its list, or the allowance quietly outlives the problem and the
 * next author inherits permission nobody granted.
 *
 * `tests/foundation.test.cjs` keeps the older, sharper check — white text on a
 * background the bridge resolves to light — because that one is a contrast bug
 * rather than a style debt, and it has no allowance at all.
 */

const SCAN_ROOTS = ['apps/frontend/src'];

const scan = (pattern, roots = SCAN_ROOTS) => {
  let output;
  try {
    output = execFileSync(
      'grep',
      ['-rlE', pattern, ...roots, '--include=*.tsx', '--include=*.jsx'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    );
  } catch (error) {
    // grep exits 1 when it matches nothing. That is the state this guard is
    // working towards, so it must read as an empty result rather than blow up
    // the moment someone finishes paying a rule's debt off.
    if (error.status === 1) return [];
    throw error;
  }
  return output.trim().split('\n').filter(Boolean).sort();
};

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx|jsx)$/.test(entry.name) ? [entryPath] : [];
  });

const SHARED_CONTROL_NAMES = new Set([
  'Button',
  'Input',
  'Select',
  'Textarea',
  'RadioOption',
  'Tab',
  'MenuOption',
  'MenuButton',
]);

const SHARED_CONTROL_HEIGHT_CLASS =
  /(?:^|[\s"'`])(?:[\w-]+:)*!?(?:min-|max-)?(?:h-|size-)|\[(?:height|min-height|max-height|block-size|min-block-size|max-block-size):/;
const SHARED_CONTROL_HEIGHT_STYLE =
  /\b(?:height|minHeight|maxHeight|blockSize|minBlockSize|maxBlockSize)\s*:/;

const findSharedControlHeightOffenders = (files) => {
  const offenders = [];

  for (const { file, source } of files) {
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    const imported = new Set();
    const bindings = new Map();

    ast.forEachChild((node) => {
      if (
        ts.isImportDeclaration(node) &&
        (String(node.moduleSpecifier.text).startsWith('@contentfactory/react/') ||
          String(node.moduleSpecifier.text).startsWith('.'))
      ) {
        const namedBindings = node.importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          namedBindings.elements.forEach((entry) => {
            const exported = entry.propertyName?.text ?? entry.name.text;
            if (SHARED_CONTROL_NAMES.has(exported)) {
              imported.add(entry.name.text);
            }
          });
        }
      }

      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((declaration) => {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            ts.isStringLiteral(declaration.initializer)
          ) {
            bindings.set(declaration.name.text, declaration.initializer.text);
          }
        });
      }
    });

    const visit = (node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        imported.has(node.tagName.getText(ast))
      ) {
        const classAttribute = node.attributes.properties.find(
          (property) =>
            ts.isJsxAttribute(property) && property.name.text === 'className'
        );
        const rawClassName = classAttribute?.initializer?.getText(ast) ?? '';
        const identifier = /^\{([A-Za-z_$][\w$]*)\}$/.exec(rawClassName)?.[1];
        const className = identifier
          ? bindings.get(identifier) ?? rawClassName
          : rawClassName;
        const style =
          node.attributes.properties
            .find(
              (property) =>
                ts.isJsxAttribute(property) && property.name.text === 'style'
            )
            ?.initializer?.getText(ast) ?? '';

        if (
          SHARED_CONTROL_HEIGHT_CLASS.test(className) ||
          SHARED_CONTROL_HEIGHT_STYLE.test(style)
        ) {
          const line =
            ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
          offenders.push(`${file}:${line}`);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(ast);
  }

  return offenders.sort();
};

/**
 * The third button.
 *
 * `border border-cf-accent bg-cf-accent-soft text-cf-accent hover:bg-cf-accent`
 * is not a variant of anything: the action scale in
 * `libraries/react-shared-libraries/src/form/button.tsx` has five, and this is a
 * sixth that nobody designed, retyped by hand onto anchors and divs until it
 * read as a house style. `DESIGN.md` gives accent to the current selection and
 * to the main action, and both of those already have a primitive — `Button`,
 * `ButtonLink`, and the choice family, which is why a component that owns the
 * role (`MenuOption`, `ControlButton`, `RadioOption`) is not scanned here: the
 * choice primitives take their paint from the call site on purpose.
 *
 * What is scanned is the element that carries the interaction itself and paints
 * it by hand: an intrinsic tag or a `Link` that is clickable — `href`,
 * `onClick`, or being an `a`/`button` — and wears the accent fill or the accent
 * border. Panels and badges with the same fill are not touched; they do not
 * claim to be pressable, and a status chip is not a button.
 */
const HAND_ROLLED_ACCENT_CLASS =
  /(?:^|[\s"'`{])(?:[\w-]+:)*!?(?:bg-cf-accent-soft|border-cf-accent)(?![\w-])/;

const INTERACTIVE_INTRINSIC_TAGS = new Set(['a', 'button']);

/**
 * Files that already paint an interactive element by hand. Every one of them is
 * a selection chip or a filter row written before the choice family existed;
 * they are debt to migrate, not permission to add a nineteenth. The list is
 * checked in both directions, so a file that stops offending has to leave it.
 */
const HAND_ROLLED_ACCENT_ALLOWED = [
  'apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx',
  'apps/frontend/src/components/launches/ai.image.tsx',
  'apps/frontend/src/components/launches/filters.tsx',
  'apps/frontend/src/components/launches/helpers/pick.platform.component.tsx',
  'apps/frontend/src/components/launches/import-debug-post.modal.tsx',
  'apps/frontend/src/components/launches/missing-release.modal.tsx',
  'apps/frontend/src/components/launches/select.customer.tsx',
  'apps/frontend/src/components/media/media.component.tsx',
];

const findHandRolledAccentOffenders = (files) => {
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
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        // A capitalised tag other than `Link` is a component, and a component
        // is where the paint is supposed to live.
        const handRolled = /^[a-z]/.test(tag) || tag === 'Link';
        const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
        const names = new Set(
          attributes.map((attribute) => attribute.name.getText(ast))
        );
        const interactive =
          INTERACTIVE_INTRINSIC_TAGS.has(tag) ||
          tag === 'Link' ||
          names.has('href') ||
          names.has('onClick');

        if (handRolled && interactive) {
          const className =
            attributes
              .find((attribute) => attribute.name.getText(ast) === 'className')
              ?.initializer?.getText(ast) ?? '';
          if (HAND_ROLLED_ACCENT_CLASS.test(className)) {
            const line =
              ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
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

/**
 * Colour literals in JSX.
 *
 * Two groups here are not going away and are not meant to: the vendored icon
 * sets (`ui/icons`, `ui/check.icon.component.tsx`) and the platform preview
 * components, where a LinkedIn or TikTok preview has to keep looking like the
 * external platform rather than like Content Factory. The rest is inherited
 * Postiz markup awaiting migration onto the `cf-*` layer.
 */
const HEX_ALLOWED = [
  'apps/frontend/src/app/(app)/auth/login-required/page.tsx',
  'apps/frontend/src/app/(app)/integrations/social/layout.tsx',
  'apps/frontend/src/components/analytics/chart-social.tsx',
  'apps/frontend/src/components/analytics/chart.tsx',
  'apps/frontend/src/components/analytics/stars.table.component.tsx',
  'apps/frontend/src/components/auth/providers/farcaster.provider.tsx',
  'apps/frontend/src/components/auth/providers/google.provider.tsx',
  'apps/frontend/src/components/billing/embedded.billing.tsx',
  'apps/frontend/src/components/billing/lifetime.deal.tsx',
  'apps/frontend/src/components/billing/main.billing.component.tsx',
  'apps/frontend/src/components/launches/ai.image.tsx',
  'apps/frontend/src/components/launches/ai.video.tsx',
  'apps/frontend/src/components/launches/comments/comment.component.tsx',
  'apps/frontend/src/components/launches/creation.method.badge.tsx',
  'apps/frontend/src/components/launches/helpers/media.settings.component.tsx',
  'apps/frontend/src/components/launches/information.component.tsx',
  'apps/frontend/src/components/launches/layout.standalone.tsx',
  'apps/frontend/src/components/launches/menu/menu.tsx',
  'apps/frontend/src/components/launches/tags.component.tsx',
  'apps/frontend/src/components/launches/web3/providers/telegram.provider.tsx',
  'apps/frontend/src/components/layout/click.outside.tsx',
  'apps/frontend/src/components/media/media.component.tsx',
  'apps/frontend/src/components/new-launch/editor.tsx',
  'apps/frontend/src/components/new-launch/manage.modal.tsx',
  // Platform previews below: external platform colours are the point.
  'apps/frontend/src/components/new-launch/providers/facebook/facebook.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/facebook/facebook.provider.tsx',
  'apps/frontend/src/components/new-launch/providers/linkedin/linkedin.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/pinterest/pinterest.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx',
  'apps/frontend/src/components/new-launch/providers/youtube/youtube.preview.tsx',
  'apps/frontend/src/components/new-launch/select.current.tsx',
  'apps/frontend/src/components/new-layout/billing.after.tsx',
  'apps/frontend/src/components/notifications/notification.component.tsx',
  'apps/frontend/src/components/platform-analytics/render.analytics.tsx',
  'apps/frontend/src/components/third-parties/third-party.component.tsx',
  // Vendored icon sets, shipped with their own fixed colours.
  'apps/frontend/src/components/ui/check.icon.component.tsx',
  'apps/frontend/src/components/ui/icons/index.tsx',
];

/**
 * `text-white`.
 *
 * `accent-ink` is dark in the dark theme, so a hardcoded white label on a
 * themed fill loses its contrast there. Everything listed is inherited markup;
 * new components take their text colour from a token.
 */
const WHITE_ALLOWED = [
  'apps/frontend/src/components/launches/calendar.tsx',
  'apps/frontend/src/components/launches/creation.method.badge.tsx',
  'apps/frontend/src/components/launches/customer.modal.tsx',
  'apps/frontend/src/components/launches/helpers/top.title.component.tsx',
  'apps/frontend/src/components/launches/information.component.tsx',
  'apps/frontend/src/components/launches/tags.component.tsx',
  'apps/frontend/src/components/launches/web3/providers/telegram.provider.tsx',
  'apps/frontend/src/components/layout/announcement.banner.tsx',
  'apps/frontend/src/components/new-launch/editor.tsx',
  'apps/frontend/src/components/new-launch/providers/pinterest/pinterest.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.preview.tsx',
  'apps/frontend/src/components/third-parties/slider.component.tsx',
  'apps/frontend/src/components/third-parties/third-party.media-library.tsx',
];

/**
 * `customColor1…55`.
 *
 * These are inherited aliases bridged onto the semantic layer in `colors.scss`.
 * They still render correctly, but they carry no meaning — `customColor23` does
 * not say whether it is a surface or a border — so new components use `cf-*`.
 */
const CUSTOM_ALLOWED = [
  'apps/frontend/src/components/analytics/analytics.component.tsx',
  'apps/frontend/src/components/analytics/stars.and.forks.tsx',
  'apps/frontend/src/components/approved-apps/approved-apps.component.tsx',
  'apps/frontend/src/components/autopost/autopost.tsx',
  'apps/frontend/src/components/billing/lifetime.deal.tsx',
  'apps/frontend/src/components/billing/main.billing.component.tsx',
  'apps/frontend/src/components/developer/developer.component.tsx',
  'apps/frontend/src/components/launches/add.provider.component.tsx',
  'apps/frontend/src/components/launches/bot.picture.tsx',
  'apps/frontend/src/components/launches/comments/comment.component.tsx',
  'apps/frontend/src/components/launches/general.preview.component.tsx',
  'apps/frontend/src/components/launches/helpers/date.picker.tsx',
  'apps/frontend/src/components/layout/support.tsx',
  'apps/frontend/src/components/new-launch/dummy.code.component.tsx',
  'apps/frontend/src/components/new-launch/providers/reddit/reddit.provider.tsx',
  'apps/frontend/src/components/onboarding/onboarding.modal.tsx',
  'apps/frontend/src/components/plugs/plug.tsx',
  'apps/frontend/src/components/public-api/public.component.tsx',
  'apps/frontend/src/components/sets/sets.tsx',
  'apps/frontend/src/components/webhooks/webhooks.tsx',
];

// The named Postiz aliases are the older sibling of customColorN: unlike a
// role, `fifth` tells a reader nothing about the surface it paints. Keep the
// inherited files visible while migrations remove them; new use is forbidden.
const LEGACY_WORD_ALIAS_PATTERN =
  '(bg|text|border|ring|fill|stroke)-(third|forth|fifth|sixth|seventh)';
const LEGACY_WORD_ALIAS_ALLOWED = [
  'apps/frontend/src/components/admin/admin-errors.component.tsx',
  'apps/frontend/src/components/analytics/analytics.component.tsx',
  'apps/frontend/src/components/analytics/stars.and.forks.tsx',
  'apps/frontend/src/components/approved-apps/approved-apps.component.tsx',
  'apps/frontend/src/components/auth/activate.tsx',
  'apps/frontend/src/components/auth/login.with.oidc.tsx',
  'apps/frontend/src/components/autopost/autopost.tsx',
  'apps/frontend/src/components/billing/finish.trial.tsx',
  'apps/frontend/src/components/billing/lifetime.deal.tsx',
  'apps/frontend/src/components/launches/add.provider.component.tsx',
  'apps/frontend/src/components/launches/ai.image.tsx',
  'apps/frontend/src/components/launches/bot.picture.tsx',
  'apps/frontend/src/components/launches/calendar.tsx',
  'apps/frontend/src/components/launches/comments/comment.component.tsx',
  'apps/frontend/src/components/launches/helpers/date.picker.tsx',
  'apps/frontend/src/components/launches/helpers/linkedin.component.tsx',
  'apps/frontend/src/components/launches/helpers/media.settings.component.tsx',
  'apps/frontend/src/components/media/media.component.tsx',
  'apps/frontend/src/components/new-launch/dummy.code.component.tsx',
  'apps/frontend/src/components/new-launch/providers/continue-provider/with-continue-provider.tsx',
  'apps/frontend/src/components/new-launch/providers/lemmy/subreddit.tsx',
  'apps/frontend/src/components/new-launch/providers/reddit/subreddit.tsx',
  'apps/frontend/src/components/new-launch/providers/warpcast/subreddit.tsx',
  'apps/frontend/src/components/notifications/notification.component.tsx',
  'apps/frontend/src/components/plugs/plug.tsx',
  'apps/frontend/src/components/sets/sets.tsx',
  'apps/frontend/src/components/third-parties/providers/heygen.provider.tsx',
  'apps/frontend/src/components/third-parties/third-party.component.tsx',
  'apps/frontend/src/components/videos/providers/image-text-slides.provider.tsx',
  'apps/frontend/src/components/webhooks/webhooks.tsx',
];

/**
 * Tailwind's own palette, used directly.
 *
 * These are the colours that do not follow the theme. `bg-red-500` is the same
 * red on sand as it is on the dark canvas, and `bg-white` stopped being the
 * light theme's `surface` the day that surface became `#FBF8F0`. Every one of
 * them is a light-theme defect waiting for someone to open the day theme, which
 * is exactly what ADR-0008 says must not happen.
 *
 */
const RAW_PALETTE_PREFIXES =
  'bg|text|border|ring|ring-offset|fill|stroke|from|to|via|divide' +
  '|placeholder|outline|decoration|caret|accent|shadow';

// `text-white` keeps its own older rule and its own list, so it is left out of
// the plain white/black branch here rather than being reported twice for the
// same line. `text-black` has no such rule and is named separately.
const RAW_PALETTE_PREFIXES_NO_TEXT =
  'bg|border|ring|ring-offset|fill|stroke|from|to|via|divide' +
  '|placeholder|outline|decoration|caret|accent|shadow';

const RAW_PALETTE_PATTERN =
  `(^|[^a-zA-Z0-9-])(${RAW_PALETTE_PREFIXES})-(slate|gray|zinc` +
  '|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky' +
  '|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}([^a-zA-Z0-9-]|$)' +
  `|(^|[^a-zA-Z0-9-])(${RAW_PALETTE_PREFIXES_NO_TEXT})-(white|black)` +
  '([^a-zA-Z0-9-]|$)' +
  '|(^|[^a-zA-Z0-9-])text-black([^a-zA-Z0-9-]|$)';

const RAW_PALETTE_ALLOWED = [
  'apps/frontend/src/app/(extension)/modal/[style]/[platform]/page.tsx',
  'apps/frontend/src/components/admin/admin-errors.component.tsx',
  'apps/frontend/src/components/agents/agent.tsx',
  'apps/frontend/src/components/analytics/analytics.component.tsx',
  'apps/frontend/src/components/auth/activate.tsx',
  'apps/frontend/src/components/billing/finish.trial.tsx',
  'apps/frontend/src/components/billing/main.billing.component.tsx',
  'apps/frontend/src/components/launches/add.provider.component.tsx',
  'apps/frontend/src/components/launches/calendar.tsx',
  'apps/frontend/src/components/launches/comments/comment.component.tsx',
  'apps/frontend/src/components/launches/customer.modal.tsx',
  'apps/frontend/src/components/launches/general.preview.component.tsx',
  'apps/frontend/src/components/launches/helpers/media.settings.component.tsx',
  'apps/frontend/src/components/launches/import-debug-post.modal.tsx',
  'apps/frontend/src/components/launches/launches.component.tsx',
  'apps/frontend/src/components/launches/merge.post.tsx',
  'apps/frontend/src/components/launches/separate.post.tsx',
  'apps/frontend/src/components/launches/tags.component.tsx',
  'apps/frontend/src/components/launches/web3/providers/moltbook.provider.tsx',
  'apps/frontend/src/components/layout/announcement.banner.tsx',
  'apps/frontend/src/components/layout/check.payment.tsx',
  'apps/frontend/src/components/layout/drop.files.tsx',
  'apps/frontend/src/components/layout/streak.component.tsx',
  'apps/frontend/src/components/media/media.component.tsx',
  'apps/frontend/src/components/new-launch/editor.tsx',
  'apps/frontend/src/components/new-launch/manage.modal.tsx',
  'apps/frontend/src/components/new-launch/mention.component.tsx',
  'apps/frontend/src/components/new-launch/providers/continue-provider/tumblr/tumblr.continue.tsx',
  'apps/frontend/src/components/new-launch/providers/continue-provider/youtube/youtube.continue.tsx',
  'apps/frontend/src/components/new-launch/providers/facebook/facebook.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/hashnode/hashnode.tags.tsx',
  'apps/frontend/src/components/new-launch/providers/instagram/instagram.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/lemmy/lemmy.provider.tsx',
  'apps/frontend/src/components/new-launch/providers/linkedin/linkedin.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/pinterest/pinterest.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/reddit/reddit.provider.tsx',
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.preview.tsx',
  'apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx',
  'apps/frontend/src/components/new-launch/providers/warpcast/warpcast.provider.tsx',
  'apps/frontend/src/components/new-launch/providers/youtube/youtube.preview.tsx',
  'apps/frontend/src/components/plugs/plug.tsx',
  'apps/frontend/src/components/plugs/plugs.tsx',
  'apps/frontend/src/components/provider-preview/preview.provider.component.tsx',
  'apps/frontend/src/components/third-parties/providers/heygen.provider.tsx',
  'apps/frontend/src/components/third-parties/slider.component.tsx',
  'apps/frontend/src/components/third-parties/third-party.media-library.tsx',
  'apps/frontend/src/components/videos/providers/image-text-slides.provider.tsx',
  'libraries/react-shared-libraries/src/form/canonical.tsx',
  'libraries/react-shared-libraries/src/form/custom.select.tsx',
  'libraries/react-shared-libraries/src/form/multi.select.tsx',
];

const RULES = [
  {
    name: 'colour hex literal in JSX',
    pattern: '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\\b',
    allowed: HEX_ALLOWED,
    fix: 'use a `cf-*` token instead of a literal colour',
  },
  {
    name: 'text-white',
    pattern: 'text-white',
    allowed: WHITE_ALLOWED,
    fix: 'use `text-cf-accent-ink`, `text-cf-ink-inverse` or another token',
  },
  {
    name: 'customColor alias',
    pattern: 'customColor[0-9]',
    allowed: CUSTOM_ALLOWED,
    fix: 'use the `cf-*` semantic colour it is bridged to',
  },
  {
    name: 'named legacy colour alias',
    pattern: LEGACY_WORD_ALIAS_PATTERN,
    allowed: LEGACY_WORD_ALIAS_ALLOWED,
    fix: 'use the cf semantic colour for the surface or state',
  },
  {
    name: 'raw Tailwind palette colour',
    pattern: RAW_PALETTE_PATTERN,
    allowed: RAW_PALETTE_ALLOWED,
    // The shared library is scanned here even though the older rules predate
    // it: a primitive that hardcodes a palette colour breaks the theme for
    // every screen that renders it at once.
    roots: ['apps/frontend/src', 'libraries'],
    fix: 'use the `cf-*` token for the role, so the colour follows the theme',
  },
  /**
   * The control height, retyped.
   *
   * `min-h-[44px] md:min-h-[40px]` is one decision — touch target below the
   * breakpoint, pointer density above it — and it was standing in ten places
   * across five files. Nothing in the guard caught it: both numbers are on the
   * four-pixel rhythm, so the geometry ledger reads them as well-behaved. A
   * repeated geometry is a token; `cf-control-h` in `tailwind.config.cjs` is
   * that token, and the allowance below is empty because the pair now lives
   * nowhere else.
   */
  {
    name: 'hand-typed control height',
    pattern: 'min-h-\\[44px\\][^"\'`]*md:min-h-\\[40px\\]',
    allowed: [],
    fix: 'use the `cf-control-h` token',
  },
];

const GEOMETRY_ALLOWLIST_PATH = path.join(
  repositoryRoot,
  'tests/design-geometry-allowlist.json'
);

/**
 * Every directory that ships product JSX.
 *
 * One root is not enough. The geometry the guard measures moves between the app
 * and the shared library as components are extracted, and while only
 * `apps/frontend/src` was scanned a relocation read as a reduction: `OpeningBand`
 * took `h-[64px] mb-[15px]` out of the app, the ledger shrank by two, and the
 * pixels were still on the screen. Scanning every root that can hold JSX means a
 * move shows up as a `stale` line in one section and an `added` line in the
 * other, and the combined total does not budge.
 *
 * `tests/design-geometry-allowlist.json` keeps one section per root so each is
 * still countable on its own. `libraries/helpers/src` holds three JSX files with
 * no geometry at all; it is declared so the root is closed rather than merely
 * empty today.
 */
const GEOMETRY_ROOTS = [
  'apps/frontend/src',
  'libraries/react-shared-libraries/src',
  'libraries/helpers/src',
];

const readGeometryAllowlist = () => {
  try {
    return JSON.parse(fs.readFileSync(GEOMETRY_ALLOWLIST_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 3, total: 0, sections: {} };
    }
    throw error;
  }
};

const geometryRootOf = (file) =>
  GEOMETRY_ROOTS.find((root) => file === root || file.startsWith(`${root}/`)) ??
  null;

const geometrySourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return geometrySourceFiles(entryPath);
    return /\.(tsx|jsx)$/.test(entry.name) ? [entryPath] : [];
  });

const literalFragments = (file, source) => {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.ES2022,
    true,
    file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX
  );
  const fragments = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      fragments.push(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      fragments.push(node.head.text);
      for (const span of node.templateSpans) {
        visit(span.expression);
        fragments.push(span.literal.text);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return fragments;
};

const canonicalPixelValue = (raw) => {
  const pixels = Number(raw);
  if (!Number.isFinite(pixels)) return null;
  const canonical = Object.is(pixels, -0) ? 0 : pixels;
  return { pixels: canonical, value: `${canonical}px` };
};

const isOffRhythm = (pixels) => {
  const remainder = Math.abs(pixels % 4);
  return remainder > 1e-9 && Math.abs(remainder - 4) > 1e-9;
};

const pixelLengthsInArbitraryPayloads = (fragment) => {
  const lengths = [];
  for (const arbitrary of fragment.matchAll(/\[([^\]\r\n]+)\]/g)) {
    for (const match of arbitrary[1].matchAll(
      /(?<![A-Za-z0-9.])[+-]?(?:\d+(?:\.\d+)?|\.\d+)px(?![A-Za-z0-9])/g
    )) {
      const normalized = canonicalPixelValue(match[0].slice(0, -2));
      if (normalized) lengths.push(normalized);
    }
  }
  return lengths;
};

const collectOffRhythmGeometry = (
  sources = Object.fromEntries(
    GEOMETRY_ROOTS.flatMap((root) =>
      geometrySourceFiles(path.join(repositoryRoot, root)).map((filePath) => [
        path.relative(repositoryRoot, filePath),
        fs.readFileSync(filePath, 'utf8'),
      ])
    )
  )
) => {
  const occurrences = new Map();

  for (const [file, source] of Object.entries(sources)) {
    for (const fragment of literalFragments(file, source)) {
      for (const { pixels, value } of pixelLengthsInArbitraryPayloads(fragment)) {
        if (!isOffRhythm(pixels)) continue;
        const key = `${file}\0${value}`;
        occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
      }
    }
  }

  return occurrences;
};

const sharedLibrarySources = () =>
  Object.fromEntries(
    sourceFiles(
      path.join(repositoryRoot, 'libraries/react-shared-libraries/src')
    ).map((filePath) => [
      path.relative(repositoryRoot, filePath),
      fs.readFileSync(filePath, 'utf8'),
    ])
  );

const countMatches = (sources, pattern) =>
  Object.values(sources).reduce(
    (total, source) => total + (source.match(pattern) ?? []).length,
    0
  );

const inheritedColorKeys = Object.keys(
  require('../apps/frontend/tailwind.config.cjs').theme.extend.colors
)
  .filter((key) => key !== 'cf')
  .sort((left, right) => right.length - left.length);
const inheritedColorAlternation = inheritedColorKeys
  .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const BROAD_LEGACY_ALIAS_PATTERN = new RegExp(
  `(?:bg|text|border|ring|fill|stroke)-(?:${inheritedColorAlternation})(?![A-Za-z0-9-])`,
  'g'
);

const countGuardDebt = (sources = sharedLibrarySources()) => ({
  hex: countMatches(sources, /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g),
  white: countMatches(sources, /text-white/g),
  custom: countMatches(sources, /customColor[0-9]+/g),
  legacy: countMatches(sources, BROAD_LEGACY_ALIAS_PATTERN),
});

const countNamedOversizedRadii = (
  sources = Object.fromEntries(
    ['apps/frontend/src', 'libraries/react-shared-libraries/src'].flatMap(
      (root) =>
        sourceFiles(path.join(repositoryRoot, root)).map((filePath) => [
          path.relative(repositoryRoot, filePath),
          fs.readFileSync(filePath, 'utf8'),
        ])
    )
  )
) => countMatches(sources, /rounded-(?:2xl|3xl)\b/g);

describe('Content Factory style guard', () => {
  test('keeps shared-library colour and legacy-alias debt shrink-only', () => {
    const fixture = {
      'new.tsx': [
        '<div className="bg-primary text-inputText border-tableBorder" />',
        '<div className="bg-customColor12 text-white" />',
        '<div className="bg-newBgColorInner border-newTableBorder text-btnPrimary" />',
        '<div style={{ color: "#fff" }} />',
      ].join('\n'),
    };

    // Exact against the fixture: that half proves the counter counts.
    expect(countGuardDebt(fixture)).toEqual({
      hex: 1,
      white: 1,
      custom: 1,
      legacy: 7,
    });

    // A ceiling against the real sources, not a snapshot of them. Equality here
    // would go red the moment anyone paid the debt down — which is the whole
    // point of `content-factory-next-mzh` and `content-factory-next-qn4` — and
    // the reflex to a red suite is to edit the number, not to keep the win.
    // Set to what is actually there today, so adding one still fails.
    const ceilings = { hex: 9, white: 3, custom: 4, legacy: 20 };
    const debt = countGuardDebt();
    for (const [kind, ceiling] of Object.entries(ceilings)) {
      // The kinds are named in the ceiling, so a failing number identifies
      // itself: 9 is hex, 3 is white, 4 is custom, 20 is the legacy aliases.
      expect(debt[kind]).toBeLessThanOrEqual(ceiling);
    }
  });

  test('counts named oversized radii so rounded-3xl cannot bypass the guard', () => {
    expect(
      countNamedOversizedRadii({
        'fixture.tsx':
          '<div className="rounded-xl rounded-2xl rounded-3xl rounded-full" />',
      })
    ).toBe(2);
    // Ceiling, for the same reason: the last one is debt to remove, not a
    // quota to keep filled.
    expect(countNamedOversizedRadii()).toBeLessThanOrEqual(1);
  });

  test.each(RULES)('adds no new $name', ({ pattern, allowed, fix, roots }) => {
    const offenders = scan(pattern, roots);
    const added = offenders.filter((file) => !allowed.includes(file));

    expect({ added, fix }).toEqual({ added: [], fix });
  });

  test.each(RULES)('keeps the $name allowance honest', ({ pattern, allowed, roots }) => {
    const offenders = new Set(scan(pattern, roots));
    // A file that no longer violates must lose its line, or the list rots into
    // a permission slip nobody reviewed.
    const stale = allowed.filter((file) => !offenders.has(file));

    expect(stale).toEqual([]);
  });

  test('never sets the monospaced typography tokens in a sans face', () => {
    // `label-sm`, `caption` and `display-num` are the three monospaced tokens.
    // Overriding their family turns a stamped marking back into a caption, or
    // a measurement back into a heading, and quietly undoes the reason the
    // second typeface was vendored at all.
    const files = scan('cf-label-sm|cf-caption|cf-display-num');
    const failures = [];

    for (const file of files) {
      const lines = fs
        .readFileSync(path.join(repositoryRoot, file), 'utf8')
        .split('\n');
      lines.forEach((line, index) => {
        if (!/cf-label-sm|cf-caption|cf-display-num/.test(line)) return;
        if (/font-sans|--font-cf-sans|font-\[Geologica/.test(line)) {
          failures.push(`${file}:${index + 1}`);
        }
      });
    }

    expect(failures).toEqual([]);
  });

  test('does not use a product radius larger than the documented 12px scale', () => {
    const offenders = scan('rounded-\\[(2[4-9]|[3-9][0-9]|[0-9]{3,})px\\]', [
      'apps/frontend/src',
      'libraries/react-shared-libraries/src',
    ]);

    expect({
      offenders,
      fix: 'use rounded-[4px], rounded-[8px], rounded-[12px], or rounded-full for a pill',
    }).toEqual({ offenders: [], fix: expect.any(String) });
  });

  test('keeps shared control visual height primitive-owned', () => {
    const files = ['apps/frontend/src', 'libraries/react-shared-libraries/src']
      .flatMap((root) => sourceFiles(path.join(repositoryRoot, root)))
      .map((absolute) => ({
        file: path.relative(repositoryRoot, absolute),
        source: fs.readFileSync(absolute, 'utf8'),
      }));
    const offenders = findSharedControlHeightOffenders(files);

    expect({
      offenders: offenders.sort(),
      fix: 'let the shared Button own its 40px visual height; use the mobile hit-area wrapper for 44px touch',
    }).toEqual({ offenders: [], fix: expect.any(String) });
  });

  test('refuses a new hand-painted accent button and keeps its ledger honest', () => {
    // First that the detector reads interaction rather than colour: the anchor,
    // the clickable div and the Link are offences; the status panel, the badge
    // and the choice primitive taking its paint from the call site are not.
    const fixture = [
      '<a href="/content" className="border border-cf-accent bg-cf-accent-soft text-cf-accent">Open</a>',
      '<div onClick={pick} className="bg-cf-accent-soft" />',
      '<Link href="/x" className="border-cf-accent" />',
      '<p role="status" className="border border-cf-accent bg-cf-accent-soft" />',
      '<span className="bg-cf-accent-soft" />',
      '<MenuOption onClick={pick} className="bg-cf-accent-soft" />',
      '<a href="/y" className="bg-cf-accent-ink border-cf-accent-hover" />',
    ].join('\n');
    expect(
      findHandRolledAccentOffenders([{ file: 'fixture.tsx', source: fixture }])
    ).toEqual(['fixture.tsx:1', 'fixture.tsx:2', 'fixture.tsx:3']);

    const files = sourceFiles(
      path.join(repositoryRoot, 'apps/frontend/src')
    ).map((absolute) => ({
      file: path.relative(repositoryRoot, absolute),
      source: fs.readFileSync(absolute, 'utf8'),
    }));
    const offending = new Set(
      findHandRolledAccentOffenders(files).map((entry) =>
        entry.slice(0, entry.lastIndexOf(':'))
      )
    );

    expect({
      added: [...offending]
        .filter((file) => !HAND_ROLLED_ACCENT_ALLOWED.includes(file))
        .sort(),
      stale: HAND_ROLLED_ACCENT_ALLOWED.filter((file) => !offending.has(file)),
      fix: 'use Button, ButtonLink or the choice family; accent is the primitive’s to paint',
    }).toEqual({ added: [], stale: [], fix: expect.any(String) });
  });

  test('catches alias, const, relative-import and inline-style height bypass fixtures', () => {
    const fixture = [
      "import { Button as SharedButton } from '@contentfactory/react/form/button';",
      "import { Input } from './form/input';",
      "const sizeClass = 'size-[52px]';",
      "const arbitraryClass = '[min-height:52px]';",
      '<SharedButton className={sizeClass} />',
      '<Input className={arbitraryClass} />',
      '<SharedButton style={{ height: 52 }} />',
      '<Input style={{ minHeight: 52 }} />',
      '<Input style={{ maxHeight: 52 }} />',
      '<Input style={{ blockSize: 52 }} />',
      '<Input style={{ minBlockSize: 52 }} />',
      '<Input style={{ maxBlockSize: 52 }} />',
    ].join('\n');
    expect(
      findSharedControlHeightOffenders([
        { file: 'fixture.tsx', source: fixture },
      ])
    ).toEqual([
      'fixture.tsx:10',
      'fixture.tsx:11',
      'fixture.tsx:12',
      'fixture.tsx:5',
      'fixture.tsx:6',
      'fixture.tsx:7',
      'fixture.tsx:8',
      'fixture.tsx:9',
    ]);
  });

  test('adds no off-rhythm arbitrary pixel geometry and shrinks its exact debt ledger', () => {
    const allowlist = readGeometryAllowlist();
    const actual = collectOffRhythmGeometry();
    const allowed = new Map();
    const invalid = [];

    if (allowlist.version !== 3) {
      invalid.push(`allowlist version must be 3, received ${allowlist.version}`);
    }
    if (!Number.isInteger(allowlist.total) || allowlist.total < 0) {
      invalid.push(`allowlist total must be a non-negative integer`);
    }

    const sections = allowlist.sections ?? {};
    const declaredRoots = Object.keys(sections).sort();
    if (
      declaredRoots.join('\n') !== [...GEOMETRY_ROOTS].sort().join('\n')
    ) {
      invalid.push(
        `ledger sections must cover exactly the scanned roots, received ${declaredRoots.join(', ')}`
      );
    }

    for (const [root, section] of Object.entries(sections)) {
      if (!section || Array.isArray(section) || typeof section !== 'object') {
        invalid.push(`${root}: section must declare a total and its allowances`);
        continue;
      }
      if (!Number.isInteger(section.total) || section.total < 0) {
        invalid.push(`${root}: section total must be a non-negative integer`);
      }
      let counted = 0;
      for (const [file, values] of Object.entries(section.allowances ?? {})) {
        // A section may only account for its own root. Without this, geometry
        // moved out of the app could be re-filed under the app's section and
        // the per-root figures would go on describing a layout that no longer
        // exists.
        if (geometryRootOf(file) !== root) {
          invalid.push(`${file}: allowance is filed under ${root}, which does not own it`);
          continue;
        }
        if (!values || Array.isArray(values) || typeof values !== 'object') {
          invalid.push(`${file}: allowance must name exact pixel values`);
          continue;
        }
        for (const [value, count] of Object.entries(values)) {
          const numeric = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/.test(value)
            ? canonicalPixelValue(value.slice(0, -2))
            : null;
          if (
            !numeric ||
            value !== numeric.value ||
            !isOffRhythm(numeric.pixels)
          ) {
            invalid.push(`${file}: ${value} is not a canonical off-rhythm pixel value`);
            continue;
          }
          if (!Number.isInteger(count) || count < 1) {
            invalid.push(`${file}: ${value} allowance must be a positive integer`);
            continue;
          }
          allowed.set(`${file}\0${value}`, count);
          counted += count;
        }
      }
      if (Number.isInteger(section.total) && section.total !== counted) {
        invalid.push(
          `${root}: section total ${section.total} does not match its ${counted} counted allowance(s)`
        );
      }
    }

    const added = [];
    const stale = [];
    const keys = new Set([...actual.keys(), ...allowed.keys()]);
    for (const key of [...keys].sort()) {
      const [file, value] = key.split('\0');
      const actualCount = actual.get(key) ?? 0;
      const allowedCount = allowed.get(key) ?? 0;
      if (actualCount > allowedCount) {
        added.push(
          `${file}: ${value} occurs ${actualCount} time(s), allowed ${allowedCount}`
        );
      } else if (actualCount < allowedCount) {
        stale.push(
          `${file}: ${value} occurs ${actualCount} time(s), allowed ${allowedCount}`
        );
      }
    }

    const actualTotal = [...actual.values()].reduce(
      (sum, count) => sum + count,
      0
    );
    const ledgerTotal = [...allowed.values()].reduce(
      (sum, count) => sum + count,
      0
    );
    const correction = allowlist.metric?.reviewCorrection;
    const categories = correction?.coverageExpansion?.categories ?? {};
    const categoryTotal = Object.values(categories).reduce(
      (sum, count) => sum + count,
      0
    );
    if (
      correction?.coverageExpansion?.occurrences !== categoryTotal ||
      correction?.priorScanner?.offRhythmOccurrences +
        correction?.coverageExpansion?.occurrences -
        correction?.excludedNonCodeCommentOccurrences !==
        correction?.astScanner?.offRhythmOccurrences ||
      correction?.astScanner?.offRhythmOccurrences -
        correction?.priorScanner?.offRhythmOccurrences !==
        correction?.netTotalChange
    ) {
      invalid.push('scanner coverage-expansion metadata must match the exact ledger');
    }

    // The total went up by 38 when the library root was added. That is not new
    // debt, and the ledger has to say so in numbers a reader can check rather
    // than in a sentence they have to take on trust.
    const rootExpansion = allowlist.metric?.rootCoverageExpansion;
    const addedRoots = rootExpansion?.addedSourceRoots ?? {};
    const addedOccurrences = Object.values(addedRoots).reduce(
      (sum, entry) => sum + (entry?.occurrences ?? 0),
      0
    );
    if (
      rootExpansion?.priorSourceRoots?.join('\n') !== 'apps/frontend/src' ||
      Object.keys(addedRoots).sort().join('\n') !==
        GEOMETRY_ROOTS.filter((root) => root !== 'apps/frontend/src')
          .sort()
          .join('\n') ||
      rootExpansion?.addedOccurrences !== addedOccurrences ||
      rootExpansion?.priorTotal + addedOccurrences !==
        rootExpansion?.combinedTotal ||
      rootExpansion?.combinedTotal !== allowlist.total
    ) {
      invalid.push('root coverage-expansion metadata must match the exact ledger');
    }

    const declaredSectionTotal = Object.values(sections).reduce(
      (sum, section) => sum + (section?.total ?? 0),
      0
    );
    if (declaredSectionTotal !== allowlist.total) {
      invalid.push(
        `sections declare ${declaredSectionTotal} in total, allowlist declares ${allowlist.total}`
      );
    }

    expect({
      invalid,
      added,
      stale,
      actualTotal,
      ledgerTotal,
      declaredTotal: allowlist.total,
    }).toEqual({
      invalid: [],
      added: [],
      stale: [],
      actualTotal: allowlist.total,
      ledgerTotal: allowlist.total,
      declaredTotal: allowlist.total,
    });
  });

  test('leaves no tracked JSX outside the scanned geometry roots', () => {
    // The section check stops geometry being re-filed between known roots. This
    // stops the other escape: a brand new directory of components that no root
    // covers, where the same pixels would simply not be counted.
    const tracked = execFileSync(
      'git',
      ['ls-files', '-z', '*.tsx', '*.jsx'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    )
      .split('\0')
      .filter(Boolean);
    const unscanned = tracked.filter((file) => !geometryRootOf(file)).sort();

    expect({
      unscanned,
      fix: 'add the directory to GEOMETRY_ROOTS and give it its own ledger section',
    }).toEqual({ unscanned: [], fix: expect.any(String) });
  });

  test('extracts every pixel length from arbitrary class literal fragments', () => {
    const actual = collectOffRhythmGeometry({
      'fixture.tsx': `
        const columns = 'grid-cols-[7px_1fr]';
        const spacing = clsx(active && 'p-[02.500px]', '[margin:-7px]');
        const shadow = \`shadow-[0_2px_0_7px]\`;
        // const ignoredComment = 'p-[3px]';
        export const Fixture = () => <div className={clsx(columns, spacing, shadow)} />;
      `,
    });

    expect(Object.fromEntries([...actual.entries()].sort())).toEqual({
      'fixture.tsx\u0000-7px': 1,
      'fixture.tsx\u00002.5px': 1,
      'fixture.tsx\u00002px': 1,
      'fixture.tsx\u00007px': 2,
    });
  });

  /**
   * The product-owned stylesheets. `polonto.css` is deliberately absent: it
   * overrides a vendor editor whose own geometry we do not set, so holding it
   * to the product scale would fail on values we neither chose nor control.
   */
  const SCALED_STYLESHEETS = [
    'apps/frontend/src/app/global.scss',
    'apps/frontend/src/app/colors.scss',
  ];

  test('keeps radii and type sizes in product stylesheets on the documented scales', () => {
    const normalizeLength = (value) => {
      const clean = value.replace(/!important/g, '').trim();
      if (clean === 'inherit' || /^var\(--cf-/.test(clean)) return clean;
      if (clean === '0') return '0px';

      const length = clean.match(/^(\d*\.?\d+)(px|rem)$/);
      if (!length) return clean;
      const pixels =
        length[2] === 'rem' ? Number(length[1]) * 16 : Number(length[1]);
      return `${pixels}px`;
    };
    /**
     * `border-radius` takes up to four lengths. Each corner is judged on its
     * own, so `4px 4px 0 0` is a legitimate one-sided rounding rather than an
     * unrecognised value that quietly slips past the allowlist.
     */
    const normalizeDeclaration = (value) =>
      value
        .replace(/!important/g, '')
        .trim()
        .split(/\s+/)
        .map(normalizeLength);

    const collectOffScale = (source, file, pattern, allowed) =>
      [...source.matchAll(pattern)].flatMap((match) =>
        normalizeDeclaration(match[1])
          .filter(
            (normalized) =>
              normalized !== 'inherit' &&
              !normalized.startsWith('var(--cf-') &&
              !allowed.has(normalized)
          )
          .map((normalized) => `${file}: ${match[1].trim()} (${normalized})`)
      );

    const radii = [];
    const typeSizes = [];
    for (const file of SCALED_STYLESHEETS) {
      const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
      radii.push(
        ...collectOffScale(
          source,
          file,
          /border(?:-(?:top|right|bottom|left)){0,2}-radius:\s*([^;}\n]+)/g,
          new Set(['0px', '4px', '8px', '12px', '9999px'])
        )
      );
      typeSizes.push(
        ...collectOffScale(
          source,
          file,
          /font-size:\s*([^;}\n]+)/g,
          new Set([
            '11px',
            '12px',
            '13px',
            '14px',
            '16px',
            '18px',
            '24px',
            '32px',
          ])
        )
      );
    }

    expect({ radii, typeSizes }).toEqual({ radii: [], typeSizes: [] });
  });
});
