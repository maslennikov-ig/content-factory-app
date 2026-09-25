'use strict';

/**
 * `content-factory-next-rrs9`: the walkthrough, and the one rule that makes it
 * one.
 *
 * What it replaces was four paragraphs about the calendar, the draft, the
 * preview and the schedule — the loop any scheduler has. The owner read it on
 * 01.09.2026 and said «оно очень странно выглядит, как будто бы у нас его и
 * нет», then pressed «Начать» and skipped it. Three things made it look
 * absent, and this file holds the fixes for all three:
 *
 *  - the step promised a video the rename had removed;
 *  - it described someone else's loop, never the voice, the facts or the
 *    evidence a draft has to stand on;
 *  - and there was no way back to it once skipped.
 *
 * The rule that carries the rest: **a step closes because the thing exists,
 * not because a person pressed «дальше»**. No local flag, no «I have read
 * this» checkbox, nothing the page can decide on its own. That is what makes
 * the ticks worth reading, and it is a single `stepIsDone` away from being
 * quietly replaced by a piece of component state that congratulates everyone.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const FILES = {
  adapter: 'apps/frontend/src/components/onboarding/onboarding.adapter.ts',
  copy: 'apps/frontend/src/components/onboarding/onboarding.copy.ts',
  screen: 'apps/frontend/src/components/onboarding/onboarding.walkthrough.tsx',
  page: 'apps/frontend/src/app/(app)/(site)/onboarding/page.tsx',
  controller: 'apps/backend/src/api/routes/onboarding.controller.ts',
  repository:
    'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.repository.ts',
  mount: 'apps/frontend/src/components/onboarding/onboarding.tsx',
  telegram: 'apps/frontend/src/components/onboarding/onboarding.telegram.tsx',
  layout: 'apps/frontend/src/components/layout/layout.context.tsx',
  progressHook:
    'apps/frontend/src/components/onboarding/use-onboarding-progress.ts',
  menu: 'apps/frontend/src/components/layout/top.menu.tsx',
  settings: 'apps/frontend/src/components/layout/settings.component.tsx',
};

const read = (key) => fs.readFileSync(path.join(root, FILES[key]), 'utf8');

test('every piece of the walkthrough exists', () => {
  for (const file of Object.values(FILES)) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
  }
});

if (!Object.values(FILES).every((file) => fs.existsSync(path.join(root, file))))
  return;

const adapter = require('./helpers/load-tsx.cjs').loadTypeScriptModule(
  FILES.adapter
);

describe('a step closes because the work is done', () => {
  const only = (patch) => ({ ...adapter.EMPTY_PROGRESS, ...patch });

  test('nothing is done in an empty workspace', () => {
    const empty = adapter.EMPTY_PROGRESS;
    expect(adapter.doneCount(empty)).toBe(0);
    // Variant B (2q28.6): menu order, the avatar first.
    expect(adapter.currentStep(empty)).toBe('avatar');
  });

  test('each count closes its own step and no other', () => {
    // 2q28.13: samples are material for an avatar, not an avatar. One pasted
    // text ticked this step while the avatar screen said «Аватара пока нет».
    expect(adapter.stepIsDone('avatar', only({ voiceSamples: 2 }))).toBe(false);
    expect(adapter.stepIsDone('avatar', only({ avatars: 1 }))).toBe(true);
    expect(adapter.stepIsDone('channel', only({ avatars: 1 }))).toBe(false);

    expect(adapter.stepIsDone('channel', only({ channels: 1 }))).toBe(true);
    expect(adapter.stepIsDone('piece', only({ channels: 1 }))).toBe(false);

    expect(adapter.stepIsDone('piece', only({ pieces: 1 }))).toBe(true);
    // A piece alone has nothing cut for a channel yet.
    expect(adapter.stepIsDone('adaptation', only({ pieces: 1 }))).toBe(false);

    expect(adapter.stepIsDone('adaptation', only({ adaptations: 1 }))).toBe(true);
    expect(adapter.stepIsDone('plan', only({ adaptations: 1 }))).toBe(false);

    expect(adapter.stepIsDone('plan', only({ scheduled: 1 }))).toBe(true);
    expect(adapter.stepIsDone('plan', only({ planModes: 1 }))).toBe(true);
    expect(adapter.stepIsDone('channel', only({ planModes: 1 }))).toBe(false);
  });

  test('a draft from the older path still closes the piece and the adaptation', () => {
    expect(adapter.stepIsDone('piece', only({ drafts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('adaptation', only({ drafts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('plan', only({ drafts: 1 }))).toBe(false);
  });

  test('the claim is optional: it never counts and never blocks «всё пройдено»', () => {
    expect(adapter.ONBOARDING_STEP_KEYS).not.toContain('fact');
    expect(adapter.factIsDone(only({ facts: 1 }))).toBe(true);
    expect(adapter.factIsDone(only({ pieceFacts: 1 }))).toBe(true);
    expect(adapter.doneCount(only({ facts: 3, pieceFacts: 2 }))).toBe(0);
    expect(
      adapter.allStepsDone(
        only({ avatars: 1, channels: 1, pieces: 1, adaptations: 1, planModes: 1 })
      )
    ).toBe(true);
  });

  test('the repository counts a live заготовка and not an archived one', () => {
    // `ContentPiece` has no `deletedAt` — the list hides a row by
    // `archivedAt`, so the count asks the same question the screens do.
    const repository = read('repository');
    expect(repository).toMatch(
      /contentPiece\(\)\.count\(\{\s*where:\s*\{\s*organizationId,\s*kind:\s*'CORE',\s*archivedAt:\s*null\s*\}/
    );
    const counter = repository.slice(
      repository.indexOf('type PieceCounter'),
      repository.indexOf('};', repository.indexOf('type PieceCounter'))
    );
    expect(counter).toContain('archivedAt: null');
    expect(counter).not.toContain('deletedAt');
  });

  test('all five done is one function, not a number retyped per caller', () => {
    expect(adapter.allStepsDone(adapter.EMPTY_PROGRESS)).toBe(false);
    expect(
      adapter.allStepsDone(
        only({ avatars: 1, channels: 1, pieces: 1, drafts: 1, scheduled: 1 })
      )
    ).toBe(true);
    // A piece without an adaptation — the path is not over.
    expect(
      adapter.allStepsDone(only({ avatars: 1, channels: 1, pieces: 1 }))
    ).toBe(false);
  });

  test('a published post keeps the last step closed', () => {
    // `scheduled` counts QUEUE and PUBLISHED together in the repository.
    const repository = read('repository');
    expect(repository).toMatch(/state:\s*\{\s*in:\s*\['QUEUE',\s*'PUBLISHED'\]/);
  });

  test('only a plan mode someone chose closes the plan step', () => {
    // `NULL` reads as «Бронь» everywhere, but it is nobody's decision.
    const repository = read('repository');
    expect(repository).toMatch(/planMode:\s*\{\s*not:\s*null\s*\}/);
  });

  test('a retracted claim does not tick the optional claim', () => {
    const repository = read('repository');
    expect(repository).toContain("notIn: ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED']");
  });

  test('a server that answered with less does not congratulate anyone', () => {
    expect(adapter.readProgress(undefined)).toEqual(adapter.EMPTY_PROGRESS);
    expect(adapter.readProgress({ channels: 'many' })).toEqual(
      adapter.EMPTY_PROGRESS
    );
    expect(adapter.readProgress({ channels: -3 }).channels).toBe(0);
    // An older server without the two new fields reads them as zero.
    expect(adapter.readProgress({ channels: 1 }).adaptations).toBe(0);
    expect(adapter.readProgress({ channels: 1 }).planModes).toBe(0);
  });

  test('the screen keeps no completion state of its own', () => {
    const screen = read('screen');
    // The one piece of state is which step is on the screen. A flag the page
    // sets on itself — «viewed», «skipped», «finished» — is a tick that means
    // nothing, and so is anything remembered in the browser.
    const states = [...screen.matchAll(/useState<([^>]+)>/g)].map((m) => m[1]);
    expect(states).toEqual(['View | null']);
    expect(screen).not.toMatch(/localStorage|sessionStorage|setDone|setSkipped/);
    expect(screen).toContain('stepIsDone');
  });
});

describe('moving between steps never ticks anything', () => {
  const only = (patch) => ({ ...adapter.EMPTY_PROGRESS, ...patch });

  test('«Дальше» and «Сделаю позже» lead to the next step in menu order', () => {
    expect(adapter.nextStep('avatar', adapter.EMPTY_PROGRESS)).toBe('channel');
    expect(adapter.nextStep('adaptation', adapter.EMPTY_PROGRESS)).toBe('plan');
    expect(adapter.previousStep('avatar')).toBeNull();
    expect(adapter.previousStep('channel')).toBe('avatar');
  });

  test('the last step finishes: no wrap-around to a skipped one', () => {
    const skippedChannel = only({ avatars: 1, pieces: 1, adaptations: 1 });
    expect(adapter.nextStep('plan', skippedChannel)).toBe('done');
    const allButPlan = only({ avatars: 1, channels: 1, pieces: 1, adaptations: 1 });
    expect(adapter.nextStep('plan', allButPlan)).toBe('done');
  });
});

describe('the voice step counts the corpus the screens show', () => {
  /**
   * `content-factory-next-za05`. The count asked for every
   * `BrandVoiceSample` row in the organisation. Two kinds of row are not
   * corpus: one soft-deleted (`deletedAt`), which every other reader in
   * `voice-sample.repository.ts` already skips, and a `STYLE_REFERENCE` past
   * its retention date, whose `text` `purgeExpiredReferences` erases in place
   * while keeping the row so the corpus history stays readable. Either one
   * ticked the voice step for a workspace whose «Аватары» tab has nothing
   * left to measure.
   */
  const loadRepository = () =>
    require('./helpers/load-ts-module.cjs').loadTypeScriptModule(
      FILES.repository,
      {
        '@nestjs/common': { Injectable: () => (target) => target },
        '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {},
      }
    );

  const askedFor = async () => {
    const asked = {};
    const counter = (name) => ({
      count: async ({ where }) => {
        asked[name] = where;
        return 0;
      },
    });
    const { OnboardingRepository } = loadRepository();
    await new OnboardingRepository({
      model: {
        integration: counter('integration'),
        brandVoiceSample: counter('brandVoiceSample'),
        projectBrandProfile: counter('projectBrandProfile'),
        contentFact: counter('contentFact'),
        contentPiece: counter('contentPiece'),
        contentDerivation: counter('contentDerivation'),
        post: counter('post'),
      },
    }).progress('org-a');
    return asked;
  };

  test('a deleted sample is not counted', async () => {
    const where = (await askedFor()).brandVoiceSample;
    expect(where.organizationId).toBe('org-a');
    expect(where.deletedAt).toBeNull();
  });

  test('a reference sample erased by its own retention date is not counted', async () => {
    const where = (await askedFor()).brandVoiceSample;
    expect(where.text).toEqual({ not: '' });
  });
});

