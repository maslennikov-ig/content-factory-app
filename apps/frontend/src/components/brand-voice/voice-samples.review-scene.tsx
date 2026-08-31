'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceSamplesScreen,
  type SampleRow,
  type SampleSource,
  type VoiceSamplesState,
} from './voice-samples.screen';

/**
 * Screen 03: collecting the corpus.
 *
 * Two states carry the weight. `default` is the shortfall — the number, and
 * the sentence saying why the number matters, which is the difference between
 * a threshold and a wall. `success` is the floor reached, where the button
 * that was inert becomes the way forward.
 *
 * The corpus here is deliberately just under the floor: a screen that only
 * ever gets reviewed in its satisfied state is a screen whose refusal path
 * nobody has looked at.
 */

const BASE: SampleRow[] = [
  {
    code: 'smp-01',
    title: 'Итоги наладки линии',
    origin: 'OWN_POST',
    charCount: 2140,
    date: '12.08.26',
  },
  {
    code: 'smp-02',
    title: 'Почему мы поменяли поставщика подшипников',
    origin: 'OWN_POST',
    charCount: 1780,
    date: '05.08.26',
  },
  {
    code: 'smp-03',
    title: 'Письмо смене перед аттестацией',
    origin: 'PASTE',
    charCount: 1020,
    date: '22.08.26',
    redacted: true,
  },
  {
    code: 'smp-04',
    title: 'Обращение к подписчикам о графике отгрузок',
    origin: 'TELEGRAM_EXPORT',
    charCount: 880,
    date: '30.07.26',
  },
  {
    code: 'smp-05',
    title: 'Заметка о ремонте кровли цеха №4',
    origin: 'FILE',
    charCount: 580,
    date: '18.07.26',
  },
];

const FULL: SampleRow[] = [
  ...BASE,
  {
    code: 'smp-06',
    title: 'Разбор простоя на участке термообработки',
    origin: 'OWN_POST',
    charCount: 3410,
    date: '14.08.26',
  },
  {
    code: 'smp-07',
    title: 'Что изменилось в приёмке за квартал',
    origin: 'OWN_POST',
    charCount: 2960,
    date: '09.08.26',
  },
  {
    code: 'smp-08',
    title: 'Ответ на вопрос про сроки поставки',
    origin: 'TELEGRAM_EXPORT',
    charCount: 2430,
    date: '02.08.26',
  },
];

const LONG_ROW: SampleRow = {
  code: 'smp-09',
  title:
    'Протокол совещания по вопросам модернизации участка термообработки от 14 августа с приложением перечня работ',
  origin: 'FILE',
  charCount: 3410,
  date: '14.08.26',
};

const sourcesFor = (state: string): SampleSource[] => [
  {
    key: 'OWN_POST',
    available: state !== 'restricted',
    unavailableReason:
      state === 'restricted'
        ? 'Канал «Завод · новости» больше не читается. Ранее взятые оттуда образцы остались и учитываются.'
        : undefined,
  },
  { key: 'TELEGRAM_EXPORT', available: true },
  { key: 'PASTE', available: true },
  { key: 'FILE', available: true },
  {
    key: 'SOURCE_SNAPSHOT',
    available: state !== 'disabled',
    unavailableReason:
      state === 'disabled'
        ? 'Чтение внешних адресов отключено политикой организации.'
        : undefined,
  },
];

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/samples',
  fixture: { screen: '03', floor: 15000, samples: BASE.length },
  notes: {
    default: {
      ru: 'Недобор назван числом и объяснён причиной: «на меньшем объёме разбор находит случайные привычки вместо устойчивых».',
      en: 'The shortfall is a number with a reason: on less than that the analysis finds accidental habits rather than settled ones.',
    },
    empty: {
      ru: 'Ни одного образца. Ноль показан крупно, и сказано, с чего начать.',
      en: 'No samples. The zero is shown large, and it says where to start.',
    },
    success: {
      ru: 'Норма набрана — кнопка «Дальше» перестала быть подписью и стала действием.',
      en: 'The floor is reached — "Next" stops being a caption and becomes an action.',
    },
    error: {
      ru: 'Один файл не прочитан, остальные загрузились. Отказ частичный, а не общий.',
      en: 'One file failed, the rest loaded. The failure is partial, not total.',
    },
    restricted: {
      ru: 'Доступ к каналу отозван. Уже взятые оттуда образцы остаются и продолжают считаться.',
      en: 'Channel access was revoked. Samples already taken from it stay and still count.',
    },
    disabled: {
      ru: 'Чтение внешних адресов выключено. Четыре пути из пяти работают.',
      en: 'Reading external addresses is off. Four paths of five still work.',
    },
    'long-content': {
      ru: 'Длинное название переносится, а объём и дата остаются на своих местах справа.',
      en: 'A long title wraps while the size and the date stay put on the right.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceSamplesScreen
      locale={locale}
      state={state as VoiceSamplesState}
      samples={
        state === 'empty'
          ? []
          : state === 'success'
          ? FULL
          : state === 'long-content'
          ? [...BASE, LONG_ROW]
          : BASE
      }
      sources={sourcesFor(state)}
      selectedCodes={state === 'selected' ? ['smp-01', 'smp-02', 'smp-04'] : []}
      notice={
        state === 'error'
          ? locale === 'ru'
            ? 'otchet-2026.pages — формат не распознан. Остальные четыре файла загрузились.'
            : 'otchet-2026.pages — format not recognised. The other four files loaded.'
          : undefined
      }
    />
  ),
});
