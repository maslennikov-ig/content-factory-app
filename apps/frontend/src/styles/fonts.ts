import localFont from 'next/font/local';

/**
 * Почему файлы называются `*-Variable.ttf`, а не так, как их отдаёт upstream.
 *
 * Upstream называет переменные шрифты по осям: `Geologica[CRSV,SHRP,slnt,wght].ttf`.
 * Квадратные скобки и запятые Next переносит в имя собранного файла как есть, и
 * дальше один и тот же файл называется двумя разными способами: предзагрузка в
 * разметке пишет его закодированным — `Geologica%5BCRSV%2CSHRP%2Cslnt%2Cwght%5D…`,
 * — а `@font-face src` в CSS пишет скобки буквально.
 *
 * Для браузера это два разных адреса: `%5B` и `[` равнозначны только для
 * незарезервированных знаков, а скобка к ним не относится. Поэтому шрифт
 * скачивался дважды — один раз по предзагрузке, второй раз по требованию CSS, —
 * и предзагрузка при этом пропадала впустую. Браузер сообщал об этом честно:
 * «preloaded using link preload but not used within a few seconds», три раза на
 * каждую загрузку страницы. Найдено на боевой 28.08.2026.
 *
 * Имена без скобок убирают расхождение целиком. Содержимое файлов не тронуто —
 * SHA-256 в каждом `SOURCE.md` считаны заново и совпадают с записанными.
 */

/**
 * The primary application typeface.
 *
 * Geologica is vendored under `styles/fonts/geologica/` (see its `SOURCE.md`),
 * so the build never reaches out to a font CDN. Latin and Cyrillic are both
 * native, which keeps Russian and English on the same face.
 *
 * Only the `wght` axis is varied; `CRSV`, `SHRP` and `slnt` stay at their
 * default instance. The interface uses no italic, so one normal face is enough.
 */
export const appSans = localFont({
  src: [
    {
      path: './fonts/geologica/Geologica-Variable.ttf',
      weight: '100 900',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-cf-sans',
  fallback: ['system-ui', 'Arial', 'sans-serif'],
});

/**
 * The monospaced typeface for working information.
 *
 * JetBrains Mono is vendored under `styles/fonts/jetbrains-mono/` (see its
 * `SOURCE.md`) under the same rule as Geologica: local files, SIL OFL 1.1,
 * native Cyrillic, no font CDN at build time.
 *
 * It carries exactly two of the nine typography tokens — `label-sm` and
 * `caption` — so identifiers, dates and numeric columns read as measurements.
 * The remaining seven stay on `appSans`.
 *
 * The upper weight bound is 800, not 900: that is where the file's `wght` axis
 * actually ends, and declaring more would let the browser synthesise a bolder
 * cut than the font contains.
 */
export const appMono = localFont({
  src: [
    {
      path: './fonts/jetbrains-mono/JetBrainsMono-Variable.ttf',
      weight: '100 800',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-cf-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
});

/**
 * A face for text a person sets on their own image, not for the interface.
 *
 * The product's screens are set in exactly two faces and the nine typography
 * tokens do not change. This one belongs to the image editor's text tool, where
 * the typography is content rather than chrome, and where a caption meant to be
 * read across a photograph needs something other than a technical grotesque
 * with narrow apertures. Golos Text is humanist and open, drawn Cyrillic-first,
 * under SIL OFL 1.1; see its `SOURCE.md`.
 *
 * The variable is declared on the same layouts as the other two, but nothing
 * renders in it until the editor asks for the family, so a page that never
 * opens the editor never downloads it.
 *
 * `preload: false` именно поэтому, и это исправление, а не настройка вкуса.
 * `next/font` по умолчанию ставит `<link rel="preload">` на каждую объявленную
 * гарнитуру, и браузер честно жаловался в консоли боевой 28.08.2026: файл
 * скачан заранее и в первые секунды не понадобился. Для двух интерфейсных
 * гарнитур предзагрузка оправдана — ими набран экран; для этой она забирает
 * полосу у первой отрисовки ради редактора изображений, который на этой
 * странице, скорее всего, никто не откроет. Шрифт остаётся объявленным и
 * загрузится в тот момент, когда редактор попросит семейство.
 */
export const editorText = localFont({
  src: [
    {
      path: './fonts/golos-text/GolosText-Variable.ttf',
      weight: '400 900',
      style: 'normal',
    },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-cf-editor-text',
  fallback: ['Georgia', 'system-ui', 'sans-serif'],
});
