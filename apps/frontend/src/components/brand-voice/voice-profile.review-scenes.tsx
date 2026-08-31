'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoicePassportScreen,
  type PassportVoice,
  type VoicePassportState,
} from './voice-passport.screen';
import {
  VoiceScalesScreen,
  type ScaleEntry,
  type VoiceScalesState,
} from './voice-scales.screen';
import {
  VoiceVersionsScreen,
  type VoiceVersion,
  type VoiceVersionsState,
} from './voice-versions.screen';
import type { StyleScaleKey } from './voice-copy';

/**
 * Screens 06, 07 and 09: the voice as something you can look at.
 *
 * The states that earn their place here are the awkward ones. A scale with too
 * few observations has to say so in words rather than show a number that merely
 * looks right;
 * a scale that failed outright has to leave the other seven working; and a
 * version comparison has to list the fields that did not change, or a reader
 * cannot tell whether they were compared.
 */

const VOICE: PassportVoice = {
  whoSpeaks:
    'Служба новостей завода — люди, которые сами стоят у линии и знают, как всё устроено.',
  tone: 'Спокойно и по делу. Без казённых оборотов, без восторга и без попыток продать.',
  audience:
    'К своим: смены, мастера, подписчики канала. Люди, которые знают производство.',
  neverSay: ['уникальное предложение', 'мы рады сообщить', 'инновационный'],
  versionLabel: 'v3',
  activeSince: '22.08.2026',
  sampleCount: 16,
  charCount: 15_200,
  confidence: 'LOW',
  sentenceLength: { value: '14,2', low: 10, high: 18 },
  dashShare: '74%',
};

const value = (
  raw: number,
  display: number,
  low: number,
  high: number,
  example: string,
  code: string,
  extra: Partial<ScaleEntry> = {}
): ScaleEntry => ({
  kind: 'value',
  raw,
  display,
  low,
  high,
  observations: 980,
  sampleCount: 16,
  exampleText: example,
  exampleSampleCode: code,
  ...(extra as object),
});

const SCALES: Partial<Record<StyleScaleKey, ScaleEntry>> = {
  sentenceLength: value(
    14.2,
    28,
    10,
    18,
    'Поставщика поменяли — старый срывал сроки третий месяц.',
    'smp-02'
  ),
  sentenceSpread: value(
    62,
    62,
    50,
    75,
    'Зато по графику.',
    'smp-02'
  ),
  shortSentences: value(48, 48, 40, 60, 'Зато по графику.', 'smp-02'),
  listParagraphs: value(
    26,
    26,
    8,
    20,
    'проверить остатки',
    'smp-07'
  ),
  questions: value(3, 3, 0, 8, 'Что делаем дальше?', 'smp-04'),
  dashCopula: value(
    74,
    74,
    60,
    85,
    'Причина — поставка.',
    'smp-07'
  ),
  firstPerson: value(71, 71, 60, 85, 'Мы вчера догнали план.', 'smp-02'),
  nominalisation: value(
    8,
    8,
    0,
    12,
    'Проведение аттестации назначено на среду.',
    'smp-11'
  ),
};

const scalesFor = (state: string): Partial<Record<StyleScaleKey, ScaleEntry>> => {
  if (state === 'empty') {
    return {
      ...SCALES,
      questions: { kind: 'gap', reason: 'TOO_FEW_POSITIVE', positives: 4 },
    };
  }
  if (state === 'error') {
    return {
      ...SCALES,
      sentenceSpread: { kind: 'gap', reason: 'FAILED', positives: 0 },
    };
  }
  if (state === 'disabled') {
    return {
      ...SCALES,
      nominalisation: value(
        8,
        8,
        0,
        12,
        'Проведение аттестации назначено на среду.',
        'smp-11',
        { excluded: true }
      ),
    };
  }
  if (state === 'success') {
    return {
      ...SCALES,
      listParagraphs: value(
        12,
        12,
        8,
        20,
        'проверить остатки',
        'smp-07',
        { manualCorridor: true }
      ),
    };
  }
  return SCALES;
};

