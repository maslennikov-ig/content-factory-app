'use strict';

/**
 * Подвал окна поста: одна кнопка и меню рядом с ней
 * (`content-factory-next-m2eg.18`, макет одобрен владельцем 07.09.2026).
 *
 * До этого «Опубликовать сейчас» — самое необратимое действие окна — открывалась
 * по НАВЕДЕНИЮ на основную кнопку и висела над ней. Три следствия, и все три
 * были настоящими: с клавиатуры до неё нельзя было дойти вовсе; на сенсорном
 * экране наведения нет; мышью её находили случайно, потому что кнопка ничем не
 * сообщала, что за ней что-то есть.
 *
 * Здесь проверяется то, что переживёт правку разметки: у окна ровно один список
 * условий запрета, стрелка объявляет себя открывашкой меню, само меню собрано
 * общим примитивом, а не своей разметкой, и наведения в нём не осталось.
 * Клавиатуру самого меню — стрелки, Escape, возврат фокуса — держит
 * `tests/choice-control.contract.test.cjs` у примитива; повторять её здесь
 * значило бы проверять примитив дважды.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const MANAGE = 'apps/frontend/src/components/new-launch/manage.modal.tsx';
const COPY = 'apps/frontend/src/components/new-launch/compose.copy.ts';
const SCSS = 'apps/frontend/src/app/global.scss';
const LAYERS = 'apps/frontend/src/components/ui/layers.tsx';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Разметка без комментариев: файл вправе объяснять себя свободно. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('the publishing menu replaces the hover flyout', () => {
  test('nothing in the footer opens on hover any more', () => {
    const manage = code(MANAGE);

    // Класс, которым раскрывалась «Опубликовать сейчас», и оба его правила.
    expect(manage).not.toMatch(/group-hover:/);
    expect(manage).not.toMatch(/btnSub/);
    expect(manage).not.toMatch(/post-now/);
    // Мёртвые правила ушли из таблицы стилей вместе с разметкой.
    const scss = read(SCSS);
    expect(scss).not.toMatch(/\.btnSub/);
    expect(scss).not.toMatch(/\.post-now/);
  });

  test('the arrow says it opens a menu, and the menu is the shared primitive', () => {
    const manage = code(MANAGE);

    expect(manage).toMatch(/<MenuButton/);
    expect(manage).toMatch(/<MenuList/);
    expect(manage.match(/<DescribedMenuItem\b/g)).toHaveLength(2);
    const describedItem = code(LAYERS).split('export function DescribedMenuItem')[1].split('export const Dialog')[0];
    expect(describedItem).toMatch(/<MenuCommand\b/);
    expect(describedItem).toMatch(/\{\.\.\.props\}/);
    expect(describedItem).toMatch(/layout="content"/);
    // `aria-haspopup`/`aria-expanded` пишет сам примитив; здесь важно, что
    // стрелка названа словами — иначе это кнопка без имени.
    expect(manage).toMatch(/morePublishingActions/);
    // И ни одной роли меню, написанной руками.
    expect(manage).not.toMatch(/role="menu/);
  });

  test('one refusal expression, not two lists of the same conditions', () => {
    const manage = code(MANAGE);

    expect(manage).toMatch(/const publishDisabled =/);
    // Оба контрола отправки читают одно выражение.
    expect(manage.match(/disabled=\{publishDisabled\}/g)).toHaveLength(2);

    /*
      И ни один из них не несёт своей копии условий. Считается только кусок
      между двумя контролами отправки: «Сохранить как черновик» рядом
      выключается по СВОИМ условиям — у него есть шестое слагаемое про
      требуемые доказательства, — и сводить их в одно выражение значило бы
      склеить два разных запрета ради одинакового вида.
    */
    const publishing = manage.slice(manage.indexOf('<Menu open={publishMenuOpen}'));
    expect(publishing).not.toMatch(/contentIntelligenceLoadState/);
    expect(publishing).not.toMatch(/selectedIntegrations\.length === 0/);
  });

  test('the main action is named once and reused by the menu', () => {
    const manage = code(MANAGE);

    expect(manage).toMatch(/const mainActionLabel = useMemo\(/);
    // Подпись стоит и на кнопке, и в пункте меню — и это одно значение.
    expect(manage.match(/\{mainActionLabel\}/g)).toHaveLength(2);
  });

  test('each item says what happens to the time of the post', () => {
    const copy = read(COPY);

    for (const key of ['postNowHint', 'keepScheduledAt', 'addToCalendarHint']) {
      // Дважды: раздел `ru` и раздел `en`.
      expect(copy.match(new RegExp(`${key}[:(]`, 'g')).length).toBeGreaterThanOrEqual(2);
    }
    expect(copy).toMatch(/в канал сразу, минуя расписание/);
    expect(copy).toMatch(/оставить в расписании на \$\{time\}/);
  });

  test('each command stacks its label and explanation with real flex layout', () => {
    const manage = code(MANAGE);

    expect(manage.match(/<DescribedMenuItem\b/g)).toHaveLength(2);
    expect(manage).toMatch(/<DescribedMenuItem[^>]*onClick=\{schedule\('now'\)\}[^>]*description=\{composeCopy\[voiceLocale\]\.postNowHint\}/);
    expect(manage).toMatch(/<DescribedMenuItem[^>]*onClick=\{schedule\('schedule'\)\}[^>]*description=\{mainActionHint\}/);
    const describedItem = code(LAYERS).split('export function DescribedMenuItem')[1].split('export const Dialog')[0];
    expect(describedItem).toMatch(/flex flex-col items-start gap-\[4px\]/);
    expect(describedItem).toMatch(/<span[^>]*>\{title\}<\/span>/);
    expect(describedItem).toMatch(/<span[^>]*>\{description\}<\/span>/);
  });

  test('the two reference blocks stand above the footer, without a single checkbox', () => {
    const manage = code(MANAGE);
    const editor = code('apps/frontend/src/components/new-launch/editor.tsx');

    expect(manage).toMatch(/<RelatedOwnPostsNote/);
    expect(editor).toMatch(/ContentIntelligenceCitationSelector/);
    for (const source of [manage, editor]) {
      expect(source).not.toMatch(/CheckboxField/);
    }
  });
});
