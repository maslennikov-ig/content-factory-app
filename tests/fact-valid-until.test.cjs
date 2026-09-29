'use strict';

/**
 * «Свежо до» is one rule for the fact form and the chat
 * (`content-factory-next-kcxz.43`, owner 28.09.2026): the named day is the
 * last day a fact holds, whole, in the person's time zone. The shared
 * function (`fact-valid-until.ts`), both callers — the form's payload
 * builder and `facts.add` — and the read back to the same day.
 */

const path = require('node:path');
const fs = require('node:fs');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadTypeScriptModule: loadTsx } = require('./helpers/load-tsx.cjs');
const {
  IDENTITY,
  loadRegistry,
  servicesFrom,
  requestContextFor,
  executeTool,
  root,
} = require('./helpers/agent-capabilities.cjs');

const shared = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/context/fact-valid-until.ts'
);
const adapter = loadTsx(
  'apps/frontend/src/components/content-intelligence/content-facts.adapter.ts'
);

describe('the shared rule', () => {
  test('the named day ends at its last moment in the zone', () => {
    expect(shared.factValidUntilMoment('2027-12-31', 'Europe/Moscow')).toBe(
      '2027-12-31T20:59:59.999Z'
    );
    expect(shared.factValidUntilMoment('2027-12-31', 'UTC')).toBe('2027-12-31T23:59:59.999Z');
  });

  test('a zone behind UTC: the stored moment falls on the next UTC date, still the named day there', () => {
    const moment = shared.factValidUntilMoment('2027-12-31', 'America/Los_Angeles');
    expect(moment).toBe('2028-01-01T07:59:59.999Z');
    expect(shared.factValidUntilDay(moment, 'America/Los_Angeles')).toBe('2027-12-31');
  });

  test('round trip: the stored moment reads back as the day named, never the next', () => {
    const zones = ['UTC', 'Europe/Moscow', 'Asia/Tokyo', 'America/Los_Angeles', 'Asia/Kolkata', 'America/Santiago', 'America/Havana'];
    // 25.10.2026 is a summer-time switch in Berlin; 08.03.2026 in Los Angeles.
    const days = ['2026-10-25', '2026-03-08', '2027-02-28', '2028-02-29', '2027-12-31', '2026-09-05', '2026-04-04', '2026-03-07'];
    for (const zone of zones.concat('Europe/Berlin')) {
      for (const day of days) {
        const moment = shared.factValidUntilMoment(day, zone);
        expect(shared.factValidUntilDay(moment, zone)).toBe(day);
        // One millisecond later is the next day there.
        const after = new Date(Date.parse(moment) + 1).toISOString();
        expect(shared.factValidUntilDay(after, zone)).not.toBe(day);
      }
    }
  });

  test('where summer time starts or ends at midnight the day still ends at its true last moment (review F1)', () => {
    // Chile: 5 → 6 Sept 2026 the clock jumps from 23:59:59 (-04) to 01:00 (-03).
    expect(shared.factValidUntilMoment('2026-09-05', 'America/Santiago')).toBe('2026-09-06T03:59:59.999Z');
    // Cuba: 7 → 8 March 2026, 00:00 (-05) becomes 01:00 (-04).
    expect(shared.factValidUntilMoment('2026-03-07', 'America/Havana')).toBe('2026-03-08T04:59:59.999Z');
    // Chile back: 23:00–23:59 of 4 April happen twice; the day ends after the second.
    expect(shared.factValidUntilMoment('2026-04-04', 'America/Santiago')).toBe('2026-04-05T03:59:59.999Z');
    const personTime = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/person-time.ts');
    expect(personTime.localDayStart('2026-09-06', 'America/Santiago').toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(personTime.localDayStart('2026-09-27', 'Europe/Moscow').toISOString()).toBe('2026-09-26T21:00:00.000Z');
  });

  test('one check before a day is stored: not a day, or already over in the zone (review F4)', () => {
    const now = new Date('2026-09-28T22:30:00.000Z'); // 29.09 01:30 in Moscow, 28.09 in UTC
    expect(shared.factDayProblem('2026-09-28', 'Europe/Moscow', now)).toBe('past');
    expect(shared.factDayProblem('2026-09-28', 'UTC', now)).toBeNull();
    expect(shared.factDayProblem('2026-09-29', 'Europe/Moscow', now)).toBeNull();
    expect(shared.factDayProblem('2026-02-30', 'UTC', now)).toBe('invalid');
  });

  test('one zone fallback for the form and the chat (review F5)', () => {
    const personTime = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/person-time.ts');
    expect(personTime.firstKnownZone('Europe/Moscow', 'Asia/Tokyo')).toBe('Europe/Moscow');
    expect(personTime.firstKnownZone('Mars/Olympus', 'Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(personTime.firstKnownZone('', undefined)).toBe('');
    const layout = fs.readFileSync(path.join(root, 'apps/frontend/src/components/layout/set.timezone.tsx'), 'utf8');
    expect(layout).toContain('return firstKnownZone(profile, browser);');
    // The chat's header and the form read the same helper.
    const transport = fs.readFileSync(path.join(root, 'apps/frontend/src/components/agents/agent.transport.ts'), 'utf8');
    expect(transport).toContain('export { screenTimeZone };');
  });

  test('what is not a calendar day is not a moment', () => {
    for (const day of ['2027-02-30', '2027-13-01', '31.12.2027', '', 'tomorrow']) {
      expect(shared.factValidUntilMoment(day, 'Europe/Moscow')).toBeNull();
    }
    expect(shared.factValidUntilDay(null, 'UTC')).toBeNull();
    expect(shared.factValidUntilDay('not a date', 'UTC')).toBeNull();
  });

  test('a row the form stored before (00:00 UTC, not migrated): ahead of UTC it shows the named day, behind it the day before (review F3)', () => {
    expect(shared.factValidUntilDay('2027-12-31T00:00:00.000Z', 'Europe/Moscow')).toBe('2027-12-31');
    expect(shared.factValidUntilDay('2027-12-31T00:00:00.000Z', 'America/Los_Angeles')).toBe(
      '2027-12-30'
    );
  });
});

describe('the fact form', () => {
  const draft = (freshUntil) => ({
    claimKey: '',
    statement: 'Скидка действует до конца года',
    language: 'ru',
    valueText: '',
    temporalKind: 'CURRENT',
    effectiveFrom: '',
    effectiveTo: '',
    freshUntil,
  });

  test('«Свежо до» travels as the day’s last moment in the screen’s zone', () => {
    expect(adapter.buildFactCreatePayload(draft('2027-12-31'), 'America/Los_Angeles').freshUntil).toBe(
      shared.factValidUntilMoment('2027-12-31', 'America/Los_Angeles')
    );
    expect(adapter.buildFactCreatePayload(draft(' 2027-12-31 '), 'Europe/Moscow').freshUntil).toBe(
      '2027-12-31T20:59:59.999Z'
    );
  });

  test('an empty field sends no date', () => {
    expect(adapter.buildFactCreatePayload(draft(''), 'Europe/Moscow')).not.toHaveProperty('freshUntil');
  });

  test('the form sends the calendar’s zone, as the chat does', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/content-intelligence/content-facts.container.tsx'),
      'utf8'
    );
    expect(source).toContain('const zone = screenTimeZone();');
    expect(source).toContain('buildFactCreatePayload(draft, zone)');
    expect(source).toContain("from '@contentfactory/frontend/components/layout/set.timezone'");
  });
});

describe('the chat’s facts.add', () => {
  const registry = loadRegistry();
  const capability = registry.CAPABILITY_CATALOGUE.find((entry) => entry.id === 'facts.add');

  const run = async (validUntil, timeZone) => {
    const written = [];
    const service = {
      addFact: async (_organizationId, _userId, input) => {
        written.push(input);
        return {
          existed: false,
          fact: {
            id: 'fact-1',
            statement: input.statement,
            claimKey: input.claimKey,
            status: 'VERIFIED',
            verifiedAt: '2026-09-28T10:00:00.000Z',
            freshUntil: input.freshUntil ?? null,
          },
        };
      },
    };
    const tool = registry.buildCapabilityTool(capability, {
      services: servicesFrom({ ContentFactService: service }),
      language: 'ru',
      entrance: 'chat',
    });
    const { output } = await executeTool(
      tool,
      { statement: 'Скидка действует до конца года', validUntil },
      { requestContext: requestContextFor(registry, { ...IDENTITY, timeZone }) }
    );
    return { output, written };
  };

  test('stores the same moment the form does and answers the day named', async () => {
    const { output, written } = await run('2027-12-31', 'America/Los_Angeles');
    expect(written[0].freshUntil).toBe(
      adapter.buildFactCreatePayload(
        {
          claimKey: '',
          statement: 'x',
          language: 'ru',
          valueText: '',
          temporalKind: 'CURRENT',
          effectiveFrom: '',
          effectiveTo: '',
          freshUntil: '2027-12-31',
        },
        'America/Los_Angeles'
      ).freshUntil
    );
    expect(written[0].temporalKind).toBe('CURRENT');
    expect(output.summary.validUntil).toBe('2027-12-31');
  });

  test('a day that is not a day is refused before anything is written', async () => {
    const { output, written } = await run('2027-02-30', 'Europe/Moscow');
    expect(written).toEqual([]);
    expect(output).toMatchObject({ ok: false, code: 'FACT_DATE_INVALID' });
  });
});