describe('the walkthrough leads into the product', () => {
  test('every step names somewhere to go, and it is not this page', () => {
    for (const step of adapter.ONBOARDING_STEP_KEYS) {
      const href = adapter.ONBOARDING_STEP_HREF[step];
      expect(typeof href).toBe('string');
      expect(href.startsWith('/')).toBe(true);
      expect(href.startsWith('/onboarding')).toBe(false);
    }
  });

  test('the five steps follow the menu, and their keys are the tour keys', () => {
    expect([...adapter.ONBOARDING_TOUR_STEPS]).toEqual([
      'avatar',
      'channel',
      'piece',
      'adaptation',
      'plan',
    ]);
    expect(adapter.ONBOARDING_STEP_KEYS).toBe(adapter.ONBOARDING_TOUR_STEPS);
    const copy = read('copy');
    expect(copy).toContain('чьей манерой писать');
    expect(copy).toContain('Необязательно');
  });

  test('«Показать на экране» keeps the target query and adds the tour key', () => {
    expect(adapter.tourHref('avatar')).toBe('/content?tab=avatars&tour=avatar');
    expect(adapter.tourHref('channel')).toBe('/channels?tour=channel');
    expect(adapter.tourHref('piece')).toBe('/content?tab=materials&tour=piece');
    // The adaptation anchors live on a piece's page (contract with S3):
    // without a piece the list's own tour is the honest fallback.
    expect(adapter.tourHref('adaptation')).toBe(
      '/content?tab=materials&tour=piece'
    );
    const withPiece = { ...adapter.EMPTY_PROGRESS, latestPieceId: 'p 1' };
    expect(adapter.tourHref('adaptation', withPiece)).toBe(
      '/content/pieces/p%201?tour=adaptation'
    );
    expect(adapter.tourHref('plan', withPiece)).toBe('/launches?tour=plan');
    expect(adapter.withTour('/x?tour=old&a=1', 'plan')).toBe('/x?a=1&tour=plan');
    expect(read('screen')).toContain('tourHref(step, progress)');
  });

  test('the adaptation and plan buttons open the piece touched last', () => {
    const withPiece = { ...adapter.EMPTY_PROGRESS, latestPieceId: 'abc' };
    expect(adapter.stepHref('adaptation', withPiece)).toBe('/content/pieces/abc');
    expect(adapter.stepHref('plan', withPiece)).toBe('/content/pieces/abc');
    expect(adapter.stepHref('plan', adapter.EMPTY_PROGRESS)).toBe('/launches');
    expect(adapter.stepHref('piece', withPiece)).toBe('/content?tab=materials');
    expect(adapter.readProgress({ latestPieceId: 42 }).latestPieceId).toBeNull();
  });

  test('each step says what closes it', () => {
    const copy = read('copy');
    // Five in each language, plus the field on the type.
    expect((copy.match(/^\s+closes:/gm) || []).length).toBe(11);
  });

  test('the avatar step names the real corpus floor and the lighter path', () => {
    const copy = read('copy');
    expect(copy).toContain('MIN_CORPUS_SAMPLES');
    expect(copy).toContain('MIN_CORPUS_CHARS');
    expect(copy).toContain('«Заполнить вручную»');
  });

  test('the channel step connects Telegram through the shared mechanics', () => {
    const guide = read('telegram');
    expect(guide).toContain('useTelegramConnect');
    expect(guide).toContain('/integrations/social/telegram?redirectUrl=');
    expect(guide).toContain('telegramBotName');
  });
});

