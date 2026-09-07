/**
 * Подписи двух стеммеров `@orama/stemmers`, которых не видит наш резолвер.
 *
 * Пакет объявляет тридцать языков через `exports` (`"./russian"`,
 * `"./english"`, …), и Node их находит: `require('@orama/stemmers/russian')`
 * работает как задумано. TypeScript в этом репозитории настроен на
 * `moduleResolution: "node"` (`tsconfig.base.json`) — это разрешение до
 * `exports`, и подпуть оно ищет файлом `node_modules/@orama/stemmers/russian`,
 * которого нет: сборка лежит в `dist/ru.cjs` вместе со своим `dist/ru.d.ts`.
 *
 * Три выхода было ровно три. Импортировать `@orama/stemmers/dist/ru` —
 * TypeScript увидит, а Node откажет `ERR_PACKAGE_PATH_NOT_EXPORTED`, потому
 * что `exports` закрывает всё, чего в нём нет. Переключить резолвер на
 * `bundler` — это правка `tsconfig.base.json`, то есть решение за весь
 * репозиторий ради одного импорта. Объявить подпись здесь — цена в десять
 * строк, и она не лжёт: подпись списана с `dist/ru.d.ts` пакета версии
 * 3.1.18 слово в слово.
 *
 * Файл подключается тройной ссылкой из `text-search.index.ts`: у бэкенда нет
 * `include`, и лежащий рядом `.d.ts` сам в программу не попадёт.
 */

declare module '@orama/stemmers/russian' {
  export function stemmer(word: string): string;
  export const language: string;
}

declare module '@orama/stemmers/english' {
  export function stemmer(word: string): string;
  export const language: string;
}
