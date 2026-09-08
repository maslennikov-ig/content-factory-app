import type { OnboardingStepKey } from './onboarding.adapter';
import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * The walkthrough's words, written out in two languages beside the code —
 * the convention this generation of screens set (`content-section.copy.ts`,
 * `editorial-stage.copy.ts`): two languages spelled out here, not sixteen
 * locale files promising a translation nobody wrote.
 *
 * Every step says three things and in this order: what to do, why the product
 * asks for it, and what closes the step. The third one matters most — the
 * screen this replaces never told anyone what it wanted, so there was nothing
 * to finish.
 */

type StepWords = {
  /** The rail's short name. */
  short: string;
  /** The step's own heading. */
  title: string;
  /** Why the product asks. Never «because it is step three». */
  why: string;
  /** The one thing to do. */
  todo: string;
  /** The words on the button that leaves for the product. */
  action: string;
  /** What closes the step, said plainly. */
  closes: string;
};

type Words = {
  pageTitle: string;
  pageLead: string;
  progressLabel: string;
  progressValue: (done: number, total: number) => string;
  stepOf: (index: number, total: number) => string;
  todoLabel: string;
  current: string;
  progressPending: string;
  allDoneTitle: string;
  allDoneBody: string;
  leave: string;
  comeBack: string;
  /** Откуда берутся галочки и почему нет кнопки «начать заново». */
  counted: string;
  /** Подпись пункта бокового меню. */
  menuLabel: string;
  loading: string;
  failed: string;
  channels: (n: number) => string;
  samples: (n: number) => string;
  facts: (n: number) => string;
  steps: Record<OnboardingStepKey, StepWords>;
};

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

