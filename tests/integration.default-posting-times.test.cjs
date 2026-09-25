'use strict';

/**
 * The slots a newly connected channel starts with (`2q28.21`, walk s0 item 17).
 *
 * The schema default `postingTimes` is 120/400/700 minutes after UTC midnight,
 * which reads as 05:00, 09:40 and 14:40 in Moscow: with «Бронь» on, the first
 * post booked five in the morning. New channels now get 09:00, 13:00 and 19:00
 * in the person's own time — Moscow when the connect request carries no offset
 * — at creation, in code, with no migration. A reconnected channel keeps its
 * own times: `update` does not write them.
 */

const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const REPOSITORY =
  'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts';

const load = () =>
  loadWithMocks(REPOSITORY, {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({ uploadSimple: jest.fn() }) },
    },
    '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto': {
      IntegrationTimeDto: class {},
    },
    '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto': {
      PlugDto: class {},
    },
    '@contentfactory/nestjs-libraries/services/make.is': {
      makeId: () => 'generated-id',
    },
  });

const hhmm = (minutesUtc, offset) => {
  const local = (((minutesUtc + offset) % 1440) + 1440) % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(
    local % 60
  ).padStart(2, '0')}`;
};

describe('default posting times of a new channel', () => {
  const { defaultPostingTimes } = load();

  test('without an offset the slots are 09:00, 13:00, 19:00 Moscow time', () => {
    for (const missing of [undefined, null, Number.NaN, +undefined]) {
      const times = defaultPostingTimes(missing);
      expect(times).toEqual([{ time: 360 }, { time: 600 }, { time: 960 }]);
      expect(times.map((one) => hhmm(one.time, 180))).toEqual([
        '09:00',
        '13:00',
        '19:00',
      ]);
    }
  });

  test('with the offset the calendar shows, the same hours in that time', () => {
    for (const offset of [180, 300, 0, -300, 600]) {
      const times = defaultPostingTimes(offset);
      for (const one of times) {
        expect(one.time).toBeGreaterThanOrEqual(0);
        expect(one.time).toBeLessThan(1440);
      }
      expect(times.map((one) => hhmm(one.time, offset))).toEqual([
        '09:00',
        '13:00',
        '19:00',
      ]);
    }
  });

  test('never the old five-in-the-morning default', () => {
    expect(defaultPostingTimes(undefined).map((one) => one.time)).not.toContain(120);
  });

  test('create writes the defaults; update leaves an existing channel alone', async () => {
    const { IntegrationRepository } = load();
    const upsert = jest.fn().mockResolvedValue({ id: 'channel-1' });
    const repository = new IntegrationRepository(
      { model: { integration: { upsert } } },
      {},
      {},
      {},
      {},
      {}
    );
    await repository.createOrUpdateIntegration(
      undefined,
      false,
      'org-1',
      'Мой канал',
      undefined,
      'social',
      'tg-1',
      'telegram',
      'token',
      '',
      999,
      'me',
      false,
      undefined,
      Number.NaN
    );
    const call = upsert.mock.calls[0][0];
    expect(JSON.parse(call.create.postingTimes)).toEqual([
      { time: 360 },
      { time: 600 },
      { time: 960 },
    ]);
    expect(call.update).not.toHaveProperty('postingTimes');
  });
});
