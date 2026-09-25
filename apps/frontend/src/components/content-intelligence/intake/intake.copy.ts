/**
 * Слова экрана «Написать из мысли», на двух языках.
 *
 * Не i18next и это решение, а не спешка (`content-factory-next-tu3k.4`).
 * Раздел «Контент» весь написан двумя языками прямо в исходниках
 * (`content-section.copy.ts` и его объяснение про шестнадцать локалей): экран
 * живёт внутри этого раздела, открывается его вкладкой и делит с ним выбор
 * языка через `resolveContentLocale`. Шестнадцать ключей вокруг двух языков
 * внутри обещали бы перевод, которого нет.
 *
 * Один ключ i18next здесь всё же переиспользуется, и не отсюда:
 * `ai_allowance_unavailable` — общая фраза про недоступный ИИ, её печатает
 * контейнер, потому что ту же самую фразу говорят другие двери модели.
 */

import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';
import { INTAKE_MAX_PASTED_LINKS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/** Ссылки в русской счётной строке: одна ссылка, две ссылки, пять ссылок. */
const LINKS_RU = ['ссылку', 'ссылки', 'ссылок'] as const;

export type IntakeLocale = 'ru' | 'en';

export const intakeCopy = {
  ru: {
    /* --- Шапка и поле ввода --------------------------------------------- */
    // `content-factory-next-tu3k.9` (06.09.2026): дверь делает заготовку —
    // нейтральную суть без площадки, — а канал стал необязательным.
    title: 'Новая заготовка',
    lead: 'Дайте мысль, ссылку или чужой пост. Соберём нейтральную заготовку. Канал и форму выберете на её странице.',
    inputLabel: 'О чём будем писать',
    inputPlaceholder: 'Вставьте мысль, ссылку или чужой пост…',
    kindLink: 'Похоже на ссылку — прочитаем страницу и возьмём её как источник.',
    /*
      Пропущенная ссылка сказана человеку, а не только журналу
      (`content-factory-next-97dq.12`). Одна строка, без диалога и без
      настройки: ход не прерывался, материал у нас есть — сам текст, — и
      человеку нужно знать ровно то, чего в заготовке не окажется. Два случая
      разные и называются по-разному: «не открылась» и «до неё не дошли».
    */
    linksSkipped: (unreadable: number, beyondLimit: number) =>
      [
        unreadable
          ? `Не смогли открыть ${unreadable} ${plural(unreadable, LINKS_RU)} из текста — ${
              unreadable === 1 ? 'её' : 'их'
            } пропустили.`
          : '',
        beyondLimit
          ? `Читаем не больше ${INTAKE_MAX_PASTED_LINKS} ссылок из текста: ${beyondLimit} ${plural(
              beyondLimit,
              LINKS_RU
            )} не открывали.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),

    /* --- Каналы, язык, действие ------------------------------------------ */
    channelsLabel: 'Куда',
    channelsHint: 'Необязательно. До трёх каналов за раз — для каждого получится свой текст.',
    writingProfileAction: (name: string) =>
      `Настроить: как пишем в «${name}»`,
    writingProfileStored: 'настроено',
    writingProfileDefault: 'по умолчанию',
    languageLabel: 'Язык текста',
    languageRu: 'Русский',
    languageEn: 'English',
    researchLabel: 'Нужен ресерч',
    // Кружок с вопросом вместо подписи под флажком (владелец, 14.09.2026):
    // объяснение живёт в подсказке и не занимает место на экране.
    researchHintLabel: 'Подсказка: что такое ресерч',
    researchHint:
      'Проверим вашу мысль по внешним источникам: подтвердим числа и факты, ' +
      'поправим то, что расходится с источниками, и добавим находки по теме ' +
      'с адресами. Это платная операция, она тратит одну из операций месяца.',
    // Владелец, 18.09.2026 (живой прогон 18.09, `content-factory-next-97dq`):
    // вставленный чужой пост ничем не отличался от собственной мысли, и продукт
    // выдавал чужое мнение за авторское. Флажок стоит рядом с ресерчем — это
    // второе, что человек говорит о своём тексте, — а подсказка называет
    // последствие, а не свойство.
    // Переключатель вида входа над полем (владелец, 22.09.2026, `97dq.28`):
    // три положения — три разных отношения к словам. С `97dq.36` у каждого
    // положения свой «?», как у «Нужен ресерч», и строки под полосой больше
    // нет: одно объяснение — одно место.
    kindLabel: 'Что вы присылаете',
    kindOwn: 'Свой текст',
    kindForeign: 'Чужой пост',
    kindInstruction: 'Задание',
    kindHintLabel: (kind: string) => `Подсказка: ${kind.toLowerCase()}`,
    kindOwnHint:
      'Ваши мысли, набросок или расшифровка голосового. Поправим речь, а слова и смысл останутся вашими.',
    kindForeignHint:
      'Чужой пост, статья или ссылка на них. Сделаем из этого ваш собственный пост и спросим вашу позицию.',
    kindInstructionHint:
      'Описание поста, который нужно написать. Напишем по нему, а ссылки из описания сохраним дословно.',
    researchLevelLabel: 'Глубина ресерча',
    researchQuick: 'Быстрый · до 8 источников',
    researchStandard: 'Стандартный · до 20 источников',
    researchDeep: 'Глубокий · до 50 источников',
    researchContinue: 'Продолжить с выбранными опорами',
    // Итог ресерча в духе «сделали за вас» (владелец выбрал вариант 1, 13.09.2026).
    researchOutcomeTitle: 'Проверили по источникам',
    researchLevelNames: { quick: 'быстрый', standard: 'стандартный', deep: 'глубокий' } as const,
    researchSourcesLine: (sources: number, encyclopedic: number) =>
      `${sources} ${plural(sources, ['источник', 'источника', 'источников'])}${
        encyclopedic ? `, ${encyclopedic} ${plural(encyclopedic, ['энциклопедия', 'энциклопедии', 'энциклопедий'])}` : ''
      }`,
    researchSummaryConfirmed: (n: number) => `${n} подтвердилось`,
    researchSummaryCorrected: (n: number) => `${n} поправили по источникам`,
    researchSummaryUnverified: (n: number) => `${n} проверить нечем`,
    researchSummaryFound: (n: number) => `${n} нашли дополнительно`,
    researchThoughtTitle: 'Ваша мысль с правками',
    researchKeepMine: 'Вернуть моё',
    researchAcceptFix: 'Принять поправку',
    researchUnverifiedDefault: 'Проверить нечем. Оставили ваши слова.',
    researchConflictNoFix: 'Источник говорит иначе; замены не предложили, ваши слова остались.',
    researchFoundTitle: 'Что ещё нашли',
    researchFoundHint: 'Отмеченное пойдёт в суть. Снимите галочку, если не нужно.',
    researchContinueWithFixes: 'Продолжить с правками',
    researchContinuePlain: 'Продолжить',
    researchKeepMyNumbers: 'Оставить мои числа',
    researchNoSources: 'Источники не нашлись; продолжим по вашим словам.',
    researchSourceOf: 'источник',
    researchSelectionHint: 'Отметьте, что можно взять в суть. Выбор не подтверждает факт.',
    researchType: 'Тип',
    researchInclude: 'Берём',
    researchOwn: 'своё',
    researchExternal: 'внешнее',
    researchFound: 'найдено',
    write: 'Написать',
    makePiece: 'Сделать заготовку',
    writing: 'Пишем…',
    cancel: 'Отменить',
    pieceSaved: (code: string) => `Заготовка сохранена — ${code}`,
    openPiece: 'Открыть заготовку',

    /* --- Почему кнопка не нажимается ------------------------------------- */
    blockedNoInput: 'Напишите хотя бы пару слов',
    blockedNoChannel: 'Выберите канал',
    blockedChecking: 'Проверяем, подключён ли ИИ…',

    /* --- Шаги стрима ------------------------------------------------------ */
    stepStarted: 'Читаем…',
    stepBrief: 'Собираем бриф…',
    stepClaims: 'Разбираем утверждения…',
    stepSearch: 'Ищем недостающие факты…',
    stepWriting: 'Пишем…',

    /* --- Карточка вопросов ------------------------------------------------ */
    questionsBadge: 'Уточнение',
    // Русский считает вещь тремя способами, и счётная строка, считающая один,
    // сломана: `plural` — то самое общее правило из библиотеки, а не четвёртая
    // его копия. Вопросов здесь всегда один или два (предел решения
    // владельца), но правило одно на всё.
    questionsTitle: (count: number) =>
      `${count === 1 ? 'Один' : 'Два'} ${plural(count, [
        'вопрос',
        'вопроса',
        'вопросов',
      ])} — и пишем`,
    questionsLead:
      'Спрашиваем только то, чего в вашем тексте нет. Остальное мы предположили сами — поправите в квитанции.',
    ownAnswer: 'Свой ответ',
    ownAnswerLabel: 'Ваш ответ',
    decideThis: 'Решите за меня',
    decideAll: 'Решите всё за меня',
    addFact: 'Добавить факт',
    blockedUnanswered: 'Ответьте или нажмите «Решите за меня»',

    /* --- Квитанция -------------------------------------------------------- */
    receiptTitle: 'Что мы поняли',
    originInput: 'из вашего текста',
    originPerson: 'ваш ответ',
    originAvatar: 'из аватара',
    originMemory: 'из памяти',
    originSearch: 'найдено поиском',
    originModel: 'предположение',
    originModelDecision: 'решили мы',
    receiptDecisions: 'Решили за вас',
    factsRestOn: 'На что это опирается',
    /* Заголовки колонок таблицы опор. Названия, а не значения ячеек:
       `content-factory-next-hh50` — в колонках «Состояние» и «Источник»
       стояли «не подтверждено» и «найдено поиском», то есть одно из значений
       вместо имени колонки, и таблица читалась как список из одной строки. */
    researchTableTitle: 'Опоры текста',
    researchColumnStatus: 'Состояние',
    researchColumnSource: 'Источник',
    factVerified: 'подтверждено',
    factUnverified: 'не подтверждено',
    factConflicting: 'расходится',
    factNotFound: 'не найдено',
    ungroundedLabel: 'Не подтвердилось и в текст не вошло',

    /* --- Результат -------------------------------------------------------- */
    draftTitle: 'Черновик',
    openInEditor: 'Открыть в редакторе',


    /* --- Строка качества под текстом --------------------------------------- */
    /*
      Одна строка вместо трёх блоков (решение владельца 07.09.2026,
      `content-factory-next-fn33.28.4`). Слова называют только то, на что
      стоит взглянуть: чистый текст не получает ни строки, ни галочки, ни
      «находок нет». Проверки даром и считаются одинаково при одинаковом
      тексте, поэтому строка ничего не обещает и ничего не запрещает.
    */
    qualitySlop: (count: number) => `Штампов: ${count}`,
    qualityAntiCopy: (count: number) => `Чужих фраз: ${count}`,
    qualityVoiceFar: 'Не похоже на вас',
    qualityGaps: 'Своих чисел нет',
    qualityAntiCopyDetail:
      'Эти отрезки повторяют исходный материал слово в слово.',
    qualityGapsDetail:
      'Текст уходит как есть. Своё число — то, чего нет больше ни у кого; добавлять его не обязательно.',

    /* --- Отказы и пустота -------------------------------------------------- */
    errorTitle: 'Не написалось',
    errorFallback: 'Текст не собрался. Попробуйте ещё раз.',
    errorIncomplete: 'Ответ пришёл неполным. Ничего не сохранено.',
    retry: 'Попробовать снова',
    continueWithoutLink: 'Продолжить без ссылки',
    emptyTitle: 'Сначала подключите канал',
    emptyBody:
      'Текст пишется под канал: его длину, эмодзи и призыв. Подключите хотя бы один — и сюда можно будет вернуться.',
    emptyAction: 'К каналам',
    restrictedTitle: 'Написать пока нечем',
    readOnlyTitle: 'Здесь только читают',
    readOnlyBody:
      'Писать тексты может редактор или администратор пространства. Попросите того, кто им управляет.',

    /* --- Карточка канала --------------------------------------------------- */
    profileTitle: (name: string) => `Как пишем в «${name}»`,
    profileAuto: 'выберем сами',
    profileLength: 'Длина',
    profileLengthShort: 'до 500',
    profileLengthIdeal: '500–1000',
    profileLengthLong: 'до 1500',
    profileLengthMax: 'до 2500 (форматы)',
    profileEmoji: 'Эмодзи',
    /*
      Бегунок плотности (`97dq.96`): пять слов — подписи делений, значение
      и отметка канала. Числа нет: сколько штук, решает длина поста.
    */
    profileEmojiNone: 'Без эмодзи',
    profileEmojiFew: 'Мало',
    profileEmojiMedium: 'Средне',
    profileEmojiMany: 'Много',
    profileEmojiMax: 'Как можно больше',
    profileEmojiInChannel: (value: string) => `в канале: ${value}`,
    profileEmojiSlider: 'Сколько эмодзи в посте',
    profileLink: 'Ссылки',
    profileLinkNone: 'без ссылок',
    profileLinkEnd: 'не больше одной, в конце',
    profileLinkInline: 'можно внутри текста',
    /* Честная подсказка (`97dq.58`): адрес берётся только из текста человека,
       его ответов или найденных источников — новых мы не придумываем. */
    profileLinkSource:
      'Ссылку берём из вашего текста или найденных источников — новых адресов не придумываем.',
    profileHashtag: 'Хэштеги',
    profileHashtagNone: 'без хэштегов',
    profileHashtagEnd: '1–3 в конце',
    profileHashtagFree: 'как получится',
    profileCta: 'Призыв',
    profileCtaNone: 'без призыва',
    profileCtaQuestion: 'вопрос читателю',
    profileCtaComment: 'позвать в комментарии',
    profileCtaLink: 'перейти по ссылке',
    profileCtaSubscribe: 'подписаться',
    profileCtaReply: 'написать в ответ',
    profileFormat: 'Формат по умолчанию',
    profileNotes: 'Что ещё важно про этот канал',
    profileNotesHint: 'Своими словами, до 500 знаков.',
    profileNotesCount: (used: number, max: number) => `${used} из ${max}`,
    profileSave: 'Сохранить',
    profileSaving: 'Сохраняем…',
    profileSaved: 'Карточка сохранена.',
    profileReset: 'Вернуть умолчания',
    profileFailed: 'Карточка не загрузилась.',
    profileSaveFailed: 'Карточка не сохранилась. Попробуйте ещё раз.',
    profileLoading: 'Загружаем карточку',
    profileDefaultsBody: (provider: string) =>
      `Карточка не заполнена: пишем по умолчаниям для ${
        provider || 'площадки'
      }. Проверьте их — это три минуты, и каждая адаптация станет точнее.`,
    profileHintFor: (label: string) => `Подсказка: ${label}`,
    profileHintLength:
      'Сколько знаков будет в посте. Мы можем выбрать длину по материалу в пределах площадки.',
    profileHintEmoji:
      'Сколько эмодзи будет в посте. Точное число зависит от длины поста: в длинном тексте их больше, в коротком меньше.',
    profileHintLink:
      'Можно ли ставить ссылки и где: рядом с фактом или одну в конце.',
    profileHintHashtag: 'Нужны ли метки темы и где они стоят.',
    profileHintCta:
      'Какого действия ждём от читателя после поста. Призыв может быть не нужен.',
    profileHintFormat:
      'Как построить текст: мнение, история, список или другой формат.',
    /* Слои настроек (`97dq.38`): кто говорит в канале и как он обращается. */
    profileSpeakerDefault: 'По умолчанию',
    profileSpeakerUnnamed: 'Без имени',
    profileHintSpeaker:
      'Аватар, от лица которого пишутся посты этого канала. «По умолчанию» — основной аватар пространства. Для одного поста его можно сменить на странице адаптации.',

    /* --- Форматы ----------------------------------------------------------- */
    formatAuto: 'выберем сами',
    formatOpinion: 'мнение',
    formatAnnouncement: 'анонс',
    formatList: 'список',
    formatExpert: 'разбор',
    formatCase: 'случай из работы',
    formatStory: 'история',

    /* --- Ссылка для поста (`97dq.75`) ---------------------------------------
       Детерминированный вопрос, не от ИИ: задаётся, когда канал принимает
       ссылки. Ответ — единственная ссылка, которую пост добавит сам. */
    postLinkQuestion: 'Какую ссылку поставить в пост?',
    postLinkQuestionHint:
      'Спрашиваем, потому что канал принимает ссылки. Своих адресов мы не придумываем: в пост попадёт только эта ссылка и ссылки из вашего материала. Передумаете — поменяйте её в настройках поста, в поле «Ссылка для поста».',
    postLinkChoice: 'Ссылка в посте',
    postLinkNone: 'Без ссылки',
    postLinkOwn: 'Вставить ссылку',
    postLinkAddress: 'Адрес ссылки',
    postLinkPlaceholder: 'https://…',
    postLinkInvalid: 'Нужен адрес http или https, например https://example.com.',
    postLinkSaving: 'Сохраняем ответ',
    postLinkFailed: 'Ответ не сохранился. Попробуйте ещё раз.',
    postLinkKeep: 'Оставить как было',
    /* --- Текст ссылки (`97dq.79`) --------------------------------------- */
    postLinkText: 'Текст ссылки',
    postLinkTextHint:
      'Слова, на которых будет стоять ссылка, — в каналах, где ссылка ставится на слова, как в Telegram. Оставьте пустым — подберём 2–5 слов по смыслу сами. Где так нельзя, в пост встанет сам адрес.',
    postLinkTextPlaceholder: 'пусто — подберём слова сами',
  },
  en: {
    title: 'New piece',
    lead: 'Give a thought, a link or somebody else’s post. We will make a neutral piece. Choose its channel and form on the piece page.',
    inputLabel: 'Where we start',
    inputPlaceholder: 'Paste a thought, a link or somebody else’s post…',
    kindLink: 'Looks like a link — we will read the page and take it as a source.',
    linksSkipped: (unreadable: number, beyondLimit: number) =>
      [
        unreadable
          ? `We could not open ${unreadable} link${
              unreadable === 1 ? '' : 's'
            } in your text — ${unreadable === 1 ? 'it was' : 'they were'} skipped.`
          : '',
        beyondLimit
          ? `We read at most ${INTAKE_MAX_PASTED_LINKS} links from a text: ${beyondLimit} more ${
              beyondLimit === 1 ? 'was' : 'were'
            } left unopened.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),

    channelsLabel: 'Where to',
    channelsHint: 'Optional. Up to three channels at a time — each gets its own text.',
    writingProfileAction: (name: string) =>
      `Set up: how we write in “${name}”`,
    writingProfileStored: 'set up',
    writingProfileDefault: 'defaults',
    languageLabel: 'Text language',
    languageRu: 'Русский',
    languageEn: 'English',
    researchLabel: 'Research this',
    researchHintLabel: 'Hint: what research is',
    researchHint:
      'We check your thought against outside sources: confirm numbers and facts, ' +
      'correct what the sources contradict, and add findings on the topic with ' +
      'their addresses. This is a paid step: it spends one of the month’s operations.',
    kindLabel: 'What you are sending',
    kindOwn: 'My text',
    kindForeign: 'Someone’s post',
    kindInstruction: 'Instruction',
    kindHintLabel: (kind: string) => `Hint: ${kind.toLowerCase()}`,
    kindOwnHint:
      'Your thoughts, a draft or a transcribed voice note. We tidy the wording; the words and the meaning stay yours.',
    kindForeignHint:
      'Someone else’s post, article or a link to one. We turn it into a post of your own and ask for your position.',
    kindInstructionHint:
      'A description of the post we should write. We write from it and keep the links in it verbatim.',
    researchLevelLabel: 'Research depth',
    researchQuick: 'Quick · up to 8 sources',
    researchStandard: 'Standard · up to 20 sources',
    researchDeep: 'Deep · up to 50 sources',
    researchContinue: 'Continue with selected sources',
    researchOutcomeTitle: 'Checked against sources',
    researchLevelNames: { quick: 'quick', standard: 'standard', deep: 'deep' } as const,
    researchSourcesLine: (sources: number, encyclopedic: number) =>
      `${sources} ${sources === 1 ? 'source' : 'sources'}${
        encyclopedic ? `, ${encyclopedic} ${encyclopedic === 1 ? 'encyclopedia' : 'encyclopedias'}` : ''
      }`,
    researchSummaryConfirmed: (n: number) => `${n} confirmed`,
    researchSummaryCorrected: (n: number) => `${n} corrected from sources`,
    researchSummaryUnverified: (n: number) => `${n} cannot be checked`,
    researchSummaryFound: (n: number) => `${n} found in addition`,
    researchThoughtTitle: 'Your thought with corrections',
    researchKeepMine: 'Keep mine',
    researchAcceptFix: 'Accept the correction',
    researchUnverifiedDefault: 'Nothing to check it against. Your words stay.',
    researchConflictNoFix: 'A source says otherwise; no replacement was offered, your words stay.',
    researchFoundTitle: 'Also found',
    researchFoundHint: 'Ticked rows go into the piece. Untick what you do not need.',
    researchContinueWithFixes: 'Continue with corrections',
    researchContinuePlain: 'Continue',
    researchKeepMyNumbers: 'Keep my numbers',
    researchNoSources: 'No sources were found; continuing with your words.',
    researchSourceOf: 'source',
    researchSelectionHint: 'Choose what may enter the piece. Selection does not verify a fact.',
    researchType: 'Type',
    researchInclude: 'Include',
    researchOwn: 'own',
    researchExternal: 'external',
    researchFound: 'found',
    write: 'Write',
    makePiece: 'Make a piece',
    writing: 'Writing…',
    cancel: 'Cancel',
    pieceSaved: (code: string) => `The piece is saved — ${code}`,
    openPiece: 'Open the piece',

    blockedNoInput: 'Write at least a couple of words',
    blockedNoChannel: 'Pick a channel',
    blockedChecking: 'Checking whether AI is connected…',

    stepStarted: 'Reading…',
    stepBrief: 'Filling the brief…',
    stepClaims: 'Reading the claims…',
    stepSearch: 'Looking for missing facts…',
    stepWriting: 'Writing…',

    questionsBadge: 'One thing to clear up',
    questionsTitle: (count: number) =>
      count === 1 ? 'One question and we write' : 'Two questions and we write',
    questionsLead:
      'We only ask for what your text does not have. The rest we assumed ourselves — correct it in the receipt.',
    ownAnswer: 'My own answer',
    ownAnswerLabel: 'Your answer',
    decideThis: 'You decide',
    decideAll: 'You decide everything',
    addFact: 'Add a fact',
    blockedUnanswered: 'Answer, or press “You decide”',

    receiptTitle: 'What we understood',
    originInput: 'from your text',
    originPerson: 'your answer',
    originAvatar: 'from the avatar',
    originMemory: 'from memory',
    originSearch: 'found by search',
    originModel: 'an assumption',
    originModelDecision: 'our decision',
    receiptDecisions: 'Decided for you',
    factsRestOn: 'What it rests on',
    researchTableTitle: 'What the text rests on',
    researchColumnStatus: 'State',
    researchColumnSource: 'Source',
    factVerified: 'confirmed',
    factUnverified: 'unconfirmed',
    factConflicting: 'conflicting',
    factNotFound: 'not found',
    ungroundedLabel: 'Unconfirmed and kept out of the text',

    draftTitle: 'Draft',
    openInEditor: 'Open in the editor',


    qualitySlop: (count: number) => `Clichés: ${count}`,
    qualityAntiCopy: (count: number) => `Copied runs: ${count}`,
    qualityVoiceFar: "Doesn't sound like you",
    qualityGaps: 'None of your numbers',
    qualityAntiCopyDetail:
      'These runs repeat the source material word for word.',
    qualityGapsDetail:
      'The text goes as it is. A figure of your own is the part nobody else has; adding one is optional.',

    errorTitle: 'It did not get written',
    errorFallback: 'The text was not built. Try again.',
    errorIncomplete: 'The answer arrived incomplete. Nothing was saved.',
    retry: 'Try again',
    continueWithoutLink: 'Continue without the link',
    emptyTitle: 'Connect a channel first',
    emptyBody:
      'A text is written for a channel: its length, its emoji, its call. Connect at least one and come back here.',
    emptyAction: 'To the channels',
    restrictedTitle: 'Nothing to write with yet',
    readOnlyTitle: 'This is read-only here',
    readOnlyBody:
      'Writing texts belongs to an editor or an administrator of the workspace. Ask whoever runs it.',

    profileTitle: (name: string) => `How we write in “${name}”`,
    profileAuto: 'we decide',
    profileLength: 'Length',
    profileLengthShort: 'up to 500',
    profileLengthIdeal: '500–1000',
    profileLengthLong: 'up to 1500',
    profileLengthMax: 'up to 2500 (long forms)',
    profileEmoji: 'Emoji',
    profileEmojiNone: 'No emoji',
    profileEmojiFew: 'Few',
    profileEmojiMedium: 'Some',
    profileEmojiMany: 'Many',
    profileEmojiMax: 'As many as fit',
    profileEmojiInChannel: (value: string) => `channel: ${value}`,
    profileEmojiSlider: 'How many emoji a post has',
    profileLink: 'Links',
    profileLinkNone: 'none',
    profileLinkEnd: 'at most one, at the end',
    profileLinkInline: 'may be inside the text',
    profileLinkSource:
      'Links come from your text or the sources we found — we never make up new addresses.',
    profileHashtag: 'Hashtags',
    profileHashtagNone: 'none',
    profileHashtagEnd: '1–3 at the end',
    profileHashtagFree: 'as it comes',
    profileCta: 'Call to action',
    profileCtaNone: 'none',
    profileCtaQuestion: 'a question to the reader',
    profileCtaComment: 'invite to the comments',
    profileCtaLink: 'follow the link',
    profileCtaSubscribe: 'subscribe',
    profileCtaReply: 'write back',
    profileFormat: 'Default format',
    profileNotes: 'Anything else about this channel',
    profileNotesHint: 'In your own words, up to 500 characters.',
    profileNotesCount: (used: number, max: number) => `${used} of ${max}`,
    profileSave: 'Save',
    profileSaving: 'Saving…',
    profileSaved: 'The card is saved.',
    profileReset: 'Back to defaults',
    profileFailed: 'The card did not load.',
    profileSaveFailed: 'The card was not saved. Try again.',
    profileLoading: 'Loading the card',
    profileDefaultsBody: (provider: string) =>
      `This card is not filled in: we use the defaults for ${
        provider || 'this platform'
      }. Review them once so every adaptation is more accurate.`,
    profileHintFor: (label: string) => `Hint: ${label}`,
    profileHintLength: 'Post length. We can choose within the platform limit.',
    profileHintEmoji:
      'How many emoji a post has. The exact number depends on the length of the post: more in a long text, fewer in a short one.',
    profileHintLink:
      'Whether links may appear and where: next to a fact or one at the end.',
    profileHintHashtag: 'Whether topic tags are useful and where they go.',
    profileHintCta:
      'What readers should do after reading. A call to action may be unnecessary.',
    profileHintFormat:
      'How to structure the text: opinion, story, list, or another format.',
    profileSpeakerDefault: 'Default',
    profileSpeakerUnnamed: 'Unnamed',
    profileHintSpeaker:
      'The avatar this channel’s posts are written as. “Default” is the workspace’s main avatar. You can change it for one post on the adaptation page.',

    formatAuto: 'we pick',
    formatOpinion: 'opinion',
    formatAnnouncement: 'announcement',
    formatList: 'list',
    formatExpert: 'expert take',
    formatCase: 'case from work',
    formatStory: 'story',

    /* --- Link for the post (`97dq.75`) ----------------------------------- */
    postLinkQuestion: 'Which link goes into the post?',
    postLinkQuestionHint:
      'We ask because the channel takes links. We never invent addresses: the post gets only this link and the links in your material. Change your mind — change it in the post settings, in the «Link for the post» field.',
    postLinkChoice: 'Link in the post',
    postLinkNone: 'No link',
    postLinkOwn: 'Add a link',
    postLinkAddress: 'Link address',
    postLinkPlaceholder: 'https://…',
    postLinkInvalid: 'Needs an http or https address, like https://example.com.',
    postLinkSaving: 'Saving the answer',
    postLinkFailed: 'The answer was not saved. Try again.',
    postLinkKeep: 'Keep it as it was',
    /* --- Link text (`97dq.79`) ------------------------------------------- */
    postLinkText: 'Link text',
    postLinkTextHint:
      'The words that carry the link, in channels that put links on words, like Telegram. Leave it empty — we pick 2–5 meaningful words ourselves. Where that is not possible, the post gets the address itself.',
    postLinkTextPlaceholder: 'empty — we pick the words',
  },
} as const;

export type IntakeWords = (typeof intakeCopy)[IntakeLocale];
