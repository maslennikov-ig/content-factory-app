'use strict';

/**
 * Every instruction Content Factory sends to a model is English
 * (`content-factory-next-97dq.97`, owner request of 25.09.2026); the model
 * still writes its output in the content language. Data the prompt carries —
 * the person's words, a stored post, a catalogue of forbidden phrases — stays
 * in its own language, so a check has to take the data out before it looks.
 *
 * `cyrillicOutsideData(prompt, data)` removes every fenced block
 * (`--- BLOCK START ---` … `--- BLOCK END ---`) and every string in `data`,
 * and returns the Cyrillic runs that are left, each with a little context.
 * An empty array means the instructions are English.
 */

const CYRILLIC = /[А-Яа-яЁё][А-Яа-яЁё\s«»,.:;!?—-]*/gu;

const withoutFences = (text) =>
  text.replace(/--- BLOCK START ---[\s\S]*?--- BLOCK END ---/gu, '');

const cyrillicOutsideData = (prompt, data = []) => {
  let rest = withoutFences(String(prompt));
  for (const item of [...data]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .sort((a, b) => b.length - a.length)) {
    rest = rest.split(item).join(' ');
  }
  const found = [];
  for (const match of rest.matchAll(CYRILLIC)) {
    const start = Math.max(0, match.index - 40);
    found.push(rest.slice(start, match.index + match[0].length + 20).trim());
  }
  return found;
};

module.exports = { cyrillicOutsideData };
