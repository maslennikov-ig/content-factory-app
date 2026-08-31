const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(repositoryRoot, file), 'utf8');

const channelSurfaces = [
  'apps/frontend/src/components/launches/launches.component.tsx',
  'apps/frontend/src/components/launches/add.provider.component.tsx',
  'apps/frontend/src/components/launches/calendar.tsx',
  'apps/frontend/src/components/launches/helpers/pick.platform.component.tsx',
  'apps/frontend/src/components/launches/import-debug-post.modal.tsx',
  'apps/frontend/src/components/launches/information.component.tsx',
  'apps/frontend/src/components/new-launch/picks.socials.component.tsx',
  'apps/frontend/src/components/new-launch/select.current.tsx',
  'apps/frontend/src/components/new-launch/manage.modal.tsx',
  'apps/frontend/src/components/new-launch/providers/high.order.provider.tsx',
  'apps/frontend/src/components/post-url-selector/post.url.selector.tsx',
  'apps/frontend/src/components/agents/agent.tsx',
  'apps/frontend/src/components/preview/post.preview.tsx',
];

const PLATFORM_BADGE =
  'libraries/react-shared-libraries/src/platform/platform.badge.tsx';
const PLATFORM_CARD =
  'libraries/react-shared-libraries/src/platform/platform.card.tsx';
const PLATFORM_ASSET =
  'libraries/react-shared-libraries/src/platform/platform.asset.ts';

