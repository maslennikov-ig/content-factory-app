'use client';

import clsx from 'clsx';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { Status, type StatusTone } from '../../ui/surface';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import {
  cellAction,
  type PieceCellStateV1,
  type PieceCellV1,
} from './pieces.adapter';

/**
 * Клетка матрицы «площадка × заготовка» — единственный новый компонент волны.
 *
 * Семь состояний живут в одном месте, потому что шесть из них уже назывались
 * по-разному в трёх экранах, а седьмого — «пока не знаем» — не было вовсе.
 * Клетка сама решает, нажимается ли она и что нажатие значит: открыть пост
 * (`published`, `queued`, `draft`, `error`) или начать адаптацию (`none`).
 *
 * Три решения здесь важнее вида.
 *
 * **Пустая клетка — возможность, а не долг** (§11.7 карты раздела). У `none`
 * пунктирная рамка, приглушённое слово и никакого тревожного цвета; счётчиков
 * «заполнено N из M» на этом экране нет нигде.
 *
 * **`no_channel` объясняет себя до нажатия.** Клетка выключена, причина стоит
 * в `title` и уходит в доступное имя, а не приезжает отказом после нажатия —
 * то же правило, по которому старая таблица материалов перестала предлагать
 * площадку без канала (`fn33.86`).
 *
 * **`unknown` — это не «ещё нет».** Ответ без клеток означает, что публикацию
 * ещё не прочитали, и «ещё нет» поверх существующих постов было бы враньём.
 *
 * Цвет не единственный носитель смысла: у каждого состояния своё слово, а
 * дата стоит рядом отдельной строкой в моноширинном `caption` — это дата,
 * а не подпись.
 */

const TONE: Partial<Record<PieceCellStateV1, StatusTone>> = {
  published: 'accent',
  queued: 'info',
  draft: 'neutral',
  error: 'danger',
};

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

/**
 * Дата в клетке: день для опубликованного, день и время для запланированного.
 *
 * Считается из ISO без библиотеки дат и без «сегодня»: клетка печатает момент,
 * который ей дали, а не расстояние до него. Строка, которую нельзя прочитать,
 * не печатается вовсе — «Invalid Date» в таблице хуже пустоты.
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
  if (state === 'queued') return `${day} ${two(at.getHours())}:${two(at.getMinutes())}`;
  return null;
}

export function AdaptationCell({
  locale,
  cell,
  platformName,
  onOpenPost,
  onAdapt,
  disabled = false,
}: {
  locale: PiecesLocale;
  cell: PieceCellV1;
  /** Имя площадки для шапки и для доступного имени клетки. */
  platformName: string;
  onOpenPost?: (cell: PieceCellV1) => void;
  onAdapt?: (cell: PieceCellV1) => void;
  /** Только чтение: клетка остаётся читаемой, но ничего не начинает. */
  disabled?: boolean;
}) {
  const t = piecesCopy[locale];
  const word = stateWord(cell.state, t);
  const date = cellDate(cell.state, cell.date);
  const action = cellAction(cell.state);
  const tone = TONE[cell.state];
  const reason =
    cell.state === 'no_channel'
      ? t.noChannelReason
      : cell.state === 'unknown'
      ? t.unknownReason
      : undefined;
  const off = disabled || action === 'none';

  return (
    <span className="flex flex-col items-start gap-[4px]">
      <button
        type="button"
        data-piece-cell={cell.platform}
        data-piece-cell-state={cell.state}
        disabled={off}
        title={reason}
        aria-label={t.cellLabel(platformName, word)}
        onClick={() => {
          if (action === 'post') onOpenPost?.(cell);
          if (action === 'adapt') onAdapt?.(cell);
        }}
        className={clsx(
          'inline-flex min-h-[32px] max-w-full items-center gap-[8px] rounded-[8px] border px-[8px] py-[4px] text-start transition-colors duration-state motion-reduce:transition-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
          off
            ? 'border-cf-border text-cf-ink-muted'
            : 'border-cf-border-control text-cf-ink hover:bg-cf-surface-subtle cf-pressed',
          // Пунктир — единственное, чем «ещё нет» отличается от занятой
          // клетки. Ни цвета, ни знака: это возможность, а не пропуск.
          cell.state === 'none' && 'border-dashed',
          cell.state === 'no_channel' && 'opacity-70'
        )}
      >
        <PlatformBadge identifier={cell.platform} name={platformName} size={16} />
        {tone ? (
          <Status tone={tone}>{word}</Status>
        ) : (
          <span className="cf-caption text-cf-ink-muted">{word}</span>
        )}
      </button>
      {date ? (
        <span
          data-piece-cell-date={cell.platform}
          className="cf-caption tabular-nums text-cf-ink-muted"
        >
          {date}
        </span>
      ) : null}
      {reason ? (
        <span className="max-w-[24ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {reason}
        </span>
      ) : null}
      {cell.more && cell.more > 0 ? (
        <span
          data-piece-cell-more={cell.platform}
          className="cf-caption text-cf-ink-muted"
        >
          {t.more(cell.more)}
        </span>
      ) : null}
    </span>
  );
}

export default AdaptationCell;
