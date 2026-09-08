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
import type { IntakeScreenState } from './intake.adapter';

/**
 * Экран входа во всех девяти состояниях, без единого запроса.
 *
 * Смотреть здесь надо не на «нарисовалось», а на три места, где этот экран
 * легче всего сделать неправильно: причина, по которой «Написать» не
 * нажимается, — читается ли она рядом с кнопкой; строка хода — стоит ли она
 * там же, у кнопки, а не отдельной надписью ниже; и последний кадр — строка
 * «Заготовка сохранена» с кодом, единственное, что этот экран показывает
 * после хода.
 *
 * Ни вопросов, ни готового текста с квитанцией здесь больше нет: волна
 * `content-factory-next-m2eg` увела уточнения на страницу заготовки, а хвост
 * `m2eg.21` — и сам текст. `selected` показывает вставленную ссылку с
 * выбранным каналом, то есть кадр перед нажатием.
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

/** Заготовка, записанная ходом: код и адрес — всё, что экран о ней говорит. */
const PIECE = { pieceId: 'piece-12', code: 'cnt-07' };

/** Длинная мысль в поле: проверяет перенос и ширину колонки ввода. */
const LONG_INPUT = `Рост на 37% случился не из-за рынка.\n\n${Array.from({
  length: 6,
})
  .map(
    () =>
      'Дальше идёт длинный абзац, который проверяет перенос, ширину поля и то, что кнопка с причиной рядом не уезжает за край.'
  )
  .join('\n\n')}`;

export const scene = defineInterfaceReviewScene({
  id: 'content-intelligence/intake',
  fixture: {
    channels: CHANNELS.map((one) => one.id),
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
    ru: 'Заготовка записана: код назван, «Открыть заготовку» рядом. Дальше экран уходит на её страницу сам.',
    en: 'The piece is recorded: its code is named and «Open the piece» is beside it. The screen then leaves for its page.',
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
    ru: 'Длинная мысль в поле: перенос держится, кнопка с причиной рядом не уезжает за край.',
    en: 'A long thought in the field: the wrapping holds and the button with its reason stays on screen.',
  },
};

const STATE_OF: Record<InterfaceReviewState, IntakeScreenState> = {
  loading: 'checking',
  empty: 'no-channel',
  default: 'idle',
  selected: 'idle',
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
  const showsPiece = state === 'draft';

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
                : long
                ? LONG_INPUT
                : 'Рост на 37% случился не из-за рынка.'
            }
            inputKind={context.state === 'selected' ? 'link' : 'foreign_post'}
            detectedLink={context.state === 'selected'}
            language={locale}
            step={state === 'streaming' ? 'writing' : null}
            piece={showsPiece ? PIECE : null}
            blocked={
              state === 'checking'
                ? 'checking'
                : context.state === 'default'
                ? 'input'
                : null
            }
            errorMessage={t.errorIncomplete}
            restrictedReason={t.restrictedTitle}
            onInputChange={() => undefined}
            onLanguageChange={() => undefined}
            onWrite={() => undefined}
            onCancel={() => undefined}
            onOpenPiece={() => undefined}
            onManual={() => undefined}
            onRetry={() => undefined}
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
