/**
 * Слова заготовок и адаптаций, на двух языках.
 *
 * Тот же выбор, что у входа (`intake.copy.ts`) и у всего раздела «Контент»:
 * два языка прямо в исходнике, а не шестнадцать ключей i18next вокруг
 * перевода, которого нет. Экран открывается вкладкой раздела и делит с ним
 * `resolveContentLocale`.
 *
 * Слова состояний — не украшение, а сам продукт. Пустая клетка называется
 * «ещё нет» и рисуется спокойно: решение владельца 06.09.2026 (§11.7 карты
 * раздела) запрещает читать её как долг. Ни одного счётчика «заполнено N из
 * M» здесь нет и быть не должно.
 */

import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';

export type PiecesLocale = 'ru' | 'en';

export const piecesCopy = {
  ru: {
    /* --- Список ---------------------------------------------------------- */
    title: 'Заготовки',
    lead: 'Заготовка — суть того, о чём вы хотите рассказать, без площадки. Из неё делается адаптация: пост, подпись, статья.',
    subtitle: (count: number) =>
      `${count} ${plural(count, ['заготовка', 'заготовки', 'заготовок'])}`,
    newPiece: 'Новая заготовка',
    searchLabel: 'Поиск по словам',
    searchPlaceholder: 'Слово из заголовка, сути или брифа…',
    // Пара фильтров читается одной фразой: «на площадке — в состоянии».
    // «Ещё нет в…» была той же фразой с намертво вписанным состоянием.
    platformFilterLabel: 'Площадка',
    platformFilterAll: 'Все',
    stateFilterLabel: 'Состояние',
    stateFilterAll: 'Любое',
    columnsLabel: 'Площадки',
    columnsHint: 'Отмеченные площадки остаются колонками; остальные — в «ещё N».',
    columnCode: 'Код',
    columnTitle: 'Заголовок',
    columnFormat: 'Формат',
    columnDate: 'Дата',
    columnRest: (count: number) => `ещё ${count}`,
    more: (count: number) => `ещё ${count}`,

    /* --- Клетка ---------------------------------------------------------- */
    statePublished: 'опубликовано',
    stateQueued: 'запланировано',
    stateDraft: 'черновик',
    stateError: 'не ушло',
    stateNone: 'ещё нет',
    stateNoChannel: 'нет канала',
    stateUnknown: 'пока не знаем',
    noChannelReason: 'Подключите канал, чтобы писать сюда.',
    unknownReason: 'Публикации ещё не прочитаны — состояние появится само.',
    cellLabel: (platform: string, state: string) => `${platform}: ${state}`,
    // Подсказка клетки собирается из того, что приехало: имени канала в
    // ответе нет, и предложения про канал в ней нет тоже.
    cellWhenPublished: (day: string) => `Вышло ${day}.`,
    cellWhenQueued: (day: string, time: string) =>
      `Выйдет ${day} в ${time}.`,
    cellChannels: (count: number) =>
      `${count} ${plural(count, ['канал', 'канала', 'каналов'])} площадки.`,
    cellOpensPost: 'Нажмите, чтобы открыть пост.',
    cellOpensAdapt: 'Нажмите, чтобы адаптировать.',
    legendLabel: 'Состояния клеток',
    legendHintLabel: 'Подсказка: состояния клеток',
    legendHint:
      'В клетке стоит состояние площадки: значок и цвет вместе, слово — в подсказке клетки. Цифра в углу — каналов этой площадки больше одного.',

    /* --- Строка и её изнанка --------------------------------------------- */
    coreMissing: 'суть не выделена',
    originThought: 'из мысли',
    originLink: 'из ссылки',
    originForeign: 'из чужого поста',
    originInstruction: 'по заданию',
    originLead: 'из повода',
    // content-factory-next-75xn.8: подпись «из повода» была на месте, а
    // вернуться к материалу, из которого повод вырос, было некуда.
    leadSourceLabel: 'источник',
    originManual: 'вручную',
    originLegacy: 'материал до заготовок',
    excerptLabel: 'Суть',
    adaptationsLabel: 'Адаптации',
    adaptationsEmpty: 'Адаптаций пока нет.',
    openPiece: 'Открыть заготовку',
    openPost: 'Открыть пост',
    adapt: 'Адаптировать',
    expand: 'Раскрыть строку',
    collapse: 'Свернуть строку',

    /* --- Пустота, загрузка, отказы ---------------------------------------- */
    loading: 'Загружаем заготовки',
    emptyTitle: 'Заготовок пока нет',
    emptyBody:
      'Заготовка — суть будущего текста без площадки. Сделайте первую: хватит одной мысли, ссылки или чужого поста.',
    emptyAction: 'Новая заготовка',
    errorTitle: 'Список не загрузился',
    errorBody: 'Заготовки на месте — попробуйте ещё раз.',
    retry: 'Попробовать снова',
    restrictedTitle: 'Здесь только читают',
    restrictedBody:
      'Делать заготовки и адаптации может редактор или администратор пространства.',

    /* --- Страница заготовки ------------------------------------------------ */
    coreTitle: 'Суть',
    coreFallback:
      'ИИ не ответил — суть собрана из брифа. Проверьте её перед адаптацией.',
    legacyTitle: 'Текст одного канала',
    /* Пока сути нет: то, что человек прислал, стоит на её месте (97dq.25). */
    sentPersonTitle: 'Ваш текст',
    sentSourceTitle: 'Чужой пост, на который вы отвечаете',
    sentLinkTitle: 'Что вы прислали',
    sentInstructionTitle: 'Ваше задание',
    legacyWarning:
      'Это старый материал: тело — текст одного канала, а не нейтральная суть. Адаптация будет опираться на него как есть.',
    slopTitle: 'Проверка на штампы',
    slopAtCreation: 'Считана при создании сути, а не по кнопке.',
    /* Подпись строкой под сутью: та же проверка, свёрнутая до одного слова. */
    slopNoFindings: 'находок нет',
    slopFound: (count: number) =>
      `${count} ${plural(count, ['находка', 'находки', 'находок'])}`,
    ownNumberHas: 'своё число есть',
    ownNumberNone: 'своего числа нет',
    breadcrumbSection: 'Контент',
    backToList: 'Все заготовки',
    laterShort: 'видео и аудио — позже',
    slopRewriteNote:
      'Советуем переписать. Адаптировать это не мешает — решаете вы.',
    targetsTitle: 'Куда адаптировать',
    formatAutomatic: 'Подберём при адаптации',
    laterTitle: 'Позже',
    laterBody: 'Видео и аудио появятся здесь позже — сейчас их нет.',
    kindLabel: 'Вид адаптации',
    kindPost: 'пост',
    kindCaption: 'подпись',
    kindArticle: 'статья',
    kindNewsletter: 'письмо',
    kindVideo: 'видео',
    kindAudio: 'аудио',
    toChannels: 'К каналам',
    adapting: 'Адаптируем…',
    cancel: 'Отменить',
    chooseChannel: 'Выберите канал',
    deleteAdaptation: 'Удалить адаптацию',
    deleteRefusedPublished:
      'Адаптация опубликована. Происхождение опубликованного текста не стирается.',
    pieceErrorTitle: 'Заготовка не открылась',
    pieceNotFound: 'Такой заготовки нет.',
    archived: 'в архиве',
    archive: 'В архив',
    archiveDone: 'Заготовка убрана в архив. Опубликованные посты остались на месте.',
    archiveRefused: 'Заготовка уже в архиве.',
    // Удаление (`97dq.30`): взведённая кнопка сама называет, что произойдёт.
    deletePiece: 'Удалить',
    deletePieceArmed: 'Удалить насовсем?',
    deletePieceDone: 'Заготовка удалена. Посты в каналах остались на месте.',
    ownNumberLabel: 'Можно добавить',
    ownNumberBody: 'В этой заготовке нет вашего числа.',
    ownNumberOptional:
      'Заготовка готова и адаптируется как есть — отвечать не обязательно.',

    /* --- Интервью ---------------------------------------------------------- */
    interviewBadge: 'Уточнение',
    interviewTitle: (count: number) =>
      `${count} ${plural(count, ['вопрос', 'вопроса', 'вопросов'])} — и пишем`,
    interviewLead:
      'Предлагаем первой. Согласитесь, поправьте или отдайте решение нам.',
    suggestedLead: 'Я думаю, вот так',
    answerYes: 'Так и есть',
    answerFix: 'Поправить',
    answerDecide: 'Решите за меня',
    answerDecideAll: 'Решите всё за меня',
    answerSkip: 'Пропустить',
    ownAnswerLabel: 'Ваш ответ',
    ownAnswerHint: 'Пойдёт в текст дословно.',
    ownOptionPlaceholder:
      'Напишите, с чем согласны, а с чем нет — одним-двумя предложениями',
    skipInterview: 'Пропустить интервью',
    interviewSend: 'Дальше',
    interviewExhausted:
      'Больше спрашивать не будем: два круга — предел. Дальше решим сами.',

    /* --- Уточнение заготовки ----------------------------------------------- */
    // `content-factory-next-m2eg`: вопросы приезжают вместе с заготовкой и
    // живут здесь, рядом с сутью, которую они правят.
    clarifyLead:
      'Заготовка уже сохранена. Ответьте — и суть перепишется с вашими словами; не ответите — останется как есть.',
    clarifySkip: 'Оставить как есть',
    clarifyBusy: 'Переписываем суть…',
    clarifyDone: 'Суть переписана с вашими словами.',
    clarifyFailed: 'Ответ не сохранился. Попробуйте ещё раз.',

    /* --- Тело адаптации ----------------------------------------------------- */
    // `content-factory-next-97dq.4`: тело хранится с `**жирным**`, и до этой
    // волны человек читал свой будущий пост со звёздочками посреди фразы.
    showMarkup: 'Показать разметку',
    hideMarkup: 'Скрыть разметку',

    /* --- Опоры текста ------------------------------------------------------- */
    textSourcesTitle: 'Опоры текста',
    textSourcesHintLabel: 'Подсказка: опоры текста',
    textSourcesHint:
      'Что нашёл ресерч по вашей теме: утверждение своими словами, цитата и адрес. Отмеченные строки идут в адаптации и в следующую переписку сути. Уже написанный текст галочка не меняет.',

    /* --- Проверка адаптации -------------------------------------------------- */
    // Все слова проверки живут здесь, а не в `adaptation-review.tsx`: до
    // 18.09.2026 их было четыре десятка прямо в разметке, и ни одно нельзя
    // было прочитать, не открыв компонент.
    reviewWhy: 'Почему',
    reviewIncomplete: 'Неполный результат проверки.',
    researchIncomplete: 'Неполный результат ресерча.',
    researchStale: 'Результат ресерча устарел.',
    publish: 'Опубликовать',
    regenerate: 'Перегенерировать',
    regenerateDescription:
      'Скажете, что поменять: заголовок, абзац или весь текст.',
    addResearch: 'Дополнить ресерчем',
    checkFacts: 'Проверить факты',
    checkFactsSearch: 'Проверить факты поиском',
    checkFactsSearchDescription: 'Найдём источники по каждому числу и дате.',
    checkFactsSpendLabel: 'Подсказка: расход на проверку фактов',
    checkFactsSpend:
      'Поиск и ИИ могут расходовать включённый лимит или средства подключённого провайдера. Источники могут охватить не все утверждения.',
    reviewMenu: 'Ещё ▾',
    // Владелец, 18.09.2026: «убрать штампы» называло список каталога, а
    // человек ждал, что текст перестанет читаться как машинный.
    removeAiTells: 'Убрать следы ИИ',
    removeAiTellsDescription:
      'Найдём обороты, по которым текст читается как написанный ИИ, и предложим правки. Штампы уберём заодно.',
    compareCore: 'Сверить с сутью',
    compareCoreDescription:
      'Проверим, что пост говорит то же, что заготовка, и ничего не добавил от себя.',
    reviewBoth: 'И то и другое',
    reviewBothDescription: 'Следы ИИ и сверка с сутью за один проход.',
    lastChoice: ' · Последний выбор',
    rewritePrompt: 'Что перегенерировать?',
    rewriteOnlyTitle: 'Только заголовок',
    rewriteWholeText: 'Весь текст',
    regenerating: 'Перегенерируем…',
    cancelAction: 'Отмена',
    findingSources: 'Ищем опоры…',
    runResearch: 'Запустить ресерч',
    researchDirection: 'Куда копать',
    researchDirectionExample:
      'Например: свежие цифры за 2026 год. Можно оставить пустым',
    saving: 'Сохраняем…',
    reviewing: 'Проверяем текст…',
    noChangesNeeded: 'Правки не понадобились.',
    // Одна фраза о штампах на две поверхности: строка результата проверки и
    // строка качества после принятой правки.
    slopBeforeAfter: (before: number, after: number) =>
      `Штампов по каталогу: было ${before} → стало ${after}`,
    slopCatalogNote:
      'Считаем по каталогу бесплатно; «Убрать следы ИИ» — один проход ИИ по этому списку.',
    // Сомнение владельца на прогоне 18.09.2026: «Я не уверен, что убрали
    // именно те штампы, которые были». Два списка — ответ на него: что ушло и
    // что осталось, отрывками из текста, а не числом.
    catalogRemoved: 'Ушло:',
    catalogRemaining: 'Осталось:',
    catalogMore: (count: number) => `и ещё ${count}`,
    quoted: (text: string) => `«${text}»`,
    claimsChecked: (count: number) => `Проверено утверждений: ${count}`,
    searchQueries: 'Что искали',
    typoPrefix: 'Исправление опечатки: ',
    acceptSelected: 'Принять выбранные',
    leaveUnchanged: 'Оставить как было',
    searchSources: 'Источники поиска',
  },
  en: {
    title: 'Pieces',
    lead: 'A piece is the substance of what you want to say, with no platform attached. An adaptation is made from it: a post, a caption, an article.',
    subtitle: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
    newPiece: 'New piece',
    searchLabel: 'Search by words',
    searchPlaceholder: 'A word from the title, the substance or the brief…',
    platformFilterLabel: 'Platform',
    platformFilterAll: 'All',
    stateFilterLabel: 'State',
    stateFilterAll: 'Any',
    columnsLabel: 'Platforms',
    columnsHint: 'Ticked platforms stay columns; the rest fold into “N more”.',
    columnCode: 'Code',
    columnTitle: 'Title',
    columnFormat: 'Format',
    columnDate: 'Date',
    columnRest: (count: number) => `${count} more`,
    more: (count: number) => `${count} more`,

    statePublished: 'published',
    stateQueued: 'scheduled',
    stateDraft: 'draft',
    stateError: 'did not go out',
    stateNone: 'not yet',
    stateNoChannel: 'no channel',
    stateUnknown: 'not known yet',
    noChannelReason: 'Connect a channel to write here.',
    unknownReason:
      'The posts have not been read yet — the state will appear on its own.',
    cellLabel: (platform: string, state: string) => `${platform}: ${state}`,
    cellWhenPublished: (day: string) => `Went out ${day}.`,
    cellWhenQueued: (day: string, time: string) =>
      `Goes out ${day} at ${time}.`,
    cellChannels: (count: number) =>
      `${count} ${count === 1 ? 'channel' : 'channels'} of this platform.`,
    cellOpensPost: 'Press to open the post.',
    cellOpensAdapt: 'Press to adapt.',
    legendLabel: 'Cell states',
    legendHintLabel: 'Hint: cell states',
    legendHint:
      'A cell carries the state of the platform: the icon and the colour together, the word in the cell’s own hint. A digit in the corner means the platform has more than one channel.',

    coreMissing: 'substance not extracted',
    originThought: 'from a thought',
    originLink: 'from a link',
    originForeign: 'from somebody else’s post',
    originInstruction: 'from an instruction',
    originLead: 'from a lead',
    leadSourceLabel: 'source',
    originManual: 'by hand',
    originLegacy: 'material from before pieces',
    excerptLabel: 'Substance',
    adaptationsLabel: 'Adaptations',
    adaptationsEmpty: 'No adaptations yet.',
    openPiece: 'Open the piece',
    openPost: 'Open the post',
    adapt: 'Adapt',
    expand: 'Expand the row',
    collapse: 'Collapse the row',

    loading: 'Loading the pieces',
    emptyTitle: 'No pieces yet',
    emptyBody:
      'A piece is the substance of a future text without a platform. Make the first one: a thought, a link or somebody else’s post is enough.',
    emptyAction: 'New piece',
    errorTitle: 'The list did not load',
    errorBody: 'The pieces are intact — try again.',
    retry: 'Try again',
    restrictedTitle: 'This is read-only here',
    restrictedBody:
      'Making pieces and adaptations belongs to an editor or an administrator of the workspace.',

    coreTitle: 'Substance',
    coreFallback:
      'AI did not answer — the substance was assembled from the brief. Check it before adapting.',
    legacyTitle: 'Text of one channel',
    sentPersonTitle: 'Your text',
    sentSourceTitle: 'The post you are answering',
    sentLinkTitle: 'What you sent',
    sentInstructionTitle: 'Your instruction',
    legacyWarning:
      'This is older material: the body is one channel’s text, not neutral substance. An adaptation will lean on it as it is.',
    slopTitle: 'Cliché check',
    slopAtCreation: 'Taken when the substance was written, not on a button.',
    slopNoFindings: 'no findings',
    slopFound: (count: number) =>
      `${count} ${count === 1 ? 'finding' : 'findings'}`,
    ownNumberHas: 'a figure of yours is there',
    ownNumberNone: 'no figure of yours',
    breadcrumbSection: 'Content',
    backToList: 'All pieces',
    laterShort: 'video and audio — later',
    slopRewriteNote:
      'We suggest a rewrite. That does not stop an adaptation — you decide.',
    targetsTitle: 'Where to adapt',
    formatAutomatic: 'Chosen during adaptation',
    laterTitle: 'Later',
    laterBody: 'Video and audio will appear here later — they are not here now.',
    kindLabel: 'Kind of adaptation',
    kindPost: 'post',
    kindCaption: 'caption',
    kindArticle: 'article',
    kindNewsletter: 'newsletter',
    kindVideo: 'video',
    kindAudio: 'audio',
    toChannels: 'To the channels',
    adapting: 'Adapting…',
    cancel: 'Cancel',
    chooseChannel: 'Pick a channel',
    deleteAdaptation: 'Delete the adaptation',
    deleteRefusedPublished:
      'The adaptation is published. The provenance of a published text is not erased.',
    pieceErrorTitle: 'The piece did not open',
    pieceNotFound: 'There is no such piece.',
    archived: 'archived',
    archive: 'Archive',
    archiveDone: 'The piece is put away. Published posts stay where they are.',
    archiveRefused: 'The piece is already archived.',
    deletePiece: 'Delete',
    deletePieceArmed: 'Delete for good?',
    deletePieceDone: 'The piece is deleted. Posts in the channels stay where they are.',
    ownNumberLabel: 'You could add',
    ownNumberBody: 'This piece carries no figure of yours.',
    ownNumberOptional:
      'The piece is ready and adapts as it is — answering is optional.',

    interviewBadge: 'One thing to clear up',
    interviewTitle: (count: number) =>
      `${count} ${count === 1 ? 'question' : 'questions'} and we write`,
    interviewLead:
      'We offer first. Agree, correct it, or hand the decision back.',
    suggestedLead: 'I think it goes like this',
    answerYes: 'That is right',
    answerFix: 'Correct it',
    answerDecide: 'You decide',
    answerDecideAll: 'You decide everything',
    answerSkip: 'Skip',
    ownAnswerLabel: 'Your answer',
    ownAnswerHint: 'It goes into the text word for word.',
    ownOptionPlaceholder:
      'Say what you agree with and what you do not — one or two sentences',
    skipInterview: 'Skip the interview',
    interviewSend: 'Next',
    interviewExhausted:
      'We will not ask again: two rounds is the limit. We decide from here.',

    clarifyLead:
      'The piece is already saved. Answer and the substance is rewritten with your words; leave it and it stays as it is.',
    clarifySkip: 'Leave it as it is',
    clarifyBusy: 'Rewriting the substance…',
    clarifyDone: 'The substance is rewritten with your words.',
    clarifyFailed: 'The answer was not saved. Try again.',

    showMarkup: 'Show markup',
    hideMarkup: 'Hide markup',

    textSourcesTitle: 'Text sources',
    textSourcesHintLabel: 'Hint: text sources',
    textSourcesHint:
      'What research found on your topic: a plain-language claim, a quote, and its address. Ticked rows go into adaptations and into the next rewrite of the substance. A tick changes no text that is already written.',

    reviewWhy: 'Why',
    reviewIncomplete: 'Incomplete review.',
    researchIncomplete: 'Incomplete research result.',
    researchStale: 'Research result expired.',
    publish: 'Publish',
    regenerate: 'Regenerate',
    regenerateDescription:
      'Tell us what to change: the title, a paragraph or the whole text.',
    addResearch: 'Add research',
    checkFacts: 'Check facts',
    checkFactsSearch: 'Check facts with search',
    checkFactsSearchDescription: 'We find sources for every figure and date.',
    checkFactsSpendLabel: 'Hint: what the fact check spends',
    checkFactsSpend:
      'Search and AI may use your included allowance or incur charges with your connected provider. Sources may not cover every claim.',
    reviewMenu: 'More ▾',
    removeAiTells: 'Remove AI tells',
    removeAiTellsDescription:
      'We find the turns of phrase that make the text read as AI-written and suggest edits. Clichés go with them.',
    compareCore: 'Compare with core',
    compareCoreDescription:
      'We check that the post says the same thing as the piece and added nothing of its own.',
    reviewBoth: 'Both',
    reviewBothDescription: 'AI tells and the comparison with the core in one pass.',
    lastChoice: ' · Last choice',
    rewritePrompt: 'What should change?',
    rewriteOnlyTitle: 'Only title',
    rewriteWholeText: 'Whole text',
    regenerating: 'Regenerating…',
    cancelAction: 'Cancel',
    findingSources: 'Finding sources…',
    runResearch: 'Run research',
    researchDirection: 'Research direction',
    researchDirectionExample:
      'For example: current figures for 2026. You can leave this empty.',
    saving: 'Saving…',
    reviewing: 'Reviewing…',
    noChangesNeeded: 'No changes needed.',
    slopBeforeAfter: (before: number, after: number) =>
      `Catalog clichés: ${before} → ${after}`,
    slopCatalogNote:
      'The catalog count is free; “Remove AI tells” is one AI pass over that list.',
    catalogRemoved: 'Gone:',
    catalogRemaining: 'Still there:',
    catalogMore: (count: number) => `and ${count} more`,
    quoted: (text: string) => `“${text}”`,
    claimsChecked: (count: number) => `Claims checked: ${count}`,
    searchQueries: 'What we searched for',
    typoPrefix: 'Typo: ',
    acceptSelected: 'Accept selected',
    leaveUnchanged: 'Leave unchanged',
    searchSources: 'Search sources',
  },
} as const;

export type PiecesWords = (typeof piecesCopy)[PiecesLocale];
