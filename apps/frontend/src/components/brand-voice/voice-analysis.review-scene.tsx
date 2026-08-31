'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceAnalysisScreen,
  type AnalysisLexiconRow,
  type AnalysisRejectedRow,
  type VoiceAnalysisState,
} from './voice-analysis.screen';

/**
 * Screen 04: the deterministic pass.
 *
 * `default` and `loading` carry the run in progress — a percentage and a
 * stage, nothing more, because that is everything `VoiceAnalysisResponseV1`
 * hands over while it is `pending`. `success` is the one state with numbers
 * to show, and it is deliberately not the state most people will linger on:
 * the run finishes in seconds for a corpus small enough to paste, and this
 * screen exists mainly to be watched while it moves.
 */

const LEXICON: AnalysisLexiconRow[] = [
  { term: 'смена', count: 64 },
  { term: 'отгрузка', count: 51 },
  { term: 'по факту', count: 37 },
  { term: 'без лишних слов', count: 22 },
];

const REJECTED: AnalysisRejectedRow[] = [
  { code: 'smp-06', reason: 'TOO_SHORT' },
  { code: 'smp-09', reason: 'AI_ARTEFACT' },
];

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/analysis',
  fixture: { screen: '04', sampleCount: 16, charCount: 15200 },
  notes: {
    loading: {
      ru: 'Первые секунды: ни процента, ни стадии ещё нет — полоса едва тронулась.',
      en: 'The first seconds: no percentage or stage yet — the bar has barely moved.',
    },
    empty: {
      ru: 'Числа появятся через несколько секунд. Пустые клетки не заполняются догадками.',
      en: 'Numbers arrive in a few seconds. Empty cells are never filled with a guess.',
    },
    default: {
      ru: 'Идёт разбор: процент и стадия — ровно то, что несёт `pending`.',
      en: 'Running: the percentage and the stage — exactly what `pending` carries.',
    },
    selected: {
      ru: 'Та же полоса, отмеченная как текущий шаг мастера.',
      en: 'The same bar, marked as the wizard’s current step.',
    },
    success: {
      ru: 'Разбор завершён: длина фраз, лексика и пунктуация — то, что действительно посчитано.',
      en: 'The analysis is finished: sentence length, vocabulary and punctuation — what was actually counted.',
    },
    error: {
      ru: 'Разбор прерван. Кнопка «Продолжить разбор» запускает его заново.',
      en: 'The analysis was cut off. "Resume the analysis" runs it again.',
    },
    restricted: {
      ru: 'Наблюдатель видит разбор целиком, но не может его запустить или остановить.',
      en: 'A read-only member sees the analysis in full but cannot run or stop it.',
    },
    disabled: {
      ru: 'Сбор части шагов отключён политикой организации.',
      en: 'Part of the run is switched off by an organisation policy.',
    },
    'long-content': {
      ru: 'Длинное слово в лексике переносится, счётчик остаётся на месте.',
      en: 'A long vocabulary entry wraps; the count stays put.',
    },
  },
  render: ({ state, locale }) => {
    const s = state as VoiceAnalysisState;
    // `long-content` shows the same measured panel `success` does, with one
    // entry long enough to wrap — it is a review state, not a fourth outcome.
    const showMeasured = s === 'success' || s === 'long-content';
    return (
      <VoiceAnalysisScreen
        locale={locale}
        state={s}
        sampleCount={16}
        charCount={15200}
        progress={s === 'default' || s === 'selected' ? 62 : undefined}
        stage={s === 'default' || s === 'selected' ? 'MEASURING' : undefined}
        wordCount={showMeasured ? 13780 : undefined}
        sentenceCount={showMeasured ? 980 : undefined}
        lexicon={
          showMeasured
            ? s === 'long-content'
              ? [
                  ...LEXICON,
                  {
                    term: 'отглагольные существительные в позиции подлежащего',
                    count: 9,
                  },
                ]
              : LEXICON
            : undefined
        }
        punctuation={
          showMeasured
            ? {
                dashInsteadOfCopula: 74,
                colonBeforeList: 58,
                questionAtEnd: 12,
                exclamation: 2,
              }
            : undefined
        }
        rejected={showMeasured ? REJECTED : undefined}
        notice={
          s === 'error'
            ? locale === 'ru'
              ? 'Остановились на шаге 3 из 5. Посчитанное сохранено.'
              : 'Stopped partway through. What was counted is kept.'
            : s === 'disabled'
            ? locale === 'ru'
              ? 'Сбор словаря отключён в настройках голоса. Остальные шаги идут.'
              : 'Vocabulary collection is off in the voice settings. The rest still runs.'
            : undefined
        }
      />
    );
  },
});
