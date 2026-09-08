import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * Раздел помощи: двенадцать вопросов и ответы к ним, двумя языками рядом с
 * кодом.
 *
 * Решение владельца 07.09.2026 (`m2eg.25`): «завести в продукте раздел помощи
 * и рассказать в нём, от чьего имени выходят посты». Вопросы — не выдумка
 * этого экрана: каждый из одиннадцати кто-то задал на живом прогоне, и до
 * сегодняшнего дня ответ на него жил в переписке, а не в продукте.
 *
 * Слова живут здесь, а не двенадцатью ключами i18next, — та же договорённость,
 * что у `onboarding.copy.ts` и `content-section.copy.ts`: два языка,
 * выписанные рядом с кодом, вместо шестнадцати файлов локалей с обещанием
 * перевода, которого никто не писал. Русский текст — источник; английский
 * переведён с него.
 *
 * Одно слово сюда не попало нарочно — само название раздела. Оно нужно пункту
 * меню, заголовку вкладки браузера и заголовку страницы, то есть трём местам
 * сразу, и живёт одним ключом `help` во всех шестнадцати локалях. Название,
 * выписанное здесь вторым экземпляром, — это два разных имени одного раздела,
 * ровно то, чего `onboarding.copy.ts` избегал, отдавая подпись меню себе.
 *
 * Источник правды — `docs/product/help-faq.md`. Вопросы и ответы здесь и там
 * совпадают дословно, и это проверяет `tests/help.screen.test.cjs`: ответ,
 * который живёт в двух местах и разошёлся, хуже отсутствующего — читающий
 * поверит тому, который увидел первым. Если ответ разошёлся с кодом продукта,
 * верен код, и тогда чинится ответ здесь и в документе одним коммитом.
 */

/** Один вопрос и ответ на него. `id` — устойчивое имя для теста и разметки. */
export type HelpQuestion = {
  id: string;
  question: string;
  answer: string;
};

type Words = {
  pageLead: string;
  /** Подпись строки «где это лежит» под списком. */
  whereLabel: string;
  whereOnboarding: string;
  whereContent: string;
  questions: HelpQuestion[];
};

/** Двенадцать `id` в том порядке, в каком они стоят на экране. */
export const HELP_QUESTION_IDS = [
  'telegram-authorship',
  'post-needs-channel',
  'piece-vs-post',
  'already-written',
  'when-web-search',
  'avatar-corpus',
  'slop-check',
  'adaptation-review',
  'account-pending',
  'roles',
  'ai-keys',
  'ai-usage',
  'where-to-start',
] as const;

export type HelpQuestionId = (typeof HELP_QUESTION_IDS)[number];

/** Куда ведут ссылки строки «Где найти». Адреса уже существующих экранов. */
export const HELP_ONBOARDING_HREF = '/onboarding';
export const HELP_CONTENT_HREF = '/content';