export const onboardingCopy: { ru: Words; en: Words } = {
  ru: {
    pageTitle: 'С чего начать',
    pageLead:
      'Пройдите один материал от начала до конца. Дальше всё остальное — то же самое, только быстрее.',
    progressLabel: 'Пройдено',
    progressValue: (done, total) => `${done} из ${total}`,
    stepOf: (index, total) => `Шаг ${index} из ${total}`,
    todoLabel: 'Что сделать',
    current: 'Сейчас на этом шаге',
    progressPending: 'считаем…',
    allDoneTitle: 'Всё пройдено',
    allDoneBody:
      'Первый материал прошёл весь путь. Дальше можно не возвращаться сюда — но страница останется в настройках, если понадобится.',
    leave: 'Закрыть и осмотреться',
    comeBack: 'Закроете — вернётесь через пункт меню «С чего начать».',
    counted:
      'Шаги считаются по данным области. Сбросить нельзя: пройдите заново в новой области.',
    menuLabel: 'С чего начать',
    loading: 'Смотрим, что уже сделано',
    failed:
      'Не удалось узнать, что уже сделано. Шаги ниже те же самые — просто галочки пока не проставлены.',
    channels: (n) =>
      `${n} ${plural(n, 'канал', 'канала', 'каналов')} подключено`,
    samples: (n) =>
      `${n} ${plural(n, 'образец', 'образца', 'образцов')} манеры`,
    facts: (n) =>
      `${n} ${plural(n, 'утверждение', 'утверждения', 'утверждений')} в памяти`,
    steps: {
      channel: {
        short: 'Подключить канал',
        title: 'Подключите канал',
        why: 'Без канала посту некуда выйти. С него же продукт узнаёт, как вы обычно пишете, — если канал уже вёлся.',
        todo: 'Подключите один канал. Остальные добавите позже.',
        action: 'Открыть каналы',
        closes: 'Шаг закроется, когда появится первый подключённый канал.',
      },
      voice: {
        short: 'Задать голос',
        title: 'Скажите, чьей манерой писать',
        why: 'Иначе черновик выйдет ровным текстом без лица. Манера собирается из образцов — ваших прежних постов, статей, писем.',
        todo: 'Добавьте хотя бы один образец своего текста в разделе «Аватар».',
        action: 'Открыть «Аватар»',
        closes: 'Шаг закроется, когда появится первый образец.',
      },
      fact: {
        short: 'Найти, на что опереться',
        title: 'Найдите то, на что будете опираться',
        why: 'Продукт не даст собрать черновик, пока нет ни одного утверждения. Без опоры модель напишет гладкий текст ни о чём, и в разборе поста показать будет нечего.',
        todo: 'Добавьте одно утверждение о своём деле — цену, срок, цифру, которую вы точно знаете. Или найдите его поиском и подтвердите.',
        action: 'Открыть «Новая заготовка»',
        closes: 'Шаг закроется, когда появится первое утверждение.',
      },
      brief: {
        short: 'Сделать заготовку',
        title: 'Сделайте заготовку и получите черновик',
        why: 'Заготовка — это суть материала: одна мысль, записанная простыми словами, и заполненный бриф рядом с ней. Из неё собираются черновики под каждый канал. Пока сути нет, модель пишет складно и ни о чём.',
        todo: 'Нажмите «Новая заготовка», войдите одной мыслью — что вы хотите сказать — и ответьте на вопросы брифа.',
        action: 'Открыть «Контент»',
        closes:
          'Шаг закроется, когда в области появится первая заготовка — или первый черновик, если вы шли прежним путём.',
      },
      preview: {
        short: 'Посмотреть черновик в канале',
        title: 'Посмотрите, как это выйдет в канале',
        why: 'В каждом канале текст выглядит по-своему: где-то обрежется, где-то ссылка развернётся картинкой. Предпросмотр показывает то, что увидит читатель.',
        todo: 'На странице заготовки создайте адаптацию, затем откройте её предпросмотр.',
        action: 'Открыть «Контент»',
        closes:
          'Шаг закроется, когда появится первая адаптация в черновике: продукт не хранит отдельно, смотрели вы предпросмотр или нет.',
      },
      schedule: {
        short: 'Поставить в расписание',
        title: 'Поставьте пост в расписание',
        why: 'Это последний шаг пути. Дальше продукт публикует сам и показывает, что из этого вышло.',
        todo: 'Выберите время и поставьте черновик в очередь.',
        action: 'Открыть календарь',
        closes: 'Шаг закроется, когда первый пост встанет в расписание.',
      },
    },
  },
  en: {
    pageTitle: 'Where to start',
    pageLead:
      'Take one piece of content the whole way through. Everything after that is the same, only faster.',
    progressLabel: 'Done',
    progressValue: (done, total) => `${done} of ${total}`,
    stepOf: (index, total) => `Step ${index} of ${total}`,
    todoLabel: 'What to do',
    current: 'You are here',
    progressPending: 'counting…',
    allDoneTitle: 'All done',
    allDoneBody:
      'Your first piece went the whole way. You do not need to come back here — but the page stays in Settings if you ever do.',
    leave: 'Close and look around',
    comeBack: 'Close this and you can return through the "Where to start" menu item.',
    counted:
      'The ticks are counted from what is in this workspace. There is no reset: start again in a new workspace.',
    menuLabel: 'Where to start',
    loading: 'Checking what is already done',
    failed:
      'We could not read what is already done. The steps below are the same — the ticks are just missing.',
    channels: (n) => `${n} channel${n === 1 ? '' : 's'} connected`,
    samples: (n) => `${n} writing sample${n === 1 ? '' : 's'}`,
    facts: (n) => `${n} claim${n === 1 ? '' : 's'} in memory`,
    steps: {
      channel: {
        short: 'Connect a channel',
        title: 'Connect a channel',
        why: 'Without one a post has nowhere to go. It is also where the product learns how you usually write, if the channel has been running.',
        todo: 'Connect one channel. The rest can wait.',
        action: 'Open channels',
        closes: 'This closes when the first channel is connected.',
      },
      voice: {
        short: 'Set the voice',
        title: 'Say whose voice to write in',
        why: 'Otherwise the draft comes out even and faceless. The voice is built from samples — your own posts, articles, letters.',
        todo: 'Add at least one sample of your own writing in the "Avatar" section.',
        action: 'Open "Avatar"',
        closes: 'This closes when the first sample is in.',
      },
      fact: {
        short: 'Find something to stand on',
        title: 'Find what the piece will stand on',
        why: 'The product refuses to build a draft while there is not a single claim. With nothing to stand on the model writes something fluent about nothing, and a post review has nothing to show.',
        todo: 'Add one claim about your own work — a price, a deadline, a number you know. Or find one by search and confirm it.',
        action: 'Open "New piece"',
        closes: 'This closes when the first claim exists.',
      },
      brief: {
        short: 'Make a piece',
        title: 'Make a piece and get a draft',
        why: 'A piece is the substance: one thought written out in plain words, with the filled brief beside it. Drafts for each channel are cut from it. While there is no substance, the model writes something fluent about nothing.',
        todo: 'Press "New piece", start with one thought — what you want to say — and answer the brief.',
        action: 'Open "Content"',
        closes:
          'This closes when the workspace has its first piece — or its first draft, if you came the older way.',
      },
      preview: {
        short: 'See it in the channel',
        title: 'See how it comes out in the channel',
        why: 'Every channel renders text its own way: one truncates, another turns a link into a card. The preview shows what a reader will actually see.',
        todo: 'Create an adaptation on the piece page, then open its channel preview.',
        action: 'Open "Content"',
        closes:
          'This closes when the first draft exists: the product does not record separately whether you looked.',
      },
      schedule: {
        short: 'Put it in the schedule',
        title: 'Put the post in the schedule',
        why: 'This is the last step of the path. From here the product publishes on its own and shows what came of it.',
        todo: 'Pick a time and queue the draft.',
        action: 'Open the calendar',
        closes: 'This closes when the first post is scheduled.',
      },
    },
  },
};

export type OnboardingLocale = keyof typeof onboardingCopy;

/**
 * Which of the two languages a person reads, decided in one place.
 *
 * This used to spell the ternary out again — the eighth hand-written copy of
 * `String(language ?? 'ru').toLowerCase().startsWith('ru')`, written two
 * commits after `content-factory-next-w4vh` removed seven of them, and outside
 * the folder `content-locale-single-decision.guard.test.cjs` watches. It is
 * the same question with the same answer, so it delegates instead. The name
 * stays: callers here ask for an onboarding locale, and this file is where
 * that word means something.
 */
export const resolveOnboardingLocale = (
  language: string | undefined | null
): OnboardingLocale => resolveContentLocale(language);
