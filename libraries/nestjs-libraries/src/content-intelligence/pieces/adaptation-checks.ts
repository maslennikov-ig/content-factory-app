/**
 * Квитанция проверок адаптации — одной сборкой для записи и для чтения.
 *
 * `content-factory-next-97dq.2`, находка восьмого захода: строка качества
 * жила ровно до перезагрузки страницы. Считалась она один раз, в момент
 * записи адаптации (`piece.service.ts`, `persist`), уезжала в событие стрима и
 * нигде не хранилась, а `adaptationOf` про неё не знал вовсе — человек видел
 * «Штампов: 2, голос похож», нажимал F5 и больше не видел ничего.
 *
 * Хранить её негде: схема в этой волне не меняется. Но хранить и не нужно —
 * все три проверки детерминированы и бесплатны:
 *
 *  - **штампы** — арифметика по каталогу;
 *  - **антикопия** — сравнение слов с отпечатками чужого текста, которые
 *    заготовка и так хранит в своём брифе (`foreignShingles`);
 *  - **голос** — та же мерка разбора области, что и кнопка в ленте; модели
 *    она не спрашивает и никогда не бросает.
 *
 * Поэтому проверка считается заново по сохранённому телу, и считается ОДНИМ
 * местом: две сборки одной квитанции разъехались бы на первом же пороге, и
 * разъехались бы молча — обе вернули бы правдоподобное число.
 *
 * Чего здесь нет: второго захода генерации. `retried` знает только тот, кто
 * генерировал, поэтому запись отдаёт свой отчёт антикопии как есть
 * (`antiCopy` передан), а чтение считает его по телу заново.
 */

import {
  antiCopyReport,
  ANTI_COPY_MIN_WORDS,
} from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/anti-copy';
import type {
  AdaptationChecksV1,
  AntiCopyReportV1,
  SlopReportV1,
  VoiceCheckReportV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  VOICE_CHECK_SILENT,
  type VoiceCheckPort,
} from '../brand-voice/voice-check.port';

/**
 * Шов проверки на ИИ-штампы: тот же порт, что держит сервис заготовок.
 *
 * Опоры — необязательный последний довод (`content-factory-next-97dq.10`):
 * подменённый порт в наборах о них не знает и продолжает собираться.
 */
export type AdaptationSlopCheck = (
  text: string,
  platform: string,
  locale: 'ru' | 'en',
  grounded?: readonly string[]
) => SlopReportV1 | null;

export type AdaptationChecksInput = {
  organizationId: string;
  /** Тело адаптации простым текстом — то, что показывает страница. */
  text: string;
  platform: string;
  language: 'ru' | 'en';
  /** Отпечатки чужого текста заготовки; без них антикопии не бывает. */
  foreignShingles?: readonly string[];
  /**
   * Готовый отчёт антикопии от генерации. Отличается от пересчёта одним
   * полем — `retried`, — и подделывать его чтением нечем.
   */
  antiCopy?: AntiCopyReportV1 | null;
  /**
   * На чём стоит эта заготовка: её суть и отмеченные опоры брифа.
   *
   * `content-factory-next-97dq.10`. Точное число из материала перестаёт быть
   * размытым количеством: «более 620 000 бизнесов» из источника — это факт, а
   * не штамп. Пусто — каталог считает как считал.
   */
  grounded?: readonly string[];
};

export type AdaptationChecksDeps = {
  slopCheck: AdaptationSlopCheck | null;
  voiceCheck: VoiceCheckPort | null;
};

/**
 * Упавшая проверка — это `null`, а не пятисотая на чтении страницы.
 *
 * `content-factory-next-97dq.2`, разбор корректности P2-18: не бросать обещал
 * только порт голоса; каталог штампов и антикопия — обычные функции, и одно
 * ядовитое тело закрывало бы страницу заготовки навсегда. Квитанция — это
 * предупреждение, а не ворота, и пустая клетка честнее отказа показать текст.
 */
const quietly = <T>(
  compute: () => T,
  onError?: (error: unknown) => void
): T | null => {
  try {
    return compute();
  } catch (error) {
    onError?.(error);
    return null;
  }
};

/** Всё, кроме голоса: штампы и антикопия считаются на месте и без запросов. */
const offlineChecks = (
  input: AdaptationChecksInput,
  deps: AdaptationChecksDeps
): Omit<AdaptationChecksV1, 'voice'> => {
  const text = (input.text || '').trim();
  const shingles = input.foreignShingles ?? [];
  return {
    antiCopy:
      input.antiCopy !== undefined
        ? input.antiCopy
        : text && shingles.length
        ? quietly(() =>
            antiCopyReport(text, shingles, { minWords: ANTI_COPY_MIN_WORDS })
          )
        : null,
    slop:
      text && deps.slopCheck
        ? quietly(() =>
            deps.slopCheck!(
              text,
              input.platform,
              input.language,
              input.grounded
            )
          )
        : null,
  };
};

export async function adaptationChecksOf(
  input: AdaptationChecksInput,
  deps: AdaptationChecksDeps
): Promise<AdaptationChecksV1> {
  const text = (input.text || '').trim();
  return {
    ...offlineChecks(input, deps),
    voice:
      text && deps.voiceCheck
        ? await deps.voiceCheck.voiceCheckFor(
            input.organizationId,
            text,
            input.language
          )
        : VOICE_CHECK_SILENT,
  };
}

/**
 * Квитанции нескольких адаптаций одной заготовки — одним разбором голоса.
 *
 * `content-factory-next-97dq.2`, разбор корректности P1-2: страница считала
 * вердикт голоса на каждую строку, а каждый вердикт заново читал разбор
 * области и её мерку — четыре запроса на строку и двадцать строк на страницу.
 * Разбор один, читается он один раз, а тексты меряются против него по
 * очереди (`voiceCheckMany`).
 *
 * Порт без пакетного метода остаётся прежним портом: тогда считается по
 * одному, как считалось. Ответов ровно столько же, сколько текстов, и в том же
 * порядке — соответствие строке страницы держится позицией, а не поиском.
 */
export async function adaptationChecksMany(
  common: {
    organizationId: string;
    language: 'ru' | 'en';
    foreignShingles?: readonly string[];
    /** Опоры заготовки: у всех её адаптаций они одни и те же. */
    grounded?: readonly string[];
  },
  rows: ReadonlyArray<{ text: string; platform: string }>,
  deps: AdaptationChecksDeps
): Promise<AdaptationChecksV1[]> {
  if (!rows.length) return [];
  const texts = rows.map((row) => (row.text || '').trim());
  const voices: VoiceCheckReportV1[] = !deps.voiceCheck
    ? texts.map(() => VOICE_CHECK_SILENT)
    : deps.voiceCheck.voiceCheckMany
    ? await deps.voiceCheck.voiceCheckMany(
        common.organizationId,
        texts,
        common.language
      )
    : await Promise.all(
        texts.map((text) =>
          text
            ? deps.voiceCheck!.voiceCheckFor(
                common.organizationId,
                text,
                common.language
              )
            : Promise.resolve(VOICE_CHECK_SILENT)
        )
      );
  return rows.map((row, index) => ({
    ...offlineChecks(
      {
        organizationId: common.organizationId,
        text: texts[index],
        platform: row.platform,
        language: common.language,
        foreignShingles: common.foreignShingles,
        grounded: common.grounded,
      },
      deps
    ),
    voice: voices[index] ?? VOICE_CHECK_SILENT,
  }));
}
