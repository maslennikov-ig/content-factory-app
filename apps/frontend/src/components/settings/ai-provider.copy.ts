import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * `content-factory-next-m2eg.24`: то, что владелец не смог прочитать.
 *
 * Живой прогон 07.09.2026, дословно: «расходы по участнику… не понимаю, где
 * смотреть, потому что там же их нет. А еще для меня не очень понятны разделы
 * «модель на роль вызова»… непонятно написаны, непонятно, а зачем они нужны».
 *
 * Две разные жалобы с одной причиной — экран молчит там, где ему нечего
 * сказать:
 *
 *  - обе таблицы расхода рисовались только при непустом списке, а список
 *    пуст, пока не сделан первый вызов модели. Человек искал раздел, которого
 *    в этот момент буквально не было на странице, и решал, что расхода не
 *    видно нигде. Ноль — это ответ, и его надо напечатать;
 *  - у ролей вызова был заголовок, одна строка подсказки и шесть полей с
 *    названиями вроде «Разбор текста». Что такое роль вызова, почему пусто —
 *    это нормально и зачем вообще их трогать, не было сказано нигде.
 *
 * Слова живут здесь, а не семнадцатым ключом i18next: `onboarding.copy.ts`
 * и `content-section.copy.ts` записали эту договорённость раньше — два языка
 * рядом с кодом вместо шестнадцати файлов с обещанием перевода, которого никто
 * не писал. Подписи, которые уже переведены во всех шестнадцати, экран
 * по-прежнему берёт через `t()`; сюда переехало только то, чего там не было.
 */

/**
 * `content-factory-next-75xn.6`: второе такое же место, и по той же причине.
 *
 * У поиска стало два рычага — ключ на каждый движок и сервер на каждую задачу,
 * — и ни одного слова о том, что по умолчанию работают ключи системы и
 * заполнять здесь ничего не надо. Ключи локалей этого сказать не могут: они
 * писались, когда движок был один, поэтому русские и английские строки прямо
 * называют Tavily в подписи поля, которое теперь принадлежит Exa. Название
 * движка в подписи — это не перевод, а часть смысла, и подставить его в
 * шестнадцать файлов локалей никто не возьмётся.
 */

type RoleWords = {
  /** Одна строка: что эта роль делает. */
  what: string;
};

/** Слова одного поискового движка: подпись поля, его состояние и удаление. */
type EngineWords = {
  /** Как движок называется на экране. */
  name: string;
  /** Одна строка: чем этот движок полезен и на чём он лучше остальных. */
  what: string;
};

/** То же для движка, которому нужен собственный ключ. */
type KeyedEngineWords = EngineWords & {
  /** Подпись поля ключа. */
  keyLabel: string;
  /** Строка под полем, когда ключ этого движка сохранён. */
  keyStored: string;
  /** Строка под полем, когда ключа нет. */
  keyMissing: string;
  /** Что именно исчезнет. Спрашивается до запроса, а не после. */
  removeKeyConfirm: string;
};

/** Слова одной поисковой задачи: подпись селектора и строка под ним. */
type TaskWords = {
  /** Подпись: что человек тут выбирает. */
  label: string;
  /** Одна строка: когда эта задача случается и что в ней важно. */
  what: string;
};

