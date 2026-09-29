'use strict';

/**
 * W4 live walk 29.09.2026, P3-D: the facts door stored a fact «свежо до» a
 * day already over (201, out of date at once). The form and the chat refuse
 * the day before they build the moment (`factDayProblem`); the service now
 * refuses the moment for every caller (`factMomentOver`, the same shared file).
 */
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const CONTEXT = 'libraries/nestjs-libraries/src/content-intelligence/context';
const mocks = {
  '@nestjs/common': { Injectable: () => (target) => target, Inject: () => () => undefined, Optional: () => () => undefined },
};
const { ContentFactService } = loadTypeScriptModule(`${CONTEXT}/content-fact.service.ts`, mocks);
const shared = loadTypeScriptModule(`${CONTEXT}/fact-valid-until.ts`);

const serviceOver = () => {
  const created = [];
  const repository = {
    findFactByDedupeKey: async () => null,
    createFact: async (_org, _user, record) => {
      created.push(record);
      return { id: 'f1', ...record };
    },
  };
  return { service: new ContentFactService(repository), created };
};

const fact = (freshUntil) => ({
  claimKey: 'тариф',
  statement: 'Тариф «Команда» стоит 990 ₽',
  language: 'ru',
  valueText: 'Тариф «Команда» стоит 990 ₽',
  temporalKind: 'CURRENT',
  freshUntil,
});

describe('the door refuses a «Свежо до» already over', () => {
  test('a past moment is refused with the product code and words; nothing is written', async () => {
    const { service, created } = serviceOver();
    const past = shared.factValidUntilMoment('2026-09-01', 'Europe/Moscow');
    await expect((async () => service.createFact('org-1', 'user-1', fact(past)))()).rejects.toMatchObject({
      code: 'CONTENT_CONTEXT_INPUT_INVALID',
      status: 422,
      // In the fact's language (walk recheck P3-b): this one is Russian.
      message: expect.stringMatching(/уже прошёл/),
    });
    await expect(
      (async () => service.createFact('org-1', 'user-1', { ...fact(past), language: 'en' }))()
    ).rejects.toMatchObject({ message: expect.stringMatching(/already over/) });
    await expect(service.addFact('org-1', 'user-1', fact(past))).rejects.toMatchObject({
      code: 'CONTENT_CONTEXT_INPUT_INVALID',
    });
    expect(created).toEqual([]);
  });

  test('today’s last moment and a later day are stored', async () => {
    const { service, created } = serviceOver();
    const today = shared.factToday('Europe/Moscow');
    await service.createFact('org-1', 'user-1', fact(shared.factValidUntilMoment(today, 'Europe/Moscow')));
    await service.createFact('org-1', 'user-1', fact('2099-12-31T20:59:59.999Z'));
    expect(created).toHaveLength(2);
  });

  test('the shared check: over only when the moment has passed', () => {
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(shared.factMomentOver(new Date('2026-09-29T11:59:59.999Z'), now)).toBe(true);
    expect(shared.factMomentOver(new Date('2026-09-29T20:59:59.999Z'), now)).toBe(false);
  });
});
