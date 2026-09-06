'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../../interface-review/fixture-contract';
import { ReviewLocaleProvider } from '../../interface-review/review-i18n';
import { IntakeScreen, type IntakeChannel } from './intake.screen';
import { intakeCopy } from './intake.copy';
import type {
  BriefFilledV1,
  IntakeQuestionV1,
  IntakeScreenState,
} from './intake.adapter';

/**
 * Экран входа во всех девяти состояниях, без единого запроса.
 *
 * Смотреть здесь надо не на «нарисовалось», а на четыре места, где этот
 * экран легче всего сделать неправильно: причина, по которой «Написать» не
 * нажимается, — читается ли она рядом с кнопкой; карточка вопросов — видно ли
 * оба вопроса сразу и равны ли по весу три способа ответить; квитанция — не
 * теряется ли слово «предположение» рядом с «из вашего текста»; и две
 * колонки результата на 768 и 390 — кто из них остаётся первым.
 */

export const INTAKE_REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
] as const satisfies readonly InterfaceReviewState[];

const CHANNELS: readonly IntakeChannel[] = [
  {
    id: 'int-tg',
    name: 'Мой канал',
    identifier: 'telegram',
    picture: '',
    disabled: false,
    inBetweenSteps: false,
  },
  {
    id: 'int-vk',
    name: 'Сообщество',
    identifier: 'vk',
    picture: '',
    disabled: false,
    inBetweenSteps: false,
  },
];

const QUESTIONS: readonly IntakeQuestionV1[] = [
  {
    field: 'thesis',
    question: 'Что именно вы утверждаете? Одно предложение, которое можно оспорить.',
    options: [
      'Писать про ИИ надо чаще, потому что читатели ждут именно этого',
      'Про ИИ пишут все, и это повод писать реже, но точнее',
    ],
  },
  {
    field: 'facts',
    question:
      'На чём это стоит? Нужен хотя бы один факт со ссылкой, которую можно проверить.',
    options: [],
  },
];

const BRIEF: BriefFilledV1 = {
  inputKind: 'foreign_post',
  goal: 'показать, что рост даётся дисциплиной, а не рынком',
  thesis:
    'Рост на 37% случился не из-за рынка, а из-за отказа от половины продуктов',
  position: 'Я бы на их месте резал ещё жёстче',
  disagreement: 'Те, кто считает, что широкая линейка защищает от просадок',
  audience: 'владельцы небольших студий, которые ведут канал сами',
  format: 'expert',
  facts: [
    {
      statement: 'выручка достигла 4,2 млрд',
      sourceUrl: 'https://example.test/report',
      factId: null,
      evidenceId: 'ev-1',
      origin: 'search',
      verified: true,
    },
    {
      statement: 'присутствие в 12 странах',
      sourceUrl: null,
      factId: null,
      evidenceId: null,
      origin: 'input',
      verified: false,
    },
  ],
  origins: {
    thesis: 'input',
    position: 'model',
    disagreement: 'model',
    audience: 'avatar',
    goal: 'model',
    format: 'model',
  },
  ungrounded: ['присутствие в 12 странах'],
};

const DRAFT =
  'Рост на 37% — не подарок рынка.\n\nКомпания выручила 4,2 млрд [E1] после того, как закрыла половину линейки [E2]. Я бы резал ещё жёстче.\n\nЧто вы оставили бы последним?';

const LONG_DRAFT = `${DRAFT}\n\n${Array.from({ length: 6 })
  .map(
    () =>
      'Дальше идёт длинный абзац, который проверяет перенос, ширину колонки и то, что квитанция рядом не сжимается до нечитаемого столбика из двух букв на строку.'
  )
  .join('\n\n')}`;

const LONG_BRIEF: BriefFilledV1 = {
  ...BRIEF,
  thesis:
    'Рост на тридцать семь процентов случился не потому, что рынок вырос сам, а потому что компания за один квартал отказалась от половины линейки продуктов и переставила всех освободившихся людей на два оставшихся направления, и это решение принималось не советом директоров, а одним человеком на одной встрече.',
};

export const scene = defineInterfaceReviewScene({
  id: 'content-intelligence/intake',
  fixture: {
    channels: CHANNELS.map((one) => one.id),
    questions: QUESTIONS.length,
    facts: BRIEF.facts.length,
  },
  states: INTAKE_REVIEW_STATES,
});

