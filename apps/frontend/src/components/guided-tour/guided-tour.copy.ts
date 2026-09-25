import type { TourStopId } from './guided-tour.contract';

/**
 * The tour's words, both languages beside the code — the convention of
 * `onboarding.copy.ts` and `content-section.copy.ts`.
 *
 * Every stop names the control in its title and says in one line what it
 * does. Titles quote the control's own label, so the card and the button
 * read as one thing.
 */

type StopWords = { title: string; body: string };

type Words = {
  /** driver.js fills `{{current}}` and `{{total}}`. */
  progress: string;
  next: string;
  previous: string;
  done: string;
  close: string;
  stops: Record<TourStopId, StopWords>;
};

export const guidedTourCopy: { ru: Words; en: Words } = {
  ru: {
    progress: '{{current}} из {{total}}',
    next: 'Дальше',
    previous: 'Назад',
    done: 'Понятно',
    close: 'Закрыть подсказку',
    stops: {
      avatarCreate: {
        title: '«Создать аватар»',
        body: 'Аватар — голос, которым пишет ИИ. Кнопка начинает сбор вашей манеры по образцам текстов.',
      },
      avatarList: {
        title: 'Ваши аватары',
        body: 'Основной — в зелёной рамке: им пишутся черновики, если не выбрать другой.',
      },
      channelConnect: {
        title: '«Подключить канал»',
        body: 'Открывает список площадок: выберите нужную и следуйте шагам окна.',
      },
      channelTelegram: {
        title: 'Если это Telegram',
        body: 'Добавьте нашего бота администратором канала и отправьте в канал сообщение /connect … — точную команду покажет окно подключения.',
      },
      pieceNew: {
        title: '«Новая заготовка»',
        body: 'Заготовка — суть будущего поста без привязки к площадке. С неё начинается любой материал.',
      },
      pieceKind: {
        title: 'Свой текст · Чужой пост · Задание',
        body: 'Скажите, что вставляете: свою мысль, чужой пост, из которого сделать свой, или задание для ИИ.',
      },
      pieceInput: {
        title: 'Одна мысль',
        body: 'Напишите мысль своими словами или вставьте готовый текст — дальше продукт спросит, чего не хватает.',
      },
      adaptationAdapt: {
        title: 'Адаптация',
        body: 'Делает из заготовки пост под этот канал: длина, тон и оформление площадки.',
      },
      adaptationPanel: {
        title: 'Настройки поста',
        body: 'Длина, тон, аватар и остальное для этого поста. Применяются, когда пост переписывается.',
      },
      adaptationRewrite: {
        title: '«Переписать по настройкам»',
        body: 'Пишет пост заново с текущими настройками; прежний текст остаётся вариантом.',
      },
      adaptationPreview: {
        title: 'Предпросмотр',
        body: 'Показывает пост так, как его увидит читатель в канале.',
      },
      planView: {
        title: 'Календарь или «Список»',
        body: '«Список» показывает посты строками — в нём удобно искать и проверять очередь.',
      },
      planSearch: {
        title: 'Поиск',
        body: 'Находит посты по словам в тексте и складывается с отбором по каналу.',
      },
      planConfirm: {
        title: '«Подтвердить»',
        body: 'Бронь сама не выходит: «Подтвердить» ставит пост в очередь на выбранное время.',
      },
    },
  },
  en: {
    progress: '{{current}} of {{total}}',
    next: 'Next',
    previous: 'Back',
    done: 'Got it',
    close: 'Close the hint',
    stops: {
      avatarCreate: {
        title: '"New avatar"',
        body: 'An avatar is the voice the AI writes in. This starts collecting your manner from samples of your writing.',
      },
      avatarList: {
        title: 'Your avatars',
        body: 'The default one has the green frame: drafts are written in it unless you pick another.',
      },
      channelConnect: {
        title: '"Connect channel"',
        body: 'Opens the list of platforms: pick one and follow the steps in the window.',
      },
      channelTelegram: {
        title: 'If it is Telegram',
        body: 'Add our bot to the channel as an admin and post /connect … in the channel — the connect window shows the exact command.',
      },
      pieceNew: {
        title: '"New piece"',
        body: 'A piece is the core of a future post, not tied to any platform. Every piece of content starts here.',
      },
      pieceKind: {
        title: 'My text · Someone’s post · Instruction',
        body: 'Say what you are pasting: your own thought, someone else’s post to make your own, or an instruction for the AI.',
      },
      pieceInput: {
        title: 'One thought',
        body: 'Write the thought in your own words or paste a finished text — the product then asks for what is missing.',
      },
      adaptationAdapt: {
        title: 'Adaptation',
        body: 'Turns the piece into a post for this channel: length, tone and the platform’s format.',
      },
      adaptationPanel: {
        title: 'Post settings',
        body: 'Length, tone, avatar and the rest for this post. They apply when the post is rewritten.',
      },
      adaptationRewrite: {
        title: '"Rewrite with these settings"',
        body: 'Writes the post again with the current settings; the previous text stays as a variant.',
      },
      adaptationPreview: {
        title: 'Preview',
        body: 'Shows the post the way a reader will see it in the channel.',
      },
      planView: {
        title: 'Calendar or "List"',
        body: '"List" shows posts as rows — the place to search and check the queue.',
      },
      planSearch: {
        title: 'Search',
        body: 'Finds posts by words in their text and combines with the channel filter.',
      },
      planConfirm: {
        title: '"Confirm"',
        body: 'A reservation does not go out by itself: "Confirm" queues the post for the chosen time.',
      },
    },
  },
};
