'use client';

import { Fragment, useId, useState, type ReactNode } from 'react';
import { ControlButton } from '@contentfactory/react/choice/control.button';
import {
  isSilenceCode,
  type AntiCopyReportV1,
  type SlopReportV1,
  type VoiceCheckV1,
} from '../intake/intake.adapter';
import { intakeCopy, type IntakeLocale } from '../intake/intake.copy';
import { SlopFindingList } from './slop-finding-list';

/**
 * Одна строка качества под текстом — в трёх местах одна и та же.
 *
 * Решение владельца 07.09.2026 (`content-factory-next-fn33.28.4`). До него
 * четыре проверки жили четырьмя поверхностями: вердикт штампов на странице
 * заготовки, кнопка «Проверить на штампы» под адаптацией, лента голоса в
 * окне поста и записка про своё число. Человек, пишущий пост, читал их как
 * четыре разных мнения о своём тексте — и ни одно не говорило, что делать.
 *
 * Три правила, из-за которых строка выглядит так, а не иначе.
 *
 * **Молчание — обычный исход.** Чистый текст не получает ни строки, ни
 * галочки, ни «находок нет»: подтверждение того, что всё в порядке, занимает
 * место и приучает пролистывать. Нечего сказать — компонент рисует `null`.
 *
 * **Ничего не запрещается.** Строка не гасит кнопок, не красится тревогой и
 * не ждёт ответа. `FAR` у голоса — замечание, а не ворота; так же читается
 * `rewrite` у штампов там, где хост про него говорит.
 *
 * **Проверки даром и одинаковы.** Штампы, чужие фразы и своё число считаются
 * без модели, поэтому строка появляется сразу и на один и тот же текст
 * отвечает одинаково. Ничего платного отсюда не зовётся, и текст она не
 * правит: правит человек.
 */

/** Своего числа в тексте нет — то же, что говорит `draftGaps` сервера. */
export const OWN_NUMBERS_GAP = [
  { metric: 'carriesOwnMeasurement' },
] as const;

type SegmentId = 'slop' | 'anti-copy' | 'voice' | 'gaps';

type Segment = {
  id: SegmentId;
  word: string;
  /** Что раскрывается под строкой. `null` — раскрывать нечего. */
  details: ReactNode | null;
};

/** Говорит ли `draftGaps` о недостающем своём числе. */
const missesOwnNumbers = (gaps: readonly unknown[] | null | undefined) =>
  (gaps ?? []).some(
    (gap) =>
      !!gap &&
      typeof gap === 'object' &&
      (gap as { metric?: unknown }).metric === 'carriesOwnMeasurement'
  );

export function QualityLine({
  locale,
  slop,
  antiCopy,
  voice,
  draftGaps,
}: {
  locale: IntakeLocale;
  slop?: SlopReportV1 | null;
  antiCopy?: AntiCopyReportV1 | null;
  /**
   * Похоже ли это на вас. `undefined` — обычное состояние ответа, который
   * вердикта ещё не несёт, и молчание здесь честнее домысла.
   */
  voice?: VoiceCheckV1 | null;
  draftGaps?: readonly unknown[] | null;
}) {
  const t = intakeCopy[locale];
  const baseId = useId();
  const [opened, setOpened] = useState<SegmentId | null>(null);

  const segments: Segment[] = [];

  const findings = slop?.findings ?? [];
  if (findings.length > 0) {
    segments.push({
      id: 'slop',
      word: t.qualitySlop(findings.length),
      details: <SlopFindingList locale={locale} findings={findings} />,
    });
  }

  const runs = antiCopy && !antiCopy.clean ? antiCopy.runs ?? [] : [];
  if (runs.length > 0) {
    segments.push({
      id: 'anti-copy',
      word: t.qualityAntiCopy(runs.length),
      details: (
        <div className="flex min-w-0 flex-col gap-[8px]">
          <ul className="flex flex-col gap-[8px]">
            {runs.map((run, index) => (
              <li
                key={`${run.start}-${index}`}
                data-anti-copy-run={run.start}
                className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[8px] max-w-[64ch] cf-body-sm text-cf-ink [text-wrap:pretty]"
              >
                «{run.text}»
              </li>
            ))}
          </ul>
          <p className="max-w-[64ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.qualityAntiCopyDetail}
          </p>
        </div>
      ),
    });
  }

  /*
    Только `FAR`. `CLOSE` — это «всё в порядке», а `UNKNOWN` — «сказать
    нечем»: обе строки заняли бы место, ничего не сообщив, и приучили бы
    пролистывать ту единственную, которая сообщает.
  */
  if (voice?.verdict === 'FAR') {
    const reason = isSilenceCode(voice.reason) ? undefined : voice.reason;
    segments.push({
      id: 'voice',
      word: t.qualityVoiceFar,
      details: reason ? (
        <p className="max-w-[64ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
          {reason}
        </p>
      ) : null,
    });
  }

  if (missesOwnNumbers(draftGaps)) {
    segments.push({
      id: 'gaps',
      word: t.qualityGaps,
      details: (
        <p className="max-w-[64ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.qualityGapsDetail}
        </p>
      ),
    });
  }

  if (segments.length === 0) return null;

  const open = segments.find((segment) => segment.id === opened) ?? null;

  return (
    <div data-quality-line="true" className="flex min-w-0 flex-col gap-[8px]">
      <div className="flex min-w-0 flex-wrap items-center gap-[8px] cf-caption text-cf-ink-muted">
        {segments.map((segment, index) => (
          <Fragment key={segment.id}>
            {index > 0 && <span aria-hidden="true">·</span>}
            {segment.details ? (
              /*
                Вид принадлежит строке, а не кнопке: `ControlButton` даёт
                `type="button"`, кольцо фокуса и читаемый `disabled`, и не
                навязывает ни цвета, ни рамки — ровно то, ради чего он и
                заведён. `Button` здесь забрал бы краску и высоту действия, а
                это не действие, а раскрытие подписи под текстом.
              */
              <ControlButton
                density="dense"
                mobileTouchTarget
                data-quality-segment={segment.id}
                aria-expanded={opened === segment.id}
                aria-controls={`${baseId}-${segment.id}`}
                onClick={() =>
                  setOpened((current) =>
                    current === segment.id ? null : segment.id
                  )
                }
                className="rounded-[4px] underline decoration-dotted underline-offset-2 transition-colors duration-150 ease-out hover:text-cf-ink active:text-cf-ink"
              >
                {segment.word}
              </ControlButton>
            ) : (
              <span data-quality-segment={segment.id}>{segment.word}</span>
            )}
          </Fragment>
        ))}
      </div>

      {open?.details ? (
        <div id={`${baseId}-${open.id}`} className="flex min-w-0 flex-col">
          {open.details}
        </div>
      ) : null}
    </div>
  );
}

export default QualityLine;
