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
    foreignLabel: 'Это чужой текст',
    foreignHintLabel: 'Подсказка: чужой текст',
    foreignHint:
      'Поставьте, если вставили чужой пост или статью: спросим вашу позицию и ' +
      'не выдадим чужое мнение за ваше',
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
    decideAll: 'Реши всё сама',
    manualForm: 'Заполнить бриф вручную',
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

    /*
      «Повторить» — единственное, что осталось от кнопки «Проверить на
      штампы». Сама кнопка и её вердикты удалены 07.09.2026 вместе с
      `slop-findings.tsx`: готовый текст описывает строка качества, и
      проверка приезжает вместе с ним, а не по нажатию. Слово читает карточка
      канала — там это отказ загрузки, а не отказ проверки.
    */
    slopRetry: 'Повторить',

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
    profileDefaultsCaption:
      'Значения по умолчанию — из рекомендаций для Telegram; правьте под свой канал.',
    profileAuto: 'выберем сами',
    profileLength: 'Длина',
    profileLengthShort: 'до 500',
    profileLengthIdeal: '500–1000',
    profileLengthLong: 'до 1500',
    profileLengthMax: 'до 2500 (форматы)',
    profileEmoji: 'Эмодзи',
    profileEmojiNone: 'без эмодзи',
    profileEmojiFew: 'мало · 1–3',
    profileEmojiFree: 'много',
    profileLink: 'Ссылки',
    profileLinkNone: 'без ссылок',
    profileLinkEnd: 'одна в конце',
    profileLinkInline: 'внутри текста',
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
    profileClose: 'Закрыть',
    profileFailed: 'Карточка не загрузилась.',
    profileSaveFailed: 'Карточка не сохранилась. Попробуйте ещё раз.',
    profileLoading: 'Загружаем карточку',

    /* --- Форматы ----------------------------------------------------------- */
    formatAuto: 'выберем сами',
    formatOpinion: 'мнение',
    formatAnnouncement: 'анонс',
    formatList: 'список',
    formatExpert: 'разбор',
    formatCase: 'случай из работы',
    formatStory: 'история',
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
    foreignLabel: 'This is someone else’s text',
    foreignHintLabel: 'Hint: someone else’s text',
    foreignHint:
      'Tick this if you pasted someone else’s post or article: we will ask for ' +
      'your position and will not present their opinion as yours',
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
    manualForm: 'Fill the brief by hand',
    addFact: 'Add a fact',
    blockedUnanswered: 'Answer, or press “You decide”',

    receiptTitle: 'What we understood',
    originInput: 'from your text',
    originPerson: 'your answer',
    originAvatar: 'from the avatar',
    originMemory: 'from memory',
    originSearch: 'found by search',
    originModel: 'an assumption',
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

    slopRetry: 'Try again',

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
    profileDefaultsCaption:
      'The defaults come from the Telegram guidance; adjust them for your own channel.',
    profileAuto: 'we decide',
    profileLength: 'Length',
    profileLengthShort: 'up to 500',
    profileLengthIdeal: '500–1000',
    profileLengthLong: 'up to 1500',
    profileLengthMax: 'up to 2500 (long forms)',
    profileEmoji: 'Emoji',
    profileEmojiNone: 'none',
    profileEmojiFew: '1–3, at most two kinds',
    profileEmojiFree: 'many',
    profileLink: 'Links',
    profileLinkNone: 'none',
    profileLinkEnd: 'one at the end',
    profileLinkInline: 'inside the text',
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
    profileClose: 'Close',
    profileFailed: 'The card did not load.',
    profileSaveFailed: 'The card was not saved. Try again.',
    profileLoading: 'Loading the card',

    formatAuto: 'we pick',
    formatOpinion: 'opinion',
    formatAnnouncement: 'announcement',
    formatList: 'list',
    formatExpert: 'expert take',
    formatCase: 'case from work',
    formatStory: 'story',
  },
} as const;

export type IntakeWords = (typeof intakeCopy)[IntakeLocale];
