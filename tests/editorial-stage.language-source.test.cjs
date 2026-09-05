'use strict';

/**
 * `content-factory-next-fn33.146` — язык панели фильтра этапов календаря.
 *
 * На боевом прогоне 05.09.2026 шапка и меню были английскими, а полоса «Все
 * этапы / План / Пишется / Проверка / Расписание» над сеткой — русской; после
 * переключения языка кнопкой в шапке всё поменялось местами, и сходилось
 * только после перезагрузки страницы.
 *
 * Причина: полоса брала язык из `useVariables().language` — значения,
 * посчитанного один раз при серверной отрисовке. Кнопка смены языка зовёт
 * `i18next.changeLanguage`, и переменная запроса про это не знает.
 *
 * Проверяется именно живая смена: язык меняют на смонтированном дереве, без
 * перерисовки заново, и слова обязаны поменяться. Плюс страж источника —
 * чтобы `useVariables().language` не вернулся в эти четыре файла.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const FILTER =
  'apps/frontend/src/components/launches/editorial-stage.filter.tsx';
const SELECT =
  'apps/frontend/src/components/launches/editorial-stage.select.tsx';
const BADGE = 'apps/frontend/src/components/launches/editorial-stage.badge.tsx';
const CALENDAR = 'apps/frontend/src/components/launches/calendar.tsx';

const filter = loadTypeScriptModule(FILTER);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const i18next = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18next.ts'
).default;

afterEach(cleanup);

describe('панель фильтра этапов слышит смену языка без перезагрузки', () => {
  const renderFilter = async (requestLanguage) => {
    await act(async () => {
      render(
        React.createElement(
          variables.VariableContextComponent,
          { language: requestLanguage },
          React.createElement(filter.EditorialStageFilter, {
            value: null,
            onChange: () => {},
          })
        )
      );
    });
  };

  const optionText = () =>
    Array.from(document.querySelectorAll('option')).map((node) =>
      node.textContent.trim()
    );

  test('слова полосы идут за языком интерфейса, а не за языком запроса', async () => {
    await act(async () => {
      await i18next.changeLanguage('en');
    });
    // Язык запроса намеренно расходится с языком интерфейса — ровно та
    // расстановка, что была на боевом при первом входе.
    await renderFilter('ru');

    expect(optionText()).toEqual([
      'All stages',
      'Plan',
      'Writing',
      'Review',
      'Schedule',
    ]);

    await act(async () => {
      await i18next.changeLanguage('ru');
    });

    expect(optionText()).toEqual([
      'Все этапы',
      'План',
      'Пишется',
      'Проверка',
      'Расписание',
    ]);
  });
});

describe('этап спрашивает про язык одно место на все четыре поверхности', () => {
  test.each([[FILTER], [SELECT], [BADGE], [CALENDAR]])(
    '%s не берёт язык из переменной запроса',
    (relative) => {
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      expect(source).toContain('useInterfaceLanguage');
      expect(source).not.toMatch(
        /resolveEditorialStageLocale\(\s*language\s*\)/u
      );
      // `calendar.tsx` берёт из переменной другие поля, поэтому запрещаем
      // именно вынутое поле языка, а не сам вызов.
      expect(source).not.toMatch(/\{\s*[^}]*\blanguage\b[^}]*\}\s*=\s*useVariables\(\)/u);
    }
  );
});
