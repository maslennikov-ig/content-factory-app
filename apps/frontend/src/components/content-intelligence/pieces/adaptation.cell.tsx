'use client';

import clsx from 'clsx';
import { PlusIcon } from '@contentfactory/frontend/components/ui/icons';
import { STATUS_TONES, type StatusTone } from '../../ui/surface';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import {
  cellAction,
  type PieceCellStateV1,
  type PieceCellV1,
} from './pieces.adapter';

/**
 * Клетка матрицы «площадка × заготовка» — квадрат 28 × 28.
 *
 * Макет, одобренный владельцем 18.09.2026: состояние несут значок и цвет
 * вместе, слово живёт в подсказке клетки и в легенде под таблицей. До этой
 * волны клетка печатала слово целиком, и строка из пяти площадок занимала
 * поперёк таблицы больше места, чем заголовок заготовки, ради того же факта.
 *
 * Семь состояний живут в одном месте, потому что шесть из них уже назывались
 * по-разному в трёх экранах, а седьмого — «пока не знаем» — не было вовсе.
 * Клетка сама решает, нажимается ли она и что нажатие значит: открыть пост
 * (`published`, `queued`, `draft`, `error`) или начать адаптацию (`none`).
 *
 * Четыре решения здесь важнее вида.
 *
 * **Цвет не единственный носитель смысла.** У каждого состояния свой значок,
 * своё слово в доступном имени и та же клетка в легенде. Различить
 * «опубликовано» и «запланировано» можно, не различая зелёного и синего.
 *
 * **Пустая клетка — возможность, а не долг** (§11.7 карты раздела). У `none`
 * пунктирная рамка и плюс; счётчиков «заполнено N из M» на этом экране нет
 * нигде, и нажатие ведёт прямо в «Адаптировать» для этой площадки.
 *
 * **`no_channel` объясняет себя до нажатия.** Клетка выключена, рамки у неё
 * нет вовсе — она не спорит с живыми клетками, — а причина стоит в подсказке и
 * в доступном имени, а не приезжает отказом после нажатия (`fn33.86`).
 *
 * **`unknown` — это не «ещё нет».** Ответ без клеток означает, что публикацию
 * ещё не прочитали, и «ещё нет» поверх существующих постов было бы враньём.
 *
 * Размер квадрата написан здесь один раз: клетка в таблице, клетка на карточке
 * и клетка в легенде — один и тот же компонент, а не три похожие геометрии.
 */

/** Единственное место, где живёт геометрия клетки. */
const CELL_BOX =
  'relative inline-flex size-[28px] flex-none items-center justify-center rounded-[4px] border';

/** Тон берётся у `Status`: одна пара «заливка · рамка · чернила» на состояние. */
const TONE: Partial<Record<PieceCellStateV1, StatusTone>> = {
  published: 'accent',
  queued: 'info',
  draft: 'neutral',
  error: 'danger',
};

/**
 * Состояния без тона: у них нет заливки вовсе.
 *
 * «Ещё нет» — пунктир, «нет канала» — совсем без рамки, «пока не знаем» —
 * точечная рамка: три разные тишины, которые нельзя перепутать на глаз.
 */
const QUIET: Partial<Record<PieceCellStateV1, string>> = {
  none: 'border-dashed border-cf-border-control bg-transparent text-cf-ink-muted',
  no_channel: 'border-transparent bg-transparent text-cf-ink-muted opacity-70',
  unknown: 'border-dotted border-cf-border bg-transparent text-cf-ink-muted',
};

/** Порядок состояний в легенде — все семь, как их рисует клетка. */
export const CELL_STATES_IN_ORDER: readonly PieceCellStateV1[] = [
  'published',
  'queued',
  'draft',
  'error',
  'none',
  'no_channel',
  'unknown',
];

/**
 * Состояния, по которым спрашивают в шапке, — пять, а не семь.
 *
 * «Нет канала» и «пока не знаем» из фильтра убраны намеренно: ни то, ни другое
 * не про заготовку. Первое — свойство пространства («канал не подключён»),
 * второе — временное незнание продукта о публикациях, и оба уходят сами.
 * Строка ответа на них не выбирается, а список вариантов они удлиняли в
 * полтора раза. В клетке и в легенде они остались: читать их надо, спрашивать
 * ими — нет.
 */