type Words = {
  /**
   * Имя кнопки-подсказки: «Подсказка: глубина поиска», а не второе «Глубина
   * поиска». Одиннадцать одинаковых «подсказок» на экране скринридер читает
   * как одиннадцать одинаковых кнопок, и найти среди них нужную нечем.
   */
  hintFor: (subject: string) => string;
  /** Строка рядом с «Сохранить»: что сохраняется само, а что — нет. */
  autosaveNote: string;
  /** Строка таблицы, когда за период не было ни одного вызова. */
  usageNone: string;
  /** Почему таблица пуста, и что её наполнит. */
  usageNoneHint: string;
  /** Что такое роль вызова и зачем её трогать — в подсказку, не на экран. */
  rolesHint: string;
  /** Переключатель выбирает ключи и для генерации, и для поиска. */
  usageModeHint: string;
  /** Что значит пустое поле. Решающее, поэтому остаётся строкой. */
  rolesEmpty: string;
  /**
   * Строка-открывашка свёрнутой таблицы ролей (`97dq.62`, вариант B): что в
   * ней сейчас, без раскрытия.
   */
  rolesSummaryAll: string;
  rolesSummarySome: (routed: number, total: number) => string;
  /** Одна строка в «?» у каждого главного поля (`97dq.62`). */
  fields: {
    provider: string;
    key: string;
    textModel: string;
    imageModel: string;
    searchTopic: string;
  };
  roles: {
    classify: RoleWords;
    extract: RoleWords;
    research: RoleWords;
    draft: RoleWords;
    judge: RoleWords;
    review: RoleWords;
    image: RoleWords;
  };
  search: {
    /** Что вообще делает этот раздел. */
    what: string;
    /**
     * Единственная строка раздела на «Ключах системы».
     *
     * Владелец 18.09.2026: «если выбрана глобальная настройка, что ключи
     * системы, то зачем это все показывать… всё это нужно прятать». Полей там
     * нет, но молчание было бы хуже полей: человек должен знать, что поиск
     * работает и на чей счёт.
     */
    systemKeys: string;
    /**
     * Одна строка вместо трёх селекторов «задача → сервер».
     *
     * Считается из сохранённых ключей теми же умолчаниями, что и на сервере,
     * поэтому она не «рекомендация», а описание того, куда уйдёт следующий
     * поиск (`content-factory-next-75xn.10`).
     */
    routing: (pairs: Array<{ task: string; engine: string }>) => string;
    /** Та же строка, когда тратить нечего ни одному движку. */
    routingNone: string;
    /** Плейсхолдер поля, когда ключ этого движка уже сохранён. */
    keySavedPlaceholder: string;
    /** Плейсхолдер пустого поля. */
    keyEmptyPlaceholder: string;
    keyOwn: string;
    keySystem: string;
    /** Имя крестика: что именно он сделает и с каким движком. */
    returnToSystem: (engine: string) => string;
    /**
     * Что будет после нажатия крестика.
     *
     * Владелец 18.09.2026: «должно быть пояснение при наведении на крестик…
     * для обычного пользователя не должно быть возможности работать без
     * ключа». Крестик выглядит как удаление, а означает возврат на ключ
     * системы, и это надо сказать до нажатия, а не в диалоге после.
     */
    returnToSystemHint: string;
    /**
     * Подсказка «?» под полем. Владелец 22.09.2026 (`97dq.34`): у «?» стояла
     * та же строка, что у крестика, и «Нажмёте» читалось как «нажмите
     * вопросик». Здесь крестик назван прямо и не повторяет строку с него.
     */
    returnToSystemExplain: (engine: string) => string;
    engines: {
      tavily: KeyedEngineWords;
      exa: KeyedEngineWords;
      openrouter: EngineWords;
    };
    tasks: {
      research: TaskWords;
      facts: TaskWords;
      discovery: TaskWords;
    };
  };
};

