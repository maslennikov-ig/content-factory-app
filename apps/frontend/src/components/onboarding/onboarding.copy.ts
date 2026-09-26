import type { OnboardingStepKey } from './onboarding.adapter';
import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';
import {
  MIN_CORPUS_CHARS,
  MIN_CORPUS_SAMPLES,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The walkthrough's words, written out in two languages beside the code —
 * the convention this generation of screens set (`content-section.copy.ts`,
 * `editorial-stage.copy.ts`): two languages spelled out here, not sixteen
 * locale files promising a translation nobody wrote.
 *
 * Variant B (2q28.6): one step on the screen. Each step says what it is in
 * one heading, why in one line, gives one action, and says what closes it.
 * Everything else a step could teach — the essence, «Переписать по
 * настройкам», the channel card, the calendar list — is folded under «Что
 * ещё здесь есть»: there for whoever wants it, never in the way of the one
 * thing to do («решать за человека», owner, 13.09.2026).
 */

type StepWords = {
  /** The strip's short name — the menu's own word. */
  short: string;
  /** The step's own heading. */
  title: string;
  /** Why the product asks, in one line. */
  why: string;
  /** The one thing to do. */
  todo: string;
  /** The words on the button that leaves for the product. */
  action: string;
  /** What closes the step, said plainly. */
  closes: string;
  /** Optional things worth knowing on the step's screens, folded away. */
  more: readonly string[];
};

type TelegramWords = {
  addBotTitle: string;
  addBotBody: string;
  commandTitle: string;
  commandIdle: string;
  commandBody: string;
  appearsTitle: string;
  waiting: string;
  expired: string;
  startAgain: string;
  copy: string;
  copyBot: string;
  copyCommand: string;
  copied: string;
  failed: string;
  unavailable: string;
  otherPlatform: string;
};

type Words = {
  pageTitle: string;
  pageLead: string;
  stripLabel: string;
  progressValue: (done: number, total: number) => string;
  progressPending: string;
  stepOf: (index: number, total: number) => string;
  stateDone: string;
  stateOpen: string;
  doneNote: string;
  /**
   * Under a forward button that is still off. It names that button as it is
   * labelled — «Дальше: Канал» or, on the last step, «Завершить» — and the
   * «Сделаю позже» beside it (live walk 25.09.2026, P3-8).
   */
  waitNote: (forward: string, later: string) => string;
  showOnScreen: string;
  openChannels: string;
  openLatestPiece: string;
  back: string;
  later: string;
  next: (name: string) => string;
  /** The last step's forward button: it finishes, it does not go round. */
  finish: string;
  moreLabel: string;
  allDoneTitle: string;
  allDoneBody: string;
  leftTitle: string;
  leftBody: (open: number) => string;
  /** Only while the «С чего начать» menu row is there: it hides at 5 of 5. */
  comeBack: string;
  /** At 5 of 5 the menu row is gone; the settings tab is the way back. */
  comeBackDone: string;
  /** Откуда берутся галочки и почему нет кнопки «начать заново». */
  counted: string;
  /** Подпись пункта бокового меню. */
  menuLabel: string;
  loading: string;
  failed: string;
  channels: (n: number) => string;
  fact: {
    label: string;
    title: string;
    body: string;
    action: string;
    done: (n: number) => string;
  };
  telegram: TelegramWords;
  steps: Record<OnboardingStepKey, StepWords>;
};

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/*
 * The avatar step names the real floor of «Собрать из моих текстов» — the
 * one the collecting screen enforces — rather than a number of its own.
 */
const corpusChars = (locale: 'ru' | 'en') =>
  MIN_CORPUS_CHARS.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');

export const onboardingCopy: { ru: Words; en: Words } = {
  ru: {
    pageTitle: 'С чего начать',
    pageLead:
      'Пять шагов до первого поста в вашем канале. Один шаг на экране; любой можно отложить и вернуться к нему с полосы сверху.',
    stripLabel: 'Шаги',
    progressValue: (done, total) => `${done} из ${total}`,
    progressPending: 'считаем…',
    stepOf: (index, total) => `Шаг ${index} из ${total}`,
    stateDone: 'сделано',
    stateOpen: 'не сделано',
    doneNote: 'Этот шаг уже сделан.',
    waitNote: (forward, later) =>
      `Кнопка «${forward}» станет доступна, когда шаг будет сделан. «${later}» — перейти, ничего не отмечая.`,
    showOnScreen: 'Показать на экране',
    openChannels: 'Открыть каналы',
    openLatestPiece: 'Открыть последнюю заготовку',
    back: 'Назад',
    later: 'Сделаю позже',
    next: (name) => `Дальше: ${name}`,
    finish: 'Завершить',
    moreLabel: 'Что ещё здесь есть',
    allDoneTitle: 'Всё пройдено',
    allDoneBody:
      'Первый пост прошёл весь путь. Сюда можно не возвращаться.',
    leftTitle: 'Почти всё',
    leftBody: (open) =>
      `${open} ${plural(
        open,
        'шаг отложен',
        'шага отложены',
        'шагов отложено'
      )}. Вернитесь к ${plural(open, 'нему', 'ним', 'ним')} с полосы сверху, когда будет время.`,
    comeBack: 'Вернуться к этим шагам можно через пункт меню «С чего начать».',
    comeBackDone:
      'Страница остаётся в настройках — вкладка «С чего начать».',
    counted:
      'Шаги считаются по данным пространства. Сбросить нельзя: пройдите заново в новом пространстве.',
    menuLabel: 'С чего начать',
    loading: 'Смотрим, что уже сделано',
    failed:
      'Не удалось узнать, что уже сделано. Шаги те же самые — просто галочки пока не проставлены.',
    // «1 канал подключён», «3 канала подключены», «5 каналов подключено».
    channels: (n) =>
      `${n} ${plural(
        n,
        'канал подключён',
        'канала подключены',
        'каналов подключено'
      )}`,
    fact: {
      label: 'Необязательно',
      title: 'Опора для поста',
      body: 'Цена, срок, цифра, которую вы точно знаете. С опорой текст конкретнее, и в разборе видно, на чём держится утверждение. Без неё путь тоже проходится.',
      action: 'Открыть «Новая заготовка»',
      done: (n) =>
        `${n} ${plural(
          n,
          'утверждение',
          'утверждения',
          'утверждений'
        )} в памяти и заготовках`,
    },
    telegram: {
      addBotTitle: 'Добавьте бота в свой канал администратором',
      addBotBody:
        'В Telegram: канал → Администраторы → Добавить. Обязательно право публиковать сообщения. Право удалять сообщения — по желанию: с ним бот уберёт команду из канала сам.',
      commandTitle: 'Отправьте в канал эту команду',
      commandIdle:
        'Нажмите «Подключить Telegram» — появится команда со словом только для вас.',
      commandBody:
        'Команда действует 15 минут. Без права удалять сообщения бот её оставит — удалите её из канала сами, на подключение это не влияет.',
      appearsTitle: 'Готово — канал появится здесь сам',
      waiting: 'Ждём сообщение в канале…',
      expired: 'Команда устарела. Получите новую и отправьте её ещё раз.',
      startAgain: 'Новая команда',
      copy: 'Скопировать',
      copyBot: 'Скопировать имя бота',
      copyCommand: 'Скопировать команду',
      copied: 'Скопировано',
      failed:
        'Не получилось начать подключение. Подключите канал на экране каналов.',
      unavailable:
        'Бот Telegram на этом сервере не настроен. Подключите канал на экране каналов.',
      otherPlatform: 'Другая площадка — на экране каналов',
    },
    steps: {
      avatar: {
        short: 'Аватар',
        title: 'Скажите, чьей манерой писать',
        why: 'Без аватара черновики выходят ровным текстом без лица.',
        todo: `Быстрее всего — «Заполнить вручную»: пять строк о том, как вы пишете, 10–15 минут, тексты не нужны. «Собрать из моих текстов» точнее, но просит от ${MIN_CORPUS_SAMPLES} текстов и от ${corpusChars(
          'ru'
        )} знаков.`,
        action: 'Открыть «Аватар»',
        closes:
          'Шаг закроется, когда аватар будет готов.',
        more: [
          'Путь можно сменить в любой момент: образцы сохраняются.',
          'Третий путь — взять манеру автора, который нравится: берём ритм и устройство фраз, не содержание.',
        ],
      },
      channel: {
        short: 'Канал',
        title: 'Подключите канал, куда будут выходить посты',
        why: 'Подойдёт и тестовый закрытый канал. Больше ничего на этом шаге не нужно.',
        todo: 'Три действия в Telegram — и канал подключится сам.',
        action: 'Подключить Telegram',
        closes: 'Шаг закроется, когда канал подключится.',
        more: [
          'У каждого канала есть карточка «Как пишем в «…»»: длина поста, бегунок «Сколько эмодзи в посте», ссылки и хэштеги.',
          'Там же «План» — как посты канала встают в календарь: «Бронь» ждёт вашего «Подтвердить», «Автопилот» выходит сам.',
        ],
      },
      piece: {
        short: 'Заготовка',
        title: 'Запишите суть будущего поста',
        why: 'Суть — одна мысль простыми словами. Из неё собираются посты под каждый канал.',
        todo: 'На вкладке «Заготовки» нажмите «Новая заготовка», напишите, что хотите сказать, и ответьте на вопросы.',
        action: 'Открыть «Заготовки»',
        closes: 'Шаг закроется, когда появится первая заготовка.',
        more: [
          'Суть можно поправить руками: она нейтральна, стиль добавит адаптация.',
          'Если вопросов слишком много — «Решите всё за меня».',
        ],
      },
      adaptation: {
        short: 'Адаптация',
        title: 'Сделайте из сути пост для канала',
        why: 'Адаптация — пост под конкретный канал: его длина, тон и оформление.',
        todo: 'Откройте заготовку и создайте адаптацию для своего канала.',
        action: 'Открыть «Заготовки»',
        closes: 'Шаг закроется, когда появится первая адаптация.',
        more: [
          'Не нравится текст — поменяйте длину, эмодзи или пожелание и нажмите «Переписать по настройкам».',
          '«Переписать и запомнить для канала» сделает эти значения готовыми настройками канала.',
        ],
      },
      plan: {
        short: 'План',
        title: 'Решите, когда выйдет пост',
        why: 'Дальше продукт публикует сам — в выбранное время.',
        todo: 'На странице заготовки, в адаптации, нажмите «Запланировать» — или «Подтвердить» у брони. В календаре видны все посты.',
        action: 'Открыть календарь',
        closes:
          'Шаг закроется, когда пост встанет в расписание или вы выберете план канала.',
        more: [
          'План канала — «Бронь» или «Автопилот» — выбирается в карточке канала, и новые посты встают в календарь сами.',
          'В календаре есть вид «Список» и поиск по тексту постов.',
        ],
      },
    },
  },
  en: {
    pageTitle: 'Where to start',
    pageLead:
      'Five steps to the first post in your channel. One step on the screen; any of them can wait, and the strip above brings you back.',
    stripLabel: 'Steps',
    progressValue: (done, total) => `${done} of ${total}`,
    progressPending: 'counting…',
    stepOf: (index, total) => `Step ${index} of ${total}`,
    stateDone: 'done',
    stateOpen: 'not done',
    doneNote: 'This step is already done.',
    waitNote: (forward, later) =>
      `"${forward}" opens once the step is done. "${later}" moves on without ticking anything.`,
    showOnScreen: 'Show me on the screen',
    openChannels: 'Open channels',
    openLatestPiece: 'Open the latest piece',
    back: 'Back',
    later: 'Later',
    next: (name) => `Next: ${name}`,
    finish: 'Finish',
    moreLabel: 'What else is here',
    allDoneTitle: 'All done',
    allDoneBody:
      'Your first post went the whole way. You do not need to come back here.',
    leftTitle: 'Almost there',
    leftBody: (open) =>
      `${open} step${open === 1 ? '' : 's'} put off. Come back from the strip above when you have time.`,
    comeBack: 'Return to these steps through the "Where to start" menu item.',
    comeBackDone: 'The page stays in Settings, on the "Where to start" tab.',
    counted:
      'The ticks are counted from what is in this workspace. There is no reset: start again in a new workspace.',
    menuLabel: 'Where to start',
    loading: 'Checking what is already done',
    failed:
      'We could not read what is already done. The steps are the same — the ticks are just missing.',
    channels: (n) => `${n} channel${n === 1 ? '' : 's'} connected`,
    fact: {
      label: 'Optional',
      title: 'Something for the post to stand on',
      body: 'A price, a deadline, a number you know. A claim makes the text concrete and shows in the review what it stands on. The path works without it too.',
      action: 'Open "New piece"',
      done: (n) => `${n} claim${n === 1 ? '' : 's'} in memory and pieces`,
    },
    telegram: {
      addBotTitle: 'Add the bot to your channel as an admin',
      addBotBody:
        'In Telegram: channel → Administrators → Add. The right to post messages is required. The right to delete messages is optional: with it, the bot removes the command from the channel itself.',
      commandTitle: 'Send this command to the channel',
      commandIdle:
        'Press "Connect Telegram" and a command with a word just for you appears.',
      commandBody:
        'The command works for 15 minutes. Without the right to delete messages the bot leaves it there — remove it yourself; the connection works either way.',
      appearsTitle: 'Done — the channel shows up here by itself',
      waiting: 'Waiting for the message in the channel…',
      expired: 'The command expired. Get a new one and send it again.',
      startAgain: 'New command',
      copy: 'Copy',
      copyBot: 'Copy the bot name',
      copyCommand: 'Copy the command',
      copied: 'Copied',
      failed:
        'Could not start connecting. Connect the channel on the channels screen.',
      unavailable:
        'The Telegram bot is not set up on this server. Connect the channel on the channels screen.',
      otherPlatform: 'Another platform — on the channels screen',
    },
    steps: {
      avatar: {
        short: 'Avatar',
        title: 'Say whose voice to write in',
        why: 'Without an avatar drafts come out even and faceless.',
        todo: `Fastest is "Fill it in by hand": five lines about how you write, 10–15 minutes, no texts needed. "Build it from my own texts" is more precise but needs at least ${MIN_CORPUS_SAMPLES} texts and ${corpusChars(
          'en'
        )} characters.`,
        action: 'Open "Avatar"',
        closes:
          'This closes when the avatar is ready.',
        more: [
          'You can switch paths at any time: samples are kept.',
          'A third path borrows the manner of an author you like: rhythm and sentence build, never content.',
        ],
      },
      channel: {
        short: 'Channel',
        title: 'Connect the channel your posts go to',
        why: 'A private test channel works too. Nothing else is needed on this step.',
        todo: 'Three moves in Telegram, and the channel connects by itself.',
        action: 'Connect Telegram',
        closes: 'This closes when the channel is connected.',
        more: [
          'Every channel has a card “How we write in …”: post length, the “How many emoji a post has” slider, links and hashtags.',
          'The same card has “Plan” — how the channel’s posts get into the calendar: “Reserve” waits for your “Confirm”, “Autopilot” goes out by itself.',
        ],
      },
      piece: {
        short: 'Piece',
        title: 'Write down the essence of the post',
        why: 'The essence is one thought in plain words. Posts for each channel are cut from it.',
        todo: 'On the "Pieces" tab press "New piece", write what you want to say and answer the questions.',
        action: 'Open "Pieces"',
        closes: 'This closes when the first piece exists.',
        more: [
          'You can edit the essence by hand: it is neutral, the adaptation adds the style.',
          'Too many questions? “You decide everything”.',
        ],
      },
      adaptation: {
        short: 'Adaptation',
        title: 'Turn the essence into a post for the channel',
        why: 'An adaptation is the post for one channel: its length, tone and layout.',
        todo: 'Open the piece and create an adaptation for your channel.',
        action: 'Open "Pieces"',
        closes: 'This closes when the first adaptation exists.',
        more: [
          'Not happy with the text? Change the length, emoji or a wish and press “Rewrite with these settings”.',
          '“Rewrite and remember for the channel” makes those values the channel’s defaults.',
        ],
      },
      plan: {
        short: 'Plan',
        title: 'Decide when the post goes out',
        why: 'From here the product publishes by itself, at the time you chose.',
        todo: 'On the piece page, in the adaptation, press "Schedule" — or "Confirm" on a reservation. The calendar shows every post.',
        action: 'Open the calendar',
        closes:
          'This closes when a post is scheduled or you choose a plan for the channel.',
        more: [
          'The channel plan — “Reserve” or “Autopilot” — is chosen on the channel card, and new posts get into the calendar by themselves.',
          'The calendar has a “List” view and search through the text of posts.',
        ],
      },
    },
  },
};

export type OnboardingLocale = keyof typeof onboardingCopy;

/**
 * Which of the two languages a person reads, decided in one place: the same
 * question `content-section.copy.ts` answers, so it delegates instead of
 * spelling the ternary out again.
 */
export const resolveOnboardingLocale = (
  language: string | undefined | null
): OnboardingLocale => resolveContentLocale(language);
