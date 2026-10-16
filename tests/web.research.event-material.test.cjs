const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { researchEventMaterial } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/research-event-material.ts'
);
const intent = {
  timezone: 'Europe/Moscow',
  eventInterval: { start: '2026-10-08T21:00:00.000Z', end: '2026-10-16T09:00:00.000Z' },
};

test.each(['October 9, 2026', '9 октября 2026', '2026-10-09', '09.10.2026'])(
  'selects an existing dated event section with %s without splicing source text', (date) => {
    const section = `${date}\n\nA capability became available. Its behavior and limitations are documented here.`;
    const text = `October 20, 2026\nFuture event.\n\n${section}\n\nOctober 2, 2026\nOld event.`;
    expect(researchEventMaterial(text, intent, 48_000)).toBe(section);
    expect(text).toContain(researchEventMaterial(text, intent, 48_000));
  }
);

test('never supplies a missing year or substitutes publication metadata for an event date', () => {
  expect(researchEventMaterial('October 14\nProduct changes.', intent, 48_000)).toBeUndefined();
  expect(researchEventMaterial('Published 2024-01-01. A rolling archive of changes.', intent, 48_000)).toBeUndefined();
  expect(researchEventMaterial('An undated event became available.', intent, 48_000)).toBeUndefined();
});

test('keeps multiple adjacent eligible sections and stops at the old dated section', () => {
  const selected = 'October 14, 2026\nFirst release.\n\nOctober 10, 2026\nSecond release.';
  expect(researchEventMaterial(`${selected}\n\nOctober 8, 2026\nOld release.`, intent, 48_000)).toBe(selected);
});

test('uses a bounded scan and retains prose around an inline event date', () => {
  const section = 'The product changed on October 14, 2026. This paragraph states what became available.';
  const text = `Unrelated background.\n\n${section}`;
  expect(researchEventMaterial(text, intent, 48_000)).toBe(section);
  expect(researchEventMaterial(text, intent, 20)).toBeUndefined();
});


test.each(['Published October 15, 2026.', 'Updated: October 15, 2026', 'Опубликовано: 15 октября 2026'])('ignores metadata date %s before a later event section', (metadata) => {
  const event = 'October 14, 2026\nOrbit launched with a team workspace and documented constraints.';
  const source = `${metadata}\n\n${'Background without an event date. '.repeat(300)}\n\n${event}`;
  expect(researchEventMaterial(source, intent, 48_000)).toBe(event);
  expect(researchEventMaterial(`${metadata}\n\nUndated background.`, intent, 48_000)).toBeUndefined();
});
