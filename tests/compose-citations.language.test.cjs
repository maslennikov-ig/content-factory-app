'use strict';

/**
 * `content-factory-next-fn33.28.13`: блок «Использованные цитаты» говорит на
 * языке человека, который пишет пост.
 *
 * Две поломки в одном блоке. Строка выбора начиналась английским словом —
 * `${citation.kind === 'FACT' ? 'Fact' : 'Source'} · ...` было зашито прямо в
 * разметке, поэтому на русском экране выходило «Source · Занятость в регионе
 * выросла на 4%», хотя заголовок и пояснение рядом переводились. А пояснение,
 * переводясь, говорило «выданные сервером»: слово из устройства, а не из
 * работы человека.
 *
 * Проверяется здесь то, что переживёт правку разметки: подписи берутся из
 * локалей, они есть во всех шестнадцати, и в тексте не осталось языка
 * устройства.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const EDITOR = 'apps/frontend/src/components/new-launch/editor.tsx';
const LOCALES = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);

const source = fs.readFileSync(path.join(root, EDITOR), 'utf8');

/** Разметка без комментариев: файл вправе объяснять себя свободно. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const bundle = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES, locale, 'translation.json'), 'utf8')
  );

const KEYS = ['used_citations', 'used_citations_help', 'citation_kind_fact', 'citation_kind_source'];

describe('the citation list speaks the language of the window', () => {
  test('the kind of a citation is a translated word, not one wired into the markup', () => {
    expect(code).toMatch(/t\('citation_kind_fact', 'Fact'\)/);
    expect(code).toMatch(/t\('citation_kind_source', 'Source'\)/);
    // Прежняя склейка ушла целиком, а не осталась запасной веткой.
    expect(code).not.toMatch(/\? 'Fact' : 'Source'/);
  });

  test('every label of the block exists in all sixteen locales', () => {
    const missing = [];
    for (const locale of fs.readdirSync(LOCALES)) {
      const strings = bundle(locale);
      for (const key of KEYS) {
        if (typeof strings[key] !== 'string' || !strings[key].trim()) {
          missing.push(`${locale}/${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('the Russian block is Russian all the way through', () => {
    const ru = bundle('ru');
    for (const key of KEYS) {
      // Ни одного английского слова в четыре буквы и длиннее.
      expect(ru[key]).toMatch(/[А-Яа-я]/);
      expect(ru[key]).not.toMatch(/[A-Za-z]{4}/);
    }
  });

  test('the help line no longer explains the machine to the writer', () => {
    // «Выданные сервером» — про то, откуда взялась запись, а не про то, что
    // человеку сделать. Ни в одной локали этого больше нет.
    const machine = [
      /выданные сервером/i,
      /server-issued/i,
      /сервер/i,
      /server/i,
    ];
    const offenders = [];
    for (const locale of fs.readdirSync(LOCALES)) {
      const help = bundle(locale).used_citations_help || '';
      if (machine.some((pattern) => pattern.test(help))) {
        offenders.push(locale);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the help line still tells the person what to do', () => {
    // Не просто «убрали слово»: строка осталась указанием к действию.
    expect(bundle('en').used_citations_help).toMatch(/^Mark which/);
    expect(bundle('ru').used_citations_help).toMatch(/^Отметьте/);
  });
});
