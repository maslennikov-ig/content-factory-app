import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * Слова экрана «Ключи и модели по умолчанию» — `content-factory-next-75xn.16`.
 *
 * Решение владельца 13.09.2026, дословно: «настройка ключей по умолчанию
 * доступна только суперадминам, а для других можно выбрать использовать ключ
 * по умолчанию или использовать свой ключ». Вторая половина уже стояла на
 * экране области; это первая, и до неё ключ, которым платит весь инстанс, жил
 * только в переменных окружения.
 *
 * Два языка рядом с кодом, а не семнадцатым ключом i18next, — по той же
 * договорённости, что `onboarding.copy.ts`, `content-section.copy.ts` и
 * `ai-provider.copy.ts`: набор ключей локали одинаков у всех шестнадцати
 * языков (`tests/locale-key-set.test.cjs`), поэтому новая строка на экране —
 * это шестнадцать обещаний перевода, которых никто не писал. Подписи, уже
 * переведённые везде — «Сохранить», «Ключ API», «Провайдер», — экран
 * по-прежнему берёт через `t()`; сюда переехало только то, чего там нет.
 *
 * Почти всё здесь — про три состояния поля ключа. Их действительно три:
 * ключ задан на этом экране, ключ задан на сервере переменной окружения, и
 * ключа нет нигде. Если второе не написать, суперадмин работающего инстанса
 * увидит пустое поле, решит, что ключа нет, и вставит второй.
 */

/** Состояние одного поля ключа. Их три, и каждое читается словами. */
export type KeyOrigin = 'screen' | 'environment' | 'absent';

/** Слова одного поля ключа: подпись, состояния и удаление. */
type KeyFieldWords = {
  /** Подпись поля. */
  label: string;
  /** Одна строка в «?» у подписи (`97dq.62`): за что этот ключ платит. */
  hint: string;
  /** Строка состояния: ключ сохранён здесь. */
  storedHere: string;
  /** Строка состояния: ключа здесь нет, но сервер запущен с ним. */
  fromEnvironment: string;
  /** Строка состояния: ключа нет нигде, и что из-за этого не работает. */
  absent: string;
  /** Плейсхолдер, когда где-то ключ уже есть. */
  placeholderReplace: string;
  /** Плейсхолдер, когда ключа нет. */
  placeholderEmpty: string;
  /** Имя кнопки удаления — своё у каждого поля, иначе их не различить. */
  removeKey: string;
  /** Что именно исчезнет. Спрашивается до запроса, а не после. */
  removeKeyConfirm: string;
};

