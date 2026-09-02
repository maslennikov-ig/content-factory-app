import type { OnboardingStepKey } from './onboarding.adapter';

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
  skipStep: string;
  allDoneTitle: string;
  allDoneBody: string;
  leave: string;
  comeBack: string;
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
    skipStep: 'Пропустить шаг',
    allDoneTitle: 'Всё пройдено',
    allDoneBody:
      'Первый материал прошёл весь путь. Дальше можно не возвращаться сюда — но страница останется в меню помощи, если понадобится.',
    leave: 'Закрыть и осмотреться',
    comeBack: 'Закроете — вернётесь через «Помощь → С чего начать».',
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
        todo: 'Добавьте хотя бы один образец своего текста.',
        action: 'Открыть «Кто пишет»',
        closes: 'Шаг закроется, когда появится первый образец.',
      },
      fact: {
        short: 'Найти, на что опереться',
        title: 'Найдите то, на что будете опираться',
        why: 'Продукт не даст собрать черновик, пока нет ни одного утверждения. Без опоры модель напишет гладкий текст ни о чём, и в разборе поста показать будет нечего.',
        todo: 'Добавьте одно утверждение о своём деле — цену, срок, цифру, которую вы точно знаете. Или найдите его поиском и подтвердите.',
        action: 'Открыть «Что пишем»',
        closes: 'Шаг закроется, когда появится первое утверждение.',
      },
      brief: {
        short: 'Собрать бриф',
        title: 'Соберите бриф и получите черновик',
        why: 'Черновик собирается из брифа, а не из темы. Пока в брифе нет сути, модель пишет складно и ни о чём.',
        todo: 'Ответьте на вопросы брифа и нажмите «собрать черновик».',
        action: 'Открыть бриф',
        closes: 'Шаг закроется, когда появится первый черновик.',
      },
      preview: {
        short: 'Посмотреть черновик в канале',
        title: 'Посмотрите, как это выйдет в канале',
        why: 'В каждом канале текст выглядит по-своему: где-то обрежется, где-то ссылка развернётся картинкой. Предпросмотр показывает то, что увидит читатель.',
        todo: 'Откройте черновик и посмотрите предпросмотр канала.',
        action: 'Открыть календарь',
        closes:
          'Шаг закрывается вместе с предыдущим: продукт не хранит отдельно, смотрели вы предпросмотр или нет.',
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
    skipStep: 'Skip this step',
    allDoneTitle: 'All done',
    allDoneBody:
      'Your first piece went the whole way. You do not need to come back here — but the page stays in the help menu if you ever do.',
    leave: 'Close and look around',
    comeBack: 'Close this and you can return through Help → Where to start.',
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
        todo: 'Add at least one sample of your own writing.',
        action: 'Open "Who writes"',
        closes: 'This closes when the first sample is in.',
      },
      fact: {
        short: 'Find something to stand on',
        title: 'Find what the piece will stand on',
        why: 'The product refuses to build a draft while there is not a single claim. With nothing to stand on the model writes something fluent about nothing, and a post review has nothing to show.',
        todo: 'Add one claim about your own work — a price, a deadline, a number you know. Or find one by search and confirm it.',
        action: 'Open "What we write"',
        closes: 'This closes when the first claim exists.',
      },
      brief: {
        short: 'Fill the brief',
        title: 'Fill the brief and get a draft',
        why: 'A draft is built from the brief, not from the topic. While the brief has no substance, the model writes something fluent about nothing.',
        todo: 'Answer the brief and press "build a draft".',
        action: 'Open the brief',
        closes: 'This closes when the first draft exists.',
      },
      preview: {
        short: 'See it in the channel',
        title: 'See how it comes out in the channel',
        why: 'Every channel renders text its own way: one truncates, another turns a link into a card. The preview shows what a reader will actually see.',
        todo: 'Open the draft and look at the channel preview.',
        action: 'Open the calendar',
        closes:
          'This closes together with the previous step: the product does not record separately whether you looked.',
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

export const resolveOnboardingLocale = (
  language: string | undefined | null
): OnboardingLocale =>
  String(language ?? 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en';
