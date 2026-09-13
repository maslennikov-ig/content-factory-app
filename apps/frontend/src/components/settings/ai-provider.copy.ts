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
  /**
   * Та же мысль для режима включённых ключей: ключ есть, но лежит.
   *
   * Отдельной строкой, а не той же, что выше: «сохранён» и «сохранён, но не
   * тратится» — разные факты, и человек, пришедший убрать свой ключ, должен
   * увидеть второй, иначе решит, что платит дважды.
   */
  keyDormant: string;
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
  /** Строка таблицы, когда за период не было ни одного вызова. */
  usageNone: string;
  /** Почему таблица пуста, и что её наполнит. */
  usageNoneHint: string;
  /** Что вообще такое роль вызова. */
  rolesWhat: string;
  /** Что значит пустое поле. */
  rolesEmpty: string;
  /** Зачем менять. */
  rolesWhy: string;
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
    /** Что такое «сервер на задачу» и что значит незаполненная строка. */
    tasksWhat: string;
    /** Какой движок для какой задачи и почему. */
    tasksWhy: string;
    /** Значение селектора «отдельного сервера нет». */
    taskDefaultOption: string;
    /**
     * Режим включённых ключей: у области есть свой ключ, и он сейчас лежит.
     * Без названия движка — ответ сервера в этом режиме говорит про ключи
     * системы, а про свои знает только «есть или нет».
     */
    includedOwnKey: string;
    /** Имя кнопки, которая убирает свои поисковые ключи целиком. */
    includedRemoveKeys: string;
    /** Что именно исчезнет. */
    includedRemoveKeysConfirm: string;
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
    usageNone: 'Пока 0',
    usageNoneHint:
      'Расход появляется после первого вызова модели: пока за этот период ни одного не было.',
    rolesWhat:
      'Роль вызова — это работа, ради которой продукт обращается к модели. Стоимость зависит от вида работы и выбранной модели.',
    rolesEmpty:
      'Пустое поле означает «брать модель для текста, указанную выше» — то есть модель провайдера по умолчанию. Ничего заполнять не обязательно.',
    rolesWhy:
      'Менять стоит ради денег: мелкие роли — классификация, разбор — прекрасно работают на дешёвой модели, а платить за них по цене черновика незачем.',
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
      ownKey:
        'Свой ключ — по желанию. Он заменяет системный только для этой области и тратится с вашего счёта у поискового сервиса.',
      ownKeyKept:
        'Если вернуться к ключам системы, свой ключ остаётся сохранённым и снова заработает, как только вы снова выберете свои ключи. Чтобы он исчез совсем, уберите его кнопкой рядом с полем.',
      keySavedPlaceholder: 'Ключ сохранён — введите новый, чтобы заменить',
      keyEmptyPlaceholder: 'Вставьте ключ',
      openrouterNoKey:
        'У OpenRouter своего поискового ключа нет: он ищет через ваш ключ генерации, указанный выше, и тратит его.',
      tasksWhat:
        'Поисковые серверы не взаимозаменяемы, поэтому сервер выбирается на задачу. «Как в области» означает сервер, выбранный выше для всей области.',
      tasksWhy:
        'Exa рекомендован для ресерча: он ищет по описанию нужной страницы и точнее находит источники, которые потом читает человек. Tavily — для проверки фактов: он возвращает короткую цитируемую выдержку и умеет ограничивать выдачу окном по дате публикации.',
      taskDefaultOption: 'Как в области',
      includedOwnKey:
        'У этой области сохранён свой поисковый ключ. Сейчас он не тратится — работают ключи системы, — и останется сохранённым до тех пор, пока вы его не уберёте.',
      includedRemoveKeys: 'Убрать сохранённые поисковые ключи области',
      includedRemoveKeysConfirm:
        'Сохранённые поисковые ключи этой области будут удалены без возможности восстановления. Поиск продолжит работать на ключах системы, а при возврате к своим ключам восстанавливать будет нечего.',
      engines: {
        tavily: {
          name: 'Tavily',
          what: 'Короткая цитируемая выдержка и окно по дате публикации.',
          keyLabel: 'Ключ Tavily',
          keyStored:
            'Ключ Tavily сохранён для этой области. Он больше не показывается.',
          keyMissing:
            'Своего ключа Tavily нет — Tavily работает на ключе системы.',
          keyDormant:
            'Ключ Tavily сохранён за этой областью и сейчас не тратится.',
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
          keyDormant:
            'Ключ Exa сохранён за этой областью и сейчас не тратится.',
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
    usageNone: 'Nothing yet',
    usageNoneHint:
      'Usage appears after the first model call: there has not been one this period.',
    rolesWhat:
      'A call role is the job the product goes to a model for. Cost depends on the job and the chosen model.',
    rolesEmpty:
      'An empty field means "use the text model above" — the provider default. Filling these in is optional.',
    rolesWhy:
      'The reason to change one is money: the small roles — classification, extraction — do fine on a cheap model, and paying draft prices for them buys nothing.',
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
      ownKey:
        'A key of your own is optional. It replaces the system one for this workspace only, and it is spent from your own account at that search service.',
      ownKeyKept:
        'Going back to the system keys keeps your key stored: it starts working again the moment you choose your own keys again. To make it disappear for good, remove it with the button beside the field.',
      keySavedPlaceholder: 'A key is saved — type a new one to replace it',
      keyEmptyPlaceholder: 'Paste a key',
      openrouterNoKey:
        'OpenRouter has no search key of its own: it searches through the generation key above and spends it.',
      tasksWhat:
        'The search backends are not interchangeable, so a backend is chosen per task. «As for the workspace» means the backend selected above for everything.',
      tasksWhy:
        'Exa is recommended for research: it answers a query written as a description of the wanted page, and finds the sources a person then reads. Tavily is recommended for fact checking: it returns a short citable snippet and can limit results to a published-date window.',
      taskDefaultOption: 'As for the workspace',
      includedOwnKey:
        'This workspace has a search key of its own. It is not being spent right now — the system keys are in use — and it stays stored until you remove it.',
      includedRemoveKeys: 'Remove the stored search keys of this workspace',
      includedRemoveKeysConfirm:
        'The stored search keys of this workspace are removed and cannot be recovered. Search keeps working on the system keys, and there will be nothing to restore when you switch back to your own.',
      engines: {
        tavily: {
          name: 'Tavily',
          what: 'A short citable snippet and a published-date window.',
          keyLabel: 'Tavily key',
          keyStored:
            'A Tavily key is stored for this workspace. It is never shown again.',
          keyMissing:
            'No Tavily key of your own — Tavily runs on the system key.',
          keyDormant:
            'A Tavily key is stored for this workspace and is not being spent.',
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
          keyDormant:
            'An Exa key is stored for this workspace and is not being spent.',
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
