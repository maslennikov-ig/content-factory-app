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

export type IntakeLocale = 'ru' | 'en';

export const intakeCopy = {
  ru: {
    /* --- Шапка и поле ввода --------------------------------------------- */
    // `content-factory-next-tu3k.9` (06.09.2026): дверь делает заготовку —
    // нейтральную суть без площадки, — а канал стал необязательным.
    title: 'Новая заготовка',
    lead: 'Дайте мысль, ссылку или чужой пост. Получится заготовка — суть без площадки; выберете канал — сразу напишем и текст для него.',
    inputLabel: 'С чего начинаем',
    inputPlaceholder: 'Вставьте мысль, ссылку или чужой пост…',
    kindLink: 'Похоже на ссылку — прочитаем страницу и возьмём её как источник.',

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
    write: 'Написать',
    makePiece: 'Сделать заготовку',
    makeAndWrite: (name: string) => `Сделать и написать для «${name}»`,
    makeAndWriteMany: (count: number) =>
      `Сделать и написать в ${count} ${plural(count, [
        'канал',
        'канала',
        'каналов',
      ])}`,
    writing: 'Пишем…',
    cancel: 'Отменить',
    pieceSaved: (code: string) => `Заготовка сохранена — ${code}`,
    openPiece: 'Открыть заготовку',

    /* --- Почему кнопка не нажимается ------------------------------------- */
    blockedNoInput: 'Напишите хотя бы пару слов',
    blockedNoChannel: 'Выберите канал',
    blockedChecking: 'Проверяем, подключён ли ИИ…',

    /* --- Шаги стрима ------------------------------------------------------ */
    stepStarted: 'Читаем и собираем бриф…',
    stepClaims: 'Берём подтверждения…',
    stepSearch: 'Проверяем цифры поиском…',
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
      'Спрашиваем только то, чего в вашем тексте нет. Остальное модель предположила сама — поправите в квитанции.',
    ownAnswer: 'Свой ответ',
    ownAnswerLabel: 'Ваш ответ',
    decideThis: 'Реши сама',
    decideAll: 'Реши всё сама',
    manualForm: 'Заполнить бриф вручную',
    addFact: 'Добавить факт',
    blockedUnanswered: 'Ответьте или нажмите «Реши сама»',

    /* --- Квитанция -------------------------------------------------------- */
    receiptTitle: 'Что модель поняла',
    receiptLead:
      'Каждая строка помечена тем, откуда она взялась. Поправьте, что не так, и нажмите «Пересобрать».',
    understoodAs: 'Понято как',
    kindThought: 'мысль',
    kindLinkShort: 'ссылка',
    kindForeign: 'чужой пост',
    notSo: 'Это не так',
    edit: 'Изменить',
    editDone: 'Готово',
    revertEdits: 'Отменить правки',
    empty: '—',
    originInput: 'из вашего текста',
    originPerson: 'ваш ответ',
    originAvatar: 'из аватара',
    originMemory: 'из памяти',
    originSearch: 'найдено поиском',
    originModel: 'предположение',
    factsLabel: 'Факты и чем они подкреплены',
    factVerified: 'подтверждено',
    factUnverified: 'не подтверждено — в текст не вошло',
    ungroundedLabel: 'Не подтвердилось и в текст не вошло',

    /* --- Результат -------------------------------------------------------- */
    draftTitle: 'Черновик',
    openInEditor: 'Открыть в редакторе',

    /* --- Проверка на штампы ----------------------------------------------- */
    slopCheck: 'Проверить на штампы',
    slopChecking: 'Проверяем…',
    slopRetry: 'Повторить',
    slopCaption: 'Проверка только показывает. Текст правите вы — в редакторе.',
    slopClean: 'Чисто',
    slopReview: 'Стоит взглянуть',
    slopRewrite: 'Лучше переписать',
    slopEmpty: 'Штампов не нашли.',
    slopFailed: 'Проверка не прошла. Попробуйте ещё раз.',

    /* --- Отказы и пустота -------------------------------------------------- */
    errorTitle: 'Не написалось',
    errorFallback: 'Текст не собрался. Попробуйте ещё раз.',
    errorIncomplete: 'Ответ пришёл неполным. Ничего не сохранено.',
    retry: 'Попробовать снова',
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
    profileLength: 'Длина',
    profileLengthShort: 'до 500',
    profileLengthIdeal: '500–1000',
    profileLengthLong: 'до 1500',
    profileLengthMax: 'до 2500 (форматы)',
    profileEmoji: 'Эмодзи',
    profileEmojiNone: 'без эмодзи',
    profileEmojiFew: '1–3, не больше двух видов',
    profileEmojiFree: 'как получится',
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
    formatAuto: 'выберет модель',
    formatOpinion: 'мнение',
    formatAnnouncement: 'анонс',
    formatList: 'список',
    formatExpert: 'разбор',
    formatCase: 'случай из работы',
    formatStory: 'история',
  },
  en: {
    title: 'New piece',
    lead: 'Give a thought, a link or somebody else’s post. You get a piece — substance with no platform; pick a channel and we write its text too.',
    inputLabel: 'Where we start',
    inputPlaceholder: 'Paste a thought, a link or somebody else’s post…',
    kindLink: 'Looks like a link — we will read the page and take it as a source.',

    channelsLabel: 'Where to',
    channelsHint: 'Optional. Up to three channels at a time — each gets its own text.',
    writingProfileAction: (name: string) =>
      `Set up: how we write in “${name}”`,
    writingProfileStored: 'set up',
    writingProfileDefault: 'defaults',
    languageLabel: 'Text language',
    languageRu: 'Русский',
    languageEn: 'English',
    write: 'Write',
    makePiece: 'Make a piece',
    makeAndWrite: (name: string) => `Make it and write for “${name}”`,
    makeAndWriteMany: (count: number) => `Make it and write for ${count} channels`,
    writing: 'Writing…',
    cancel: 'Cancel',
    pieceSaved: (code: string) => `The piece is saved — ${code}`,
    openPiece: 'Open the piece',

    blockedNoInput: 'Write at least a couple of words',
    blockedNoChannel: 'Pick a channel',
    blockedChecking: 'Checking whether AI is connected…',

    stepStarted: 'Reading and filling the brief…',
    stepClaims: 'Taking what is confirmed…',
    stepSearch: 'Checking the numbers by search…',
    stepWriting: 'Writing…',

    questionsBadge: 'One thing to clear up',
    questionsTitle: (count: number) =>
      count === 1 ? 'One question and we write' : 'Two questions and we write',
    questionsLead:
      'We only ask for what your text does not have. The rest the model assumed itself — correct it in the receipt.',
    ownAnswer: 'My own answer',
    ownAnswerLabel: 'Your answer',
    decideThis: 'You decide',
    decideAll: 'You decide everything',
    manualForm: 'Fill the brief by hand',
    addFact: 'Add a fact',
    blockedUnanswered: 'Answer, or press “You decide”',

    receiptTitle: 'What the model understood',
    receiptLead:
      'Every line is marked with where it came from. Fix what is wrong and press “Rebuild”.',
    understoodAs: 'Understood as',
    kindThought: 'a thought',
    kindLinkShort: 'a link',
    kindForeign: 'somebody else’s post',
    notSo: 'That is wrong',
    edit: 'Edit',
    editDone: 'Done',
    revertEdits: 'Undo edits',
    empty: '—',
    originInput: 'from your text',
    originPerson: 'your answer',
    originAvatar: 'from the avatar',
    originMemory: 'from memory',
    originSearch: 'found by search',
    originModel: 'an assumption',
    factsLabel: 'Facts and what backs them',
    factVerified: 'confirmed',
    factUnverified: 'unconfirmed — kept out of the text',
    ungroundedLabel: 'Unconfirmed and kept out of the text',

    draftTitle: 'Draft',
    openInEditor: 'Open in the editor',

    slopCheck: 'Check for clichés',
    slopChecking: 'Checking…',
    slopRetry: 'Try again',
    slopCaption: 'The check only shows. You fix the text — in the editor.',
    slopClean: 'Clean',
    slopReview: 'Worth a look',
    slopRewrite: 'Better rewritten',
    slopEmpty: 'No clichés found.',
    slopFailed: 'The check did not run. Try again.',

    errorTitle: 'It did not get written',
    errorFallback: 'The text was not built. Try again.',
    errorIncomplete: 'The answer arrived incomplete. Nothing was saved.',
    retry: 'Try again',
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
    profileLength: 'Length',
    profileLengthShort: 'up to 500',
    profileLengthIdeal: '500–1000',
    profileLengthLong: 'up to 1500',
    profileLengthMax: 'up to 2500 (long forms)',
    profileEmoji: 'Emoji',
    profileEmojiNone: 'none',
    profileEmojiFew: '1–3, at most two kinds',
    profileEmojiFree: 'as it comes',
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

    formatAuto: 'the model picks',
    formatOpinion: 'opinion',
    formatAnnouncement: 'announcement',
    formatList: 'list',
    formatExpert: 'expert take',
    formatCase: 'case from work',
    formatStory: 'story',
  },
} as const;

export type IntakeWords = (typeof intakeCopy)[IntakeLocale];
