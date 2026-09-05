'use strict';

/**
 * `content-factory-next-fn33.28.8`: отказ раздела «Контент» говорит на языке
 * человека.
 *
 * Сервер отвечает `{code, message}`, и `message` у него английский всегда: это
 * строка из `posts.repository.ts` и `content-context.finalize.ts`, написанная
 * для журнала. На русском экране она печаталась дословно, потому что
 * `post-save-error.ts` подставлял её в «Пост не сохранён: {{message}}» как
 * есть. Язык знает только клиент, поэтому текст он и выбирает — по `code`.
 *
 * Этот набор держит три вещи. Каждый код, которым сервер отказывает при
 * сохранении поста, имеет перевод. Перевод есть во всех шестнадцати локалях.
 * И ни в одном переводе не упомянут сам код: человеку он ничего не объясняет.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const LOCALES = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);

const helperSource = read(
  'apps/frontend/src/components/new-launch/post-save-error.ts'
);

/** Таблица кодов, скомпилированная из самого файла: он без импортов. */
const helper = (() => {
  const compiled = require('typescript').transpileModule(helperSource, {
    compilerOptions: { module: 1, target: 7 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', compiled)(module.exports, module);
  return module.exports;
})();

/**
 * Коды, которыми сервер отказывает на пути сохранения поста, собранные из
 * самих источников, а не переписанные сюда руками. Список, набранный руками,
 * устарел бы молча в тот день, когда на сервере появится новый отказ.
 */
const serverRefusalCodes = () => {
  const sources = [
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts',
    'libraries/nestjs-libraries/src/content-intelligence/context/content-context.finalize.ts',
  ];
  const found = new Set();
  for (const relative of sources) {
    for (const match of read(relative).matchAll(/'([A-Z][A-Z0-9_]{6,})'/g)) {
      // Отсеиваем всё, что кодом отказа не является: коды приходят первым
      // аргументом рядом со статусом, поэтому проверяем соседство с числом.
      const tail = read(relative).slice(
        read(relative).indexOf(match[0]) + match[0].length
      );
      if (/^,\s*\d{3},/.test(tail)) found.add(match[1]);
    }
  }
  return found;
};

describe('every refusal the server can send has words in the window language', () => {
  test('the codes the window knows cover the ones the server sends', () => {
    const known = new Set(Object.keys(helper.POST_SAVE_REFUSAL_COPY));
    const sent = serverRefusalCodes();

    expect(sent.size).toBeGreaterThan(0);
    expect([...sent].filter((code) => !known.has(code))).toEqual([]);
  });

  test('every key of the table exists in all sixteen locales', () => {
    const entries = Object.values(helper.POST_SAVE_REFUSAL_COPY);
    expect(entries.length).toBeGreaterThan(0);

    const missing = [];
    for (const locale of fs.readdirSync(LOCALES)) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(LOCALES, locale, 'translation.json'), 'utf8')
      );
      for (const { key } of entries) {
        if (typeof bundle[key] !== 'string' || !bundle[key].trim()) {
          missing.push(`${locale}/${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  test('no translation prints the error code at a person', () => {
    const entries = Object.entries(helper.POST_SAVE_REFUSAL_COPY);
    const offenders = [];
    for (const locale of fs.readdirSync(LOCALES)) {
      const bundle = JSON.parse(
        fs.readFileSync(path.join(LOCALES, locale, 'translation.json'), 'utf8')
      );
      for (const [code, { key }] of entries) {
        const text = bundle[key] || '';
        if (text.includes(code) || /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(text)) {
          offenders.push(`${locale}/${key}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test('the refusal the walkthrough met is Russian now', () => {
    const ru = JSON.parse(
      fs.readFileSync(path.join(LOCALES, 'ru/translation.json'), 'utf8')
    );
    const { key } = helper.POST_SAVE_REFUSAL_COPY.CONTENT_CONTEXT_DRAFT_ONLY;

    // Ровно тот отказ, который на стенде пришёл английским текстом.
    expect(ru[key]).toMatch(/[А-Яа-я]/);
    expect(ru[key]).not.toMatch(/[A-Za-z]{4}/);
  });

  test('the table is reached before the server message, not after it', async () => {
    const t = (key, fallback, values) =>
      values
        ? Object.entries(values).reduce(
            (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
            fallback
          )
        : `translated:${key}`;

    const message = await helper.postSaveErrorMessage(
      {
        json: async () => ({
          code: 'CONTENT_CONTEXT_DRAFT_ONLY',
          message: 'A post built from checked context is saved as a draft first',
        }),
      },
      t
    );

    expect(message).toBe(
      'The post was not saved: translated:content_context_draft_only'
    );
  });
});
