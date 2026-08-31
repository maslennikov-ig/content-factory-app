'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceBriefScreen,
  type RadarTopic,
  type VoiceBriefState,
} from './voice-brief.screen';

/**
 * The radar and the brief.
 *
 * `default` is the state that matters: a brief missing its substance, showing
 * the questions instead of a draft button that works. Reviewing the satisfied
 * state alone would be reviewing the half of this screen that never fires.
 */

const TOPICS: RadarTopic[] = [
  {
    id: 't1',
    title: 'Смена поставщика подшипников: что это стоило',
    score: 100,
    evidenceCount: 4,
    reasons: [
      '4 подтверждённых факта уже есть',
      'вы об этом ещё не писали',
      'материал свежий, 3 дн.',
    ],
  },
  {
    id: 't2',
    title: 'Итоги квартала по отгрузкам',
    score: 30,
    evidenceCount: 0,
    reasons: [
      'нет ни одного подтверждённого факта — писать пока не на чем',
      'вы уже писали об этом — нужен новый угол',
      'материалу 90 дн. — проверьте, не устарел ли',
    ],
  },
];

const PARTIAL = {
  goal: 'Объяснить, почему поменяли поставщика',
  thesis: 'Смена поставщика стоила двух дней и сняла срывы графика',
  channel: 'Telegram',
  format: 'длинный пост',
};

const FULL = {
  ...PARTIAL,
  position: 'Считаем, что два дня доставки — приемлемая цена за график',
  disagreement: 'Снабжение возражает: дальний склад дороже в логистике',
  audience: 'Смены, мастера и подписчики канала завода',
};

const QUESTIONS = [
  {
    field: 'position',
    question:
      'Что вы об этом думаете? Пересказ чужого материала не нуждается в вашем голосе.',
  },
  {
    field: 'disagreement',
    question:
      'С чем здесь можно не согласиться? Текст, с которым спорить нечего, никому не нужен.',
  },
  {
    field: 'audience',
    question:
      'Для кого это? Не «для всех» — назовите людей, которые это прочитают.',
  },
];

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/brief',
  fixture: { topics: TOPICS.length, questions: QUESTIONS.length },
  notes: {
    default: {
      ru: 'Сути не хватает — вместо черновика заданы три вопроса, на каждый можно ответить одной фразой.',
      en: 'Substance is missing — three questions instead of a draft, each answerable in one sentence.',
    },
    empty: {
      ru: 'Тем нет: радар берёт их из источников и фактов, и об этом сказано прямо.',
      en: 'No topics: the radar takes them from sources and facts, and it says so.',
    },
    selected: {
      ru: 'Тема взята в бриф. Оценка объяснена причинами, а не только числом.',
      en: 'A topic is taken into the brief. The score is explained by reasons, not only a number.',
    },
    success: {
      ru: 'Всё на месте: тезис, факты со ссылками, позиция, возражение и адресат. Черновик можно создавать.',
      en: 'Everything is here: thesis, sourced facts, position, objection, audience. The draft can be created.',
    },
    error: {
      ru: 'Радар не собрался, ответы брифа сохранены.',
      en: 'The radar did not build; the brief answers are kept.',
    },
    restricted: {
      ru: 'Бриф читается, взять тему и создать черновик может владелец.',
      en: 'The brief is readable; taking a topic and creating a draft is the owner’s.',
    },
    disabled: {
      ru: 'Создание черновиков выключено. Вопросы и ответы остаются видимыми.',
      en: 'Draft creation is off. Questions and answers stay visible.',
    },
    'long-content': {
      ru: 'Длинные причины и длинный тезис переносятся; карточки тем не сжимаются.',
      en: 'Long reasons and a long thesis wrap; the topic cards do not shrink.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceBriefScreen
      locale={locale}
      state={state as VoiceBriefState}
      topics={state === 'empty' ? [] : TOPICS}
      selectedTopicId={
        state === 'selected' || state === 'success' ? 't1' : undefined
      }
      brief={
        state === 'success'
          ? FULL
          : state === 'long-content'
          ? {
              ...PARTIAL,
              thesis: `${PARTIAL.thesis}, и это первый случай за три года, когда график держится без субботних смен и без переработки на участке термообработки.`,
            }
          : PARTIAL
      }
      questions={state === 'success' ? [] : QUESTIONS}
      ungroundedFacts={
        state === 'default' || state === 'long-content'
          ? ['Все знают, что новый поставщик надёжнее']
          : []
      }
    />
  ),
});
