'use strict';

/**
 * The plan's words (`content-factory-next-kcxz.15`): what the agent says about
 * a busy queue is what the calendar says (`post-save-error.ts`,
 * `cf_queue_busy_refusal`), and a time is said in the person's saved zone.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadRegistry } = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const locale = (language) =>
  JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        `../libraries/react-shared-libraries/src/translation/locales/${language}/translation.json`
      ),
      'utf8'
    )
  );

describe('the plan speaks as the screens do', () => {
  test.each(['ru', 'en'])('CF_QUEUE_BUSY in %s is the calendar’s sentence', (language) => {
    expect(registry.CF_QUEUE_BUSY_WORDS[language]).toBe(locale(language).cf_queue_busy_refusal);
  });

  test.each(['ru', 'en'])('POST_STATE_CHANGED in %s starts as the calendar’s sentence (kcxz.30)', (language) => {
    const calendar = locale(language).post_state_changed_refusal;
    const agent = registry.POST_STATE_CHANGED_WORDS[language];
    const head = (text) => text.split(/(?<=\.)\s/u)[0];
    expect(head(agent)).toBe(head(calendar));
  });

  test('a time is said in the person’s zone, with its offset at that moment', () => {
    expect(registry.localTime('2031-03-04T07:00:00.000Z', 'Europe/Moscow', 'ru')).toBe('вт 04.03 10:00 (UTC+3)');
    expect(registry.localTime('2031-03-04T07:00:00.000Z', 'Europe/Moscow', 'en')).toBe('Tue 04.03 10:00 (UTC+3)');
    expect(registry.localTime('2031-03-04T07:00:00.000Z', 'Asia/Kolkata', 'ru')).toBe('вт 04.03 12:30 (UTC+5:30)');
    // Summer time from Intl, not a fixed offset: Berlin is +1 in winter, +2 in summer.
    expect(registry.localTime('2031-01-15T09:00:00.000Z', 'Europe/Berlin', 'ru')).toBe('ср 15.01 10:00 (UTC+1)');
    expect(registry.localTime('2031-07-15T09:00:00.000Z', 'Europe/Berlin', 'ru')).toBe('вт 15.07 11:00 (UTC+2)');
    // The saved standard offset is a fixed zone; an unusable zone reads as UTC.
    expect(registry.timeZoneOfOffset(180)).toBe('+03:00');
    expect(registry.timeZoneOfOffset(0)).toBe('UTC');
    expect(registry.timeZoneOfOffset(10_000)).toBeNull();
    expect(registry.localTime('2031-03-04T07:00:00.000Z', 'Nowhere/Else', 'ru')).toBe('вт 04.03 07:00 (UTC)');
    expect(registry.localTime('not a date', 'Europe/Moscow', 'ru')).toBeNull();
    // A day of the calendar starts at the zone's midnight, across a switch too.
    expect(registry.localDayStart('2031-03-30', 'Europe/Berlin').toISOString()).toBe('2031-03-29T23:00:00.000Z');
    expect(registry.localDayStart('2031-03-31', 'Europe/Berlin').toISOString()).toBe('2031-03-30T22:00:00.000Z');
  });

  test('the door’s rule: the header when Intl knows it, else the saved offset, else UTC', () => {
    expect(registry.agentTimeZone('Europe/Moscow', 0)).toBe('Europe/Moscow');
    expect(registry.agentTimeZone('Mars/Olympus', 180)).toBe('+03:00');
    expect(registry.agentTimeZone('', undefined)).toBe('UTC');
    expect(registry.agentTimeZone(undefined, null)).toBe('UTC');
  });

  test('a card state follows the stored adaptation', () => {
    expect(registry.slotStateOf({ id: 'a', state: 'queued' })).toBe('scheduled');
    expect(registry.slotStateOf({ id: 'a', state: 'published' })).toBe('published');
    expect(registry.slotStateOf({ id: 'a', state: 'draft', plan: { status: 'reserved' } })).toBe('reserve');
    expect(registry.slotStateOf({ id: 'a', state: 'draft', plan: null })).toBe('draft');
  });

  test('no plan input outside the confirm class can carry a firm date’s or a queue’s value', () => {
    for (const capability of registry.CAPABILITY_CATALOGUE.filter(
      (one) => one.group === 'plan' && one.risk !== 'confirm'
    )) {
      expect({ id: capability.id, findings: registry.outboundFindings(capability.input) }).toEqual({
        id: capability.id,
        findings: [],
      });
    }
    // The confirm inputs are taken verbatim: nothing trims, defaults or transforms them.
    for (const capability of registry.CAPABILITY_CATALOGUE.filter(
      (one) => one.group === 'plan' && one.risk === 'confirm'
    )) {
      expect({ id: capability.id, findings: registry.rewritingFindings(capability.input) }).toEqual({
        id: capability.id,
        findings: [],
      });
    }
  });
});
