'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { QualityLine } from '@contentfactory/frontend/components/content-intelligence/shared/quality-line';
import {
  INTAKE_API,
  readSlopReport,
  readVoiceCheck,
  type SlopReportV1,
  type VoiceCheckV1,
} from '@contentfactory/frontend/components/content-intelligence/intake/intake.adapter';
import type { IntakeLocale } from '@contentfactory/frontend/components/content-intelligence/intake/intake.copy';
import { VOICE_API_BASE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * Строка качества под редактором окна поста.
 *
 * Решение владельца 07.09.2026 (`content-factory-next-fn33.28.4`): одна и та
 * же строка в трёх местах, и окно поста — третье. Здесь текст не приезжает с
 * проверками: его печатает человек, поэтому проверки спрашиваются по мере
 * того, как он пишет.
 *
 * Четыре решения, без которых эта строка навредила бы больше, чем помогла.
 *
 * **Обе двери бесплатные и считают без модели.** `slop-check` и
 * `voice/text-check` — правила и мерка, снятая заранее; на один и тот же
 * текст они отвечают одинаково и денег не стоят. Платной правки предложения
 * отсюда нет вовсе: 07.09.2026 владелец её снял, и дверь `text-check/repair`
 * уходит вместе с лентой, которая её звала.
 *
 * **Ниже ста двадцати знаков не спрашивается ничего.** Первая недописанная
 * строка — это не привычка автора, и замечание о ней было бы замечанием ни о
 * чём. Тот же порог держала лента голоса, и он остался её единственной
 * пережившей мыслью.
 *
 * **Восемьсот миллисекунд тишины.** Ключ SWR — сам текст, поэтому ответ на
 * прошлую версию черновика не может дорисоваться поверх новой: он приходит
 * под чужим ключом и отбрасывается.
 *
 * **Строка ничего не держит.** Ни отказа двери, ни ожидания она не
 * показывает, и ни одна кнопка окна её не ждёт: сохранение, расписание и
 * отправка не знают о ней вовсе. Проверка, которая не ответила, — это
 * отсутствие проверки, а не ошибка окна.
 */

/** Ниже этого мерка описывает случайность одной фразы, а не манеру. */
const MIN_MEASURABLE_CHARS = 120;

/** Печать успевает утихнуть, прежде чем черновик меряют. */
const DEFAULT_DEBOUNCE_MS = 800;

const TEXT_CHECK_PATH = `${VOICE_API_BASE}/text-check`;

export function DraftQualityLine({
  locale,
  text,
  platform,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  locale: IntakeLocale;
  /** Текст коробок поста без разметки — то, что человек написал прямо сейчас. */
  text: string;
  /** Площадка выбранного канала: пороги штампов у неё свои. */
  platform?: string | null;
  /** Ноль меряет сразу — для проверок, а не для окна. */
  debounceMs?: number;
}) {
  const request = useFetch();

  const [settled, setSettled] = useState(text);
  useEffect(() => {
    if (debounceMs <= 0) {
      setSettled(text);
      return;
    }
    const timer = setTimeout(() => setSettled(text), debounceMs);
    return () => clearTimeout(timer);
  }, [text, debounceMs]);

  const measurable = settled.length >= MIN_MEASURABLE_CHARS;

  const slopQuery = useSWR<SlopReportV1 | null>(
    measurable ? ['draft-quality-slop', platform ?? '', settled] : null,
    async () => {
      const response = await request(INTAKE_API.slopCheck, {
        method: 'POST',
        body: JSON.stringify({
          text: settled,
          ...(platform ? { platform } : {}),
          locale,
        }),
      });
      if (!response.ok) return null;
      return readSlopReport(await response.json());
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  const voiceQuery = useSWR<VoiceCheckV1 | null>(
    measurable ? ['draft-quality-voice', settled] : null,
    async () => {
      const response = await request(TEXT_CHECK_PATH, {
        method: 'POST',
        body: JSON.stringify({ text: settled }),
      });
      if (!response.ok) return null;
      return readVoiceCheck(await response.json());
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );

  if (!measurable) return null;

  return (
    <QualityLine
      locale={locale}
      slop={slopQuery.data ?? null}
      voice={voiceQuery.data ?? null}
    />
  );
}

export default DraftQualityLine;
