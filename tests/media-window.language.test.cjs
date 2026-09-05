'use strict';

/**
 * `content-factory-next-fn33.28.15`: полоса загрузки и кнопка картинки говорят
 * на языке экрана.
 *
 * Два английских остатка в окне поста, и оба — по разным причинам.
 *
 * «ИИ Image»: подпись собиралась из переведённого `t('ai', 'AI')` и зашитого
 * рядом слова `Image`. Половина строки переводилась, половина нет, и на
 * русском экране выходило слово из двух языков. Лечится тем, что подпись
 * становится одним ключом целиком, а не склейкой.
 *
 * «browse files»: подпись рисует не наша разметка, а `@uppy/dashboard` из
 * своего словаря, до которого перевод приложения не дотягивается. Лечится
 * единственным местом, где Uppy об этом спрашивает, — `locale.strings`
 * у `<Dashboard>`.
 *
 * Проверяется здесь то, что переживёт правку разметки: подписи берутся из
 * локалей, они есть во всех шестнадцати, подстановка Uppy не потеряна ни в
 * одном переводе, а русский текст — русский.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const AI_IMAGE = 'apps/frontend/src/components/launches/ai.image.tsx';
const MEDIA = 'apps/frontend/src/components/media/media.component.tsx';
const LOCALES = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);

const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

/** Разметка без комментариев: файл вправе объяснять себя свободно. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const bundle = (locale) =>
  JSON.parse(
    fs.readFileSync(path.join(LOCALES, locale, 'translation.json'), 'utf8')
  );

const KEYS = [
  'ai_image',
  'media_drop_paste_files',
  'media_browse_files',
  'media_drop_hint',
];

describe('the media window speaks one language at a time', () => {
  test('the AI image button is one translated label, not half of one', () => {
    const source = code(AI_IMAGE);

    expect(source).toMatch(/t\('ai_image', 'AI image'\)/);
    // Прежняя склейка ушла целиком, а не осталась запасной веткой.
    expect(source).not.toMatch(/t\('ai',\s*'AI'\)\s*Image/);
    // И никакого зашитого английского слова рядом с подписью.
    expect(source).not.toMatch(/>\s*\{[^}]*\}\s*Image\s*</);
  });

  test('the uploader strip is told what to say, in the language of the screen', () => {
    // Здесь комментарии не срезаются: в этом файле есть `'image/*'`, и любая
    // срезка блочных комментариев принимает его за начало комментария и
    // съедает разметку до ближайшего `*/`. Проверки ниже — на наличие, так
    // что комментарий ложным срабатыванием стать не может.
    const source = read(MEDIA);

    // Единственная дверь, через которую Uppy принимает подписи.
    expect(source).toMatch(/locale=\{uploaderLocale\}/);
    expect(source).toMatch(/dropPasteFiles: t\(\s*'media_drop_paste_files'/);
    expect(source).toMatch(/browseFiles: t\('media_browse_files'/);
    expect(source).toMatch(/dropHint: t\('media_drop_hint'/);
    // Второй Dashboard — полоса под редактором окна поста — получает тот же
    // словарь тем же хуком (fn33.28.17).
    const editor = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/new-launch/editor.tsx'),
      'utf8'
    );
    expect(editor).toMatch(/useUploaderLocale\(t\)/);
    expect(editor).toMatch(/<Dashboard[\s\S]*?locale=\{uploaderLocale\}/);
  });

  test('every new label exists in all sixteen locales', () => {
    const locales = fs.readdirSync(LOCALES);
    expect(locales).toHaveLength(16);

    const missing = [];
    for (const locale of locales) {
      const strings = bundle(locale);
      for (const key of KEYS) {
        if (typeof strings[key] !== 'string' || !strings[key].trim()) {
          missing.push(`${locale}/${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('no translation loses the placeholder Uppy substitutes the button into', () => {
    // `%{browseFiles}` подставляет сам Uppy. Перевод без неё — строка без
    // кнопки «выбрать файл»: текст переведён, а нажать больше не на что.
    const lost = [];
    for (const locale of fs.readdirSync(LOCALES)) {
      if (!bundle(locale).media_drop_paste_files.includes('%{browseFiles}')) {
        lost.push(locale);
      }
    }
    expect(lost).toEqual([]);
  });

  test('the Russian strip is Russian all the way through', () => {
    const ru = bundle('ru');
    for (const key of KEYS) {
      // Подстановка Uppy — не текст, её из проверки убираем.
      const words = ru[key].replace(/%\{[^}]*\}/g, ' ');
      expect(words).toMatch(/[А-Яа-я]/);
      // Ни одного английского слова в четыре буквы и длиннее.
      expect(words).not.toMatch(/[A-Za-z]{4}/);
    }
  });
});
