'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import {
  VOICE_API_BASE,
  type VoiceInjectionPlanResponseV1,
  type VoiceRepairResponseV1,
  type VoiceRibbonResponseV1,
  type VoiceTextCheckResponseV1,
  type VoiceTextSpotV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { VoiceRibbon, type RibbonState } from './voice-ribbon';
import { VoiceSpots, type SpotRepair } from './voice-spots';
import type { VoiceLocale } from './voice-copy';

/**
 * The accepted strip, wired to the product it describes.
 *
 * `36r.13` built the four states and `07h` gave them routes, and for a while
 * the post form joined them with neither: it decided staleness from a thirty-
 * day constant compiled into the client, and `voice-moved` could not fire at
 * all, because nothing on that side knew which version is in force *now*. A
 * strip answering "what is writing this" from a guess is worse than no strip,
 * because a reader believes it.
 *
 * So the state and the details arrive whole from `GET /voice/ribbon` and are
 * passed through untouched. Nothing here recomputes them; the day the rule for
 * "stale" changes, it changes in one place and every host follows.
 *
 * Two more things a strip alone cannot do. The voice has to survive a long
 * generation, and the boundaries where it is restated are the boxes this form
 * really holds — not a guess about how a thread might be cut. And generated
 * text is measured against *this* author's corridors by the same functions
 * that drew them, so the remark fires where the writer left their own habits
 * and never against a general norm nobody asked for.
 */

const RIBBON_PATH = `${VOICE_API_BASE}/ribbon`;
const INJECTION_PLAN_PATH = `${VOICE_API_BASE}/injection-plan`;
const TEXT_CHECK_PATH = `${VOICE_API_BASE}/text-check`;
const REPAIR_PATH = `${VOICE_API_BASE}/text-check/repair`;

/**
 * Below this the measurement is one sentence's accident rather than a habit.
 *
 * The route has no such floor and should not: it answers what it is asked. The
 * floor belongs here, where the question is asked of a draft still being typed
 * — reporting "выше коридора" on a half-written first line would be a remark
 * about nothing.
 */
const MIN_MEASURABLE_CHARS = 120;

/** Typing settles before the draft is measured. */
const DEFAULT_DEBOUNCE_MS = 800;

type Request = ReturnType<typeof useFetch>;