export const FILTER_STATES: readonly PieceCellStateV1[] = [
  'published',
  'queued',
  'draft',
  'error',
  'none',
];

export const stateWord = (
  state: PieceCellStateV1,
  t: (typeof piecesCopy)[PiecesLocale]
): string =>
  state === 'published'
    ? t.statePublished
    : state === 'queued'
    ? t.stateQueued
    : state === 'draft'
    ? t.stateDraft
    : state === 'error'
    ? t.stateError
    : state === 'none'
    ? t.stateNone
    : state === 'no_channel'
    ? t.stateNoChannel
    : t.stateUnknown;

/*
  Значки состояний: штрих, 16 px, перекрашиваются через `currentColor` — тот же
  приём, что у витрины ресерча рядом. Плюс взят из общего набора икон: он уже
  нарисован ровно так и в том же размере.
*/
const glyph = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

/** Значок состояния. Один на клетку, на чип фильтра и на строку легенды. */
export function StateGlyph({ state }: { state: PieceCellStateV1 }) {
  if (state === 'none') return <PlusIcon aria-hidden focusable="false" />;
  if (state === 'published')
    return (
      <svg {...glyph}>
        <path d="M3.5 8.5l3 3 6-6.5" />
      </svg>
    );
  if (state === 'queued')
    return (
      <svg {...glyph}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5v3.2l2.2 1.3" />
      </svg>
    );
  if (state === 'draft')
    return (
      <svg {...glyph}>
        <path d="M3 13l.6-2.6L10.8 3.2a1.2 1.2 0 011.7 0l.3.3a1.2 1.2 0 010 1.7L5.6 12.4 3 13z" />
      </svg>
    );
  if (state === 'error')
    return (
      <svg {...glyph}>
        <path d="M8 2.5l6 10.5H2L8 2.5z" />
        <path d="M8 6.5v3" />
        <path d="M8 11.4v.1" />
      </svg>
    );
  if (state === 'no_channel')
    return (
      <svg {...glyph}>
        <circle cx="8" cy="8" r="5.5" />
        <path d="M4.2 11.8l7.6-7.6" />
      </svg>
    );
  return (
    <svg {...glyph}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.6 6.4a1.45 1.45 0 012.8.5c0 .95-1.4 1.1-1.4 2.1" />
      <path d="M8 11.4v.1" />
    </svg>
  );
}

/**
 * Сам квадрат: значок, тон и — если площадка несёт больше одной адаптации —
 * цифра в углу. Ничего не нажимает: нажимаемость добавляет клетка таблицы, а
 * легенда берёт этот же квадрат и остаётся текстом.
 */