export const passport = defineVoiceScene({
  id: 'brand-voice/passport',
  fixture: { screen: '06', version: 'v3' },
  notes: {
    empty: {
      ru: '«Без голоса» — полноценный вид карточки, а не дыра на месте профиля.',
      en: '“No voice” is a first-class variant of the card, not a hole where a profile should be.',
    },
    'long-content': {
      ru: 'Длинные формулировки переносятся; числа справа остаются на местах.',
      en: 'Long wording wraps; the numbers keep their places.',
    },
    restricted: {
      ru: 'Читатель без прав видит подсказки и не видит ни одной кнопки правки: действие, которого ему не дадут, на экране не стоит.',
      en: 'A reader without the right sees the hints and no edit control at all: an action they will be refused does not belong on their screen.',
    },
    selected: {
      ru: 'Правка живёт у самой строки. Раньше эти пять полей менялись только в отдельной форме под отдельным заголовком.',
      en: 'The edit sits beside the line. These five fields used to change only in a separate form under a separate heading.',
    },
  },
  render: ({ state, locale }) => (
    <VoicePassportScreen
      locale={locale}
      state={state as VoicePassportState}
      saved={state === 'success'}
      // Каждый контрол появляется вместе со своим обработчиком: сцена
      // «restricted» — это отсутствие правок, а не выключенные кнопки.
      {...(state === 'restricted'
        ? {}
        : {
            onEditField: () => undefined,
            onAddExample: () => undefined,
            onRemoveExample: () => undefined,
            onRefreshExamples: () => undefined,
          })}
      voice={
        state === 'empty'
          ? null
          : state === 'long-content'
          ? {
              ...VOICE,
              whoSpeaks: `${VOICE.whoSpeaks} Это не пресс-служба и не отдел маркетинга: тексты пишут те же люди, которые принимают смену и подписывают акт приёмки.`,
              neverSay: [
                ...VOICE.neverSay,
                'революционное решение на рынке промышленного оборудования',
              ],
            }
          : VOICE
      }
    />
  ),
});

