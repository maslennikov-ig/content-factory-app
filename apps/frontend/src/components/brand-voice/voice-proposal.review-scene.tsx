'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceProposalScreen,
  type ProposalField,
  type ProposalObservation,
  type VoiceProposalState,
} from './voice-proposal.screen';

/**
 * Screen 05: the proposal, and the reason beside every part of it.
 *
 * The state that matters is `empty` — a field the corpus gave no grounds for.
 * A model asked to fill it would produce something that reads well and is not
 * true of this writer, so the screen shows the gap and says what to do with it.
 */

const OBSERVATIONS: ProposalObservation[] = [
  {
    ref: 'smp-02#1',
    index: 1,
    field: 'WHO_SPEAKS',
    claim:
      'В 34 из 48 постов автор пишет «мы» и «у нас на участке» — от лица тех, кто внутри, а не от лица компании.',
    quote: 'Мы вчера догнали план — правда, ценой субботней смены.',
    sampleCode: 'smp-02',
    metric: 'firstPerson',
  },
  {
    ref: 'smp-07#1',
    index: 2,
    field: 'TONE',
    claim:
      'Ни одного восклицательного знака на 980 предложений. Оценочные прилагательные — 4 раза, все в цитатах чужой речи.',
    quote: 'Сроки сдвинулись на два дня. Причина — поставка.',
    sampleCode: 'smp-07',
  },
  {
    ref: 'smp-01#1',
    index: 3,
    field: 'SENTENCE_LENGTH',
    claim:
      'Среднее — 14,2 слова, половина предложений короче 12. Коридор 10–18 покрывает 8 из 10 ваших фраз.',
    quote: 'Зато по графику.',
    sampleCode: 'smp-01',
    metric: 'sentenceLength',
  },
];

const FIELDS: ProposalField[] = [
  {
    key: 'WHO_SPEAKS',
    text: 'Служба новостей завода — люди, которые сами стоят у линии и знают, как всё устроено.',
    status: 'ACCEPTED',
    observationRefs: ['smp-02#1'],
  },
  {
    key: 'TONE',
    text: 'Спокойно и по делу. Без казённых оборотов, без восторга и без попыток продать.',
    status: 'ACCEPTED',
    observationRefs: ['smp-07#1'],
  },
  {
    key: 'AUDIENCE',
    text: 'К своим: смены, мастера, подписчики канала. Люди, которые знают производство и не любят лишних слов.',
    status: 'EDITING',
    observationRefs: ['smp-02#1'],
  },
  {
    key: 'SENTENCE_LENGTH',
    text: '14 слов в среднем, коридор 10–18.',
    status: 'ACCEPTED',
    observationRefs: ['smp-01#1'],
  },
  {
    key: 'NEVER_SAY',
    text: '«уникальное предложение», «мы рады сообщить», «инновационный»',
    status: 'UNDECIDED',
    observationRefs: ['smp-02#1'],
  },
];

const fieldsFor = (state: string): ProposalField[] => {
  if (state === 'empty') {
    return FIELDS.map((field) =>
      field.key === 'NEVER_SAY'
        ? { ...field, observationRefs: [], status: 'UNDECIDED' }
        : field
    );
  }
  if (state === 'success') {
    return FIELDS.map((field) => ({ ...field, status: 'ACCEPTED' }));
  }
  if (state === 'selected') {
    return FIELDS.map((field) =>
      field.key === 'AUDIENCE' ? { ...field, status: 'EDITING' } : field
    );
  }
  if (state === 'long-content') {
    return FIELDS.map((field) =>
      field.key === 'WHO_SPEAKS'
        ? {
            ...field,
            text: `${field.text} Это не пресс-служба и не отдел маркетинга: тексты пишут те же люди, которые принимают смену, подписывают акт приёмки и отвечают за то, что уехало с площадки.`,
          }
        : field
    );
  }
  return FIELDS;
};

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/proposal',
  fixture: { screen: '05', fields: FIELDS.length },
  notes: {
    default: {
      ru: 'Поля принимаются по одному. Справа — основание каждого: число и дословная цитата с кодом образца.',
      en: 'Fields are accepted one at a time. On the right, the grounds for each: a number and a verbatim quote with its sample code.',
    },
    empty: {
      ru: 'Поле без основания показано пустым: «в образцах ничего не нашлось». Выдуманное поле было бы хуже.',
      en: 'A field with no grounds is shown empty. An invented one would be worse.',
    },
    selected: {
      ru: 'Одно поле правится. Остальные четыре остаются принятыми, и разбор не перезапускается.',
      en: 'One field is being edited. The other four stay accepted and the analysis does not restart.',
    },
    success: {
      ru: 'Все поля приняты, согласие дано — активация стала доступна.',
      en: 'Every field accepted and the consent read — activation becomes available.',
    },
    error: {
      ru: 'Правка не ушла на сервер. Текст на месте, активация ждёт сохранения.',
      en: 'The edit did not reach the server. The text is still there; activation waits.',
    },
    restricted: {
      ru: 'Участник читает предложение и основания целиком, но не принимает поля.',
      en: 'A member reads the proposal and its grounds in full, but accepts nothing.',
    },
    disabled: {
      ru: 'Активация закрыта; поля и основания остаются видимыми.',
      en: 'Activation is closed; fields and grounds stay visible.',
    },
    'long-content': {
      ru: 'Длинная формулировка поля переносится и не ломает колонку оснований.',
      en: 'A long field wraps without breaking the grounds column.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceProposalScreen
      locale={locale}
      state={state as VoiceProposalState}
      fields={fieldsFor(state)}
      observations={state === 'empty' ? OBSERVATIONS.slice(0, 2) : OBSERVATIONS}
      profileLabel="voice-0071"
      consentGiven={state === 'success'}
      activatedAt={state === 'success' ? '22.08.2026 14:20' : undefined}
    />
  ),
});