describe('it can be found again', () => {
  test('a fresh space lands on the page, not on a screen with a modal over it', () => {
    expect(read('layout')).toContain("window.location.href = '/onboarding'");
  });

  /**
   * Владелец 07.09.2026: «раздел «С чего начать» должен быть просто отдельным
   * пунктом меню вынесен… я не вижу смысла дополнительной кнопки в
   * настройках». Две двери к одной странице читались как отсутствие страницы.
   */
  test('the page is the first row of the menu and the settings tab itself', () => {
    const menu = read('menu');
    expect(menu.indexOf("path: '/onboarding'")).toBeLessThan(
      menu.indexOf("path: '/launches'")
    );
    expect(menu).toContain('hide: onboardingFinished');

    // Вкладка настроек рисует сам обход, а не кнопку к нему.
    const settings = read('settings');
    expect(settings).toMatch(/<OnboardingWalkthrough\s+embedded=\{true\}/);
  });

  test('the menu and the page ask one question through one hook', () => {
    // Два вызова `useSWR` с одним ключом делят один запрос и один кэш; две
    // руками написанные загрузки не делят ничего, и строка меню продолжала бы
    // показывать состояние, которое страница уже прошла.
    const hook = read('progressHook');
    expect(hook).toContain('ONBOARDING_PROGRESS_API');
    for (const key of ['screen', 'menu']) {
      expect(read(key)).toContain('useOnboardingProgress');
    }
  });

  test('the page says where the ticks come from and that there is no reset', () => {
    // Владелец 07.09.2026: «нужна, наверное, возможность сбросить
    // прохождение». Сбрасывать нечего — галочки это строки области, а флаг,
    // который их снимает, врёт. Страница говорит это словами.
    const screen = read('screen');
    expect(screen).toContain('data-onboarding-note="counted"');
    const copy = read('copy');
    expect(copy).toContain('Сбросить нельзя');
    expect(copy).toContain('There is no reset');
  });

  test('there is one onboarding: the legacy modal is gone and its address hands over', () => {
    expect(
      fs.existsSync(
        path.join(root, 'apps/frontend/src/components/onboarding/onboarding.modal.tsx')
      )
    ).toBe(false);
    const mount = read('mount');
    expect(mount).not.toContain('OnboardingModal');
    expect(mount).toMatch(/query\.get\('onboarding'\)/);
    expect(mount).toContain("'/onboarding'");
  });
});