type Words = {
  /** Заголовок страницы и её пункт в админской панели. */
  title: string;
  /** Одна строка под заголовком: что это за экран и кого он касается. */
  intro: string;
  /** Кого он НЕ касается: область на своём ключе сюда не обращается. */
  ownKeyUntouched: string;
  /** Ключи отсюда не показываются никогда, даже тому, кто их сохранил. */
  neverShown: string;
  /** Что сохраняется само, а что — только по кнопке. */
  autosaveNote: string;
  /**
   * Имя кнопки-подсказки: «Подсказка: включённые операции», а не второе
   * «Включённые операции». Скринридер читает десяток одинаковых «подсказок»
   * как десяток одинаковых кнопок, и найти среди них нужную нечем.
   */
  hintFor: (subject: string) => string;
  /** Названия трёх состояний поля ключа — короткие, для маркера. */
  origins: Record<KeyOrigin, string>;
  keys: {
    /** Заголовок блока поисковых ключей. */
    searchTitle: string;
    /** Что такое поисковые ключи и кто их тратит — длинное, в подсказку. */
    searchWhat: string;
    /** У OpenRouter своего поискового ключа нет. Это надо сказать словами. */
    openrouterNoKey: string;
    model: KeyFieldWords;
    tavily: KeyFieldWords;
    exa: KeyFieldWords;
  };
  models: {
    /** Заголовок блока «провайдер и модели». */
    title: string;
    /** Что в этой карточке лежит и кто это тратит — длинное, в подсказку. */
    what: string;
    /** Что значит пустое поле модели. */
    empty: string;
    /** Строка под полем, когда значение приходит из переменной окружения. */
    fromEnvironment: string;
    /** Подсказка про смену провайдера: идентификаторы моделей не переносятся. */
    providerHint: string;
    /**
     * Цепочка текстовых вызовов (`content-factory-next-97dq.55`, `97dq.94`): flex один раз,
     * обычный уровень, запасная модель. Действует только на OpenRouter.
     */
    flexLabel: string;
    /** Что даёт flex и чем платят за него — под флажком. */
    flexWhat: string;
    /** Подпись поля запасной модели. */
    fallbackLabel: string;
    /** Когда её зовут и что значит пустое поле. */
    fallbackWhat: string;
    /** Одна строка в «?» у полей текста и картинок (`97dq.62`). */
    textHint: string;
    imageHint: string;
  };
  allowance: {
    /** Название карточки. */
    title: string;
    /** Подпись поля. */
    label: string;
    /** Решающее — на поверхности: для кого действует и что значит ноль. */
    what: string;
    /** Длинное — в подсказку: подписка сильнее этого числа. */
    hint: string;
    /** Одна строка в «?» у самого поля. */
    labelHint: string;
    /** Строка, когда число не задано здесь, но задано переменной окружения. */
    fromEnvironment: string;
    /** Строка, когда не задано нигде. */
    absent: string;
    /** Переключатель «без предела» (`97dq.27`). */
    unlimitedLabel: string;
    /** Что он значит — на поверхности, вместо поля числа. */
    unlimitedWhat: string;
    /**
     * Флажок снят, числа ещё нет: сохранено по-прежнему «без предела»
     * (четырнадцатый обход, P3-7).
     */
    unlimitedOffNeedsNumber: string;
  };
  /** Когда и кем экран был изменён в последний раз. */
  updatedAt: (when: string) => string;
  /** Строка загрузки. */
  loading: string;
  /** Не удалось прочитать состояние. */
  loadFailed: string;
  /** Повторить чтение. */
  retry: string;
  /** Сохранено. */
  saved: string;
  /** Не удалось сохранить. */
  saveFailed: string;
};

