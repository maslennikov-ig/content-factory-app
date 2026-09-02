'use strict';

/**
 * `editorial-stage.copy.ts` keeps its own copy of the four stage values
 * instead of importing `EDITORIAL_STAGE_VALUES` from
 * `get.posts.dto.ts` — that file carries `class-validator` decorators, and
 * pulling it into the frontend's copy module breaks every test harness that
 * renders a component from that file without a decorator-aware transpile
 * step (see the comment in `editorial-stage.copy.ts`).
 *
 * The tradeoff only holds if this test keeps the two lists honest. If a
 * fifth stage is ever added on one side and not the other, this is the
 * thing that has to turn red.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const server = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/posts/get.posts.dto.ts',
  {},
  { resolve: (request) => (request === 'class-validator' ? undefined : undefined) }
);

const frontend = loadTypeScriptModule(
  'apps/frontend/src/components/launches/editorial-stage.copy.ts'
);

describe('the frontend stage list matches the server contract', () => {
  test('same four values, same order', () => {
    expect(frontend.EDITORIAL_STAGE_VALUES).toEqual(server.EDITORIAL_STAGE_VALUES);
  });

  test('the frontend copy has a label for every one of them, in both languages', () => {
    for (const stage of server.EDITORIAL_STAGE_VALUES) {
      expect(typeof frontend.editorialStageCopy.ru[stage]).toBe('string');
      expect(typeof frontend.editorialStageCopy.en[stage]).toBe('string');
    }
  });

  test('the required Russian product copy is exactly this, not a paraphrase', () => {
    expect(frontend.editorialStageCopy.ru).toMatchObject({
      PLAN: 'План',
      DRAFT: 'Пишется',
      REVIEW: 'Проверка',
      SCHEDULED: 'Расписание',
    });
  });

  // The calendar card prints the delivery state above the stage pill:
  // `{state === 'DRAFT' ? t('draft', 'Draft') + ': ' : ''}` (calendar.tsx).
  // Shipped once with the stage also called «Черновик»/"Draft", the card read
  // "Stage: Draft" directly above "Draft:" — one word, two meanings, one line
  // apart. It took opening the page in a browser to see it, because every
  // test here asserts whatever label it is handed. This is the guard that
  // makes the collision fail in CI instead of on someone's screen.
  describe('no stage is named the same as the delivery state shown beside it', () => {
    const deliveryStateWords = ['draft', 'черновик'];

    test.each(['ru', 'en'])('%s', (locale) => {
      for (const stage of frontend.EDITORIAL_STAGE_VALUES) {
        const label = frontend.editorialStageCopy[locale][stage].toLowerCase();
        expect(deliveryStateWords).not.toContain(label);
      }
    });
  });
});
