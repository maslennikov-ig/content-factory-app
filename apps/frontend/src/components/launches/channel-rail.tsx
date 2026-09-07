'use client';

import { clsx } from 'clsx';

/**
 * Геометрия рейки каналов — в одном месте, оба состояния.
 *
 * `content-factory-next-tu3k.13`, живой прогон 07.09.2026. Слова владельца:
 * «в разделе „Каналы“ очень криво выстроены иконки… обеспечить их
 * консистентность стиля». Криво было потому, что каждая кнопка рейки несла
 * свой размер: «Добавить канал» — 40 в высоту и 100% в ширину, «Чистый лист» —
 * 40 без знака-варианта, «Новая заготовка» — 32 (плотный icon-only),
 * стрелка — 32 с проигнорированным `size={28}`, а аватар канала — 48 с
 * бейджем 24. Четыре разных размера в колонке шириной 68px читаются как
 * лестница.
 *
 * Здесь записаны те значения, которые повторяются больше одного раза, — по
 * правилу репозитория «повторяющаяся геометрия — компонент или токен, а не
 * число в каждом файле». Кнопки рейки читают их через `railActionClass`,
 * `AddProviderButton`, `NewPost` и `IntakeDoor`; строка канала — через
 * `RAIL_AVATAR`, `RAIL_AVATAR_PX` и `RAIL_BADGE_PX`.
 *
 * Цвет и вариант остаются за примитивом `Button`: главное действие отличается
 * только заливкой, а стрелка сворачивания и «⋮» — тихие и плотные, потому что
 * это навигация, а не действие.
 */

/** Ширина рейки: свёрнуто — колонка под один знак, развёрнуто — под имя. */
export const RAIL_WIDTH_COLLAPSED = 'md:w-[100px]';
export const RAIL_WIDTH_EXPANDED = 'md:w-[260px]';

/** Шаг между кнопками и шаг между группами. */
export const RAIL_CONTROL_GAP = 'gap-[8px]';
export const RAIL_SECTION_GAP = 'gap-[16px]';

/**
 * Аватар канала — тот же квадрат 40, что и высота кнопки рядом. `min-*` держит
 * его при длинном имени: без них картинка сжималась, и ряд шёл волной.
 */
export const RAIL_AVATAR =
  'w-[40px] h-[40px] min-w-[40px] min-h-[40px] rounded-[8px]';
export const RAIL_AVATAR_PX = 40;

/** Бейдж площадки — половина аватара, как задано `PlatformBadge`. */
export const RAIL_BADGE_PX = 16 as const;

/**
 * Гнездо тихой кнопки 32×32: «⋮» строки канала. Сам примитив меню держит свою
 * ширину, поэтому гнездо задаёт ось, по которой он стоит, — и в развёрнутой
 * строке у правого края, и в свёрнутой под аватаром.
 */
export const RAIL_QUIET_SLOT =
  'flex h-[32px] w-[32px] shrink-0 items-center justify-center';

/** Разделитель между кнопками и списком каналов. */
export const RAIL_DIVIDER = 'border-t border-cf-border';

export const railWidthClass = (collapsed: boolean) =>
  collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH_EXPANDED;

/**
 * Класс кнопки рейки во всю ширину — «Добавить канал».
 *
 * Свёрнуто кнопка — квадрат 40×40 со знаком: ширину задаёт сам примитив по
 * `iconOnly` с `density="standard"`, поэтому здесь остаётся только запрет на
 * растяжение. Развёрнуто кнопка занимает строку и читается слева.
 */
export const railActionClass = (collapsed: boolean, className?: string) =>
  clsx(collapsed ? 'shrink-0' : 'flex-1 min-w-0 justify-start', className);

/**
 * Класс кнопки из пары «Пост» / «Заготовка».
 *
 * Развёрнутая пара — половина строки на кнопку: 260 − 32 отступа − 8 шага даёт
 * 110px. Знак рядом с подписью в них не помещается ни на одном языке: 20px
 * знака, 8px шага и «Заготовка» — это уже 97px до горизонтальных полей, а
 * немецкое `Rohentwurf` длиннее. Поэтому знак остаётся у свёрнутой рейки, где
 * подписи нет, а развёрнутая пара читается подписью по центру. Поля здесь
 * узкие по той же причине.
 */
export const railPairClass = (collapsed: boolean, className?: string) =>
  clsx(
    collapsed ? 'shrink-0' : 'w-full min-w-0 justify-center px-[8px]',
    className
  );

/** Ряд из двух равных кнопок; свёрнуто — колонка по центру. */
export const railActionRowClass = (collapsed: boolean) =>
  clsx(
    RAIL_CONTROL_GAP,
    collapsed ? 'flex flex-col items-center' : 'grid grid-cols-2 items-center'
  );

/** Колонка действий целиком. */
export const railActionsClass = (collapsed: boolean) =>
  clsx('flex flex-col', RAIL_CONTROL_GAP, collapsed && 'items-center');
