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

    // Rendered: the panel for that tab value, and since 07.09.2026 it draws
    // the walkthrough itself rather than a button that opens it elsewhere.
    // The owner pressed the tab and found a heading, a paragraph and a link:
    // «я не вижу смысла дополнительной кнопки в настройках… А так я попадаю
    // как будто бы в раздел, которого и не существует». One door that is the
    // room, not two doors to the same room.
    const panelStart = settings.indexOf("tab === 'onboarding'");
    expect(panelStart).toBeGreaterThan(-1);
    const panel = settings.slice(panelStart, panelStart + 1600);
    expect(panel).toMatch(/<OnboardingWalkthrough\b/);
    expect(settings).toContain(
      "@contentfactory/frontend/components/onboarding/onboarding.walkthrough'"
    );
  });

  test('the walkthrough is also the first row of the working menu', () => {
    // Владелец 07.09.2026: «раздел «С чего начать» должен быть просто
    // отдельным пунктом меню вынесен». Пункт стоит первым и пропадает сам,
    // когда все пять шагов пройдены, — по данным области, а не по флагу.
    const menu = read('apps/frontend/src/components/layout/top.menu.tsx');
    const first = menu.indexOf("path: '/onboarding'");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(menu.indexOf("path: '/launches'"));
    expect(menu).toContain('hide: onboardingFinished');
    expect(menu).toContain('allStepsDone');
    // Пока область не ответила — пункт на месте: спрятать его по незнанию
    // значит спрятать единственный вход у того, кто ещё ничего не сделал.
    expect(menu).toContain('onboarding.answered && allStepsDone');
  });

  test('the old `?onboarding=true` address hands over to the one onboarding', () => {
    // 2q28.6: the inherited Postiz modal is gone. The parameter still comes
    // back from the channel-connect round trip and the billing return, so the
    // mount stays inside the launches shell and sends the person to the page.
    expect(
      fs.existsSync(
        path.join(
          repositoryRoot,
          'apps/frontend/src/components/onboarding/onboarding.modal.tsx'
        )
      )
    ).toBe(false);
    const onboardingMount = read(
      'apps/frontend/src/components/onboarding/onboarding.tsx'
    );
    expect(onboardingMount).toMatch(/query\.get\('onboarding'\)/);
    expect(onboardingMount).toContain('router.replace');
    expect(onboardingMount).toContain("'/onboarding'");
    // A two-step provider still needs its picker on /launches first.
    expect(onboardingMount).toMatch(/query\.get\('continue'\)/);

    const launches = read(
      'apps/frontend/src/components/launches/launches.component.tsx'
    );
    expect(launches).toMatch(/<Onboarding\s*\/>/);
  });

  test('the video the product does not show is not named in any locale', () => {
    // Postiz upstream had a real embedded video on this step. It was removed
    // at rebrand time — correctly, it was about another product — but the
    // step's label kept saying "watch" over four paragraphs of text, and the
    // keys outlived the screen: the walkthrough (`content-factory-next-rrs9`)
    // reads none of them. `content-factory-next-za05` removed the eleven dead
    // ones from all sixteen bundles, so the check is no longer «the wording
    // was fixed» but «the key is gone» — a stronger statement, and the only
    // one that stays true.
    const dead = [
      'watch_tutorial',
      'watch_tutorial_title',
      'watch_tutorial_description',
      'onboarding_step_plan',
      'onboarding_step_plan_body',
      'onboarding_step_draft',
      'onboarding_step_draft_body',
      'onboarding_step_review',
      'onboarding_step_review_body',
      'onboarding_step_publish',
      'onboarding_step_publish_body',
      // 2q28.6: the modal that read these is gone.
      'onboarding_step_next',
      'onboarding_next_title',
      'onboarding_next_description',
      'connect_your_channels',
      'connect_social_media_to_start',
      'connected_channels',
      'click_channel_to_add',
      'continue_without_channels',
      'get_started',
    ];
    const locales = fs.readdirSync(
      path.join(
        repositoryRoot,
        'libraries/react-shared-libraries/src/translation/locales'
      )
    );

    expect(locales.length).toBe(16);

    const survivors = [];
    for (const locale of locales) {
      const bundle = JSON.parse(
        read(
          `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`
        )
      );
      for (const key of dead) {
        if (key in bundle) survivors.push(`${locale}/${key}`);
      }
    }

    expect(survivors).toEqual([]);
  });
});
