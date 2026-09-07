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
  modal: 'apps/frontend/src/components/onboarding/onboarding.modal.tsx',
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
  test('nothing is done in an empty workspace', () => {
    const empty = adapter.EMPTY_PROGRESS;
    expect(adapter.doneCount(empty)).toBe(0);
    expect(adapter.currentStep(empty)).toBe('channel');
  });

  test('each count closes its own step and no other', () => {
    const only = (patch) => ({ ...adapter.EMPTY_PROGRESS, ...patch });

    expect(adapter.stepIsDone('channel', only({ channels: 1 }))).toBe(true);
    expect(adapter.stepIsDone('voice', only({ channels: 1 }))).toBe(false);

    expect(adapter.stepIsDone('voice', only({ voiceSamples: 2 }))).toBe(true);
    expect(adapter.stepIsDone('fact', only({ voiceSamples: 2 }))).toBe(false);

    expect(adapter.stepIsDone('fact', only({ facts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('brief', only({ facts: 1 }))).toBe(false);

    // A draft is what the brief produced when the brief was the only way in,
    // so it still closes both. Said out loud in the adapter rather than left
    // for someone to discover.
    expect(adapter.stepIsDone('brief', only({ drafts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('preview', only({ drafts: 1 }))).toBe(true);
    expect(adapter.stepIsDone('schedule', only({ drafts: 1 }))).toBe(false);

    expect(adapter.stepIsDone('schedule', only({ scheduled: 1 }))).toBe(true);
  });

  /**
   * `content-factory-next-m2eg.23`. Владелец 07.09.2026 сделал заготовку и
   * шаг остался открытым: «У меня все пройдено, кроме пункта… Хотя, по идее,
   * я же создал новую заготовку». Он прав — шаг просит заполненный бриф, а
   * заготовка `kind='CORE'` несёт его внутри себя.
   */
  test('заготовка закрывает шаг брифа и не закрывает предпросмотр', () => {
    const only = (patch) => ({ ...adapter.EMPTY_PROGRESS, ...patch });

    expect(adapter.stepIsDone('brief', only({ pieces: 1 }))).toBe(true);
    // Смотреть ещё нечего: черновика под канал заготовка сама по себе не даёт.
    expect(adapter.stepIsDone('preview', only({ pieces: 1 }))).toBe(false);
    expect(adapter.stepIsDone('schedule', only({ pieces: 1 }))).toBe(false);
  });

  test('the repository counts a live заготовка and not an archived one', () => {
    // `ContentPiece` has no `deletedAt` — the list hides a row by
    // `archivedAt`, so the count asks the same question the screens do. A row
    // without `kind` predates the wave and carries no brief.
    const repository = read('repository');
    expect(repository).toMatch(
      /contentPiece\(\)\.count\(\{\s*where:\s*\{\s*organizationId,\s*kind:\s*'CORE',\s*archivedAt:\s*null\s*\}/
    );
    // Узкий тип поверх клиента называет ровно те колонки, что есть у таблицы.
    // `deletedAt` у неё нет, и написанный сюда он прошёл бы проверку типов и
    // упал бы на боевой базе.
    const counter = repository.slice(
      repository.indexOf('type PieceCounter'),
      repository.indexOf('};', repository.indexOf('type PieceCounter'))
    );
    expect(counter).toContain('archivedAt: null');
    expect(counter).not.toContain('deletedAt');
  });

  test('all six done is one function, not a number retyped per caller', () => {
    expect(adapter.allStepsDone(adapter.EMPTY_PROGRESS)).toBe(false);
    expect(
      adapter.allStepsDone({
        channels: 1,
        voiceSamples: 1,
        facts: 1,
        pieces: 1,
        drafts: 1,
        scheduled: 1,
      })
    ).toBe(true);
    // Заготовка без черновика — предпросмотр ещё открыт, значит не всё.
    expect(
      adapter.allStepsDone({
        channels: 1,
        voiceSamples: 1,
        facts: 1,
        pieces: 1,
        drafts: 0,
        scheduled: 0,
      })
    ).toBe(false);
  });

  test('a published post keeps the last step closed', () => {
    // `scheduled` counts QUEUE and PUBLISHED together in the repository. If it
    // counted only QUEUE the step would reopen the moment the post went out,
    // which is exactly backwards.
    const repository = read('repository');
    expect(repository).toMatch(/state:\s*\{\s*in:\s*\['QUEUE',\s*'PUBLISHED'\]/);
  });

  test('a retracted claim does not close the fact step', () => {
    // The three statuses the brief itself refuses. Counting them would close
    // the step and then let the brief refuse the id — the worst of both.
    const repository = read('repository');
    expect(repository).toContain("notIn: ['TOMBSTONED', 'RETRACTED', 'SUPERSEDED']");
  });

  test('a server that answered with less does not congratulate anyone', () => {
    expect(adapter.readProgress(undefined)).toEqual(adapter.EMPTY_PROGRESS);
    expect(adapter.readProgress({ channels: 'many' })).toEqual(
      adapter.EMPTY_PROGRESS
    );
    expect(adapter.readProgress({ channels: -3 }).channels).toBe(0);
  });

  test('the screen keeps no completion state of its own', () => {
    const screen = read('screen');
    // `useState` here would be a flag the page sets on itself, and a flag the
    // page sets on itself is a tick that means nothing.
    expect(screen).not.toMatch(/useState/);
    expect(screen).toContain('stepIsDone');
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
        contentFact: counter('contentFact'),
        contentPiece: counter('contentPiece'),
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

  test('the six steps are the product’s own loop, not the inherited one', () => {
    expect([...adapter.ONBOARDING_STEP_KEYS]).toEqual([
      'channel',
      'voice',
      'fact',
      'brief',
      'preview',
      'schedule',
    ]);
    // The two the old screen never mentioned, and the reason the owner could
    // finish it without learning what the product is for.
    const copy = read('copy');
    expect(copy).toContain('чьей манерой писать');
    expect(copy).toContain('на что будете опираться');
  });

  test('each step says what closes it', () => {
    const copy = read('copy');
    // Six in each language, plus the field on the type: the sentence that
    // tells a person what the product is waiting for. Without it a step is a
    // suggestion.
    expect((copy.match(/^\s+closes:/gm) || []).length).toBe(13);
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

  test('the modal hands over instead of teaching a loop of its own', () => {
    const modal = read('modal');
    expect(modal).toContain('href="/onboarding"');
    // The four paragraphs about calendar/draft/preview/schedule are gone.
    expect(modal).not.toContain('onboarding_step_plan');
    expect(modal).not.toContain('watch_tutorial_title');
    // And the step no longer promises a video.
    expect(modal).not.toMatch(/t\('watch_tutorial',/);
  });
});
