/**
 * Дата, написанная так, как её пишет язык читателя.
 *
 * `content-factory-next-fn33.115`: столбец «Регистрация» в списке аккаунтов
 * показывал «2026-09-04 12:26» — это `toISOString()`, обрезанный до шестнадцати
 * символов: год-месяц-день, дефис, без запятой, одинаково во всех шестнадцати
 * языках и ни в одном из них не так, как принято.
 *
 * Срок приглашения на экране команды это уже пережил
 * (`content-factory-next-fn33.35`) и печатается через `L, LT` — собственный
 * локализованный формат dayjs. Второе написание того же решения — это дефект,
 * который потом чинят дважды, поэтому решение живёт в одном общем помощнике, а
 * экран аккаунтов зовёт его, а не заводит свою копию.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const helperFile = path.join(
  repositoryRoot,
  'libraries/react-shared-libraries/src/helpers/localized.date.ts'
);

let language = 'ru';
const compiled = ts.transpileModule(fs.readFileSync(helperFile, 'utf8'), {
  fileName: helperFile,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
    esModuleInterop: true,
  },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled)(
  loaded.exports,
  (request) =>
    request === '@contentfactory/react/translation/i18next'
      ? {
          __esModule: true,
          default: {
            get language() {
              return language;
            },
          },
        }
      : require(request),
  loaded,
  helperFile,
  path.dirname(helperFile)
);
const { formatLocalizedDateTime } = loaded.exports;

// Полдень по местному времени: в каком часовом поясе идёт прогон, значения не
// имеет — час и минута собраны локально и локально же читаются.
const moment = new Date(2026, 8, 4, 12, 26);

afterEach(() => {
  language = 'ru';
});

test('a Russian screen writes the day first, with a comma and no seconds', () => {
  expect(formatLocalizedDateTime(moment)).toBe('04.09.2026, 12:26');
});

test('an English screen writes the same moment its own way', () => {
  language = 'en';
  expect(formatLocalizedDateTime(moment)).toBe('09/04/2026, 12:26 PM');
});

test('our Georgian locale id is the one dayjs knows, and an unknown id falls back', () => {
  // `ka` пишет день первым — значит, идентификатор дошёл до dayjs, а не осел
  // в английском запасном варианте.
  language = 'ka_ge';
  expect(formatLocalizedDateTime(moment)).toBe('04/09/2026, 12:26 PM');

  language = 'kl_kl';
  expect(formatLocalizedDateTime(moment)).toBe('09/04/2026, 12:26 PM');
});

test('the list of accounts asks the helper instead of writing its own date', () => {
  const screen = read('apps/frontend/src/components/admin/admin-users.component.tsx');

  expect(screen).toContain(
    "import { formatLocalizedDateTime } from '@contentfactory/react/helpers/localized.date';"
  );
  expect(screen).toContain('{formatLocalizedDateTime(row.createdAt)}');
  expect(screen).not.toContain('toISOString');
  expect(screen).not.toContain('toLocaleString');
});

test('the helper prints the same format the invitation expiry settled on', () => {
  // `content-factory-next-fn33.35` выбрал `L, LT`. Если экран команды когда-то
  // переедет на общего помощника, эта проверка останется верной; если формат
  // разойдётся — она об этом скажет.
  expect(fs.readFileSync(helperFile, 'utf8')).toContain(".format('L, LT')");
  // Экран команды переехал на общего помощника: второй копии `L, LT` в нём
  // больше нет, есть импорт одного решения.
  const teams = read('apps/frontend/src/components/settings/teams.component.tsx');
  expect(teams).toContain('formatLocalizedDateTime');
  expect(teams).not.toContain(".format('L, LT')");
});