const ru: Words = {
  title: 'Ключи и модели по умолчанию',
  intro:
    'Эти ключи и модели тратят пространства, выбравшие в своих настройках «Ключи системы». Экран видит и меняет только суперадмин инстанса.',
  ownKeyUntouched:
    'Пространство, выбравшее «Свой ключ», сюда не обращается: оно платит своим ключом, и ничто на этом экране его не касается.',
  neverShown:
    'Сохранённый ключ не показывается больше никогда — ни другому администратору, ни тому, кто его сохранил. Экран знает только, задан ключ или нет.',
  autosaveNote:
    'Провайдер, модели и число операций сохраняются сами, как в настройках пространства. Кнопка «Сохранить» нужна ключам: вставленный ключ — это решение, а не набор символов, и уходит он только по ней.',
  hintFor: (subject) => `Подсказка: ${subject.toLowerCase()}`,
  origins: {
    screen: 'Задан здесь',
    environment: 'Задан на сервере',
    absent: 'Не задан',
  },
  keys: {
    searchTitle: 'Ключи поиска',
    searchWhat:
      'Ключи Tavily и Exa оплачивают веб-поиск: проверку фактов, ресерч и поиск свежего по теме. Их тратят пространства в режиме «Ключи системы», по счёту инстанса.',
    openrouterNoKey:
      'У OpenRouter своего поискового ключа нет: на поисковый запрос он отвечает ключом генерации — тем самым, что задан выше.',
    model: {
      label: 'Ключ генерации',
      hint: 'Им инстанс платит за тексты и картинки пространств на «Ключах системы».',
      storedHere:
        'Ключ сохранён на этом экране и сильнее переменной окружения. Введите новый, чтобы заменить его.',
      fromEnvironment:
        'На этом экране ключа нет, но сервер запущен с ключом в переменной окружения — инстанс работает на нём. Вставляйте ключ сюда, только если хотите его заменить.',
      absent:
        'Ключа нет ни здесь, ни в переменных окружения. Пространства в режиме «Ключи системы» сейчас не могут обратиться к модели.',
      placeholderReplace: 'Ключ уже есть — введите новый, чтобы заменить',
      placeholderEmpty: 'Вставьте ключ',
      removeKey: 'Убрать сохранённый ключ генерации',
      removeKeyConfirm:
        'Сохранённый ключ генерации исчезнет и не восстановится. Пространства в режиме «Ключи системы» останутся без модели, пока не будет сохранён новый ключ или пока не сработает переменная окружения.',
    },
    tavily: {
      label: 'Ключ Tavily',
      hint: 'Платит за проверку фактов и поиск свежего по теме.',
      storedHere:
        'Ключ Tavily сохранён на этом экране и сильнее переменной окружения. Введите новый, чтобы заменить его.',
      fromEnvironment:
        'На этом экране ключа Tavily нет, но сервер запущен с ним в переменной окружения — поиск работает на нём. Вставляйте ключ сюда, только если хотите его заменить.',
      absent:
        'Ключа Tavily нет ни здесь, ни в переменных окружения. Проверка фактов и поиск свежего по теме в режиме «Ключи системы» не работают.',
      placeholderReplace: 'Ключ уже есть — введите новый, чтобы заменить',
      placeholderEmpty: 'Вставьте ключ Tavily',
      removeKey: 'Убрать сохранённый ключ Tavily',
      removeKeyConfirm:
        'Сохранённый ключ Tavily исчезнет и не восстановится. Проверка фактов и поиск свежего по теме в режиме «Ключи системы» остановятся, пока не будет сохранён новый ключ.',
    },
    exa: {
      label: 'Ключ Exa',
      hint: 'Платит за ресерч: поиск материала к заготовке.',
      storedHere:
        'Ключ Exa сохранён на этом экране и сильнее переменной окружения. Введите новый, чтобы заменить его.',
      fromEnvironment:
        'На этом экране ключа Exa нет, но сервер запущен с ним в переменной окружения — ресерч работает на нём. Вставляйте ключ сюда, только если хотите его заменить.',
      absent:
        'Ключа Exa нет ни здесь, ни в переменных окружения. Ресерч в режиме «Ключи системы» уйдёт на тот движок, у которого ключ есть.',
      placeholderReplace: 'Ключ уже есть — введите новый, чтобы заменить',
      placeholderEmpty: 'Вставьте ключ Exa',
      removeKey: 'Убрать сохранённый ключ Exa',
      removeKeyConfirm:
        'Сохранённый ключ Exa исчезнет и не восстановится. Ресерч в режиме «Ключи системы» уйдёт на тот движок, у которого ключ остался.',
    },
  },
  models: {
    title: 'Провайдер и модели',
    what:
      'Провайдер, ключ генерации и модели, которыми работают пространства в режиме «Ключи системы». Ключ лежит здесь же, под провайдером, потому что он оплачивает именно эти вызовы.',
    empty:
      'Пустое поле — это нормально: тогда работает модель, предложенная провайдером.',
    fromEnvironment:
      'В поле стоит значение из переменной окружения на сервере — инстанс работает на нём. Сохраните его, чтобы закрепить здесь, или замените своим.',
    providerHint:
      'Идентификаторы моделей принадлежат своему провайдеру: «gpt-4.1» ничего не значит для OpenRouter, «openai/gpt-4.1» — для OpenAI. После смены провайдера поля моделей стоит перебрать заново.',
    flexLabel: 'Сначала дешёвый уровень flex',
    flexWhat:
      'Только OpenRouter. Текстовый вызов один раз пробует уровень flex — он вдвое дешевле, но может ответить «нет мощности», — и ждёт его не дольше 60 секунд (потоковый ответ — до первого слова), потом обычный уровень той же модели, потом запасную модель. Выключено — сразу обычный уровень.',
    fallbackLabel: 'Запасная модель',
    textHint: 'Какой ИИ пишет тексты у пространств на «Ключах системы».',
    imageHint: 'Какой ИИ рисует картинки у пространств на «Ключах системы».',
    fallbackWhat:
      'Последняя попытка, когда текстовая модель не ответила. Пустое поле — модель по умолчанию, указанная в подсказке.',
  },
  allowance: {
    title: 'Включённый режим',
    label: 'Включённых операций в месяц',
    labelHint: 'Сколько обращений к ИИ в месяц получает пространство без подписки.',
    what:
      'Действует для пространства без подписки. Ноль означает, что включённый режим для такого пространства закрыт.',
    hint: 'Когда у пространства появится подписка, лимит подписки будет сильнее этого числа, и оно перестанет его касаться.',
    fromEnvironment:
      'В поле стоит число из переменной окружения на сервере — инстанс считает по нему. Сохраните его, чтобы закрепить здесь, или замените своим.',
    absent:
      'Не задано ни здесь, ни в переменных окружения: для пространства без подписки включённый режим сейчас закрыт.',
    unlimitedLabel: 'Без предела',
    unlimitedWhat:
      'Пространства без подписки тратят ИИ на ключах системы без счёта операций. Снимите флажок, чтобы задать число.',
    unlimitedOffNeedsNumber:
      'Впишите число. Пока его нет, сохранено «Без предела» и пространства без подписки работают как раньше.',
  },
  updatedAt: (when) => `Последнее изменение: ${when}`,
  loading: 'Читаем настройки инстанса…',
  loadFailed: 'Не удалось прочитать настройки инстанса.',
  retry: 'Повторить',
  saved: 'Настройки инстанса сохранены',
  saveFailed: 'Не удалось сохранить настройки инстанса',
};