describe('desert-lab screen review regressions', () => {
  test('calendar keeps the dense channel row legible after four marks', () => {
    const source = read('apps/frontend/src/components/launches/calendar.tsx');

    expect(source).toContain('integrations.slice(0, 4).map');
    expect(source).toContain('integrations.length > 4');
    expect(source).toContain('+{integrations.length - 4}');
  });

  /**
   * The rule this fence protects is `content-factory-next-a4p`: the official
   * platform marks stay, and no screen quietly swaps one for a glyph of ours.
   *
   * The path used to be typed into every screen. It is now typed once, in the
   * two primitives that own the frame around it, so a screen satisfies the rule
   * either by holding the path itself or by rendering one of them — and the
   * primitives are checked directly below, so the guarantee does not thin out
   * by being delegated.
   */
  test.each(channelSurfaces)('%s keeps the real platform logo', (file) => {
    // `<PlatformBadge`, not `PlatformBadge`: the bare name also matches the
    // import line, so a screen that swapped the mark for a glyph of ours and
    // left the import behind would have satisfied this fence while carrying
    // exactly the regression it exists to stop.
    expect(read(file)).toMatch(
      /\/icons\/platforms\/|<PlatformBadge|<PlatformCardLogo/
    );
  });

  /**
   * The rule is about the screens, not only about the primitives that now hold
   * the path. Six of them cropped the mark into a circle with `rounded-full`;
   * an audit found four still doing it after the first pass, because the fence
   * had been placed on the two files that were already clean.
   */
  test.each(channelSurfaces)('%s never crops the platform mark', (file) => {
    const logoBlocks = [
      ...read(file).matchAll(/\/icons\/platforms\/[\s\S]{0,400}?\/>/g),
    ].map((match) => match[0]);

    for (const block of logoBlocks) {
      expect(block).not.toMatch(/rounded-full|grayscale|sepia|hue-rotate/);
    }
  });

  test('the shared platform resolver owns the official asset path', () => {
    const source = read(PLATFORM_ASSET);
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    expect(source).toContain('/icons/platforms/');
    expect(code).not.toMatch(/rounded-full|grayscale|sepia|hue-rotate/);
  });

  test.each([PLATFORM_BADGE, PLATFORM_CARD])(
    '%s renders through the official asset resolver and never redraws it',
    (file) => {
      const source = read(file);
      // Comments in these files describe the treatments they forbid, so the
      // check reads the code and not the prose about it.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      expect(source).toContain("from './platform.asset'");
      // Recolouring, tinting or cropping a trademark is what the rule forbids;
      // a rounded logo is the shipped version of exactly that.
      expect(code).not.toMatch(/rounded-full|grayscale|sepia|hue-rotate/);
    }
  );

  test.each(channelSurfaces)(
    '%s never derives ChannelMark from a provider identifier',
    (file) => {
      const source = read(file);
      const providerDerivedMark =
        /<ChannelMark[\s\S]{0,180}name=\{[^}]*(?:identifier|providerIdentifier)[^}]*\}/;

      expect(source).not.toMatch(providerDerivedMark);
    }
  );

  test.each([
    'apps/frontend/src/components/launches/launches.component.tsx',
    'apps/frontend/src/components/agents/agent.tsx',
    'apps/frontend/src/components/new-launch/picks.socials.component.tsx',
    'apps/frontend/src/components/new-launch/select.current.tsx',
  ])('%s handles an avatar URL that fails to load', (file) => {
    expect(read(file)).toMatch(/ImageWithFallback|onError=/);
  });

  test('the calendar preview trigger stays focusable and visible after focus returns', () => {
    const source = read('apps/frontend/src/components/launches/calendar.tsx');
    const previewButton = source.match(
      /<Button(?:(?!<\/Button>)[\s\S])*?aria-label=\{t\('preview_post'(?:(?!<\/Button>)[\s\S])*?<\/Button>/
    )?.[0];

    expect(source).toContain(
      "import { Button } from '@contentfactory/react/form/button';"
    );
    expect(previewButton).toBeDefined();
    expect(previewButton).toContain('iconOnly');
    expect(previewButton).toContain('type="button"');
    expect(previewButton).toContain('variant="quiet"');
    expect(previewButton).not.toContain('hidden group-hover:block');
    expect(previewButton).toContain('focus-visible:opacity-100');
    expect(previewButton).toContain('focus-visible:outline-cf-focus');
  });

  test('the shared preview disables root navigation inside the calendar dialog', () => {
    const preview = read(
      'apps/frontend/src/components/preview/post.preview.tsx'
    );
    const dialog = read(
      'apps/frontend/src/components/preview/post.preview.dialog.tsx'
    );

    expect(preview).toContain('wordmarkHref');
    expect(dialog).toContain('wordmarkHref={null}');
  });

  test('neutral statistics never use the warning token as a rotating series colour', () => {
    const source = read('apps/frontend/src/components/launches/statistics.tsx');

    expect(source).not.toContain("blue: 'bg-cf-warning'");
    expect(source).toContain("'bg-cf-info'");
  });

  test('selected channels keep their inner outline when the avatar is a ChannelMark', () => {
    const source = read(
      'apps/frontend/src/components/new-launch/picks.socials.component.tsx'
    );

    expect(source).toContain('ring-1 ring-inset ring-cf-ink');
  });

  test('adjacent channel names are not announced twice', () => {
    const surfacesWithVisibleNames = [
      'apps/frontend/src/components/launches/launches.component.tsx',
      'apps/frontend/src/components/launches/add.provider.component.tsx',
      'apps/frontend/src/components/launches/import-debug-post.modal.tsx',
      'apps/frontend/src/components/agents/agent.tsx',
      'apps/frontend/src/components/preview/post.preview.tsx',
    ];
    const offenders = surfacesWithVisibleNames.filter((file) =>
      read(file).includes('decorative={false}')
    );

    expect(offenders).toEqual([]);
  });

  // The mark's own behaviour — initials, the type-size floor, aria and colour —
  // is rendered in `channel.mark.test.cjs` rather than matched as source text.

  test('orchestration metadata points at the stable checkout and branch', () => {
    const orchestrator = read('.codex/orchestrator.toml');
    const projectIndex = read('.codex/project-index.md');

    expect(orchestrator).toContain(
      'root = "/home/me/code/content-factory-next"'
    );
    // The durable delivery target is independent of the checkout used for a
    // review. A feature branch or detached HEAD must not rewrite this pin.
    expect(orchestrator).toContain('current_branch = "main"');
    expect(projectIndex).not.toContain('Current source branch under review');
  });
});
