'use strict';

/**
 * The calendar in the reader's own notation, and its menu on a keyboard.
 *
 * Four findings from the owner's walkthrough of 04.09.2026, all in the same
 * corner of the product and all invisible to a backend test:
 *
 *  - midnight was printed «0:00 AM». In a twelve-hour clock both midnight and
 *    noon are called 12; the special case had been written for noon only
 *    (`content-factory-next-fn33.80`).
 *  - «Date passed» was a sentence inside `global.scss`. No dictionary could
 *    reach it and no key for it existed anywhere
 *    (`content-factory-next-fn33.79`).
 *  - the post date read «09/04/2026 01:51 PM» under a Russian interface,
 *    because the American notation was chosen from the browser's locale rather
 *    than from anything the person had picked
 *    (`content-factory-next-fn33.87`).
 *  - the channel menu opened from a bare `div`: no role, no name, no keyboard
 *    (`content-factory-next-fn33.91`).
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

const CALENDAR = 'apps/frontend/src/components/launches/calendar.tsx';
const MENU = 'apps/frontend/src/components/launches/menu/menu.tsx';
const STYLES = 'apps/frontend/src/app/global.scss';
const UTILS = 'apps/frontend/src/components/launches/helpers/isuscitizen.utils.tsx';
const LOCALES = 'libraries/react-shared-libraries/src/translation/locales';

/** One `const name = …` from a file, compiled and run with `injected` in scope. */
const loadConst = (relative, name, injected = {}) => {
  const source = read(relative);
  const ast = ts.createSourceFile(
    relative,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const wanted = Array.isArray(name) ? name : [name];
  const parts = [];
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (wanted.includes(declaration.name.getText(ast))) {
        parts.push(`const ${declaration.getText(ast)};`);
      }
    }
  }
  if (parts.length !== wanted.length) {
    throw new Error(`missing ${wanted.join(', ')} in ${relative}`);
  }
  const text = `${parts.join('\n')}\nmodule.exports = ${
    wanted[wanted.length - 1]
  };`;
  const compiled = ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;
  const holder = { exports: {} };
  const names = Object.keys(injected);
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', ...names, compiled)(
    holder,
    holder.exports,
    ...names.map((key) => injected[key])
  );
  return holder.exports;
};

describe('the hour column names midnight the way the notation does', () => {
  const hour = (usCitizen) =>
    loadConst(CALENDAR, 'convertTimeFormatBasedOnLocality', {
      isUSCitizen: () => usCitizen,
    });

  test('twelve-hour midnight is 12:00 AM, not 0:00 AM', () => {
    const format = hour(true);

    expect(format(0)).toBe('12:00 AM');
    expect(format(12)).toBe('12:00 PM');
    expect(format(1)).toBe('1:00 AM');
    expect(format(13)).toBe('1:00 PM');
    expect(format(23)).toBe('11:00 PM');
  });

  test('the twenty-four hour column is untouched', () => {
    const format = hour(false);

    expect(format(0)).toBe('0:00');
    expect(format(13)).toBe('13:00');
  });
});

describe('«Date passed» is a translation, not a stylesheet', () => {
  test('the stylesheet reads the words off the cell', () => {
    const styles = read(STYLES);
    const rule = styles.slice(styles.indexOf('.col-calendar:hover:before'));

    expect(rule).toContain('content: attr(data-date-passed)');
    expect(styles).not.toContain("content: 'Date passed'");
  });

  test('the cell carries the words, through the dictionary', () => {
    expect(read(CALENDAR)).toContain(
      "'data-date-passed': t('date_passed', 'Date passed')"
    );
  });

  test('every language has the key, and none of them left it in English', () => {
    const languages = fs.readdirSync(path.join(root, LOCALES));
    expect(languages.length).toBe(16);

    for (const language of languages) {
      const dictionary = JSON.parse(
        read(path.join(LOCALES, language, 'translation.json'))
      );
      expect(typeof dictionary.date_passed).toBe('string');
      expect(dictionary.date_passed.length).toBeGreaterThan(0);
      expect(typeof dictionary.channel_menu).toBe('string');
      if (language !== 'en') {
        expect(dictionary.date_passed).not.toBe('Date passed');
      }
    }
  });
});

describe('the date is written the way the reader was written to', () => {
  const utils = (language, browser, stored) =>
    loadConst(UTILS, ['interfaceLanguage', 'browserLanguage', 'isUSCitizen'], {
      i18next: { resolvedLanguage: language },
      localStorage: { getItem: () => stored ?? null },
      navigator: { language: browser, languages: [browser] },
    });

  test('a Russian interface is never given the American notation', () => {
    // The exact walkthrough: the product in Russian, the browser in en-US.
    expect(utils('ru', 'en-US')()).toBe(false);
  });

  test('an English interface on an American browser still gets it', () => {
    expect(utils('en', 'en-US')()).toBe(true);
    expect(utils('en', 'en-GB')()).toBe(false);
  });

  test('the answer a person stored themselves outranks both', () => {
    expect(utils('ru', 'ru-RU', 'US')()).toBe(true);
    expect(utils('en', 'en-US', 'GLOBAL')()).toBe(false);
  });

  test('the picker and the editor print through the one helper', () => {
    const picker = read(
      'apps/frontend/src/components/launches/helpers/date.picker.tsx'
    );
    // Дата происхождения уехала из редактора в строку происхождения: с
    // 04.09.2026 окно поста говорит о контексте одной строкой, и печатает её
    // она (`content-factory-next-fn33.28.2`). Помощник тот же самый.
    const line = read(
      'apps/frontend/src/components/new-launch/provenance.line.tsx'
    );

    expect(picker).toContain('formatDateTimeForReader');
    expect(picker).not.toContain('MM/DD/YYYY');
    expect(line).toContain('formatDateTimeForReader');
    expect(line).not.toContain('MM/DD/YYYY');
  });
});

describe('the channel menu is a menu', () => {
  const menu = read(MENU);

  test('the three dots are a button with a name, not a bare div', () => {
    expect(menu).toContain('<MenuButton');
    expect(menu).toContain("aria-label={t('channel_menu', 'Channel menu')}");
    // The div that used to be the trigger: clickable, unreachable, unnamed.
    expect(menu).not.toContain('cursor-pointer relative select-none flex');
  });

  test('the panel is a menu the arrow keys and Escape work in', () => {
    expect(menu).toContain('<MenuList');
    expect(menu).toContain('role="menuitem"');
    // Every row is an action on a real control, so nothing in the list is
    // reachable by pointer only. Eleven rows, eleven menu items.
    expect(menu.split('<MenuAction').length - 1).toBe(11);
    expect(menu).not.toMatch(
      /<div\s+className="flex gap-\[12px\] items-center py-\[8px\] px-\[10px\]"/
    );
  });
});