export const helpCopy: { ru: Words; en: Words } = {
  ru: {
    pageLead: 'Короткие ответы на вопросы, которые задают чаще всего.',
    whereLabel: 'Где найти',
    whereOnboarding: 'С чего начать',
    whereContent: 'Контент',
    questions: [
      {
        id: 'telegram-authorship',
        question: 'От чьего имени выходят посты в Telegram?',
        answer:
          'От имени канала. Публикует бот, но подписчики видят название и аватар канала, а не бота. Имя бота появляется только если в настройках канала включено «Подписывать сообщения» — держите его выключенным. В группе (не канале) пост выходит от бота; так устроен Telegram, обойти это нельзя.',
      },
      {
        id: 'post-needs-channel',
        question: 'Почему нельзя написать пост без канала?',
        answer:
          'Пост всегда адресован каналу: от канала зависят длина, тон и правила площадки. Пока канала нет, напишите заготовку в разделе «Контент → Заготовки» — она живёт без канала, а адаптировать её под канал можно позже.',
      },
      {
        id: 'piece-vs-post',
        question: 'Чем заготовка отличается от поста?',
        answer:
          'Заготовка — это суть вашей мысли, записанная вашими словами и без привязки к площадке. Пост — адаптация заготовки под конкретный канал: длина, тон, формат. Из одной заготовки можно сделать несколько постов для разных каналов.',
      },
      {
        id: 'already-written',
        question: 'Как найти свои прошлые тексты?',
        answer:
          'В таблице заготовок клетки площадок показывают состояние и число постов. Индекс своих текстов собирается автоматически: при адаптации модель ищет в нём и может сослаться на прошлую публикацию. Находки видны в блоке «Свои тексты по теме». Отдельного вида «Что уже написали» больше нет.',
      },
      {
        id: 'when-web-search',
        question: 'Когда модель ходит в интернет?',
        answer:
          'Когда дополняет заготовку фактами или когда вы отдельно выбираете «Проверить поиском» и подтверждаете расход. Утверждения черновика автоматически по сети не проверяются. При обычной адаптации под канал модель берёт материал из заготовки и из ваших старых постов.',
      },
      {
        id: 'avatar-corpus',
        question: 'Что такое аватар и сколько текстов ему нужно?',
        answer:
          'Аватар — описание того, как вы пишете: ритм, длина фраз, слова, которых вы избегаете. Он собирается из ваших текстов: нужно от пятнадцати тысяч знаков, лучше двадцать пять постов и больше. Из Telegram тексты выгружаются через Telegram Desktop: «Экспорт истории чата» в формате JSON, файл result.json загружается как есть.',
      },
      {
        id: 'slop-check',
        question: 'Что проверяет «проверка на штампы»?',
        answer:
          'Ищет обороты, по которым текст узнают как машинный: «в современном мире», «давайте разберёмся», лишние вводные, ровные списки из трёх пунктов. Не проверяет факты и не судит о смысле. Работает без вызова модели и денег не стоит.',
      },
      {
        id: 'adaptation-review',
        question: 'Как исправить штампы или сверить адаптацию с заготовкой?',
        answer:
          'Откройте адаптацию и нажмите «Проверить ▾». Выберите «Убрать штампы», «Сверить с сутью заготовки» или «И то и другое». Каждый режим делает один платный вызов модели; расход токенов зависит от текста и режима. Сверка использует только суть, опоры и слова автора, без поиска в интернете. Результат показывает разницу: «Принять» сохранит текст адаптации и черновик поста, «Оставить как было» ничего не запишет. Если черновик изменили после проверки, принять старый ответ нельзя. Последний режим запоминается отдельно для рабочего пространства. Отдельный пункт «Проверить поиском» ищет источники в интернете: перед запуском покажет предупреждение о расходе на поиск и модели и попросит подтверждение. Поиск берёт первые 5000 знаков черновика. Результат показывает ссылки и отрывки источников; если источников нет или поиск недоступен, правки не предлагаются. Это не подтверждение всех фактов.',
      },
      {
        id: 'account-pending',
        question: 'Почему после регистрации ничего не работает?',
        answer:
          'Новый аккаунт ждёт одобрения администратора. Напишите тому, кто дал вам адрес: он включит аккаунт в разделе «Пользователи».',
      },
      {
        id: 'roles',
        question: 'Что может каждая роль?',
        answer:
          'Наблюдатель смотрит. Редактор пишет заготовки, посты и правит карточки каналов. Администратор подключает каналы, ключи ИИ и приглашает людей.',
      },
      {
        id: 'ai-keys',
        question: 'Где ключи ИИ и что такое «модель на роль»?',
        answer:
          'В настройках, вкладка «ИИ». Ключ один на область. «Модель на роль» — какая модель отвечает за какой вид работы: черновик, разбор чужого текста, вопросы. Если оставить пустым, работает модель по умолчанию.',
      },
      {
        id: 'ai-usage',
        question: 'Где смотреть расход?',
        answer:
          'В настройках откройте вкладку «Глобальные настройки». Под режимом использования ИИ находятся таблицы «Расход ИИ по участникам за период» и «Расход ИИ по ролям за период» — они стоят выше блока «Расход и роли вызова». Если вызовов ещё не было, таблицы всё равно остаются на странице и показывают, что данных за период пока нет. Раздел доступен администратору рабочей области.',
      },
      {
        id: 'where-to-start',
        question: 'Куда делся раздел «С чего начать»?',
        answer:
          'Он показывается в меню, пока не пройдены все шесть шагов, потом остаётся во вкладке настроек. Шаги считаются по данным области: сбросить их нельзя, но можно пройти заново в новой области.',
      },
    ],
  },
  en: {
    pageLead: 'Short answers to the questions that come up most often.',
    whereLabel: 'Where to find it',
    whereOnboarding: 'Where to start',
    whereContent: 'Content',
    questions: [
      {
        id: 'telegram-authorship',
        question: 'Whose name do posts go out under on Telegram?',
        answer:
          'The channel’s. A bot does the publishing, but subscribers see the channel’s name and picture, not the bot’s. The bot’s name appears only when «Sign messages» is switched on in the channel settings — keep it off. In a group, rather than a channel, the post goes out from the bot; that is how Telegram works and there is no way around it.',
      },
      {
        id: 'post-needs-channel',
        question: 'Why can’t I write a post without a channel?',
        answer:
          'A post is always addressed to a channel: length, tone and the platform’s rules all follow from it. While there is no channel, write a piece in the «Content → Pieces» section — a piece lives without a channel, and it can be adapted to one later.',
      },
      {
        id: 'piece-vs-post',
        question: 'How is a piece different from a post?',
        answer:
          'A piece is the substance of your thought, written in your own words and tied to no platform. A post is that piece adapted to one channel: length, tone, format. One piece can become several posts for different channels.',
      },
      {
        id: 'already-written',
        question: 'How do I find my earlier texts?',
        answer:
          'Platform cells in the pieces table show post status and counts. Your text index is collected automatically: during adaptation the model searches it and can refer to an earlier publication. Matches appear in “Your texts on this topic”. There is no separate archive view.',
      },
      {
        id: 'when-web-search',
        question: 'When does the model go to the internet?',
        answer:
          'When enriching a piece with facts, or when you explicitly choose Check with web search and confirm spending. Draft claims are not automatically checked against the web. Normal channel adaptation uses the piece and your earlier posts.',
      },
      {
        id: 'avatar-corpus',
        question: 'What is an avatar and how much text does it need?',
        answer:
          'An avatar describes how you write: rhythm, sentence length, the words you avoid. It is built from your own texts: fifteen thousand characters at the least, better twenty-five posts or more. Telegram texts are exported through Telegram Desktop: «Export chat history» in JSON, and the result.json file is uploaded as it is.',
      },
      {
        id: 'slop-check',
        question: 'What does the cliché check look for?',
        answer:
          'Turns of phrase that give a text away as machine-written: «in today’s world», «let us break it down», padding introductions, tidy lists of three. It does not check facts and does not judge meaning. It runs without calling a model and costs nothing.',
      },
      {
        id: 'adaptation-review',
        question: 'How do I remove cliches or compare an adaptation with its piece?',
        answer:
          'Open the adaptation and choose Check: Remove cliches, Compare with the piece, or Both. Every mode makes one paid model call; token usage depends on the draft and mode. The comparison uses only the piece, its evidence and the author’s words, without web search. Review the text changes, then Accept to update the adaptation and draft post, or Leave unchanged to save nothing. Acceptance is refused if the draft changed after the review. The last mode is remembered separately for each workspace. The separate Check with web search action asks you to confirm spending on search and models before it starts. Search uses the first 5000 draft characters. The result shows source links and excerpts. If search is unavailable or yields no sources, no corrections are offered. This does not verify every fact.',
      },
      {
        id: 'account-pending',
        question: 'Why does nothing work after I register?',
        answer:
          'A new account waits for an administrator to approve it. Write to whoever gave you the address: they will switch the account on in the «Users» section.',
      },
      {
        id: 'roles',
        question: 'What can each role do?',
        answer:
          'A viewer looks. An editor writes pieces and posts and edits channel cards. An administrator connects channels and AI keys and invites people.',
      },
      {
        id: 'ai-keys',
        question: 'Where are the AI keys, and what is «a model per role»?',
        answer:
          'In settings, the «AI» tab. One key per workspace. «A model per role» is which model answers for which kind of work: a draft, reading someone else’s text, questions. Left empty, the default model works.',
      },
      {
        id: 'ai-usage',
        question: 'Where can I see AI usage?',
        answer:
          'In settings, open the «Global settings» tab. Under the AI usage mode, find the «AI usage by member, this period» and «AI usage by role, this period» tables — they sit above the «Usage and call roles» block. If there have been no calls yet, the tables stay on the page and say that there is no usage for the period yet. This section is available to workspace administrators.',
      },
      {
        id: 'where-to-start',
        question: 'Where did the «Where to start» section go?',
        answer:
          'It shows in the menu until all six steps are done, and after that it stays in the settings tab. Steps are counted from the workspace’s own data: they cannot be reset, but they can be walked again in a new workspace.',
      },
    ],
  },
};

export type HelpLocale = keyof typeof helpCopy;

/**
 * Тот же разбор языка, что у остальных экранов этого поколения: всё, что не
 * русский, читается как английский, а не падает.
 */
export const resolveHelpLocale = (
  language: string | undefined | null
): HelpLocale => resolveContentLocale(language);
