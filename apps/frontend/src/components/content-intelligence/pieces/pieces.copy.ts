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
    // План канала (`97dq.57`): бронь времени — не черновик.
    statePlanned: 'в плане',
    cellWhenPlanned: (day: string, time: string) => `В плане на ${day} ${time}.`,
    planAutopilot: 'автопилот',
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
    cellOpensPost: 'Нажмите, чтобы открыть адаптацию.',
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
    adaptStreamIncomplete:
      'Ответ с адаптацией пришёл не целиком — попробуйте ещё раз.',
    retry: 'Попробовать снова',
    restrictedTitle: 'Здесь только читают',
    restrictedBody:
      'Делать заготовки и адаптации может редактор или администратор пространства.',

    /* --- Страница заготовки ------------------------------------------------ */
    coreTitle: 'Суть',
    coreFallback:
      'ИИ не ответил — суть собрана из брифа. Проверьте её перед адаптацией.',
    legacyTitle: 'Текст одного канала',
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
    cancel: 'Отменить',
    chooseChannel: 'Выберите канал',
    // Правая панель настроек (`97dq.71`): тянется за край и прячется.
    settingsPanelLabel: 'Настройки поста',
    settingsPanelResize: 'Ширина панели настроек: тяните или стрелками',
    settingsPanelHide: 'Скрыть настройки',
    settingsPanelShow: 'Показать настройки',
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
    // Одно имя у «модель решает всё сама» — и у входа, и у адаптации
    // (разбор связности B6, `content-factory-next-97dq.31`).
    skipInterview: 'Решите всё за меня',
    /** Свои слова вместо вариантов, когда предложения модели нет. */
    ownAnswer: 'Свой ответ',
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
    // `97dq.46`, одиннадцатый заход: «Показать разметку» ушла — правят текст
    // в режиме «Редактировать», жирное видно жирным и там.
    editText: 'Редактировать',
    editDone: 'Готово',
    editOpening: 'Открываем редактор…',
    editLockedQueued:
      'Пост уже уходит в канал: править его здесь поздно.',

    /* --- Опоры текста ------------------------------------------------------- */
    textSourcesHintLabel: 'Подсказка: опоры текста',
    textSourcesHint:
      'Что нашёл поиск в интернете по вашей теме: утверждение своими словами, цитата и адрес. Отмеченные строки идут в адаптации и в следующую переписку сути. Уже написанный текст галочка не меняет.',

    /* --- Рабочее место заготовки (97dq.37) ----------------------------- */
    // Одно имя на одно действие (§4 спецификации): «Проверить факты»,
    // «Решите всё за меня», «Отменить», «Попробовать снова».
    tabsLabel: 'Суть и каналы',
    tabCore: 'Суть',
    tabMoreChannels: 'Ещё канал',
    titleEdit: 'Изменить заголовок',
    titleLabel: 'Заголовок',
    titleSave: 'Сохранить',
    titleFailed: 'Заголовок не сохранён. Попробуйте ещё раз.',
    factSelectFailed: 'Выбор не сохранён. Попробуйте ещё раз.',
    sentTitle: 'Что вы прислали',
    sentKindPerson: 'свой текст',
    sentKindSource: 'чужой пост',
    sentKindLink: 'ссылка',
    sentKindInstruction: 'задание',
    sentAsIs: 'как есть, до правок',
    coreWaiting: 'Суть появится после ответов. Можно нажать «Решите за меня».',
    whereNextTitle: 'Куда дальше',
    noChannelsYet:
      'Каналов пока нет. Подключите первый — и здесь появится его вкладка.',
    variantsCount: (count: number) =>
      `${count} ${plural(count, ['вариант', 'варианта', 'вариантов'])}`,
    openChannel: 'Открыть',
    receiptUnderstoodAs: 'Понято как',
    receiptForeignWithLink: 'чужой пост + ссылка',
    receiptMaterial: 'Материал',
    textSourcesCount: (count: number) => `Опоры текста · ${count}`,
    textSourcesLead:
      'Отмеченное идёт в адаптации. Уже написанный текст галочка не меняет.',
    textSourcesOpen: 'Раскрыть',
    textFor: (platform: string) => `Текст для ${platform}`,
    variantsLabel: 'Варианты текста',
    variant: (index: number) => `Вариант ${index}`,
    autosaveIdle: 'правки сохраняются сами',
    autosaveSaving: 'сохраняем…',
    autosaveSaved: (time: string) => `правки сохранены · ${time}`,
    autosaveFailed: 'Правка не сохранилась. Текст на экране — ваш, он не пропал.',
    textInPost: 'Текст доступен в посте.',
    noAdaptationLead: (channel: string) =>
      `Для «${channel}» текста ещё нет. Напишем его из сути — под этот канал и его привычки.`,
    adaptFor: (platform: string) => `Адаптировать для ${platform}`,
    adaptingFor: (channel: string) => `Адаптируем для «${channel}»…`,
    interviewTakeawayLead:
      'Один вопрос перед текстом — ответ пойдёт в текст по смыслу. Не хотите отвечать — «Решите всё за меня».',
    interviewAdaptLead: (count: number) =>
      count === 1
        ? 'Вопрос под этот канал — ответ пойдёт в текст по смыслу. Не хотите отвечать — «Решите всё за меня».'
        : 'Вопросы под этот канал — ответы пойдут в текст по смыслу. Не хотите отвечать — «Решите всё за меня».',
    previewTitle: (platform: string) => `Как увидят в ${platform}`,
    previewSwitch: 'Текст или как увидят',
    previewText: 'Текст',
    toolbarLabel: 'Оформление текста',
    /* --- Ссылка для поста и правка заготовки (`97dq.75`) ---------------- */
    postLinkLabel: 'Ссылка для поста',
    postLinkHint:
      'Ссылка, которую поставим в этот пост. Сначала здесь ваш ответ на вопрос «Какую ссылку поставить в пост?». Измените её — новая встанет при переписывании. Очистите поле — в этом посте ссылки не будет. Своих адресов мы не придумываем.',
    postLinkFromPiece: 'как в заготовке',
    postLinkNoneForPost: 'без ссылки в этом посте',
    postLinkNotChosen: 'ссылку ещё не выбрали',
    receiptPostLink: 'Ссылка',
    receiptPostLinkNone: 'без ссылки',
    postLinkChange: 'Изменить',
    coreEdit: 'Править суть',
    coreEditDone: 'Готово',
    coreEditHint:
      'Правка сохраняется сама. Прежний текст сути остаётся в истории заготовки. Адаптации сами не переписываются: перепишите их во вкладке канала.',
    coreEditLabel: 'Текст сути',
    coreEditFailed: 'Правка не сохранилась. Текст на экране — ваш, попробуйте ещё раз.',
    coreEditRetry: 'Сохранить ещё раз',
    coreEditedByYou: 'правлено вами',
    materialTitle: 'Дописать материал',
    materialHint:
      'Дописанное станет частью материала заготовки — как будто вы прислали это сразу. Суть сама не меняется: нажмите «Пересобрать суть», когда будете готовы.',
    materialPlaceholder: 'Факт, случай, число, мысль — что добавить',
    materialAdd: 'Добавить к материалу',
    materialAdding: 'Добавляем к материалу',
    materialAddFailed: 'Не добавилось. Текст в поле — попробуйте ещё раз.',
    materialAddedCount: (count: number) =>
      count === 1 ? 'Дописано 1 раз' : `Дописано раз: ${count}`,
    materialPending: 'Суть ещё не учитывает дописанное.',
    coreRebuild: 'Пересобрать суть',
    coreRebuildHint:
      'Суть напишется заново по всему материалу: тому, что вы прислали, ответам и дописанному. Прежний текст останется в истории заготовки. Это один запрос к ИИ.',
    coreRebuilding: 'Пересобираем суть',
    coreRebuildFailed: 'Не удалось пересобрать суть. Прежний текст на месте — попробуйте ещё раз.',
    toolBold: 'Жирный',
    toolBoldGlyph: 'Ж',
    toolItalic: 'Курсив',
    toolItalicGlyph: 'К',
    toolUnderline: 'Подчёркнутый',
    toolUnderlineGlyph: 'Ч',
    toolLink: 'Ссылка',
    toolEmoji: 'Эмодзи',
    emojiSearch: 'Найти эмодзи',
    toolImage: 'Картинка из медиатеки',
    editorLabel: (platform: string) => `Текст поста для ${platform}`,
    counter: (count: number, max: number) => `${count} из ${max} знаков`,
    counterNoMax: (count: number) =>
      `${count} ${plural(count, ['знак', 'знака', 'знаков'])}`,
    overLimit: (extra: number) =>
      `Длиннее, чем принимает площадка, на ${extra} ${plural(extra, [
        'знак',
        'знака',
        'знаков',
      ])}. Сократите текст или попросите «Короче».`,
    linkAddress: 'Адрес ссылки',
    linkPlaceholder: 'https://…',
    linkInvalid: 'Это не похоже на адрес. Проверьте его.',
    linkInsert: 'Вставить',
    linkSave: 'Сохранить ссылку',
    linkRemove: 'Убрать ссылку',
    linkHint:
      'Выделите слова и вставьте адрес — слова станут ссылкой. Без выделения адрес встанет туда, где курсор. Только http и https.',
    linkHintLabel: 'Как вставить ссылку',
    imageAttached: 'Картинка к посту',
    imageRemove: 'Убрать картинку',
    imageAlt: 'Картинка к посту',
    postOptionsChanges: (count: number) =>
      `${count} ${plural(count, ['изменение', 'изменения', 'изменений'])}`,
    asInChannel: (value: string | null) =>
      value ? `как в канале · ${value}` : 'как в канале',
    whoSpeaks: 'Кто говорит',
    hintWhoSpeaks: 'От чьего лица написать этот пост. Настройка канала не меняется.',
    speakerChannel: 'Как в канале',
    lengthShorter: 'короче',
    lengthLonger: 'длиннее',
    wishLabel: 'Пожелание',
    wishPlaceholder: 'Например: начни с вопроса',
    hintWish: 'Одна просьба своими словами — только к этому посту.',
    rewriteWithThis: 'Переписать по настройкам',
    remembering: 'Запоминаем для канала',
    rememberFailed: 'Не запомнилось. Попробуйте ещё раз.',
    whenLabel: 'Когда',
    schedule: 'Запланировать',
    scheduleHint: 'Выйдет в выбранный день и час.',
    scheduleMore: 'Другие способы отправить',
    publishNow: 'Опубликовать сейчас',
    publishNowHint: 'Уйдёт в канал сразу, без расписания.',
    scheduling: 'Ставим в расписание',
    publishingNow: 'Отправляем в канал',
    scheduledDone: 'Пост в расписании.',
    publishedDone: 'Пост отправлен в канал.',
    scheduleFailed: 'Не получилось отправить. Попробуйте ещё раз.',
    openInCalendar: 'Открыть в календаре',
    unschedule: 'Снять с расписания',
    unscheduling: 'Снимаем с расписания',
    unscheduledDone: 'Пост снят с расписания и снова черновик — его можно править.',
    deletingAdaptation: 'Удаляем адаптацию',
    /* Строка плана наверху вкладки и одна панель настроек (`97dq.70`). */
    planRowDraft: 'Черновик',
    planRowReserved: (when: string) => `В плане на ${when} · бронь`,
    planRowQueued: (when: string) => `В очереди на ${when}`,
    planConfirm: 'Подтвердить',
    planChangeTime: 'Сменить время',
    planChangeTimeHint: 'Покажет выбор дня и часа. «Подтвердить» поставит пост на новое время.',
    planDrop: 'Снять из плана',
    planDropHint: 'Бронь уйдёт, пост останется черновиком.',
    planReservedMore: 'Другие действия с бронью',
    planEditTime: 'Изменить время',
    planNewTime: 'Новое время',
    planQueuedMore: 'Другие действия с постом в очереди',
    unscheduleHint: 'Пост вернётся в черновик, его снова можно править.',
    openInCalendarHint: 'Покажет пост среди остальных в календаре.',
    planMoving: 'Переносим',
    planMove: 'Перенести',
    planMoveFailed: 'Время не поменялось. Попробуйте ещё раз.',
    settingsSaving: 'Сохраняем…',
    settingsSaved: (time: string) => `Сохранено · ${time}`,
    settingsSaveFailed: 'Настройки не сохранились. Попробуйте ещё раз.',
    saveForPost: 'Сохранить для поста',
    saveForChannel: 'Сохранить для канала',
    saveForChannelHint: 'Эти значения станут готовыми настройками канала для новых постов.',
    saveMore: 'Где ещё сохранить',
    savedForChannel: 'Сохранено для канала: так будут писаться новые посты.',
    rewriteAndRemember: 'Переписать и запомнить для канала',
    rewriteAndRememberHint: 'Новый вариант, и эти значения станут готовыми настройками канала.',
    rewriteMore: 'Другие способы переписать',
    appliesOnRewrite: 'применится при переписывании',
    imageFailed: 'Картинка не прикрепилась. Попробуйте ещё раз.',
    actionsLabel: 'Действия с текстом',
    rewriteOpen: 'Переписать…',
    rewriteRun: 'Переписать',
    avatarUnnamed: 'Без имени',
    interviewChannelLead: (channel: string) =>
      `Не хватает для канала «${channel}». Ответьте — или «Решите всё за меня».`,

    /* --- Проверка адаптации -------------------------------------------------- */
    // Все слова проверки живут здесь, а не в `adaptation-review.tsx`: до
    // 18.09.2026 их было четыре десятка прямо в разметке, и ни одно нельзя
    // было прочитать, не открыв компонент.
    reviewWhy: 'Почему',
    reviewIncomplete: 'Неполный результат проверки.',
    researchIncomplete: 'Неполный результат поиска.',
    researchStale: 'Результат поиска устарел.',
    // 2q28.33: «ресерч» — внутреннее слово; на экране — что будет сделано.
    addResearch: 'Дополнить из интернета',
    checkFacts: 'Проверить факты',
    checkFactsSpendLabel: 'Подсказка: расход на проверку фактов',
    checkFactsSpend:
      'Поиск и ИИ могут расходовать включённый лимит или средства подключённого провайдера. Источники могут охватить не все утверждения.',
    // Владелец, 18.09.2026: «убрать штампы» называло список каталога, а
    // человек ждал, что текст перестанет читаться как машинный.
    removeAiTells: 'Убрать следы ИИ',
    rewritePrompt: 'Что перегенерировать?',
    rewriteOnlyTitle: 'Только заголовок',
    rewriteWholeText: 'Весь текст',
    regenerating: 'Перегенерируем…',
    findingSources: 'Ищем опоры…',
    runResearch: 'Начать поиск',
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
    /* --- Настройки поста до текста и одна перепись (`97dq.78`) ----------- */
    adaptAction: 'Адаптировать',
    resetToChannel: 'Вернуть как в канале',
    resetToChannelHint:
      'Все поля поста снова берут значения канала. Текст не меняется, пока его не переписать.',
    postLinkRestore: 'Вернуть ссылку из заготовки',
    /* --- Пост в очереди правится до выхода (`97dq.80`) -------------------- */
    queuedEditUntil: (time: string) =>
      `Правки уйдут в пост, если сохранить до ${time}`,
    /* --- Версии сути (`97dq.85`) ----------------------------------------- */
    coreVersionsTitle: 'Версии сути',
    coreVersionsHint:
      'Прежние тексты сути: до вашей правки, до пересборки и до возврата версии. Хранятся самый первый текст и последние 19. Любую можно вернуть — текущая суть тогда тоже останется в версиях.',
    coreVersionsCount: (count: number) => `прежних: ${count}`,
    coreVersionByYou: 'вы',
    coreVersionByAi: 'ИИ',
    coreVersionUntil: (at: string) => `была сутью до ${at}`,
    coreVersionShow: 'Показать текст',
    coreVersionHide: 'Скрыть текст',
    coreVersionRestore: 'Вернуть эту версию',
    coreVersionRestoreHint:
      'Этот текст снова станет сутью, текущий сохранится в версиях. Без запроса к ИИ; адаптации не переписываются сами.',
    coreVersionRestoring: 'Возвращаем версию',
    coreVersionRestoreFailed:
      'Версия не вернулась. Текущая суть на месте — попробуйте ещё раз.',
    /* --- Ревью 97dq.78–80: правка поста в очереди и удаление --------------- */
    queuedSave: 'Сохранить в пост',
    queuedSaving: 'Сохраняем в пост…',
    queuedSaved: (time: string) => `Сохранено в пост в ${time}`,
    queuedUnsaved:
      'Правки ещё не в посте: они уйдут в канал только после «Сохранить в пост».',
    queuedMissed:
      'Правки не успели в пост: он уже уходит в канал с прежним текстом.',
    deleteAdaptationArmed: 'Удалить эту адаптацию?',
    deleteWholePieceArmed: 'Удалить всю заготовку?',
    /* --- Материала мало: необязательные вопросы (`97dq.98`) --------------- */
    materialAskLabel: 'Вопросы к материалу',
    materialAskNotice: (length: number, min: number) =>
      `Материала на ~${length} знаков, канал ждёт от ${min}. Можно ответить на вопросы ниже — пост станет полнее. Необязательно.`,
    materialAskNoticeHint:
      'Знаки считаются, как в счётчике под текстом: без разметки. «От» — нижняя граница длины из настроек этого поста или канала. Сами мы ничего не дописываем: пост станет полнее, только если вы расскажете больше.',
    materialAskNoticeHintLabel: 'Подсказка: откуда эти числа',
    materialAskPlaceholder: 'Можно коротко, своими словами',
    materialAskUse: 'Дополнить пост',
    materialAskUsing: 'Дополняем пост',
    materialAskUseHint:
      'Ответы станут частью материала заготовки, суть пересоберётся, и пост для этого канала перепишется по его настройкам. Это два запроса к ИИ. Вопросы без ответа ничего не меняют.',
    materialAskUseHintLabel: 'Подсказка: что сделает «Дополнить пост»',
    materialAskDismiss: 'Не нужно',
    materialAskFailed: 'Ответы не сохранились. Они остались в полях — попробуйте ещё раз.',
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
    statePlanned: 'planned',
    cellWhenPlanned: (day: string, time: string) => `Planned for ${day} ${time}.`,
    planAutopilot: 'autopilot',
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
    cellOpensPost: 'Press to open the adaptation.',
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
    adaptStreamIncomplete:
      'The adaptation response arrived incomplete — try again.',
    retry: 'Try again',
    restrictedTitle: 'This is read-only here',
    restrictedBody:
      'Making pieces and adaptations belongs to an editor or an administrator of the workspace.',

    coreTitle: 'Substance',
    coreFallback:
      'AI did not answer — the substance was assembled from the brief. Check it before adapting.',
    legacyTitle: 'Text of one channel',
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
    cancel: 'Cancel',
    chooseChannel: 'Pick a channel',
    settingsPanelLabel: 'Post settings',
    settingsPanelResize: 'Settings panel width: drag or use the arrow keys',
    settingsPanelHide: 'Hide settings',
    settingsPanelShow: 'Show settings',
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
    skipInterview: 'You decide everything',
    ownAnswer: 'Own answer',
    interviewSend: 'Next',
    interviewExhausted:
      'We will not ask again: two rounds is the limit. We decide from here.',

    clarifyLead:
      'The piece is already saved. Answer and the substance is rewritten with your words; leave it and it stays as it is.',
    clarifySkip: 'Leave it as it is',
    clarifyBusy: 'Rewriting the substance…',
    clarifyDone: 'The substance is rewritten with your words.',
    clarifyFailed: 'The answer was not saved. Try again.',

    editText: 'Edit',
    editDone: 'Done',
    editOpening: 'Opening the editor…',
    editLockedQueued:
      'The post is already going out, so it is too late to edit it here.',

    textSourcesHintLabel: 'Hint: text sources',
    textSourcesHint:
      'What research found on your topic: a plain-language claim, a quote, and its address. Ticked rows go into adaptations and into the next rewrite of the substance. A tick changes no text that is already written.',

    tabsLabel: 'Substance and channels',
    tabCore: 'Substance',
    tabMoreChannels: 'Another channel',
    titleEdit: 'Edit the title',
    titleLabel: 'Title',
    titleSave: 'Save',
    titleFailed: 'The title was not saved. Try again.',
    factSelectFailed: 'The selection was not saved. Try again.',
    sentTitle: 'What you sent',
    sentKindPerson: 'your own text',
    sentKindSource: 'somebody else’s post',
    sentKindLink: 'a link',
    sentKindInstruction: 'an instruction',
    sentAsIs: 'as it was, before any edits',
    coreWaiting:
      'The substance appears after your answers. You can let us decide.',
    whereNextTitle: 'Where next',
    noChannelsYet:
      'No channels yet. Connect the first one and its tab appears here.',
    variantsCount: (count: number) =>
      `${count} ${count === 1 ? 'version' : 'versions'}`,
    openChannel: 'Open',
    receiptUnderstoodAs: 'Understood as',
    receiptForeignWithLink: 'somebody else’s post + link',
    receiptMaterial: 'Material',
    textSourcesCount: (count: number) => `Text sources · ${count}`,
    textSourcesLead:
      'Ticked rows go into adaptations. A tick changes no text that is already written.',
    textSourcesOpen: 'Show',
    textFor: (platform: string) => `Text for ${platform}`,
    variantsLabel: 'Text versions',
    variant: (index: number) => `Version ${index}`,
    autosaveIdle: 'edits save themselves',
    autosaveSaving: 'saving…',
    autosaveSaved: (time: string) => `edits saved · ${time}`,
    autosaveFailed:
      'The edit was not saved. The text on screen is yours and is still here.',
    textInPost: 'The text is available in the post.',
    noAdaptationLead: (channel: string) =>
      `There is no text for “${channel}” yet. We write it from the substance, for this channel and its habits.`,
    adaptFor: (platform: string) => `Adapt for ${platform}`,
    adaptingFor: (channel: string) => `Adapting for “${channel}”…`,
    interviewTakeawayLead:
      'One question before the text — the answer goes into it by meaning. Rather not answer? “You decide everything”.',
    interviewAdaptLead: (count: number) =>
      count === 1
        ? 'A question for this channel — the answer goes into the text by meaning. Rather not answer? “You decide everything”.'
        : 'Questions for this channel — the answers go into the text by meaning. Rather not answer? “You decide everything”.',
    previewTitle: (platform: string) => `How it looks in ${platform}`,
    previewSwitch: 'Text or how it looks',
    previewText: 'Text',
    toolbarLabel: 'Text formatting',
    /* --- Link for the post and editing the piece (`97dq.75`) ------------ */
    postLinkLabel: 'Link for the post',
    postLinkHint:
      'The link this post gets. It starts as your answer to «Which link goes into the post?». Change it — the new one goes in on the next rewrite. Clear the field — this post gets no link. We never invent addresses.',
    postLinkFromPiece: 'as in the piece',
    postLinkNoneForPost: 'no link in this post',
    postLinkNotChosen: 'no link chosen yet',
    receiptPostLink: 'Link',
    receiptPostLinkNone: 'no link',
    postLinkChange: 'Change',
    coreEdit: 'Edit the core',
    coreEditDone: 'Done',
    coreEditHint:
      'Edits save themselves. The previous core text stays in the piece history. Adaptations are not rewritten by themselves: rewrite them in the channel tab.',
    coreEditLabel: 'Core text',
    coreEditFailed: 'The edit was not saved. The text on screen is yours — try again.',
    coreEditRetry: 'Save again',
    coreEditedByYou: 'edited by you',
    materialTitle: 'Add to the material',
    materialHint:
      'What you add becomes part of the piece material — as if you had sent it at the start. The core does not change by itself: press «Rebuild the core» when you are ready.',
    materialPlaceholder: 'A fact, a case, a number, a thought — what to add',
    materialAdd: 'Add to the material',
    materialAdding: 'Adding to the material',
    materialAddFailed: 'It was not added. The text is still in the field — try again.',
    materialAddedCount: (count: number) =>
      count === 1 ? 'Added once' : `Added ${count} times`,
    materialPending: 'The core does not include what you added yet.',
    coreRebuild: 'Rebuild the core',
    coreRebuildHint:
      'The core is written again from all the material: what you sent, your answers and what you added. The previous text stays in the piece history. This is one AI request.',
    coreRebuilding: 'Rebuilding the core',
    coreRebuildFailed: 'The core could not be rebuilt. The previous text is still there — try again.',
    toolBold: 'Bold',
    toolBoldGlyph: 'B',
    toolItalic: 'Italic',
    toolItalicGlyph: 'I',
    toolUnderline: 'Underline',
    toolUnderlineGlyph: 'U',
    toolLink: 'Link',
    toolEmoji: 'Emoji',
    emojiSearch: 'Find an emoji',
    toolImage: 'Image from the media library',
    editorLabel: (platform: string) => `Post text for ${platform}`,
    counter: (count: number, max: number) =>
      `${count} of ${max} characters`,
    counterNoMax: (count: number) =>
      `${count} ${count === 1 ? 'character' : 'characters'}`,
    overLimit: (extra: number) =>
      `Longer than the platform accepts by ${extra} ${
        extra === 1 ? 'character' : 'characters'
      }. Shorten the text or ask for “Shorter”.`,
    linkAddress: 'Link address',
    linkPlaceholder: 'https://…',
    linkInvalid: 'This does not look like an address. Check it.',
    linkInsert: 'Insert',
    linkSave: 'Save link',
    linkRemove: 'Remove link',
    linkHint:
      'Select words and insert an address — the words become the link. With nothing selected, the address goes where the cursor is. Only http and https.',
    linkHintLabel: 'How to insert a link',
    imageAttached: 'Post image',
    imageRemove: 'Remove the image',
    imageAlt: 'Post image',
    postOptionsChanges: (count: number) =>
      `${count} ${count === 1 ? 'change' : 'changes'}`,
    asInChannel: (value: string | null) =>
      value ? `as in the channel · ${value}` : 'as in the channel',
    whoSpeaks: 'Who speaks',
    hintWhoSpeaks: 'Whose voice this post is written in. The channel setting stays as it is.',
    speakerChannel: 'As in the channel',
    lengthShorter: 'shorter',
    lengthLonger: 'longer',
    wishLabel: 'Wish',
    wishPlaceholder: 'For example: start with a question',
    hintWish: 'One request in your own words, for this post only.',
    rewriteWithThis: 'Rewrite with these settings',
    remembering: 'Remembering for the channel',
    rememberFailed: 'That was not remembered. Try again.',
    whenLabel: 'When',
    schedule: 'Schedule',
    scheduleHint: 'Goes out on the chosen day and hour.',
    scheduleMore: 'Other ways to send',
    publishNow: 'Publish now',
    publishNowHint: 'Goes to the channel right away, without a schedule.',
    scheduling: 'Scheduling',
    publishingNow: 'Sending to the channel',
    scheduledDone: 'The post is scheduled.',
    publishedDone: 'The post went to the channel.',
    scheduleFailed: 'Sending did not work. Try again.',
    openInCalendar: 'Open in the calendar',
    unschedule: 'Take off the schedule',
    unscheduling: 'Taking it off the schedule',
    unscheduledDone: 'The post is off the schedule and a draft again — you can edit it.',
    deletingAdaptation: 'Deleting the adaptation',
    planRowDraft: 'Draft',
    planRowReserved: (when: string) => `Planned for ${when} · reserved`,
    planRowQueued: (when: string) => `Queued for ${when}`,
    planConfirm: 'Confirm',
    planChangeTime: 'Change the time',
    planChangeTimeHint: 'Shows the day and hour choice. “Confirm” queues the post at the new time.',
    planDrop: 'Remove from the plan',
    planDropHint: 'The reservation goes, the post stays a draft.',
    planReservedMore: 'Other actions for the reservation',
    planEditTime: 'Change the time',
    planNewTime: 'New time',
    planQueuedMore: 'Other actions for the queued post',
    unscheduleHint: 'The post goes back to a draft and can be edited again.',
    openInCalendarHint: 'Shows the post among the others in the calendar.',
    planMoving: 'Moving',
    planMove: 'Move',
    planMoveFailed: 'The time did not change. Try again.',
    settingsSaving: 'Saving…',
    settingsSaved: (time: string) => `Saved · ${time}`,
    settingsSaveFailed: 'The settings were not saved. Try again.',
    saveForPost: 'Save for this post',
    saveForChannel: 'Save for the channel',
    saveForChannelHint: 'These values become the channel defaults for new posts.',
    saveMore: 'Where else to save',
    savedForChannel: 'Saved for the channel: new posts will be written this way.',
    rewriteAndRemember: 'Rewrite and remember for the channel',
    rewriteAndRememberHint: 'A new version, and these values become the channel defaults.',
    rewriteMore: 'Other ways to rewrite',
    appliesOnRewrite: 'applies when rewritten',
    imageFailed: 'The image was not attached. Try again.',
    actionsLabel: 'Text actions',
    rewriteOpen: 'Rewrite…',
    rewriteRun: 'Rewrite',
    avatarUnnamed: 'Unnamed',
    interviewChannelLead: (channel: string) =>
      `Missing for “${channel}”. Answer, or “You decide everything”.`,

    reviewWhy: 'Why',
    reviewIncomplete: 'Incomplete review.',
    researchIncomplete: 'Incomplete research result.',
    researchStale: 'Research result expired.',
    addResearch: 'Add research',
    checkFacts: 'Check facts',
    checkFactsSpendLabel: 'Hint: what the fact check spends',
    checkFactsSpend:
      'Search and AI may use your included allowance or incur charges with your connected provider. Sources may not cover every claim.',
    removeAiTells: 'Remove AI tells',
    rewritePrompt: 'What should change?',
    rewriteOnlyTitle: 'Only title',
    rewriteWholeText: 'Whole text',
    regenerating: 'Regenerating…',
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
    /* --- Post settings before the text, one rewrite (`97dq.78`) ---------- */
    adaptAction: 'Adapt',
    resetToChannel: 'Back to the channel settings',
    resetToChannelHint:
      'Every field takes the channel value again. The text stays as it is until you rewrite it.',
    postLinkRestore: 'Bring back the link from the piece',
    /* --- A queued post is editable until it goes out (`97dq.80`) --------- */
    queuedEditUntil: (time: string) =>
      `Edits go into the post if saved before ${time}`,
    /* --- Core versions (`97dq.85`) ---------------------------------------- */
    coreVersionsTitle: 'Core versions',
    coreVersionsHint:
      'Earlier texts of the core: before your edit, before a rebuild and before a version was restored. The very first text and the last 19 are kept. Any of them can be restored — the current core then stays in the versions too.',
    coreVersionsCount: (count: number) => `earlier: ${count}`,
    coreVersionByYou: 'you',
    coreVersionByAi: 'AI',
    coreVersionUntil: (at: string) => `was the core until ${at}`,
    coreVersionShow: 'Show the text',
    coreVersionHide: 'Hide the text',
    coreVersionRestore: 'Restore this version',
    coreVersionRestoreHint:
      'This text becomes the core again; the current one is kept in the versions. No AI request; adaptations are not rewritten by themselves.',
    coreVersionRestoring: 'Restoring the version',
    coreVersionRestoreFailed:
      'The version was not restored. The current core is still there — try again.',
    /* --- Review of 97dq.78–80: editing a queued post, deleting ------------- */
    queuedSave: 'Save to the post',
    queuedSaving: 'Saving to the post…',
    queuedSaved: (time: string) => `Saved to the post at ${time}`,
    queuedUnsaved:
      'These edits are not in the post yet: they go to the channel only after «Save to the post».',
    queuedMissed:
      'The edits were too late for the post: it is already going out with the previous text.',
    deleteAdaptationArmed: 'Delete this adaptation?',
    deleteWholePieceArmed: 'Delete the whole piece?',
    /* --- Short material: optional questions (`97dq.98`) ------------------ */
    materialAskLabel: 'Questions about the material',
    materialAskNotice: (length: number, min: number) =>
      `There is material for ~${length} characters; the channel expects ${min} or more. You can answer the questions below to make the post fuller. Optional.`,
    materialAskNoticeHint:
      'Characters are counted as in the counter under the text: without markup. «Or more» is the lower length bound from the settings of this post or channel. We add nothing ourselves: the post gets fuller only if you tell more.',
    materialAskNoticeHintLabel: 'Hint: where these numbers come from',
    materialAskPlaceholder: 'Briefly, in your own words',
    materialAskUse: 'Fill out the post',
    materialAskUsing: 'Filling out the post',
    materialAskUseHint:
      'The answers become part of the piece’s material, the core is rebuilt, and the post for this channel is rewritten with its settings. That is two AI requests. Questions left unanswered change nothing.',
    materialAskUseHintLabel: 'Hint: what «Fill out the post» does',
    materialAskDismiss: 'Not needed',
    materialAskFailed: 'The answers were not saved. They are still in the fields — try again.',
  },
} as const;

export type PiecesWords = (typeof piecesCopy)[PiecesLocale];
