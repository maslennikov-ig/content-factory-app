'use strict';

/**
 * `content-factory-next-fn33.28.16`: три экрана перестали звать помощника,
 * которого нельзя позвать.
 *
 * `content-factory-next-fn33.28.11` научил окно поста не поднимать провайдера
 * без ключа AI, но признак `requireAvailable` достался только ему. Подписи,
 * автопостинг и дополнения рисовали `CopilotTextarea` прямо под провайдером, а
 * он без `<CopilotKit>` бросает исключение библиотеки, — поэтому провайдера они
 * просили безусловно и каждое открытие стоило `POST /copilot/chat -> 503`.
 *
 * Решение то же, что в окне поста: условие переезжает с хука на узел. Поле
 * уехало за `AssistedTextarea`, который под поднятым провайдером остаётся
 * полем помощника, а без него рисует обычное поле ввода с тем же оформлением.
 *
 * Проверяется дорога решения, а не разметка: признак стоит на всех трёх
 * экранах, `CopilotTextarea` они больше не зовут сами, а у узла есть ветка без
 * помощника и она идёт первой.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const SCREENS = [
  'apps/frontend/src/components/settings/signatures.component.tsx',
  'apps/frontend/src/components/autopost/autopost.tsx',
  'apps/frontend/src/components/plugs/plug.tsx',
];

const BRIDGE = 'apps/frontend/src/components/copilot/assisted.textarea.tsx';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Текст без комментариев: файл вправе объяснять себя свободно. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('the assistant is not called where it cannot answer', () => {
  test.each(SCREENS)('%s asks whether the assistant is available', (relative) => {
    expect(code(relative)).toMatch(/<CopilotProvider requireAvailable>/);
  });

  test.each(SCREENS)('%s no longer renders the assistant field itself', (relative) => {
    const source = code(relative);
    // Поле, которое падает без провайдера, зовётся только из узла, который
    // умеет обойтись без него.
    expect(source).not.toMatch(/<CopilotTextarea[\s>]/);
    expect(source).not.toMatch(/from '@copilotkit\/react-textarea'/);
    expect(source).toMatch(/<AssistedTextarea[\s>]/);
  });

  test('the field works without the assistant, and that branch comes first', () => {
    const source = code(BRIDGE);

    // Спрашивает то же, что и остальные потребители помощника.
    expect(source).toMatch(/useHasCopilotProvider\(\)/);
    // Обычное поле (общий примитив Textarea, не голый тег — страж сырых
    // контролов) — не запасной вариант в конце файла, а первая ветка.
    const fallback = source.indexOf('<Textarea');
    const assisted = source.indexOf('<CopilotTextarea');
    expect(fallback).toBeGreaterThan(-1);
    expect(assisted).toBeGreaterThan(fallback);
    expect(source).toMatch(/if \(!hasCopilot\)/);
  });

  test('both branches wear the same clothes', () => {
    const source = code(BRIDGE);
    // Класс приходит снаружи и достаётся обеим веткам: иначе поле без
    // помощника выглядело бы поломкой, а не полем.
    expect(source).toMatch(/<Textarea[\s\S]*?className=\{[^}]*\bclassName\b/);
    expect(source).toMatch(/<CopilotTextarea[\s\S]*?className=\{className\}/);
    expect(source.match(/placeholder=\{placeholder\}/g) || []).toHaveLength(2);
    expect(source.match(/value=\{value\}/g) || []).toHaveLength(2);
    expect(source.match(/onChange=\{onChange\}/g) || []).toHaveLength(2);
    // И собственных цветов у узла нет — его красит вызывающий экран.
    expect(source).not.toMatch(/bg-|text-\[|border-/);
  });

  test('the provider no longer promises these three screens as future work', () => {
    const provider = read(
      'apps/frontend/src/components/copilot/copilot.provider.tsx'
    );
    expect(provider).not.toMatch(/их черёд — отдельной\s*\*?\s*задачей/);
  });
});
