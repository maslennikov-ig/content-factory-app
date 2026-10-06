'use strict';
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const pure = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/openai/reader-subject-anchors.ts'
);
const request =
  'По состоянию на 1 октября 2026 года: какова действующая ключевая ставка Банка России? Сохрани название ВТБ, если банк упоминается.';
function select(table, quote) {
  for (let i = 0; i < table.parts.length; i++) {
    let text = '';
    for (let j = i; j < table.parts.length; j++) {
      text += table.parts[j][1];
      if (text === quote)
        return { first: table.parts[i][0], last: table.parts[j][0] };
      if (text.length > quote.length) break;
    }
  }
  return null;
}
test('server references preserve requested Russian inflection and names next to punctuation', () => {
  const table = pure.prepareReaderSubjectAnchors(request);
  expect(table.parts.map((p) => p[1]).join('')).toBe(request);
  for (const name of ['Банка России', 'ВТБ']) {
    const span = pure.resolveReaderSubjectAnchor(table, select(table, name));
    expect(span.quote).toBe(name);
    expect(request.slice(span.start, span.end)).toBe(name);
  }
  expect(select(table, 'Банк России')).toBeNull();
  expect(
    pure.resolveReaderSubjectAnchor(table, {
      first: 'Банк России',
      last: 'Банк России',
    })
  ).toBeNull();
});
test('names preserve punctuation, mixed scripts and full emoji without normalization', () => {
  const text = 'Сравни C++, GPT-6, ООО «Альфа» и 🧑‍💻, затем H&M.';
  const table = pure.prepareReaderSubjectAnchors(text);
  for (const name of ['C++', 'GPT-6', 'ООО «Альфа»', '🧑‍💻', 'H&M']) {
    expect(
      pure.resolveReaderSubjectAnchor(table, select(table, name)).quote
    ).toBe(name);
  }
  expect(Object.isFrozen(table)).toBe(true);
  expect(Object.isFrozen(table.parts)).toBe(true);
  expect(table.parts.every(Object.isFrozen)).toBe(true);
});
test('foreign/cloned tables, invented IDs, reversed ranges and extra reference fields fail closed', () => {
  const table = pure.prepareReaderSubjectAnchors(request);
  const ref = select(table, 'Банка России');
  expect(
    pure.resolveReaderSubjectAnchor(structuredClone(table), ref)
  ).toBeNull();
  expect(
    pure.resolveReaderSubjectAnchor(table, { first: 'Qxxxx', last: ref.last })
  ).toBeNull();
  expect(
    pure.resolveReaderSubjectAnchor(table, { first: ref.last, last: ref.first })
  ).toBeNull();
  expect(
    pure.resolveReaderSubjectAnchor(table, { ...ref, quote: 'Банк России' })
  ).toBeNull();
  const get = jest.fn(() => ref.first);
  expect(
    pure.resolveReaderSubjectAnchor(table, {
      get first() {
        return get();
      },
      last: ref.last,
    })
  ).toBeNull();
  expect(get).not.toHaveBeenCalled();
});
test('duplicate names and oversized entity spans are never silently repaired', () => {
  const repeated = pure.prepareReaderSubjectAnchors('ВТБ и ВТБ');
  expect(
    pure.resolveReaderSubjectAnchor(repeated, select(repeated, 'ВТБ'))
  ).toBeNull();
  const long = pure.prepareReaderSubjectAnchors('А'.repeat(81));
  expect(
    pure.resolveReaderSubjectAnchor(long, select(long, 'А'.repeat(81)))
  ).toBeNull();
});
test('full original query bound remains; malformed Unicode and an over-bound query refuse before invocation', () => {
  const text = 'Б'.repeat(5000);
  expect(
    pure
      .prepareReaderSubjectAnchors(text)
      .parts.map((p) => p[1])
      .join('')
  ).toBe(text);
  expect(pure.prepareReaderSubjectAnchors(text + 'Б')).toBeNull();
  expect(pure.prepareReaderSubjectAnchors('\uD83D')).toBeNull();
  expect(pure.prepareReaderSubjectAnchors('')).toBeNull();
});
