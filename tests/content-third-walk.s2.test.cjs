'use strict';
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { textOrNull, contentFromIntent, intakeDiscardDiagnostic } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/intake-content.ts');
const { parseWritingProfile } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts');
const { selectedFactsBrief } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/pieces/piece-facts.v2.ts');
const { unavoidableQuestionV2 } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/channels/channel-question.v2.ts');
const { protectedFragments, judgeLengthTrim, checkPostLength } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-length.ts');
const { extractionSchemaV2 } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/intake.prompts.v2.ts');

test.each([':null,', '\"none\"', ':undefined,', ' n/a ', '«нет»'.replace(/[«»]/g, '"'), 'null'])('reject placeholder %s', (value) => expect(textOrNull(value)).toBeNull());
test('does not remove meaningful negatives or null terminology', () => {
  expect(textOrNull('Нет данных за июнь')).toBe('Нет данных за июнь');
  expect(textOrNull('null — значение JSON')).toBe('null — значение JSON');
});
test.each(['Хочу написать про ошибки ИИ.', 'Я бы хотел в этот раз написать об опасности развития ИИ.', 'Давай про дедлайны.', 'I would like to write about mistakes.'])('intent is not source prose: %s', (intent) => {
  expect(contentFromIntent(`${intent}\nИз шести сроков сдвинулись пять.`)).toBe('Из шести сроков сдвинулись пять.');
});
test('missing extracted topic and angle are valid nulls', () => {
  expect(extractionSchemaV2.safeParse({ topic: null, angle: null, structure: [], claims: [] }).success).toBe(true);
});
test('old emoji free keeps its many meaning, while auto survives every field', () => {
  expect(parseWritingProfile({ emojiLevel: 'free' }, 'telegram', 'ru').emojiLevel).toBe('many');
  const profile = parseWritingProfile({ lengthPolicy: 'auto', emojiLevel: 'auto', linkPolicy: 'auto', hashtagPolicy: 'auto', ctaKind: 'auto', formatPreference: 'auto' }, 'telegram', 'ru');
  for (const field of ['lengthPolicy', 'emojiLevel', 'linkPolicy', 'hashtagPolicy', 'ctaKind', 'formatPreference']) expect(profile[field]).toBe('auto');
  expect(profile.version).toBe('channel-writing-profile/v2');
  expect(profile.output).toBeUndefined();
});
test('found facts require explicit selection, including verified facts', () => {
  const own = { statement: 'Мой пример', origin: 'person', verified: false };
  const found = { statement: 'Нашёл поиск', origin: 'search', kind: 'found', verified: true, selected: false };
  const brief = { inputKind: 'thought', facts: [own, found] };
  expect(selectedFactsBrief(brief).facts).toEqual([own]);
  expect(selectedFactsBrief({ ...brief, facts: [own, { ...found, selected: true }] }).facts).toHaveLength(2);
  expect(brief.facts).toHaveLength(2);
});
test('an adaptation question requires both automatic field and unavoidable reason', () => {
  const profile = parseWritingProfile({ ctaKind: 'auto' }, 'telegram', 'ru');
  const question = { unavoidable: true, field: 'ctaKind', question: 'Принимаете заявки или набор закрыт?', why: 'Нельзя приглашать в закрытый набор.', options: ['Принимаем', 'Закрыт'] };
  expect(unavoidableQuestionV2(question, profile)).toMatchObject({ key: 'cta', question: question.question, why: question.why });
  expect(unavoidableQuestionV2({ ...question, unavoidable: false }, profile)).toBeNull();
  expect(unavoidableQuestionV2({ ...question, why: '' }, profile)).toBeNull();
  expect(unavoidableQuestionV2(question, { ...profile, ctaKind: 'none' })).toBeNull();
});
test('shortening cannot erase configured emoji, including composed emoji', () => {
  const original = 'Важно 🔎 Сначала проверяем цифры. Потом считаем сроки. Пишет 👩🏽‍💻 команда.';
  expect(protectedFragments(original)).toEqual(expect.arrayContaining(['🔎', '👩🏽‍💻']));
  const check = checkPostLength(original, { median: 30, low: 10, high: 40 });
  expect(judgeLengthTrim(original, 'Важно Сначала проверяем цифры. Потом считаем сроки.', check).reason).toBe('FRAGMENT_LOST');
});

test('discard diagnostics have a fixed fourteen-day cutoff and omit raw text by default', () => {
  const cutoff = '2026-09-24T00:00:00Z';
  const now = Date.parse('2026-09-10T00:00:00Z');
  const metadata = { operation: 'intake', field: 'thesis' };
  expect(JSON.parse(intakeDiscardDiagnostic('intake', 'thesis', 'null', cutoff, now))).toEqual({ ...metadata, discarded: 'null' });
  for (const instant of [now - 1, Date.parse(cutoff), Date.parse(cutoff) + 1]) {
    expect(JSON.parse(intakeDiscardDiagnostic('intake', 'thesis', 'null', cutoff, instant))).toEqual(metadata);
  }
  for (const invalid of ['', 'invalid']) expect(JSON.parse(intakeDiscardDiagnostic('intake', 'thesis', 'null', invalid, now))).toEqual(metadata);
  expect(JSON.parse(intakeDiscardDiagnostic('intake', 'facts.statement', 'x'.repeat(100), cutoff, now)).discarded).toHaveLength(80);
});
