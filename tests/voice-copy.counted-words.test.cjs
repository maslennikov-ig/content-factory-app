'use strict';

/**
 * `content-factory-next-fn33.54`: a Russian sentence that counts something has
 * to choose the word.
 *
 * The empty avatar screen said «Сбор уже начат: 8 образцов · 21 184 знаков»:
 * the sample count picked its own word through a copy of the rule written by
 * hand, and the character count did not pick one at all. Both go through the
 * repository's one helper now, and this holds the three forms of each.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const copy = loadTypeScriptModule(
  'apps/frontend/src/components/brand-voice/voice-copy.ts'
);
const { voiceCopy } = copy;

const collected = (samples, characters) =>
  voiceCopy.ru.emptyCollected(samples, characters);

test('the sample count chooses its word', () => {
  expect(collected(1, 100)).toContain('1 образец');
  expect(collected(3, 100)).toContain('3 образца');
  expect(collected(8, 100)).toContain('8 образцов');
  expect(collected(11, 100)).toContain('11 образцов');
  expect(collected(21, 100)).toContain('21 образец');
});

test('the character count chooses its word too', () => {
  // The number itself is grouped the way Russian groups it, with a
  // non-breaking space, so the expectation is built the same way rather than
  // typed with an ordinary space that would never match.
  const grouped = (value) => value.toLocaleString('ru-RU');

  // The one from the walkthrough: 21 184 ends in 4 and takes «знака».
  expect(collected(8, 21184)).toContain(`${grouped(21184)} знака`);
  expect(collected(8, 1)).toContain('1 знак.');
  expect(collected(8, 8600)).toContain(`${grouped(8600)} знаков`);
  expect(collected(8, 111)).toContain('111 знаков');
});