export const aiProviderCopy: { ru: Words; en: Words } = {
  ru: {
    hintFor: (subject) => `Подсказка: ${subject}`,
    autosaveNote:
      'Всё сохраняется само. Кнопка нужна только для ключей — их отправляет она.',
    usageNone: 'Пока 0',
    usageNoneHint:
      'Расход появляется после первого обращения к ИИ: пока за этот период ни одного не было.',
    rolesHint:
      'Роль вызова — это работа, ради которой продукт обращается к ИИ. Менять стоит ради денег: классификация и разбор прекрасно работают на дешёвом ИИ, а платить за них по цене черновика незачем.',
    usageModeHint:
      'Переключатель выбирает, на чьих ключах работает всё: и генерация, и поиск. На «Ключах системы» поиск идёт на ключах системы и расходует включённый лимит, а ваши сохранённые поисковые ключи ждут и возвращаются в работу, как только вы выберете «Свой ключ».',
    rolesEmpty:
      'Пустое поле означает «брать ИИ для текста, указанный выше». Заполнять здесь ничего не обязательно.',
    rolesSummaryAll: 'Отдельный ИИ на задачу · у всех тот же, что для текста',
    rolesSummarySome: (routed, total) =>
      `Отдельный ИИ на задачу · свой у ${routed} из ${total}`,
    fields: {
      provider: 'Чей ИИ пишет тексты и рисует картинки: OpenAI или OpenRouter.',
      key: 'Ключ вашего аккаунта у провайдера. Хранится только для этого пространства и больше не показывается.',
      textModel:
        'Какой ИИ пишет тексты. Пусто — берём то, что провайдер ставит по умолчанию.',
      imageModel:
        'Какой ИИ рисует картинки. Пусто — берём то, что провайдер ставит по умолчанию.',
      searchTopic: 'Где искать: во всём интернете или только в свежих новостях.',
    },
    roles: {
      classify: {
        what: 'Классификация — одно предложение на входе, несколько коротких полей на выходе: к чему относится тема, годится ли источник.',
      },
      extract: {
        what: 'Разбор текста — вытащить из страницы или письма факты и цитаты, ничего не сочиняя.',
      },
      research: {
        what: 'Веб-исследование — собрать и свести найденное в сети, когда включён поиск.',
      },
      draft: {
        what: 'Черновик — собственно написание поста по заготовке и брифу. Самая дорогая роль, и здесь экономия видна сразу.',
      },
      judge: {
        what: 'Проверка голоса — сверить готовый текст с вашей манерой и сказать, где он на неё не похож.',
      },
      review: {
        what: 'Проверка адаптации — убрать штампы, сверить утверждения с сутью заготовки или сделать оба действия за один вызов.',
      },
      image: {
        what: 'Картинки — единственная роль, которой нужен ИИ, умеющий рисовать.',
      },
    },
    search: {
      what: 'Поиск работает всегда. На «Своём ключе» у каждого движка своё поле: сохранённый ключ перекрывает ключ системы только для этого движка и не расходует включённый лимит, пустое поле берёт ключ системы. На «Ключах системы» поиск идёт на ключах системы.',
      systemKeys: 'Поиск идёт на ключах системы и расходует включённый лимит.',
      routing: (pairs) =>
        `Сейчас поиск идёт так: ${pairs
          .map((pair) => `${pair.task} — ${pair.engine}`)
          .join('; ')}. Движок выбирается сам, по тому, какие ключи сохранены.`,
      routingNone:
        'Ни у одного поискового движка нет ключа, поэтому искать сейчас нечем. Сохраните свой ключ или включите ключи системы.',
      keySavedPlaceholder: 'Ключ сохранён — введите новый, чтобы заменить',
      keyEmptyPlaceholder: 'Вставьте ключ',
      keyOwn: 'Свой ключ',
      keySystem: 'На ключе системы',
      returnToSystem: (engine) => `Вернуть ${engine} на ключ системы`,
      returnToSystemHint:
        'Нажмите ×, и поле вернётся на ключ системы. Поиск без ключа не остаётся.',
      returnToSystemExplain: (engine) =>
        `Крестик × справа в поле убирает ваш ключ ${engine}: движок снова работает на ключе системы, так что искать всегда есть чем.`,
      engines: {
        tavily: {
          name: 'Tavily',
          what: 'Короткая цитируемая выдержка и окно по дате публикации.',
          keyLabel: 'Ключ Tavily',
          keyStored:
            'Ключ Tavily сохранён для этого пространства. Он больше не показывается.',
          keyMissing:
            'Своего ключа Tavily нет — Tavily работает на ключе системы.',
          removeKeyConfirm:
            'Сохранённый ключ Tavily будет удалён без возможности восстановления. Поиск через Tavily вернётся на ключ системы, а если его нет — перестанет работать.',
        },
        exa: {
          name: 'Exa',
          what: 'Поиск по описанию нужной страницы: точнее там, где важны широта и качество источников.',
          keyLabel: 'Ключ Exa',
          keyStored:
            'Ключ Exa сохранён для этого пространства. Он больше не показывается.',
          keyMissing: 'Своего ключа Exa нет — Exa работает на ключе системы.',
          removeKeyConfirm:
            'Сохранённый ключ Exa будет удалён без возможности восстановления. Поиск через Exa вернётся на ключ системы, а если его нет — перестанет работать.',
        },
        openrouter: {
          name: 'OpenRouter',
          what: 'Поиск силами вашего провайдера генерации, без отдельного ключа.',
        },
      },
      tasks: {
        research: {
          label: 'Собрать опоры',
          what: 'Материал для текста: «Поискать в интернете» и «Дополнить из интернета». Важны широта и качество источников — их читает человек.',
        },
        facts: {
          label: 'Проверить факты',
          what: 'Сверка того, что в тексте уже написано, в том числе поиск, который продукт начинает сам. Важна короткая выдержка, на которую можно сослаться.',
        },
        discovery: {
          label: 'Свежие темы',
          what: 'Что нового по теме за последние дни, для подписок в «Откуда идеи». Важно окно по дате публикации.',
        },
      },
    },
  },
  en: {
    hintFor: (subject) => `Hint: ${subject}`,
    autosaveNote:
      'Everything saves itself. The button is for the keys — they travel only through it.',
    usageNone: 'Nothing yet',
    usageNoneHint:
      'Usage appears after the first model call: there has not been one this period.',
    rolesHint:
      'A call role is the job the product goes to a model for. The reason to change one is money: classification and extraction do fine on a cheap model, and paying draft prices for them buys nothing.',
    usageModeHint:
      'This switch chooses whose keys everything runs on — generation and search alike. On the system keys, search runs on them and spends the included allowance, while your own saved search keys wait and come back into use the moment you choose your own key.',
    rolesEmpty:
      'An empty field means "use the text model above". Filling these in is optional.',
    rolesSummaryAll: 'A separate AI per task · all use the text one',
    rolesSummarySome: (routed, total) =>
      `A separate AI per task · ${routed} of ${total} set`,
    fields: {
      provider: 'Whose AI writes the texts and draws the images: OpenAI or OpenRouter.',
      key: 'Your account key at the provider. Kept for this workspace only and never shown again.',
      textModel: 'Which AI writes the texts. Empty means the provider’s default.',
      imageModel: 'Which AI draws the images. Empty means the provider’s default.',
      searchTopic: 'Where to search: the whole web or fresh news only.',
    },
    roles: {
      classify: {
        what: 'Classification — one sentence in, a few short fields out: what a subject belongs to, whether a source is usable.',
      },
      extract: {
        what: 'Extraction — pulling facts and quotations out of a page or a letter, inventing nothing.',
      },
      research: {
        what: 'Web research — gathering and summarising what search found, when search is on.',
      },
      draft: {
        what: 'Draft — actually writing the post from the piece and the brief. The most expensive role, and where a change shows first.',
      },
      judge: {
        what: 'Voice check — comparing the finished text against your own way of writing and saying where it drifts.',
      },
      review: {
        what: 'Adaptation review — remove cliches, compare claims with the piece, or do both in one call.',
      },
      image: {
        what: 'Images — the one role that needs a model which can draw.',
      },
    },
    search: {
      what: 'Search always works. On your own key each engine has a field of its own: a saved key overrides the system key for that engine alone and does not spend the included allowance, and an empty field uses the system key. On the system keys, search runs on them.',
      systemKeys:
        'Search runs on the system keys and spends the included allowance.',
      routing: (pairs) =>
        `Search runs like this now: ${pairs
          .map((pair) => `${pair.task} — ${pair.engine}`)
          .join(
            '; '
          )}. The engine is chosen for you, from the keys that are stored.`,
      routingNone:
        'No search engine has a key, so there is nothing to search with. Save a key of your own, or switch to the system keys.',
      keySavedPlaceholder: 'A key is saved — type a new one to replace it',
      keyEmptyPlaceholder: 'Paste a key',
      keyOwn: 'Own key',
      keySystem: 'On the system key',
      returnToSystem: (engine) => `Return ${engine} to the system key`,
      returnToSystemHint:
        'Press × and the field returns to the system key. Search is never left without a key.',
      returnToSystemExplain: (engine) =>
        `The × at the right of the field removes your own ${engine} key: the engine goes back to the system key, so there is always something to search with.`,
      engines: {
        tavily: {
          name: 'Tavily',
          what: 'A short citable snippet and a published-date window.',
          keyLabel: 'Tavily key',
          keyStored:
            'A Tavily key is stored for this workspace. It is never shown again.',
          keyMissing:
            'No Tavily key of your own — Tavily runs on the system key.',
          removeKeyConfirm:
            'The stored Tavily key is removed and cannot be recovered. Tavily search falls back to the system key, and stops if there is none.',
        },
        exa: {
          name: 'Exa',
          what: 'Search by a description of the wanted page: more accurate where breadth and source quality matter.',
          keyLabel: 'Exa key',
          keyStored:
            'An Exa key is stored for this workspace. It is never shown again.',
          keyMissing: 'No Exa key of your own — Exa runs on the system key.',
          removeKeyConfirm:
            'The stored Exa key is removed and cannot be recovered. Exa search falls back to the system key, and stops if there is none.',
        },
        openrouter: {
          name: 'OpenRouter',
          what: 'Search by your generation provider, with no key of its own.',
        },
      },
      tasks: {
        research: {
          label: 'Collect supports',
          what: 'Material for a text: "Research this" and "Strengthen with research". Breadth and source quality matter — a person reads them.',
        },
        facts: {
          label: 'Check facts',
          what: 'Checking what the text already claims, including the searches the product starts on its own. A short citable snippet matters most.',
        },
        discovery: {
          label: 'Fresh subjects',
          what: 'What is new on a subject in the last few days, for the topic subscriptions. A published-date window matters most.',
        },
      },
    },
  },
};

export type AiProviderLocale = keyof typeof aiProviderCopy;

/**
 * Какой из двух языков читает человек. Тот же единственный вопрос с тем же
 * единственным ответом, что у остальных экранов, поэтому он делегируется, а не
 * пишется тут девятым тернарником (`content-factory-next-w4vh`).
 */
export const resolveAiProviderLocale = (
  language: string | undefined | null
): AiProviderLocale => resolveContentLocale(language);