const en: Words = {
  title: 'Default keys and models',
  intro:
    'These keys and models are spent by the workspaces that chose «System keys» in their own settings. Only the instance superadmin can see and change this screen.',
  ownKeyUntouched:
    'A workspace that chose «Own key» never reaches them: it pays with its own key, and nothing on this screen concerns it.',
  neverShown:
    'A stored key is never shown again — not to another administrator, and not to whoever saved it. This screen only knows whether a key is set.',
  autosaveNote:
    'The provider, the models and the number of operations save themselves, exactly as the workspace settings do. The «Save» button is there for the keys: a pasted key is a decision rather than a string of characters, and it travels only through that button.',
  hintFor: (subject) => `Hint: ${subject.toLowerCase()}`,
  origins: {
    screen: 'Set here',
    environment: 'Set on the server',
    absent: 'Not set',
  },
  keys: {
    searchTitle: 'Search keys',
    searchWhat:
      'The Tavily and Exa keys pay for web search: fact checking, research and topic discovery. Workspaces in «System keys» mode spend them, on the instance account.',
    openrouterNoKey:
      'OpenRouter has no search key of its own: it answers a search question with the generation key — the one above.',
    model: {
      label: 'Generation key',
      hint: 'The instance pays with it for the texts and images of workspaces on «System keys».',
      storedHere:
        'A key is stored on this screen and overrides the environment variable. Type a new one to replace it.',
      fromEnvironment:
        'No key is stored on this screen, but the server was started with one in an environment variable — the instance runs on it. Paste a key here only if you mean to replace it.',
      absent:
        'No key here and none in the environment. Workspaces in «System keys» mode cannot reach a model right now.',
      placeholderReplace: 'A key exists — type a new one to replace it',
      placeholderEmpty: 'Paste the key',
      removeKey: 'Remove the stored generation key',
      removeKeyConfirm:
        'The stored generation key is removed and cannot be recovered. Workspaces in «System keys» mode lose the model until a new key is saved or the environment variable takes over.',
    },
    tavily: {
      label: 'Tavily key',
      hint: 'Pays for fact checking and for finding fresh material on a topic.',
      storedHere:
        'A Tavily key is stored on this screen and overrides the environment variable. Type a new one to replace it.',
      fromEnvironment:
        'No Tavily key is stored on this screen, but the server was started with one in an environment variable — search runs on it. Paste a key here only if you mean to replace it.',
      absent:
        'No Tavily key here and none in the environment. Fact checking and topic discovery do not run in «System keys» mode.',
      placeholderReplace: 'A key exists — type a new one to replace it',
      placeholderEmpty: 'Paste the Tavily key',
      removeKey: 'Remove the stored Tavily key',
      removeKeyConfirm:
        'The stored Tavily key is removed and cannot be recovered. Fact checking and topic discovery stop in «System keys» mode until a new key is saved.',
    },
    exa: {
      label: 'Exa key',
      hint: 'Pays for research: finding material for a piece.',
      storedHere:
        'An Exa key is stored on this screen and overrides the environment variable. Type a new one to replace it.',
      fromEnvironment:
        'No Exa key is stored on this screen, but the server was started with one in an environment variable — research runs on it. Paste a key here only if you mean to replace it.',
      absent:
        'No Exa key here and none in the environment. Research in «System keys» mode falls back to whichever engine still has a key.',
      placeholderReplace: 'A key exists — type a new one to replace it',
      placeholderEmpty: 'Paste the Exa key',
      removeKey: 'Remove the stored Exa key',
      removeKeyConfirm:
        'The stored Exa key is removed and cannot be recovered. Research in «System keys» mode falls back to whichever engine still has a key.',
    },
  },
  models: {
    title: 'Provider and models',
    what:
      'The provider, the generation key and the models the workspaces in «System keys» mode run on. The key sits here, under the provider, because these are the calls it pays for.',
    empty:
      'An empty field is fine: the provider default is used when nothing is written here.',
    fromEnvironment:
      'The field holds the value from an environment variable on the server — the instance runs on it. Save it to pin it here, or replace it with your own.',
    providerHint:
      'Model ids belong to their provider: «gpt-4.1» means nothing to OpenRouter, «openai/gpt-4.1» nothing to OpenAI. After switching the provider, go through the model fields again.',
    flexLabel: 'Try the cheaper flex tier first',
    flexWhat:
      'OpenRouter only. A text call tries the flex tier once — half the price, but it may answer «no capacity» — and waits for it at most 60 seconds (a streamed answer, until its first word), then the standard tier of the same model, then the fallback model. Off goes straight to the standard tier.',
    fallbackLabel: 'Fallback model',
    textHint: 'Which AI writes the texts of workspaces on «System keys».',
    imageHint: 'Which AI draws the images of workspaces on «System keys».',
    fallbackWhat:
      'The last attempt, when the text model did not answer. An empty field uses the default shown as the placeholder.',
  },
  allowance: {
    title: 'Included mode',
    label: 'Included operations a month',
    labelHint: 'How many AI calls a month a workspace without a subscription gets.',
    what:
      'Applies to a workspace with no subscription. Zero means included mode is closed for such a workspace.',
    hint: 'Once a workspace has a subscription, the subscription limit is stronger than this number and this number stops concerning it.',
    fromEnvironment:
      'The field holds the number from an environment variable on the server — the instance counts by it. Save it to pin it here, or replace it with your own.',
    absent:
      'Set neither here nor in the environment: included mode is closed right now for a workspace with no subscription.',
    unlimitedLabel: 'No limit',
    unlimitedWhat:
      'Workspaces with no subscription spend AI on the system keys without counting operations. Clear the box to set a number.',
    unlimitedOffNeedsNumber:
      'Enter a number. Until you do, «No limit» stays saved and workspaces with no subscription keep working as before.',
  },
  updatedAt: (when) => `Last changed: ${when}`,
  loading: 'Reading the instance settings…',
  loadFailed: 'Could not read the instance settings.',
  retry: 'Try again',
  saved: 'Instance settings saved',
  saveFailed: 'Could not save the instance settings',
};

export const adminAiDefaultsCopy: { ru: Words; en: Words } = { ru, en };

export type AdminAiDefaultsLocale = keyof typeof adminAiDefaultsCopy;

/**
 * Один и тот же выбор языка, что и на остальных экранах этого поколения:
 * решение живёт в `resolveContentLocale`, а не переписывается здесь.
 */
export const resolveAdminAiDefaultsLocale = (
  language: string | undefined | null
): AdminAiDefaultsLocale => resolveContentLocale(language);