export function StateSquare({
  state,
  count,
  className,
}: {
  state: PieceCellStateV1;
  /** Сколько каналов площадки заняты, если их больше одного. */
  count?: number;
  className?: string;
}) {
  const tone = TONE[state];
  return (
    <span
      aria-hidden="true"
      className={clsx(
        CELL_BOX,
        tone ? STATUS_TONES[tone] : QUIET[state],
        className
      )}
    >
      <StateGlyph state={state} />
      {count && count > 1 ? (
        <span className="absolute -end-[4px] -top-[4px] flex size-[16px] items-center justify-center rounded-full border border-cf-border bg-cf-surface-raised cf-caption text-cf-ink">
          {count}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Дата в подсказке: день для опубликованного, день и время для
 * запланированного.
 *
 * Считается из ISO без библиотеки дат и без «сегодня»: клетка печатает момент,
 * который ей дали, а не расстояние до него. Строка, которую нельзя прочитать,
 * не печатается вовсе — «Invalid Date» в подсказке хуже пустоты.
 */
export function cellDate(
  state: PieceCellStateV1,
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const two = (value: number) => String(value).padStart(2, '0');
  const day = `${two(at.getDate())}.${two(at.getMonth() + 1)}`;
  if (state === 'published') return `${day}.${two(at.getFullYear() % 100)}`;
  if (state === 'queued')
    return `${day} ${two(at.getHours())}:${two(at.getMinutes())}`;
  return null;
}

/**
 * Подсказка клетки: площадка, момент и что случится по нажатию.
 *
 * Собирается из того, что действительно приехало. Имени канала в ответе нет —
 * клетка называет площадку, а не канал, — и предложения про канал в подсказке
 * поэтому нет вовсе: выдуманное «AiDevTeam» было бы хуже короткой фразы.
 */
export function cellHint(
  cell: PieceCellV1,
  platformName: string,
  t: (typeof piecesCopy)[PiecesLocale]
): string {
  const parts = [`${platformName}.`];
  const when = cellDate(cell.state, cell.date);
  if (when && cell.state === 'published') parts.push(t.cellWhenPublished(when));
  if (when && cell.state === 'queued') {
    // День и время клетка считает одной строкой; предлог между ними — слово, и
    // живёт он в словаре, а не в форматировании даты.
    const [day, time] = when.split(' ');
    parts.push(t.cellWhenQueued(day, time));
  }
  if (cell.more && cell.more > 0) parts.push(t.cellChannels(cell.more + 1));

  const action = cellAction(cell.state);
  if (action === 'post') parts.push(t.cellOpensPost);
  if (action === 'adapt') parts.push(t.cellOpensAdapt);
  if (cell.state === 'no_channel') parts.push(t.noChannelReason);
  if (cell.state === 'unknown') parts.push(t.unknownReason);

  return parts.join(' ');
}

export function AdaptationCell({
  locale,
  cell,
  platformName,
  showPlatformName = false,
  onOpenPost,
  onAdapt,
  disabled = false,
}: {
  locale: PiecesLocale;
  cell: PieceCellV1;
  /** Имя площадки для подсказки и для доступного имени клетки. */
  platformName: string;
  /**
   * Назвать площадку рядом с квадратом.
   *
   * В таблице площадку называет колонка, и второе имя в каждой клетке было бы
   * шапкой, переписанной столько раз, сколько строк. На карточке колонок нет
   * вовсе — там имя стоит рядом, иначе человек читает ряд одинаковых квадратов
   * и не знает, чьи они.
   */
  showPlatformName?: boolean;
  onOpenPost?: (cell: PieceCellV1) => void;
  onAdapt?: (cell: PieceCellV1) => void;
  /** Только чтение: клетка остаётся читаемой, но ничего не начинает. */
  disabled?: boolean;
}) {
  const t = piecesCopy[locale];
  const word = stateWord(cell.state, t);
  const action = cellAction(cell.state);
  const hint = cellHint(cell, platformName, t);
  const off = disabled || action === 'none';

  return (
    <span className="inline-flex items-center gap-[8px]">
      <button
        type="button"
        data-piece-cell={cell.platform}
        data-piece-cell-state={cell.state}
        disabled={off}
        title={hint}
        /*
          Доступное имя несёт площадку и слово состояния: цвет и значок
          объясняют клетку глазу, имя — всему остальному. Причина отказа стоит
          в подсказке, а не только за нажатием, которого не будет.
        */
        aria-label={t.cellLabel(platformName, word)}
        onClick={() => {
          if (action === 'post') onOpenPost?.(cell);
          if (action === 'adapt') onAdapt?.(cell);
        }}
        className={clsx(
          'inline-flex items-center justify-center rounded-[4px] transition-colors duration-state motion-reduce:transition-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
          off ? 'cursor-default' : 'cf-pressed hover:opacity-80'
        )}
      >
        <StateSquare
          state={cell.state}
          count={cell.more ? cell.more + 1 : undefined}
        />
      </button>
      {showPlatformName ? (
        <span
          data-piece-cell-platform={cell.platform}
          className="cf-caption text-cf-ink-muted"
        >
          {platformName}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Легенда под таблицей: та же клетка и её слово.
 *
 * Слово состояния уехало из клетки в подсказку, и легенда — это место, где оно
 * остаётся видимым без наведения. Клетка здесь не нажимается: это словарь, а
 * не второй ряд управления.
 */
export function AdaptationLegend({
  locale,
  states = CELL_STATES_IN_ORDER,
}: {
  locale: PiecesLocale;
  states?: readonly PieceCellStateV1[];
}) {
  const t = piecesCopy[locale];
  return (
    <ul
      data-piece-legend="true"
      aria-label={t.legendLabel}
      className="flex flex-wrap items-center gap-x-[20px] gap-y-[8px]"
    >
      {states.map((state) => (
        <li
          key={state}
          data-piece-legend-state={state}
          className="inline-flex items-center gap-[8px]"
        >
          <StateSquare state={state} />
          <span className="cf-caption text-cf-ink-muted">
            {stateWord(state, t)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default AdaptationCell;
