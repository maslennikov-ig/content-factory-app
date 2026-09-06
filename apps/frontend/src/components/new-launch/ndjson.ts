/**
 * Разбивка потока NDJSON на строки — отдельно от того, кто их читает.
 *
 * `content-factory-next-tu3k.4`: вход одной мыслью читает свой стрим тем же
 * способом, каким генератор постов читает свой, — по строке на событие, с
 * хвостом, который дочитывается в конце. Это ровно три операции над буфером, и
 * второй их экземпляр рядом с первым — это две разные обработки последнего,
 * недописанного куска через месяц.
 *
 * Модуль ничего не знает о событиях: он не разбирает JSON, не судит об ошибке
 * и не хранит результат. Смысл строкам придаёт потребитель —
 * `createGeneratorNdjsonConsumer` в `store.ts` или адаптер входа. Поэтому
 * здесь нет ни одной ссылки на React, SWR или контракт.
 */

export type NdjsonSplitter = {
  /** Кусок текста из `ReadableStream`; целые строки уходят в `onLine`. */
  push(chunk: string): void;
  /** Хвост без перевода строки — тоже строка, если в нём что-то есть. */
  finish(): void;
};

export function createNdjsonSplitter(
  onLine: (line: string) => void
): NdjsonSplitter {
  let buffer = '';

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      // Последний кусок не дописан до перевода строки: он ждёт следующего
      // куска, а не отдаётся потребителю половинкой.
      buffer = lines.pop() || '';
      for (const line of lines) onLine(line);
    },
    finish() {
      if (buffer.trim()) onLine(buffer);
      buffer = '';
    },
  };
}
