const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

/**
 * The onboarding modal only ever opened two ways: a fresh space with no
 * channels, driven by the `onboarding` response header
 * (`apps/frontend/src/components/layout/layout.context.tsx`), or a hand-typed
 * `?onboarding=true` in the address bar. There was no link to it anywhere in
 * the interface, so skipping it — as the owner did on 2026-09-01 — meant
 * losing it for good. See content-factory-next-rrs9.
 *
 * This does not test the redesigned onboarding the task asks for; that still
 * needs a mock-up and is out of scope. It only proves the door back to the
 * existing modal exists and is registered, not merely rendered — a tab whose
 * value is never pushed into the tab list is unreachable regardless of what
 * its panel contains.
 */
describe('onboarding stays reachable after it is skipped', () => {
  test('Settings registers and renders a permanent onboarding tab', () => {
    const settings = read(
      'apps/frontend/src/components/layout/settings.component.tsx'
    );

    // Registered: without this, `list` never carries the tab and the surface
    // has nothing to switch to.
    expect(settings).toContain("tab: 'onboarding'");

    // Rendered: the panel for that tab value, pointing at the walkthrough.
    // `content-factory-next-rrs9` moved the destination from
    // `/launches?onboarding=true` — a screen with a modal over it — to a page
    // of its own, which is what a person can leave and come back to. The
    // requirement this guards did not change: the way back exists in a menu.
    const panelStart = settings.indexOf("tab === 'onboarding'");
    expect(panelStart).toBeGreaterThan(-1);
    const panel = settings.slice(panelStart, panelStart + 1600);
    expect(panel).toMatch(/href="\/onboarding"/);
  });

  test('the onboarding modal actually opens on that query parameter', () => {
    const onboardingMount = read(
      'apps/frontend/src/components/onboarding/onboarding.tsx'
    );
    expect(onboardingMount).toMatch(/query\.get\('onboarding'\)/);

    // The mount point lives inside the launches shell, so the link has to
    // land there, not on a page where <Onboarding /> is never rendered.
    const launches = read(
      'apps/frontend/src/components/launches/launches.component.tsx'
    );
    expect(launches).toMatch(/<Onboarding\s*\/>/);
  });

  test('the second step no longer promises a video it does not show', () => {
    // Postiz upstream had a real embedded video on this step. It was removed
    // at rebrand time — correctly, it was about another product — but the
    // step's label kept saying "watch" over four paragraphs of text.
    const en = JSON.parse(
      read(
        'libraries/react-shared-libraries/src/translation/locales/en/translation.json'
      )
    );
    const ru = JSON.parse(
      read(
        'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
      )
    );

    expect(en.watch_tutorial).not.toMatch(/watch/i);
    expect(ru.watch_tutorial).not.toMatch(/смотреть/i);
  });
});
