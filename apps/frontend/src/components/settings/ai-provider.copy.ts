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
  /** Имя кнопки удаления — у каждого движка своё, иначе их не различить. */
  removeKey: string;
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
  /** Что значит пустое поле. Решающее, поэтому остаётся строкой. */
  rolesEmpty: string;
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
    /** Главное: по умолчанию всё уже работает и вводить нечего. */
    systemKeys: string;
    /**
     * Та же мысль в режиме ключей системы, где она единственная: полей там
     * нет вовсе, и строка обязана сказать, что это не потеря, а ответ.
     */
    systemKeysOnly: string;
    /**
     * И тот же ответ, когда ключей системы нет: в этом режиме область их не
     * заводит, поэтому строка называет того, кто может, и второй выход —
     * перейти на свой ключ (`content-factory-next-75xn.26`).
     */
    systemKeysMissing: string;
    /** Подпись блока своих поисковых ключей. */
    ownKeysTitle: string;
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
    /** Зачем тогда свой ключ и что он меняет. */
    ownKey: string;
    /** Что будет со своим ключом при возврате к ключам системы. */
    ownKeyKept: string;
    /** Плейсхолдер поля, когда ключ этого движка уже сохранён. */
    keySavedPlaceholder: string;
    /** Плейсхолдер пустого поля. */
    keyEmptyPlaceholder: string;
    /** Почему у OpenRouter нет своего поля ключа. */
    openrouterNoKey: string;
    /**
     * Режим включённых ключей: у области есть свой ключ, и он сейчас лежит.
     * Без названия движка — ответ сервера в этом режиме говорит про ключи
     * системы, а про свои знает только «есть или нет». Одно предложение и ни
     * одной кнопки: убрать свой ключ можно там, где стоит его поле, то есть в
     * режиме своих ключей (`content-factory-next-75xn.26`).
     */
    includedOwnKey: string;
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
      'Расход появляется после первого вызова модели: пока за этот период ни одного не было.',
    rolesHint:
      'Роль вызова — это работа, ради которой продукт обращается к модели. Менять стоит ради денег: классификация и разбор прекрасно работают на дешёвой модели, а платить за них по цене черновика незачем.',
    rolesEmpty:
      'Пустое поле означает «брать модель для текста, указанную выше». Заполнять здесь ничего не обязательно.',
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
      review: { what: 'Проверка адаптации — убрать штампы, сверить утверждения с сутью заготовки или сделать оба действия за один вызов.' },
      image: {
        what: 'Картинки — единственная роль, которой нужна модель, умеющая рисовать.',
      },
    },
    search: {
      what: 'Веб-исследование — это поиск в интернете, к которому продукт обращается сам: собрать опоры для текста, проверить утверждение, посмотреть свежие темы.',
      systemKeys:
        'По умолчанию работают ключи системы. Их не видно, и вводить здесь ничего не нужно — поиск уже работает.',
      systemKeysOnly:
        'Поиск работает на ключах системы, вводить ничего не нужно.',
      systemKeysMissing:
        'Ключи системы для поиска пока не заданы, поэтому веб-исследование не работает. Их задаёт суперадмин инстанса; можно также выбрать «Свой ключ» и сохранить собственный.',
      ownKeysTitle: 'Свои ключи поиска',
      routing: (pairs) =>
        `Сейчас поиск идёт так: ${pairs
          .map((pair) => `${pair.task} — ${pair.engine}`)
          .join('; ')}. Движок выбирается сам, по тому, какие ключи сохранены.`,
      routingNone:
        'Ни у одного поискового движка нет ключа, поэтому искать сейчас нечем. Сохраните свой ключ или включите ключи системы.',
      ownKey:
        'Свой ключ — по желанию. Он заменяет системный только для этой области и тратится с вашего счёта у поискового сервиса.',
      ownKeyKept:
        'Если вернуться к ключам системы, свой ключ остаётся сохранённым и снова заработает, как только вы снова выберете свои ключи. Чтобы он исчез совсем, уберите его кнопкой рядом с полем.',
      keySavedPlaceholder: 'Ключ сохранён — введите новый, чтобы заменить',
      keyEmptyPlaceholder: 'Вставьте ключ',
      openrouterNoKey:
        'У OpenRouter своего поискового ключа нет: он ищет через ваш ключ генерации, указанный выше, и тратит его.',
      includedOwnKey:
        'У этой области сохранён свой поисковый ключ. Сейчас он не тратится — работают ключи системы, — и снова заработает, как только вы выберете «Свой ключ». Убрать его можно там же.',
      engines: {
        tavily: {
          name: 'Tavily',
          what: 'Короткая цитируемая выдержка и окно по дате публикации.',
          keyLabel: 'Ключ Tavily',
          keyStored:
            'Ключ Tavily сохранён для этой области. Он больше не показывается.',
          keyMissing:
            'Своего ключа Tavily нет — Tavily работает на ключе системы.',
          removeKey: 'Убрать сохранённый ключ Tavily',
          removeKeyConfirm:
            'Сохранённый ключ Tavily будет удалён без возможности восстановления. Поиск через Tavily вернётся на ключ системы, а если его нет — перестанет работать.',
        },
        exa: {
          name: 'Exa',
          what: 'Поиск по описанию нужной страницы: точнее там, где важны широта и качество источников.',
          keyLabel: 'Ключ Exa',
          keyStored:
            'Ключ Exa сохранён для этой области. Он больше не показывается.',
          keyMissing: 'Своего ключа Exa нет — Exa работает на ключе системы.',
          removeKey: 'Убрать сохранённый ключ Exa',
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
          what: 'Материал для текста: «Нужен ресерч» и «Усилить ресерчем». Важны широта и качество источников — их читает человек.',
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
    rolesEmpty:
      'An empty field means "use the text model above". Filling these in is optional.',
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
      review: { what: 'Adaptation review — remove cliches, compare claims with the piece, or do both in one call.' },
      image: {
        what: 'Images — the one role that needs a model which can draw.',
      },
    },
    search: {
      what: 'Web research is the search the product runs by itself: collecting supports for a text, checking a claim, looking at what is new on a subject.',
      systemKeys:
        'The system keys work by default. They are not shown and nothing has to be typed here — search already works.',
      systemKeysOnly:
        'Search runs on the system keys; nothing has to be typed here.',
      systemKeysMissing:
        'The system search keys are not set up yet, so web research does not run. The instance superadmin sets them; you can also choose «Own key» and save one of your own.',
      ownKeysTitle: 'Your own search keys',
      routing: (pairs) =>
        `Search runs like this now: ${pairs
          .map((pair) => `${pair.task} — ${pair.engine}`)
          .join('; ')}. The engine is chosen for you, from the keys that are stored.`,
      routingNone:
        'No search engine has a key, so there is nothing to search with. Save a key of your own, or switch to the system keys.',
      ownKey:
        'A key of your own is optional. It replaces the system one for this workspace only, and it is spent from your own account at that search service.',
      ownKeyKept:
        'Going back to the system keys keeps your key stored: it starts working again the moment you choose your own keys again. To make it disappear for good, remove it with the button beside the field.',
      keySavedPlaceholder: 'A key is saved — type a new one to replace it',
      keyEmptyPlaceholder: 'Paste a key',
      openrouterNoKey:
        'OpenRouter has no search key of its own: it searches through the generation key above and spends it.',
      includedOwnKey:
        'This workspace has a search key of its own. It is not being spent right now — the system keys are in use — and it starts working again the moment you choose «Own key». That is also where it can be removed.',
      engines: {
        tavily: {
          name: 'Tavily',
          what: 'A short citable snippet and a published-date window.',
          keyLabel: 'Tavily key',
          keyStored:
            'A Tavily key is stored for this workspace. It is never shown again.',
          keyMissing:
            'No Tavily key of your own — Tavily runs on the system key.',
          removeKey: 'Remove the stored Tavily key',
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
          removeKey: 'Remove the stored Exa key',
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
