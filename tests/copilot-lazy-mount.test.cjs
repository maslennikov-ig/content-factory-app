'use strict';

/**
 * `content-factory-next-fn33.99`: помощник поднимается по нажатию, а не по
 * открытию окна поста.
 *
 * `@copilotkit/react-core@1.10.6` при монтировании провайдера безусловно шлёт
 * `availableAgents` на `runtimeUrl`. `content-factory-next-fn33.48` увёл
 * провайдер с оболочки приложения в окно поста, и запрос перестал уходить на
 * каждой странице — но остался уходить на каждом открытии окна, хотя окно
 * помощника при этом никто не открывал. У пространства с настроенным
 * поставщиком моделей это платный вызов за каждое «Создать пост».
 *
 * Поэтому монтирование переехало на решение человека: пока помощника не
 * позвали, провайдера в дереве нет вовсе. Кнопка, которая его зовёт, остаётся
 * — и стоит только там, где помощнику есть чем ответить: кнопка, за которой
 * ничего не поднимается, — это тот самый мёртвый контрол, который владелец уже
 * читал в этом окне (`content-factory-next-fn33.76`).
 *
 * Проверяется дорога решения, а не разметка.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const MODAL = 'apps/frontend/src/components/new-launch/manage.modal.tsx';
const PROVIDER = 'apps/frontend/src/components/copilot/copilot.provider.tsx';
const BRIDGE = 'apps/frontend/src/components/copilot/assisted.textarea.tsx';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Текст без комментариев: файл вправе объяснять себя свободно. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('помощник в окне поста поднимается по нажатию', () => {
  test('провайдер стоит под состоянием, а не в безусловном возврате окна', () => {
    const source = code(MODAL);

    // Состояние существует и переключается только обработчиком нажатия.
    expect(source).toMatch(/useState\(false\)/);
    expect(source).toMatch(/assistantOpen/);
    expect(source).toMatch(/setAssistantOpen\(true\)/);
    // Провайдера нет, пока помощника не позвали: ветка «без помощника» идёт
    // первой, как у поля ввода без провайдера.
    expect(source).toMatch(/if \(!assistantOpen\)/);
    const gate = source.indexOf('if (!assistantOpen)');
    const mount = source.indexOf('<CopilotProvider');
    expect(gate).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(gate);
  });

  test('кнопка, которая зовёт помощника, остаётся и стоит до попапа', () => {
    const source = code(MODAL);

    const button = source.indexOf('openAssistant');
    expect(button).toBeGreaterThan(-1);
    const popup = source.indexOf('<AssistantPopup');
    expect(popup).toBeGreaterThan(button);
  });

  test('нажатие открывает окно помощника, а не только поднимает провайдер', () => {
    // Без `defaultOpen` человек нажал бы кнопку и увидел вторую кнопку.
    expect(code(MODAL)).toMatch(/<AssistantPopup[\s\S]{0,400}defaultOpen/);
  });

  test('кнопки нет там, где помощнику нечем ответить', () => {
    const source = code(MODAL);
    // Тот же вопрос, что задаёт провайдер, и та же дверь остатка квоты.
    expect(source).toMatch(/useAssistantAvailable\(/);
    expect(code(PROVIDER)).toMatch(/export const useAssistantAvailable/);
  });

  test('панель помощника по-прежнему рисуется только под поднятым провайдером', () => {
    const source = code(MODAL);
    const guard = source.indexOf('hasCopilot && (');
    const popup = source.indexOf('<AssistantPopup');
    expect(guard).toBeGreaterThan(-1);
    expect(popup).toBeGreaterThan(guard);
  });

  test('поле ввода без провайдера остаётся обычным полем', () => {
    const source = code(BRIDGE);
    expect(source).toMatch(/if \(!hasCopilot\)/);
    const fallback = source.indexOf('<Textarea');
    const assisted = source.indexOf('<CopilotTextarea');
    expect(fallback).toBeGreaterThan(-1);
    expect(assisted).toBeGreaterThan(fallback);
  });
});
