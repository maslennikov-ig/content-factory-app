'use client';

import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { searchWords } from '@contentfactory/nestjs-libraries/content-intelligence/search-terms';

/**
 * Поиск по словам на экране: задержка ввода и подсветка найденного
 * (`content-factory-next-odb8.4`, решение владельца 05.09.2026).
 *
 * Один файл на архив и на витрину фактов, а не по копии на экран. Это одна и
 * та же вещь в двух местах: человек печатает, вопрос уезжает на сервер не
 * раньше, чем он перестал печатать, а в ответе слова, которые он искал, видны
 * глазом. Две копии этого разъехались бы задержкой — 300 мс здесь и 250 там —
 * и одна из них однажды осталась бы без подсветки.
 *
 * Разбор запроса на слова берётся у сервера (`searchWords`), а не пишется
 * заново: подсвечивать надо ровно то, по чему искали, иначе экран обещает
 * одно, а нашёл он другое.
 */

/**
 * Задержка ввода. 300 мс — обычный человеческий разрыв между словами: меньше
 * — и каждый набранный символ уходит отдельным запросом, больше — и поле
 * начинает казаться залипшим.
 */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * То же значение, но «успокоившееся». Пока человек печатает, возвращается
 * прежнее; таймер перезаводится на каждый символ и снимается при уходе с
 * экрана, чтобы ответ не пришёл в размонтированный список.
 */
export function useDebouncedValue<T>(value: T, delay = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
    // `settled` намеренно не в зависимостях: он тут читается, чтобы не
    // заводить таймер на значение, которое уже показано, а не чтобы
    // перезапускать ожидание самим фактом его смены.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);

  return settled;
}

const escapeForRegExp = (word: string) =>
  word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Строка результата с найденными словами в `<mark>`.
 *
 * Регистр не учитывается — ровно как в запросе к базе (`mode: 'insensitive'`),
 * иначе подсветка спорила бы с отбором. Цвет берётся у токенов и только у
 * них: `<mark>` в браузере жёлтый по умолчанию, а жёлтый по умолчанию — это
 * hex мимо темы, нечитаемый на тёмном фоне.
 */
export function HighlightedWords({
  text,
  query,
}: {
  text: string;
  query: string;
}): ReactNode {
  const words = searchWords(query);
  if (words.length === 0 || !text) return text;

  const pattern = new RegExp(
    `(${words.map(escapeForRegExp).sort((a, b) => b.length - a.length).join('|')})`,
    'giu'
  );
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  const lowered = words.map((word) => word.toLocaleLowerCase());
  return (
    <>
      {parts.map((part, index) =>
        lowered.includes(part.toLocaleLowerCase()) ? (
          <mark
            key={`${index}-${part}`}
            className="bg-cf-accent-soft text-cf-ink"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={`${index}-${part}`}>{part}</Fragment>
        )
      )}
    </>
  );
}
