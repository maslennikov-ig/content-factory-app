const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { sentenceChanges } = loadTypeScriptModule('apps/frontend/src/components/content-intelligence/pieces/core-answer-diff.tsx');
const { hasOwnDetail } = loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/pieces/core-questions.ts');
const { readBrief, readIntakeEvent, buildIntakePayload } = loadTypeScriptModule('apps/frontend/src/components/content-intelligence/intake/intake.adapter.ts');

test.each(['foreign_post', 'link'])('input origin is not own evidence for %s', (inputKind) => {
  expect(hasOwnDetail({ inputKind, facts: [{ origin: 'input' }] })).toBe(false);
  expect(hasOwnDetail({ inputKind, facts: [{ origin: 'person' }] })).toBe(true);
});
test('a thought brought by the person is still their own detail', () => {
  expect(hasOwnDetail({ inputKind: 'thought', facts: [{ origin: 'input' }] })).toBe(true);
});
test('sentence diff preserves exact text and only marks added or changed sentences', () => {
  const before = 'Первая строка без точки\nВторое предложение. Третье!';
  const body = 'Первая строка без точки\nВторое изменилось. Третье!\nЕщё одно?';
  const parts = sentenceChanges(before, body);
  expect(parts.map((part) => part.text).join('')).toBe(body);
  expect(parts.filter((part) => part.changed).map((part) => part.text.trim())).toEqual(['Второе изменилось.', 'Ещё одно?']);
  expect(sentenceChanges(body, body).some((part) => part.changed)).toBe(false);
});
test('heartbeat is invisible and V2 intake cannot send channels', () => {
  expect(readIntakeEvent('{"name":"heartbeat"}')).toBeNull();
  expect(buildIntakePayload({ input: 'Текст мысли', language: 'ru', integrationIds: ['old-channel'] }).integrationIds).toBeUndefined();
});
test('mixed source identity survives brief parsing', () => {
  const inputSources = [{ kind: 'foreign_post' }, { kind: 'link', url: 'https://example.test/post', evidenceId: 'e-1' }];
  expect(readBrief({ inputKind: 'foreign_post', inputSources }).inputSources).toEqual(inputSources);
});