async function readJson(request: Request, path: string, init?: RequestInit) {
  const response = await request(path, init);
  if (!response.ok) {
    const error = new Error(`Voice request failed: ${response.status}`);
    // The refusal names its reason — `VoiceErrorBodyV1` — and a screen that
    // throws the body away can only say "что-то пошло не так" over a server
    // that already said what happened.
    const body = await response.json().catch(() => null);
    Object.assign(error, { status: response.status, body });
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

const post = (request: Request, path: string, body: unknown) =>
  readJson(request, path, { method: 'POST', body: JSON.stringify(body) });

/** Три формы, потому что в русском их три. */
const timesRu = (count: number) => {
  const tens = count % 100;
  const ones = count % 10;
  if (tens >= 11 && tens <= 14) return 'раз';
  if (ones >= 2 && ones <= 4) return 'раза';
  return 'раз';
};

const copy = {
  ru: {
    checking: 'Смотрим, какой голос применён',
    unavailable:
      'Не удалось узнать, какой голос применён. Показывать нечего, пока ответ не придёт.',
    retentionThread: (count: number) =>
      `Голос назван ${count} ${timesRu(
        count
      )} — перед каждым куском ветки, чтобы он не растворился к концу.`,
    similarityLabel: 'Похоже ли это на вас',
    /**
     * Заголовок над двумя долями ошибок.
     *
     * «Точность» тут было бы неправдой: одного числа у этой проверки нет, а
     * есть две ошибки, которыми она разменивается друг на друга.
     */
    errorsLabel: 'Сколько раз проверка ошибалась',
    repairFailed:
      'Правку показать не получилось. Исходное предложение осталось как было.',
  },
  en: {
    checking: 'Checking which voice is applied',
    unavailable:
      'Could not read which voice is applied. Nothing is claimed until it answers.',
    retentionThread: (count: number) =>
      `The voice is stated ${count} times — once before every thread item, so it does not dissolve by the end.`,
    similarityLabel: 'Does this read like you',
    errorsLabel: 'How often the check was wrong',
    repairFailed:
      'The repair could not be shown. The original sentence stands as it was.',
  },
} satisfies Record<VoiceLocale, Record<string, unknown>>;

export type VoiceRibbonContainerProps = {
  /**
   * The post as the form holds it: one entry per box, in order.
   *
   * A thread is several boxes and a single post is one, so this is also the
   * only honest source for where the generation will be cut.
   */
  chunks?: readonly string[];
  /**
   * Shown while the live answer is still unknown — the draft's own provenance,
   * where the host has it. It is a weaker claim than the route's, so it never
   * outlives it.
   */
  fallback?: ReactNode;
  /** The strip offers one action per state; the host decides where it goes. */
  onAction?: (state: RibbonState) => void;
  /** Typing settles before the draft is measured. Zero measures at once. */
  checkDebounceMs?: number;
  /**
   * Writes one box back after the person accepts a repair.
   *
   * Without it the repair is still offered and still shown — reading what a
   * sentence would become is worth something on its own — but the accept
   * button is not, because there would be nowhere to put the answer.
   */
  onReplaceChunk?: (index: number, next: string) => void;
};

export function VoiceRibbonContainer({
  chunks = [],
  fallback,
  onAction,
  checkDebounceMs = DEFAULT_DEBOUNCE_MS,
  onReplaceChunk,
}: VoiceRibbonContainerProps) {
  const request = useFetch();
  const { language } = useVariables();
  const locale: VoiceLocale = language?.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
  const t = copy[locale];

  const ribbonQuery = useSWR<VoiceRibbonResponseV1>(
    RIBBON_PATH,
    () => readJson(request, RIBBON_PATH),
    { revalidateOnFocus: false }
  );
  const ribbon = ribbonQuery.data;
  const hasVoice = !!ribbon && ribbon.state !== 'no-profile';

  /**
   * One boundary between every two boxes; the injection at the start covers
   * the first. Three boxes therefore name the voice three times, and one box
   * names it once.
   */
  const boundaries = useMemo(
    () => chunks.slice(1).map(() => 'thread-item' as const),
    [chunks]
  );

  const planQuery = useSWR<VoiceInjectionPlanResponseV1>(
    hasVoice ? [INJECTION_PLAN_PATH, boundaries.length] : null,
    () => post(request, INJECTION_PLAN_PATH, { boundaries }),
    { revalidateOnFocus: false }
  );

  const text = useMemo(
    () =>
      chunks
        .map((chunk) => (chunk ?? '').trim())
        .filter(Boolean)
        .join('\n\n'),
    [chunks]
  );

  const [settled, setSettled] = useState(text);
  useEffect(() => {
    if (checkDebounceMs <= 0) {
      setSettled(text);
      return;
    }
    const timer = setTimeout(() => setSettled(text), checkDebounceMs);
    return () => clearTimeout(timer);
  }, [text, checkDebounceMs]);

  const measurable = hasVoice && settled.length >= MIN_MEASURABLE_CHARS;
  const checkQuery = useSWR<VoiceTextCheckResponseV1>(
    measurable ? [TEXT_CHECK_PATH, settled] : null,
    () => post(request, TEXT_CHECK_PATH, { text: settled }),
    { revalidateOnFocus: false }
  );

  /**
   * One sentence at a time.
   *
   * Not a queue and not a batch: each repair is a paid call, and a screen that
   * lets somebody start five of them spends five times the quota on a draft
   * they may abandon. It is also how a person edits — one phrase, read it,
   * keep it or not.
   */
  const [repair, setRepair] = useState<SpotRepair | null>(null);

  useEffect(() => {
    // The draft moved. A proposal for a sentence that may no longer be there
    // is worse than no proposal, because it looks current.
    setRepair(null);
  }, [settled]);

  const askRepair = async (spot: VoiceTextSpotV1) => {
    setRepair({ sentence: spot.sentence, status: 'loading' });
    try {
      const answer = (await post(request, REPAIR_PATH, {
        text: settled,
        sentence: spot.sentence,
        note: spot.note,
      })) as VoiceRepairResponseV1;
      setRepair({
        sentence: spot.sentence,
        status: 'ready',
        proposal: answer.proposal,
        note: answer.note,
        keptFacts: answer.keptFacts,
        // The box holds HTML; a sentence with a tag inside it has no verbatim
        // occurrence to replace. Saying so beats replacing the wrong thing.
        applicable:
          !!onReplaceChunk &&
          chunks.some((chunk) => (chunk ?? '').includes(spot.sentence)),
      });
    } catch (error) {
      setRepair({
        sentence: spot.sentence,
        status: 'error',
        message:
          (error as { body?: { message?: string } })?.body?.message ??
          t.repairFailed,
      });
    }
  };

  const applyRepair = (accepted: SpotRepair) => {
    const index = chunks.findIndex((chunk) =>
      (chunk ?? '').includes(accepted.sentence)
    );
    if (index < 0 || !accepted.proposal || !onReplaceChunk) return;
    onReplaceChunk(
      index,
      (chunks[index] ?? '').replace(accepted.sentence, accepted.proposal)
    );
    // The check re-runs by itself once the new text settles, which is how the
    // person sees the picture move after each accepted repair.
    setRepair(null);
  };

  if (ribbonQuery.error) {
    return (
      <div
        data-voice-ribbon-live="error"
        className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
      >
        {fallback}
        <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {t.unavailable}
        </p>
      </div>
    );
  }

  if (!ribbon) {
    return (
      <div
        data-voice-ribbon-live="loading"
        aria-busy="true"
        className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
      >
        {fallback}
        <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {t.checking}
        </p>
      </div>
    );
  }

  const injections = planQuery.data?.injections?.length;
  const outside = checkQuery.data?.outside ?? [];

  return (
    <div data-voice-ribbon-live="ready" className="flex flex-col gap-[8px]">
      <VoiceRibbon
        locale={locale}
        state={ribbon.state}
        details={ribbon.details}
        onAction={onAction}
      />

      {/*
        Строка о повторах — только у ветки.
        Одиночному посту она говорила «голос назван один раз: у одиночного
        поста нет границы, повтор был бы шумом» — объяснение устройства
        генератора человеку, который просто пишет пост (замечание владельца
        04.09.2026). У ветки из нескольких кусков вопрос настоящий: там голос
        действительно может раствориться к концу, и число повторов — ответ.
      */}
      {injections && injections > 1 ? (
        <p
          data-voice-retention={injections}
          className="cf-caption text-cf-ink-muted [text-wrap:pretty]"
        >
          {t.retentionThread(injections)}
        </p>
      ) : null}

      {checkQuery.data ? (
        <div
          data-voice-corridor={outside.length > 0 ? 'true' : 'false'}
          data-voice-similarity={checkQuery.data.similarity.verdict}
          className={clsx(
            'flex flex-col gap-[4px] rounded-[8px] border p-[8px]',
            // Far from the author's manner is a remark, so it borrows the
            // warning tone and nothing from an error. Unknown borrows neither:
            // "cannot tell" is not a finding.
            checkQuery.data.similarity.verdict === 'FAR'
              ? 'border-cf-warning bg-cf-warning-soft'
              : 'border-cf-border bg-cf-surface'
          )}
        >
          <span className="cf-label-sm uppercase text-cf-ink-muted">
            {t.similarityLabel}
          </span>
          <p className="cf-caption text-cf-ink [text-wrap:pretty]">
            {checkQuery.data.summary}
          </p>

          {/*
            Молчание молчанию рознь, и человеку от них нужно разное. Причина
            стоит в атрибуте, а не только в словах, чтобы «текст короток» и
            «границ ещё нет» нельзя было спутать ни глазом, ни проверкой: до
            27.08.2026 все они приходили одним `UNKNOWN`.
          */}
          {checkQuery.data.silenceHint ? (
            <p
              data-voice-silence={checkQuery.data.similarity.reason ?? 'NONE'}
              className="cf-caption text-cf-ink-muted [text-wrap:pretty]"
            >
              {checkQuery.data.silenceHint}
            </p>
          ) : null}

          {/*
            Чего стоит вердикт. Обе доли ошибок и оба знаменателя, потому что
            одно число прячет размен между ними: порог, поднятый ради чужих
            текстов, начинает отвергать настоящие посты автора.
          */}
          {checkQuery.data.calibrationErrors ? (
            <div
              data-voice-calibration-errors="true"
              className="mt-[4px] flex flex-col gap-[4px] border-t border-cf-border pt-[4px]"
            >
              <span className="cf-label-sm uppercase text-cf-ink-muted">
                {t.errorsLabel}
              </span>
              {checkQuery.data.calibrationErrors.falseAccept ? (
                <p
                  data-voice-false-accept={
                    checkQuery.data.calibrationErrors.falseAccept.wrong
                  }
                  className="cf-caption text-cf-ink-muted [text-wrap:pretty]"
                >
                  {checkQuery.data.calibrationErrors.falseAccept.text}
                </p>
              ) : null}
              {checkQuery.data.calibrationErrors.falseReject ? (
                <p
                  data-voice-false-reject={
                    checkQuery.data.calibrationErrors.falseReject.wrong
                  }
                  className="cf-caption text-cf-ink-muted [text-wrap:pretty]"
                >
                  {checkQuery.data.calibrationErrors.falseReject.text}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <VoiceSpots
        locale={locale}
        spots={checkQuery.data?.spots ?? []}
        repair={repair}
        onRepair={askRepair}
        onApply={applyRepair}
        onDismiss={() => setRepair(null)}
      />
    </div>
  );
}
