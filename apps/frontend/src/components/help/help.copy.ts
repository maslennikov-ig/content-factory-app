import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';

/**
 * Раздел помощи: вопросы живых прогонов и ответы к ним, двумя языками рядом с
 * кодом.
 *
 * Решение владельца 07.09.2026 (`m2eg.25`): «завести в продукте раздел помощи
 * и рассказать в нём, от чьего имени выходят посты». Первые вопросы задавали
 * на живых прогонах, и до того ответ на них жил в переписке, а не в продукте.
 * `content-factory-next-2q28.8` (25.09.2026) переписал устаревшие ответы и
 * добавил то, что спросит первый настоящий клиент — блогер со своим
 * Telegram-каналом: как подключить канал, что такое план канала, как
 * подтвердить бронь, откуда идеи и факты, почему нет просмотров.
 *
 * Слова живут здесь, а не отдельными ключами i18next, — та же договорённость,
 * что у `onboarding.copy.ts` и `content-section.copy.ts`: два языка,
 * выписанные рядом с кодом, вместо шестнадцати файлов локалей с обещанием
 * перевода, которого никто не писал. Русский текст — источник; английский
 * переведён с него.
 *
 * Одно слово сюда не попало нарочно — само название раздела. Оно нужно пункту
 * меню, заголовку вкладки браузера и заголовку страницы, то есть трём местам
 * сразу, и живёт одним ключом `help` во всех шестнадцати локалях.
 *
 * Источник правды — `docs/product/help-faq.md`. Вопросы и ответы здесь и там
 * совпадают дословно, и это проверяет `tests/help.screen.test.cjs`. Если ответ
 * разошёлся с кодом продукта, верен код, и тогда чинится ответ здесь и в
 * документе одним коммитом.
 *
 * Каждая подпись в «ёлочках» — это настоящая подпись экрана, слово в слово:
 * `tests/help.labels.guard.test.cjs` ищет её в русских словах продукта и
 * падает, если экран её больше не показывает. Ответ, который велит нажать
 * несуществующую кнопку, хуже отсутствующего.
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

/** Устойчивые `id` в том порядке, в каком они стоят на экране. */
export const HELP_QUESTION_IDS = [
  'where-to-start',
  'account-pending',
  'telegram-login',
  'telegram-connect',
  'telegram-authorship',
  'piece-vs-post',
  'piece-core',
  'post-needs-channel',
  'no-ai-yet',
  'adaptation-screen',
  'rewrite-by-settings',
  'rewrite',
  'channel-model-choice',
  'channel-plan',
  'confirm-reservation',
  'calendar-search',
  'when-web-search',
  'search-engine-language',
  'ideas-and-facts',
  'already-written',
  'avatar-corpus',
  'slop-check',
  'adaptation-review',
  'telegram-analytics',
  'invite-team',
  'roles',
  'ai-keys',
  'ai-usage',
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
        id: 'where-to-start',
        question: 'С чего начать?',
        answer:
          'Откройте «С чего начать» и пройдите пять шагов в порядке меню: «Аватар» — чьей манерой писать, «Канал» — куда выходят посты, «Заготовка» — суть поста, «Адаптация» — пост для канала, «План» — когда он выйдет. Факт — цена, срок или цифра, на которую опирается пост, — добавляется по желанию. Любой шаг можно отложить кнопкой «Сделаю позже» и вернуться к нему с полосы сверху. Шаги отмечаются сами. Когда все пройдены, пункт уходит из меню и остаётся вкладкой «С чего начать» в «Настройки».',
      },
      {
        id: 'account-pending',
        question: 'Почему после регистрации нельзя войти и сколько ждать?',
        answer:
          'Новый аккаунт сначала одобряет владелец сервиса — обычно за несколько часов. Пока ждёте, на экране написано «Заявка принята», а после одобрения придёт письмо. Отправлять ничего повторно и регистрироваться ещё раз не нужно: войдёте с той же почтой и паролем. Если вас пригласили ссылкой, одобрения ждать не нужно.',
      },
      {
        id: 'telegram-login',
        question: 'Можно ли входить через Telegram?',
        answer:
          'Да, если на странице входа есть кнопка «Войти через Telegram». Чтобы входить так в уже созданный аккаунт, откройте «Настройки → Способы входа» и нажмите «Подключить» у Telegram. Кнопки нет — значит, на этом сервере вход через Telegram выключен; входите по почте и паролю.',
      },
      {
        id: 'telegram-connect',
        question: 'Как подключить свой Telegram-канал?',
        answer:
          'Откройте «Каналы», нажмите «Подключить канал» и выберите Telegram. Добавьте бота, имя которого показано в окне, в администраторы канала с правом публиковать сообщения. Нажмите «Подключить Telegram», скопируйте команду вида /connect слово кнопкой «Копировать» и отправьте её в канал — через несколько секунд канал подключится сам. Команда действует 15 минут; если время вышло, нажмите «Начать заново».',
      },
      {
        id: 'telegram-authorship',
        question: 'От чьего имени выходят посты в Telegram?',
        answer:
          'От имени канала. Публикует бот, но подписчики видят название и аватар канала, а не бота. Имя бота появляется только если в настройках канала включено «Подписывать сообщения» — держите его выключенным. В группе (не канале) пост выходит от бота; так устроен Telegram, обойти это нельзя.',
      },
      {
        id: 'piece-vs-post',
        question: 'Чем заготовка отличается от поста?',
        answer:
          'Заготовка — это суть вашей мысли, записанная без привязки к площадке. Пост (адаптация) — эта суть, переписанная под конкретный канал: длина, тон, формат. Из одной заготовки получаются посты для разных каналов.',
      },
      {
        id: 'piece-core',
        question: 'Что такое суть и как её поправить?',
        answer:
          'Суть — главная мысль заготовки в нескольких абзацах; из неё пишутся тексты для каналов. Поправить её можно самой: «Править суть», правка сохраняется сама. Хотите добавить случай или число — «Дописать материал», затем «Пересобрать суть». Прежние тексты лежат в «Версии сути», любой можно вернуть кнопкой «Вернуть эту версию». Уже написанные посты от этого сами не меняются.',
      },
      {
        id: 'post-needs-channel',
        question: 'Почему нельзя написать пост без канала?',
        answer:
          'Пост всегда пишется под канал: от канала зависят длина, тон и правила площадки. Пока канала нет, сделайте заготовку в «Контент → Новая заготовка» — она живёт без канала, а текст для канала напишется позже.',
      },
      {
        id: 'no-ai-yet',
        question: 'Почему написано «Написать пока нечем»?',
        answer:
          'Значит, ИИ в пространстве ещё не подключён: нет ни лимита от сервера, ни своего ключа. Подключает администратор в «Настройки → Глобальные настройки», блок «ИИ».',
      },
      {
        id: 'adaptation-screen',
        question: 'Как устроена страница заготовки?',
        answer:
          'Наверху вкладки: «Суть» и по вкладке на каждый канал; «Ещё канал» добавляет следующий. Во вкладке канала без текста нажмите «Адаптировать» — текст напишется из сути под этот канал. Дальше текст можно править кнопкой «Редактировать», правки сохраняются сами. Справа — «Настройки поста»; если панели не видно, нажмите «Показать настройки». Строка над текстом показывает, где пост сейчас: черновик, в плане или в очереди.',
      },
      {
        id: 'rewrite-by-settings',
        question: 'Как переписать пост короче, от другого лица или со своей просьбой?',
        answer:
          'В «Настройки поста» поменяйте нужное — длину, эмодзи, «Кто говорит», «Пожелание» — и нажмите «Переписать по настройкам». Появится новый вариант текста; прежние остаются рядом, переключатель вариантов — над текстом. Настройки меняют только этот пост. Чтобы так писались и следующие посты канала, выберите в меню у кнопки «Переписать и запомнить для канала».',
      },
      {
        id: 'rewrite',
        question: 'Как переписать только заголовок или один кусок?',
        answer:
          'Нажмите «Переписать…» под сутью или текстом канала и напишите в поле «Что перегенерировать?», что изменить. Кнопки «Только заголовок» и «Весь текст» просто подставляют просьбу. Правки придут с объяснениями: примите их или оставьте прежний текст. Для заголовка ИИ предложит три варианта. Это платный вызов ИИ.',
      },
      {
        id: 'channel-model-choice',
        question: 'Что значит «выберем сами» в карточке канала?',
        answer:
          'Это поле решаем мы — по материалу и правилам канала: длину, эмодзи, ссылки, хэштеги или призыв. Остальные заданные вами поля действуют как есть. Эмодзи задаются бегунком словами, от «Без эмодзи» до «Как можно больше»: точное число зависит от длины поста. Карточка канала — во вкладке «Карточка» на странице канала в «Каналы».',
      },
      {
        id: 'channel-plan',
        question: 'Что значат «Без плана», «Бронь» и «Автопилот»?',
        answer:
          'Это поле «План» в карточке канала: как готовые посты встают в календарь. «Бронь» стоит по умолчанию: пост занимает ближайшее время канала с пометкой «в плане» и выйдет только после вашего «Подтвердить». «Автопилот» — пост встаёт в очередь и выходит сам. «Без плана» — пост лежит черновиком, время выбираете сами. Для одного поста режим меняется в «Настройки поста».',
      },
      {
        id: 'confirm-reservation',
        question: 'Как подтвердить пост «в плане» или убрать его?',
        answer:
          'Нажмите на пост в «Календарь» — откроется его страница. В строке над текстом нажмите «Подтвердить»: пост встанет в очередь и выйдет в своё время. В меню у этой кнопки есть «Сменить время» и «Снять из плана» — бронь уйдёт, пост останется черновиком. Пост «в очереди» так же возвращается в черновик через «Снять с расписания».',
      },
      {
        id: 'calendar-search',
        question: 'Как найти пост в календаре?',
        answer:
          'В «Календарь» переключите вид на «Список»: там есть поиск «Слова из поста». Он находит посты, где есть все набранные слова, в любом порядке; отбор по каналу и состоянию при этом остаётся. Вид «Календарь» показывает день, неделю или месяц.',
      },
      {
        id: 'when-web-search',
        question: 'Когда ИИ ищет в интернете?',
        answer:
          'Только когда вы сами попросили: отметили «Поискать в интернете» при создании заготовки, нажали «Дополнить из интернета» у сути или «Проверить факты». Обычный текст для канала пишется без интернета — из заготовки и ваших прошлых постов. Найденное приходит с источниками: отметьте, что подходит, и суть дополнится без нового поиска.',
      },
      {
        id: 'search-engine-language',
        question: 'На каком языке ИИ ищет?',
        answer:
          'Где искать, мы решаем сами — настраивать поиск не нужно. Темы про вашу страну ищем на языке темы, с упором на эту страну; остальные — на языке темы и по-английски.',
      },
      {
        id: 'ideas-and-facts',
        question: 'Откуда берутся идеи и факты?',
        answer:
          'Идеи — во вкладке «Откуда идеи» раздела «Контент». Нажмите «Добавить подписку», укажите ленту сайта или тему — продукт сам проверяет их и приносит поводы написать. «Взять в работу» открывает новую заготовку, «Не надо» убирает повод насовсем. Факты — во вкладке «Откуда факты»: там видно, что продукт считает правдой о вашем деле и откуда он это взял. Чего там нет, он в текст не поставит. Факты добавляются, пока вы пишете: во вкладке «Новая заготовка».',
      },
      {
        id: 'already-written',
        question: 'Как найти свои прошлые тексты?',
        answer:
          'Ваши вышедшие посты продукт читает сам: когда пишет текст для канала, может сослаться на подходящий прошлый пост. В окне поста в календаре такие посты видны в блоке «Свои тексты по теме». В таблице «Заготовки» клетка канала показывает, что с постом: черновик, в плане, запланировано или опубликовано.',
      },
      {
        id: 'avatar-corpus',
        question: 'Что такое аватар и сколько текстов ему нужно?',
        answer:
          'Аватар — описание того, как вы пишете: ритм, длина фраз, слова, которых вы избегаете. Быстрее всего — «Заполнить вручную»: пять строк о вашей манере, тексты не нужны. Точнее — «Собрать из моих текстов»: нужно от 8 текстов и от 15 000 знаков вместе. Тексты можно взять из «Мои опубликованные посты», из «Выгрузка Telegram Desktop» (файл result.json из «Экспорт истории» в формате JSON), вставить или загрузить файлами.',
      },
      {
        id: 'slop-check',
        question: 'Что проверяет «Проверка на штампы»?',
        answer:
          'Ищет обороты, по которым текст узнают как машинный. Считает бесплатно и пересчитывает при каждой правке; число — это находки по списку, а не оценка смысла или фактов. «Убрать следы ИИ» у текста канала — платный проход ИИ по этим находкам; после него видно, что «Ушло» и что «Осталось». Не гонитесь за нулём: ваши примеры и позиция важнее.',
      },
      {
        id: 'adaptation-review',
        question: 'Как принять или отклонить правки ИИ?',
        answer:
          'После «Убрать следы ИИ», «Проверить факты» или «Переписать…» результат приходит одним текстом с подсвеченными правками; наведите на правку, чтобы прочитать, почему она. Опечатки уже отмечены, остальное отметьте по одной правке или все сразу. Текст меняется только после «Принять выбранные»; «Оставить как было» сохраняет прежний. «Проверить факты» ищет источники в интернете, но найденный источник не значит, что верен каждый факт.',
      },
      {
        id: 'telegram-analytics',
        question: 'Почему у постов в Telegram нет просмотров?',
        answer:
          'Telegram не отдаёт ботам просмотры и пересылки — это ограничение Telegram, а не продукта. В «Статистика» поста мы показываем то, что он даёт: «Реакции» и «Комментарии в обсуждении», если к каналу привязана группа для комментариев. Просмотры смотрите в самом Telegram, в статистике канала.',
      },
      {
        id: 'invite-team',
        question: 'Как пригласить помощника?',
        answer:
          'Это делает администратор: «Настройки → Команды» → «Добавить еще одного участника». Выберите роль, по желанию впишите почту и нажмите «Создать приглашение», затем «Скопировать ссылку» и отправьте её человеку. Приглашённому одобрения ждать не нужно.',
      },
      {
        id: 'roles',
        question: 'Что может каждая роль?',
        answer:
          '«Пользователь» смотрит календарь, посты и «Контент» и оставляет комментарии, но сам не пишет. «Редактор» пишет: аватар, заготовки, посты и расписание, — но не подключает каналы и не приглашает людей. «Администратор» может всё, что редактор, и ещё каналы, настройки и команду.',
      },
      {
        id: 'ai-keys',
        question: 'Где настроить ИИ и ключи?',
        answer:
          'Это делает администратор: «Настройки → Глобальные настройки», блок «ИИ». Если сервер даёт ИИ сам, в поле «Какими ключами работаем» стоит «Ключи системы» — настраивать ничего не нужно. Хотите работать на своём ключе — выберите «Свой ключ» и впишите ключ своего провайдера ИИ.',
      },
      {
        id: 'ai-usage',
        question: 'Где смотреть расход ИИ?',
        answer:
          'В «Настройки → Глобальные настройки», блок «ИИ»: строка «Осталось в этом периоде» и таблица «Расход ИИ по участникам за период». Пока вызовов не было, там ноль. Раздел видит администратор.',
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
        id: 'where-to-start',
        question: 'Where do I start?',
        answer:
          'Open «Where to start» and walk its five steps in menu order: «Avatar» — whose voice to write in, «Channel» — where posts go, «Piece» — the essence of the post, «Adaptation» — the post for the channel, «Plan» — when it goes out. A fact — a price, a deadline or a number the post stands on — is optional. Any step can wait with «Later», and the strip above brings you back. Steps tick themselves off. Once all are done the item leaves the menu and stays as the «Where to start» tab in «Settings».',
      },
      {
        id: 'account-pending',
        question: 'Why can’t I sign in after registering, and how long is the wait?',
        answer:
          'A new account is approved by the service owner first — usually within a few hours. While you wait, the screen says «Registration received», and an email follows once it is approved. There is nothing to send again and no need to register twice: sign in with the same email and password. If you were invited by a link, there is no approval to wait for.',
      },
      {
        id: 'telegram-login',
        question: 'Can I sign in with Telegram?',
        answer:
          'Yes, if the sign-in page shows «Sign in with Telegram». To use it for an account you already have, open «Settings → Sign-in methods» and choose «Connect» next to Telegram. No button means Telegram sign-in is off on this server; use your email and password.',
      },
      {
        id: 'telegram-connect',
        question: 'How do I connect my Telegram channel?',
        answer:
          'Open «Channels», choose «Connect a channel» and pick Telegram. Add the bot named in the dialog to the channel’s administrators with the right to post messages. Press «Connect Telegram», copy the /connect word command with «Copy» and send it to the channel — the channel connects itself within seconds. The command lasts 15 minutes; if it runs out, press «Start again».',
      },
      {
        id: 'telegram-authorship',
        question: 'Whose name do posts go out under on Telegram?',
        answer:
          'The channel’s. A bot does the publishing, but subscribers see the channel’s name and picture, not the bot’s. The bot’s name appears only when «Sign messages» is switched on in the channel settings — keep it off. In a group, rather than a channel, the post goes out from the bot; that is how Telegram works and there is no way around it.',
      },
      {
        id: 'piece-vs-post',
        question: 'How is a piece different from a post?',
        answer:
          'A piece is the core of your thought, written without any platform in mind. A post (an adaptation) is that core rewritten for one channel: length, tone, format. One piece becomes posts for several channels.',
      },
      {
        id: 'piece-core',
        question: 'What is the core, and how do I fix it?',
        answer:
          'The core is the main idea of a piece in a few paragraphs; channel texts are written from it. You can edit it yourself with «Edit the core», and the edit saves itself. To add a story or a number, use «Add to the material», then «Rebuild the core». Earlier texts stay in «Core versions», and any one can come back. Posts already written do not change on their own.',
      },
      {
        id: 'post-needs-channel',
        question: 'Why can’t I write a post without a channel?',
        answer:
          'A post is always written for a channel: length, tone and the platform’s rules all follow from it. While there is no channel, make a piece in «Content → New piece» — it lives without a channel, and the channel text can be written later.',
      },
      {
        id: 'no-ai-yet',
        question: 'Why does it say «Nothing to write with yet»?',
        answer:
          'It means AI is not connected in this workspace yet: there is neither an allowance from the server nor your own key. An administrator connects it in «Settings → Global settings», the «AI» block.',
      },
      {
        id: 'adaptation-screen',
        question: 'How is a piece’s page laid out?',
        answer:
          'Along the top: «Substance» and one tab per channel; «Another channel» adds the next one. In a channel tab with no text yet, press «Adapt» and the text is written from the core for that channel. After that you can change it with «Edit»; edits save themselves. «Post settings» sit on the right; if the panel is hidden, press «Show settings». The line above the text says where the post is now: draft, planned or queued.',
      },
      {
        id: 'rewrite-by-settings',
        question: 'How do I rewrite a post shorter, in another voice or with my own request?',
        answer:
          'In «Post settings» change what you need — length, emoji, «Who speaks», «Wish» — and press «Rewrite with these settings». A new version appears; earlier ones stay close by, with a version switch above the text. The settings change this post only. To make the channel’s next posts follow them too, choose «Rewrite and remember for the channel» in the button’s menu.',
      },
      {
        id: 'rewrite',
        question: 'How do I rewrite only the title or one passage?',
        answer:
          'Press «Rewrite…» under the core or the channel text and write what to change in «What should change?». «Only title» and «Whole text» just fill in the request. Changes come with explanations: accept them or keep the old text. For a title the AI offers three options. This is a paid AI call.',
      },
      {
        id: 'channel-model-choice',
        question: 'What does «we decide» mean in a channel card?',
        answer:
          'That field is ours to decide from the material and the channel’s rules: length, emoji, links, hashtags or a call to action. Your other settings apply as they are. Emoji are set with a slider of words, from «No emoji» to «As many as fit»; the exact count follows the post’s length. The channel card is the «Card» tab on the channel’s page under «Channels».',
      },
      {
        id: 'channel-plan',
        question: 'What do «No plan», «Reserve» and «Autopilot» mean?',
        answer:
          'That is the «Plan» field in the channel card: how finished posts get into the calendar. «Reserve» is the default: the post takes the channel’s next time, marked planned, and goes out only after your «Confirm». «Autopilot» puts the post in the queue and it goes out by itself. «No plan» leaves it a draft and you pick the time. For one post, change the mode in «Post settings».',
      },
      {
        id: 'confirm-reservation',
        question: 'How do I confirm a planned post or remove it?',
        answer:
          'Click the post in «Calendar» and its page opens. In the line above the text press «Confirm»: the post joins the queue and goes out at its time. The button’s menu has «Change the time» and «Remove from the plan» — the reservation goes and the post stays a draft. A queued post goes back to draft the same way with «Take off the schedule».',
      },
      {
        id: 'calendar-search',
        question: 'How do I find a post in the calendar?',
        answer:
          'In «Calendar» switch the view to «List»: it has a «Words from the post» search. It finds posts that contain every word you type, in any order; the channel and state filters still apply. The «Calendar» view shows a day, a week or a month.',
      },
      {
        id: 'when-web-search',
        question: 'When does the AI search the web?',
        answer:
          'Only when you ask: you turned on «Research this» before making a piece, pressed «Add research» on the core, or «Check facts». An ordinary channel text is written without the web — from the piece and your earlier posts. What is found comes with sources: tick what fits, and the core is enriched without searching again.',
      },
      {
        id: 'search-engine-language',
        question: 'What language does the AI search in?',
        answer:
          'We decide where to search — there is nothing to set up. Topics about your own country are searched in the topic’s language with a focus on that country; the rest in the topic’s language and in English.',
      },
      {
        id: 'ideas-and-facts',
        question: 'Where do ideas and facts come from?',
        answer:
          'Ideas: the «Ideas» tab of «Content». Press «Add subscription» and give a site feed or a topic — the product checks them itself and brings reasons to write. «Take to work» opens a new piece; the decline button drops the lead for good. Facts: the «Facts» tab shows what the product holds true about your business and where it learned it. What is not there, it will not put in a text. Facts are added while you write, in the «New piece» tab.',
      },
      {
        id: 'already-written',
        question: 'How do I find my earlier texts?',
        answer:
          'The product reads your published posts itself: when it writes a channel text it may refer to a fitting earlier post. In the calendar’s post window those posts show in «Your texts on this topic». In the «Pieces» table a channel cell shows the post’s state: draft, planned, scheduled or published.',
      },
      {
        id: 'avatar-corpus',
        question: 'What is an avatar and how many texts does it need?',
        answer:
          'An avatar describes how you write: rhythm, sentence length, the words you avoid. The quickest way is «Fill it in by hand»: five lines about your manner, no texts needed. More precise is «Build it from my own texts»: it needs at least 8 texts and at least 15,000 characters in total. Texts can come from your published posts, from a Telegram Desktop export (the result.json file from «Export chat history» in JSON), pasted in or uploaded as files.',
      },
      {
        id: 'slop-check',
        question: 'What does the «Cliché check» look for?',
        answer:
          'It finds stock phrases that make a text read as machine-written. It counts for free and recounts after every edit; the number is catalog findings, not a verdict on meaning or facts. «Remove AI tells» on a channel text is a paid AI pass over those findings; afterwards you see what is «Gone» and what is «Still there». Do not chase zero: your examples and your stance matter more.',
      },
      {
        id: 'adaptation-review',
        question: 'How do I accept or reject the AI’s changes?',
        answer:
          'After «Remove AI tells», «Check facts» or «Rewrite…» the result comes as one text with highlighted changes; hover over a change to read why. Typo fixes are already selected; pick the rest one by one or all at once. The text changes only after «Accept selected»; «Leave unchanged» keeps the old one. «Check facts» looks for web sources, but a found source does not mean every fact is right.',
      },
      {
        id: 'telegram-analytics',
        question: 'Why do my Telegram posts show no views?',
        answer:
          'Telegram does not give bots views or forwards — a Telegram limit, not the product’s. A post’s «Statistics» shows what it does give: «Reactions» and «Discussion comments» when the channel has a linked discussion group. See views in Telegram itself, in the channel statistics.',
      },
      {
        id: 'invite-team',
        question: 'How do I invite a helper?',
        answer:
          'An administrator does it: «Settings → Teams» → «Add another member». Choose a role, add an email if you like, press «Create invitation», then «Copy link» and send it to the person. An invited person has no approval to wait for.',
      },
      {
        id: 'roles',
        question: 'What can each role do?',
        answer:
          'A «User» views the calendar, posts and Content and leaves comments, but does not write. An «Editor» writes: the avatar, pieces, posts and the schedule — but does not connect channels or invite people. An «Admin» can do everything an editor can, plus channels, settings and the team.',
      },
      {
        id: 'ai-keys',
        question: 'Where do I set up AI and keys?',
        answer:
          'An administrator does it: «Settings → Global settings», the «AI» block. If the server provides AI itself, the «Which keys we use» field shows system keys and there is nothing to set. To work on your own key, choose your own key and enter your AI provider’s key.',
      },
      {
        id: 'ai-usage',
        question: 'Where do I see AI usage?',
        answer:
          'In «Settings → Global settings», the «AI» block: the «Left this period» bar and the «AI usage by member, this period» table. Until there have been calls, it shows zero. Administrators see this section.',
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
