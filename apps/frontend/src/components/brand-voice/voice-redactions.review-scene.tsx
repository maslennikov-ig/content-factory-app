'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceRedactionsScreen,
  type RedactionRow,
  type VoiceRedactionsState,
} from './voice-redactions.screen';

/**
 * Screen 08: what was not taken from someone else's writing.
 *
 * The state to look at hardest is `empty`. A screen that vanishes when it has
 * nothing to report teaches the reader that the check is optional, so an empty
 * list is shown as a result — which is also the only honest thing to do when
 * the reference genuinely carried no names, figures or links.
 */

const REDACTIONS: RedactionRow[] = [
  {
    category: 'PERSON',
    occurrences: 12,
    examples: ['Иван Петров', '«мой сын Артём»', 'Тверь, Ленина 14'],
  },
  {
    category: 'FACT_NUMBER',
    occurrences: 34,
    examples: ['выручка 4,2 млрд', 'три завода в Поволжье', 'с 2014 года'],
  },
  {
    category: 'LINK',
    occurrences: 7,
    examples: ['t.me/author', 'zavod-tver.example'],
  },
  {
    category: 'MENTION',
    occurrences: 5,
    examples: ['@mashprom', 'министерство'],
  },
  {
    category: 'VERBATIM',
    occurrences: 3,
    examples: ['семь раз отмерь — один раз отрежь'],
  },
];

const KEPT = [
  { label: 'Длина фразы', value: '9,6 слова' },
  { label: 'Коротких фраз', value: '61%' },
  { label: 'Вопросов к читателю', value: '14%' },
  { label: 'Тире вместо связки', value: '52%' },
];

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/redactions',
  fixture: { screen: '08', categories: REDACTIONS.length },
  notes: {
    default: {
      ru: 'Спокойный отчёт до согласия. Пять категорий с числом мест и примерами; согласие — отдельное действие.',
      en: 'A calm account before consent. Five categories with counts and examples; consent is its own action.',
    },
    empty: {
      ru: 'Вырезать было нечего. Пустой список — тоже результат, и его показывают, а не прячут экран.',
      en: 'There was nothing to cut. An empty list is a result too, and the screen shows it rather than disappearing.',
    },
    selected: {
      ru: 'Категория раскрыта: видно, сколько мест и какие примеры. В профиль эти примеры не попадают.',
      en: 'A category is open: how many places and which examples. Those examples never enter the profile.',
    },
    success: {
      ru: 'Согласие записано отдельным действием и уходит в «Происхождение».',
      en: 'Consent is recorded as its own action and goes to Provenance.',
    },
    error: {
      ru: 'Референс прочитан не весь. На четырёх текстах манера считается неустойчиво, и это сказано прямо.',
      en: 'The reference was only partly read. Manner measured on four texts is unstable, and it says so.',
    },
    restricted: {
      ru: 'Отчёт открыт целиком, согласие даёт владелец.',
      en: 'The report is fully open; the owner gives consent.',
    },
    disabled: {
      ru: 'Путь отключён политикой. Отчёт остаётся читаемым, действие — нет.',
      en: 'The path is disabled by policy. The report stays readable; the action does not.',
    },
    'long-content': {
      ru: 'Длинное название организации переносится по словам, счётчик справа остаётся на месте.',
      en: 'A long organisation name wraps by words; the counter on the right stays put.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceRedactionsScreen
      locale={locale}
      state={state as VoiceRedactionsState}
      redactions={
        state === 'empty'
          ? []
          : state === 'long-content'
          ? REDACTIONS.map((row) =>
              row.category === 'MENTION'
                ? {
                    ...row,
                    examples: [
                      'Всероссийское объединение машиностроительных предприятий имени Лихачёва',
                      ...row.examples,
                    ],
                  }
                : row
            )
          : REDACTIONS
      }
      kept={KEPT}
      referenceCount={12}
      finishedAt="14:32"
      longestMatch={4}
      expandedCategory={state === 'selected' ? 'FACT_NUMBER' : undefined}
      consentGiven={state === 'success'}
    />
  ),
});