export const scales = defineVoiceScene({
  id: 'brand-voice/scales',
  fixture: { screen: '07', scales: 8 },
  notes: {
    default: {
      ru: 'Восемь полос в одном масштабе. Списков 26% — вне коридора, и это сказано подписью, а не только цветом.',
      en: 'Eight bars on one scale. Lists at 26% are outside the corridor, and a label says so — not only a colour.',
    },
    empty: {
      ru: 'В образцах 4 вопроса — мало, чтобы считать привычкой. Шкала пуста и объясняет почему.',
      en: 'Four questions in the samples is too few to call a habit. The scale is empty and says why.',
    },
    error: {
      ru: 'Одна шкала не посчиталась. Остальные семь действуют, и рядом стоит «Посчитать заново».',
      en: 'One scale did not compute. The other seven are in force, with “Compute again” beside it.',
    },
    restricted: {
      ru: 'Участник видит значения и примеры целиком; границы правит владелец.',
      en: 'A member sees every value and example; the owner edits the range.',
    },
    selected: {
      ru: 'Предложение пересчитать числа: видно только суперадмину и только когда мерка, которой их сняли, старее нынешней. Сказано, что две полосы человек двигал сам и они останутся.',
      en: 'The offer to recount: visible only to an instance superadmin, and only when the ruler that took these numbers is older than today’s. It says two bars were moved by hand and will stay.',
    },
    success: {
      ru: 'Границы сохранены. Раньше их правили в форме под сгибом — от кнопки было не видно, что вообще что-то произошло.',
      en: 'The range was saved. It used to be edited in a panel below the fold, from where pressing the button looked like nothing happening at all.',
    },
    disabled: {
      ru: 'Шкала исключена владельцем — генератор её не проверяет, но значение видно.',
      en: 'A scale excluded by the owner: the generator ignores it, but the value stays visible.',
    },
    'long-content': {
      ru: 'Английская подпись длиннее русской на 10–15%; колонка рассчитана на худший случай.',
      en: 'The English caption runs 10–15% longer than the Russian; the column is sized for the worse case.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceScalesScreen
      locale={locale}
      state={state as VoiceScalesState}
      scales={scalesFor(state)}
      profileLabel="voice-0071"
      versionLabel="v3"
      sampleCount={16}
      expandedScale={state === 'selected' ? 'dashCopula' : undefined}
      canEditCorridors={state !== 'restricted'}
      saved={state === 'success'}
      // «Править границы» открывает ручки прямо на полосах. Без обработчика
      // кнопки нет вовсе: полосы остаются картинкой, какой они и были.
      {...(state === 'restricted' ? {} : { onSaveCorridor: () => undefined })}
      // Предложение пересчитать видно только суперадмину и только когда
      // мерка устарела. Сцена `selected` — тот случай, и в ней же показано,
      // что человек подвинул две полосы сам.
      {...(state === 'selected'
        ? {
            recalibration: { movedByHand: 2 },
            onRecalibrate: () => undefined,
          }
        : {})}
      lastCheck={{
        inCorridor: 7,
        outside: { key: 'listParagraphs', value: '26%' },
      }}
    />
  ),
});

const VERSIONS: VoiceVersion[] = [
  {
    id: 'v4',
    label: 'v4',
    lifecycle: 'DRAFT',
    changedAt: '22.08.2026 16:04',
    actor: 'А. Ким',
  },
  {
    id: 'v3',
    label: 'v3',
    lifecycle: 'PUBLISHED',
    active: true,
    changedAt: '22.08.2026 14:20',
    actor: 'А. Ким',
  },
  {
    id: 'v2',
    label: 'v2',
    lifecycle: 'ARCHIVED',
    changedAt: '02.07.2026 11:38',
    actor: 'М. Соловьёва',
  },
  {
    id: 'v1',
    label: 'v1',
    lifecycle: 'ARCHIVED',
    changedAt: '14.05.2026 09:02',
    actor: 'собрано из текстов',
  },
];

const COMPARISON: NonNullable<
  Parameters<typeof VoiceVersionsScreen>[0]['comparison']
> = {
  from: 'v2',
  to: 'v3',
  fields: [
    {
      field: 'WHO_SPEAKS',
      was: 'Пресс-служба предприятия',
      became: 'Служба новостей завода — люди, которые сами стоят у линии',
      changed: true,
    },
    {
      field: 'TONE',
      was: 'Официально и сдержанно',
      became: 'Спокойно и по делу, без казённых оборотов',
      changed: true,
    },
    {
      field: 'AUDIENCE',
      was: 'К своим: смены, мастера, подписчики канала',
      became: 'К своим: смены, мастера, подписчики канала',
      changed: false,
    },
    {
      field: 'SENTENCE_LENGTH',
      was: '16 слов, коридор 12–22',
      became: '14 слов, коридор 10–18',
      changed: true,
    },
    {
      field: 'NEVER_SAY',
      was: '«уникальное предложение», «мы рады сообщить»',
      became: '«уникальное предложение», «мы рады сообщить»',
      changed: false,
    },
  ],
};

export const versions = defineVoiceScene({
  id: 'brand-voice/versions',
  fixture: { screen: '09', versions: VERSIONS.length },
  notes: {
    default: {
      ru: 'Сравнение по полям, а не по строкам: сравнивают решения. Неизменённая строка показана наравне, а пустая в обеих версиях названа под таблицей — пустая полоса внутри читалась как поломка.',
      en: 'Field by field, not line by line: decisions are what is compared. An unchanged line is listed too; one empty in both versions is named under the table instead — a blank row inside read as a fault.',
    },
    empty: {
      ru: 'Версий нет — голос ещё ни разу не активировали.',
      en: 'No versions: the voice has never been activated.',
    },
    success: {
      ru: 'Возврат создаст новую версию с полями старой. История не переписывается.',
      en: 'Restoring creates a new version carrying the old fields. History is not rewritten.',
    },
    restricted: {
      ru: 'История видна, возврат недоступен: версии меняет владелец.',
      en: 'History is visible, restoring is not: versions are the owner’s to change.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceVersionsScreen
      locale={locale}
      state={state as VoiceVersionsState}
      versions={state === 'empty' ? [] : VERSIONS}
      selected={state === 'selected' || state === 'default' ? ['v2', 'v3'] : []}
      comparison={
        state === 'selected' || state === 'default' ? COMPARISON : undefined
      }
      profileLabel="voice-0071"
      canRestore={state !== 'restricted'}
    />
  ),
});