const NOTES: Partial<Record<InterfaceReviewState, { ru: string; en: string }>> = {
  loading: {
    ru: 'Ответа двери ИИ ещё нет: кнопка выключена и рядом сказано почему, а не крутится кружок.',
    en: 'The AI door has not answered yet: the button is off and says why, instead of spinning.',
  },
  empty: {
    ru: 'Каналов нет — это не поломка, а один недостающий шаг, и экран называет, где он делается.',
    en: 'No channels — not a fault but one missing step, and the screen names where it is taken.',
  },
  default: {
    ru: 'Пусто и готово к работе. «Написать» выключено, причина стоит рядом словами.',
    en: 'Empty and ready. «Write» is off and the reason stands beside it in words.',
  },
  selected: {
    ru: 'Ссылка распознана, канал выбран, у Telegram видна дверь в карточку «Как пишем сюда».',
    en: 'A link is recognised, a channel is picked, and Telegram shows its writing card door.',
  },
  success: {
    ru: 'Черновик и квитанция. Смотрите на «предположение» рядом с позицией и на «не подтверждено» у факта.',
    en: 'The draft and the receipt. Look at «an assumption» beside the position and at the unconfirmed fact.',
  },
  error: {
    ru: 'Не написалось. Ответ неполный — сказано прямо, что ничего не сохранено.',
    en: 'It did not get written. The answer was incomplete, and nothing was saved — said plainly.',
  },
  restricted: {
    ru: 'Звать модель нечем: вместо формы одна честная строка, запроса не было.',
    en: 'Nothing to call the model with: one honest line instead of the form, and no request was made.',
  },
  disabled: {
    ru: 'Ход идёт: поле и кнопки выключены, шаг назван, «Отменить» рядом.',
    en: 'A run is in flight: the field and buttons are off, the step is named, «Cancel» is beside it.',
  },
  'long-content': {
    ru: 'Длинный тезис и длинный текст: колонки не ломаются, квитанция не сжимается.',
    en: 'A long thesis and a long text: the columns hold and the receipt does not shrink.',
  },
};

const STATE_OF: Record<InterfaceReviewState, IntakeScreenState> = {
  loading: 'checking',
  empty: 'no-channel',
  default: 'idle',
  selected: 'questions',
  success: 'draft',
  error: 'error',
  restricted: 'restricted',
  disabled: 'streaming',
  'long-content': 'draft',
};

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const state = STATE_OF[context.state];
  const locale = context.locale;
  const t = intakeCopy[locale];
  const note = NOTES[context.state];
  const long = context.state === 'long-content';
  const showsDraft = state === 'draft';

  return (
    <ReviewLocaleProvider locale={locale}>
      <InterfaceReviewFrame scene={scene} context={context}>
        <div
          data-interface-review-data="synthetic"
          className="flex min-w-0 flex-col gap-[16px] p-[16px] sm:p-[20px] lg:p-[24px]"
        >
          <IntakeScreen
            locale={locale}
            state={state}
            input={
              context.state === 'selected'
                ? 'https://example.test/post'
                : state === 'idle'
                ? ''
                : 'Рост на 37% случился не из-за рынка.'
            }
            inputKind={context.state === 'selected' ? 'link' : 'foreign_post'}
            detectedLink={context.state === 'selected'}
            channels={state === 'no-channel' ? [] : CHANNELS}
            selectedIds={state === 'idle' || state === 'no-channel' ? [] : ['int-tg']}
            language={locale}
            step={state === 'streaming' ? 'writing' : null}
            questions={state === 'questions' ? QUESTIONS : []}
            brief={showsDraft ? (long ? LONG_BRIEF : BRIEF) : null}
            overrides={{}}
            draftText={showsDraft ? (long ? LONG_DRAFT : DRAFT) : null}
            draftPlatform="telegram"
            blocked={
              state === 'checking'
                ? 'checking'
                : state === 'idle'
                ? 'input'
                : null
            }
            errorMessage={t.errorIncomplete}
            restrictedReason={t.restrictedTitle}
            roundsSpent={false}
            slopKey="review"
            onInputChange={() => undefined}
            onToggleChannel={() => undefined}
            onLanguageChange={() => undefined}
            onWrite={() => undefined}
            onCancel={() => undefined}
            onAnswer={() => undefined}
            onOverride={() => undefined}
            onKindChange={() => undefined}
            onRevertOverrides={() => undefined}
            onRebuild={() => undefined}
            onOpenEditor={() => undefined}
            onOpenWritingProfile={() => undefined}
            onManual={() => undefined}
            onRetry={() => undefined}
            writingProfileStored={{ 'int-tg': false }}
          />
          {note ? (
            <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {note[locale]}
            </p>
          ) : null}
        </div>
      </InterfaceReviewFrame>
    </ReviewLocaleProvider>
  );
}
