'use strict';

/**
 * Разбивка NDJSON на строки, вынутая из `store.ts` и проверенная отдельно.
 *
 * `content-factory-next-tu3k.4`. Стрим приходит кусками, которые к строкам
 * никакого отношения не имеют: одно событие может приехать тремя чтениями, а
 * одно чтение принести полторы строки. Вся работа модуля — не отдать
 * потребителю половину строки и не потерять хвост, который пришёл без
 * перевода строки в конце.
 *
 * Проверяется здесь именно это, а не то, что события правильные: смысл им
 * придаёт потребитель, и у него свои наборы.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const { createNdjsonSplitter } = loadTypeScriptModule(
  'apps/frontend/src/components/new-launch/ndjson.ts'
);

const collect = (chunks, { finish = true } = {}) => {
  const lines = [];
  const splitter = createNdjsonSplitter((line) => lines.push(line));
  for (const chunk of chunks) splitter.push(chunk);
  if (finish) splitter.finish();
  return lines;
};

test('whole lines in one chunk come out one by one', () => {
  expect(collect(['a\nb\nc\n'])).toEqual(['a', 'b', 'c']);
});

test('a line split across three chunks is delivered once, whole', () => {
  expect(collect(['{"na', 'me":"dr', 'aft"}\n'])).toEqual(['{"name":"draft"}']);
});

test('the tail without a newline waits, and finish() releases it', () => {
  const lines = [];
  const splitter = createNdjsonSplitter((line) => lines.push(line));
  splitter.push('one\ntwo');
  // Пока хвост не дописан, отдавать его нельзя: следующий кусок может его
  // продолжить, и потребитель получил бы половину события.
  expect(lines).toEqual(['one']);
  splitter.finish();
  expect(lines).toEqual(['one', 'two']);
});

test('a stream that ends exactly on a newline leaves no empty tail', () => {
  expect(collect(['one\ntwo\n'])).toEqual(['one', 'two']);
});

test('finish() twice does not repeat the tail', () => {
  const lines = [];
  const splitter = createNdjsonSplitter((line) => lines.push(line));
  splitter.push('only');
  splitter.finish();
  splitter.finish();
  expect(lines).toEqual(['only']);
});

test('blank lines between events are passed through, not swallowed', () => {
  // Решение о пустой строке принадлежит потребителю: у генератора она
  // пропускается в `consumeLine`, у входа — в `readIntakeEvent`. Разбивка о
  // смысле строки ничего не знает.
  expect(collect(['a\n\nb\n'])).toEqual(['a', '', 'b']);
});

test('the splitter is what `store.ts` uses, not a second copy of the same code', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const store = fs.readFileSync(
    path.resolve(__dirname, '..', 'apps/frontend/src/components/new-launch/store.ts'),
    'utf8'
  );
  expect(store).toContain('createNdjsonSplitter');
  // Прежний буфер ушёл вместе с работой: строка `buffer.split('\n')` в
  // `store.ts` означала бы, что копий снова две.
  expect(store).not.toContain("buffer.split('\\n')");
});
