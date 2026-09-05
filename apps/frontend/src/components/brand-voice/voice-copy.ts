/**
 * The words the voice screens say.
 *
 * Taken from the design rather than rewritten. Its captions carry decisions
 * that a paraphrase would quietly drop: "Это рабочий режим, а не ошибка" tells
 * a person that a missing profile is not a failure, and "На меньшем объёме
 * разбор находит случайные привычки вместо устойчивых" gives the reason for a
 * threshold instead of just enforcing it. Where the design only labelled a
 * mockup, the label is not carried over.
 *
 * Two languages, matching `ContentIntelligenceView`. Sixteen locales around a
 * two-language surface would promise a translation the screen cannot keep.
 */

import { VOICE_SAMPLE_PASTE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

export type VoiceLocale = 'ru' | 'en';

/**
 * The paste card's own ceiling, read off the contract rather than retyped.
 *
 * The card is where a person decides whether to paste at all; the number
 * belongs beside that decision; a hand-typed copy of it is exactly how
 * `content-factory-next-vme.10` went unnoticed — the limit a bare 413 refused
 * at was 100 KB, not the 200,000 characters the card promised, and nothing
 * near the field said either number.
 */
const pasteCharLimitLabel = (locale: VoiceLocale): string =>
  new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(
    VOICE_SAMPLE_PASTE_LIMITS.maxCharsPerSample
  );

/**
 * Russian counts a thing three ways, and a screen that counts one is broken.
 *
 * Exported because the wizard's container says the same kind of sentence about
 * samples that these screens say about files, and two copies of one rule is
 * how «3 файла» and «3 файлов» end up on the same page.
 */
import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';

/** Re-exported because the wizard's container says the same kind of sentence. */
export { plural };

export const voiceCopy = {
  ru: {
    /**
     * Имя кнопки-подсказки.
     *
     * Своё, а не то же, что у объекта рядом: подсказка про «Вернуть v2» и сама
     * кнопка «Вернуть v2» — два разных управляющих элемента, и одинаковое имя
     * делает их неразличимыми и для скринридера, и для теста, который ищет
     * кнопку по имени.
     */
    hintFor: (subject: string) => `Подсказка: ${subject}`,
    // Screen 01 — the section with no profile yet.
    emptyTitle: 'Аватара пока нет',
    emptyBody:
      'Пока аватара нет, тексты собираются нейтральным стилем. Это рабочий режим, а не ошибка.',
    emptyWhatItIs:
      'Аватар — человек, от чьего лица пишутся тексты: кто он, как обращается к читателю, какой длины пишет и каких слов не употребляет.',
    createVoice: 'Создать аватар',
    seeExample: 'Посмотреть готовый пример',
    // Both counts choose their own word. The character count read «21 184
    // знаков» on the walkthrough of 04.09.2026, and the sample count carried
    // its own copy of the rule the shared helper already holds
    // (`content-factory-next-fn33.54`).
    emptyCollected: (samples: number, characters: number) =>
      `Сбор уже начат: ${samples} ${plural(samples, [
        'образец',
        'образца',
        'образцов',
      ])} · ${characters.toLocaleString('ru-RU')} ${plural(characters, [
        'знак',
        'знака',
        'знаков',
      ])}. Образцы сохранены.`,
    emptyContinue: 'Продолжить сбор',

    // Screen 02 — three ways in.
    pathsTitle: 'Как соберём аватар',
    pathsStep: 'шаг 1 из 4 · путь можно сменить в любой момент',
    pathsLead:
      'Три входа делают одно и то же — собирают аватар. Отличается только источник: ваша голова, ваши прошлые тексты или манера автора, которая вам нравится.',
    pathsFooter:
      'после сбора можно вернуться и выбрать другой путь — образцы сохраняются',
    cancel: 'Отменить',
    recommended: 'Советуем',
    path: 'Путь',
    manualTitle: 'Заполнить вручную',
    manualBody:
      'Вы сами пишете, каким тоном говорит бренд. Ничего не читаем и не разбираем.',
    manualTime: '10–15 мин',
    manualNeeds: 'нет',
    // Five, because five is what the form asks for. The card promised eight
    // while the wizard had no manual step at all; a number nobody could check
    // stayed wrong for as long as the path led nowhere.
    manualFields: '5',
    ownTitle: 'Собрать из моих текстов',
    ownBody:
      'Читаем то, что вы уже написали, и показываем вашу собственную манеру числами. Вы соглашаетесь или правите.',
    ownTime: '5 мин + разбор',
    ownNeeds: 'от 15 000',
    ownSources: '5',
    referenceTitle: 'Взять манеру у автора, который нравится',
    referenceBody:
      'Берём манеру письма, а не личность. Из референса извлекается ритм и устройство фраз — и ничего из содержания.',
    referenceTake: 'Берём',
    referenceLeave: 'Не берём',
    referenceTakeItems: [
      'длину и ритм фраз',
      'привычки пунктуации',
      'долю вопросов и списков',
    ],
    referenceLeaveItems: [
      'имена и биографию',
      'факты и цифры',
      'цитаты и целые фразы',
    ],
    nameAuthor: 'Указать автора',
    labelTime: 'Время',
    labelNeedsTexts: 'Нужны тексты',
    labelFields: 'Полей заполнить',
    labelNeedsChars: 'Нужно знаков',
    labelSources: 'Источников',

    // Screen 03 — collecting samples.
    samplesTitle: 'Собрать из моих текстов',
    samplesSubtitle: 'черновик · сохраняется само',
    samplesWhere: 'Откуда взять тексты',
    samplesNote:
      'Чужие тексты в этом пути не используются. Каждый образец остаётся видимым и удаляется по одному.',
    collected: 'Набрано',
    ofMinimum: 'знаков из минимума',
    minimumNeeded: 'Нужно минимум',
    shortfall: 'Недобор',
    shortfallBody: (missing: string) =>
      `Добавьте ещё ${missing} знаков. На меньшем объёме разбор находит случайные привычки вместо устойчивых — аватар получится неточным.`,
    shortfallSamples: (missing: number) =>
      `И ещё ${missing} ${plural(missing, [
        'образец',
        'образца',
        'образцов',
      ])}: короткая форма компенсируется числом текстов, а не только объёмом.`,
    collectedSamples: 'Набранные образцы',
    deleteSelected: 'Удалить выбранные',
    nextAnalysis: 'Дальше — разбор',
    opensAt: 'откроется на 15 000 знаках',
    saveAndLeave: 'Сохранить и выйти',
    columnCode: 'Код',
    columnWhat: 'Что это',
    columnFrom: 'Откуда',
    columnChars: 'Знаков',
    columnDate: 'Дата',
    emptyCorpusTitle: 'Ни одного образца',
    emptyCorpusBody:
      'Начните с любого источника слева. Обычно хватает шести-восьми постов.',
    sourceOwnPosts: 'Мои опубликованные посты',
    sourceOwnPostsHint: 'подключённые каналы',
    sourceTelegram: 'Выгрузка Telegram Desktop',
    sourceTelegramHint: 'файл result.json из «Экспорт истории»',
    sourcePaste: 'Вставить текст',
    sourcePasteHint: `скопируйте прямо в поле · до ${pasteCharLimitLabel(
      'ru'
    )} знаков`,
    sourceFile: 'Загрузить файлы',
    // Four formats, because four are read. The card promised two while none of
    // them had a route at all.
    sourceFileHint:
      'txt, md, docx, pdf, result.json · до 20 МБ, до 10 файлов за раз',
    uploadSend: (count: number) =>
      `Загрузить ${count} ${plural(count, ['файл', 'файла', 'файлов'])}`,
    uploadSending: (count: number) =>
      `Отправляем ${count} ${plural(count, ['файл', 'файла', 'файлов'])}…`,
    uploadClear: 'Убрать выбор',
    uploadRights: 'Подтверждаю право использовать эти тексты для разбора',
    uploadRetention: 'Стереть исходный текст после',
    uploadReading:
      'Файлы читаются на сервере. Ответ придёт, когда прочитаются все: по каждому будет сказано, принят он или нет.',
    sourceUrl: 'Разрешённый сайт или RSS',
    sourceUrlHint: 'читаем только то, что вы указали',
    choose: 'Выбрать',
    upload: 'Загрузить',
    paste: 'Вставить',
    setAddress: 'Указать адрес',
    originOwnPost: 'мои посты',
    originTelegram: 'telegram',
    originPaste: 'вставка',
    originFile: 'файл',
    originSource: 'сайт',
    secretRemoved: 'секрет удалён',
    duplicateSkipped: 'уже есть в корпусе',

    // Screen 04 — the analysis step.
    analysisTitle: 'Разбираем ваши тексты',
    analysisSubtitle: (samples: number, chars: string) =>
      `${samples} образцов · ${chars} знаков`,
    analysisProgressHeading: 'Что идёт сейчас',
    analysisStageMeasuring: 'считаем длину фраз, пунктуацию и повторы',
    analysisStageAssisting: 'составляем аватар',
    analysisNote:
      'Пока это арифметика по вашим текстам: считаются слова, знаки и повторы. Модель подключится на следующем шаге, когда из подсчёта нужно будет собрать формулировки.',
    analysisMeasuredHeading: 'Что уже видно в ваших текстах',
    analysisHoldout: (count: number) =>
      count === 1
        ? 'Один образец отложен для проверки: по нему потом сверяется написанный текст, поэтому в разбор он не входит.'
        : `${count} ${plural(count, [
            'образец',
            'образца',
            'образцов',
          ])} отложены для проверки: по ним потом сверяется написанный текст, поэтому в разбор они не входят.`,
    analysisAwaiting: 'Числа появятся, когда разбор досчитает до конца.',
    analysisEmptyTitle: 'Первые числа появятся через несколько секунд',
    analysisEmptyBody:
      'Показываем только то, что уже посчитано — пустые клетки не заполняем догадками.',
    analysisSentenceLength: 'Длина фраз',
    analysisSentenceLengthUnit: 'слова в среднем',
    analysisLexicon: 'Лексика',
    analysisPunctuation: 'Привычки пунктуации',
    analysisPunctuationDash: 'тире вместо связки',
    analysisPunctuationColon: 'двоеточие в списках',
    analysisPunctuationQuestion: 'вопрос в конце',
    analysisPunctuationExclaim: 'восклицание',
    analysisNoData: 'не посчитано',
    analysisRejectedTitle: 'Не учтено при подсчёте',
    analysisRejectedReasons: {
      AI_ARTEFACT: 'следы генерации',
      TOO_SHORT: 'слишком короткий',
      LANGUAGE: 'не тот язык',
    },
    analysisNext: 'Дальше — предложение',
    analysisStop: 'Остановить разбор',
    analysisRetry: 'Продолжить разбор',
    analysisErrorTitle: 'Разбор прерван',
    analysisErrorFallback: 'Разбор не удалось завершить.',
    analysisRestrictedTitle: 'Разбор виден, запускать его нельзя',
    analysisRestrictedBody:
      'Ваша роль — наблюдатель. Числа и наблюдения доступны целиком.',
    analysisDisabledFallback: 'Этот шаг пропущен настройками организации.',
    analysisLoading: 'Читаем образцы',
    analysisDone: 'Разбор завершён',
    analysisCountedOnly: 'Числа посчитаны, предложение — нет',

    // Screen 05 — the proposal.
    proposalTitle: 'Вот что получилось из ваших текстов',
    proposalSubtitle: (accepted: number, total: number) =>
      `черновик · ${accepted} ${accepted === 1 ? 'поле' : 'поля'} из ${total} приняты`,
    proposalFields: 'Предложенный аватар',
    /**
     * «Аватар», а не «портрет», — так это называет владелец, и так это читается
     * без объяснений: не описание манеры, а человек, которым модель становится.
     */
    portraitTitle: 'Аватар',
    portraitHint:
      'Кто это, а не какой у него стиль. Модель пишет от его лица, и при расхождении с остальными полями побеждает он. Правьте свободно — это ваш человек.',
    proposalWhy: 'Почему предложено именно это',
    proposalObservation: 'Наблюдение',
    stateAccepted: 'Принято',
    stateEditing: 'Правится',
    stateUndecided: 'Не решено',
    accept: 'Принять',
    edit: 'Поправить',
    saveField: 'Сохранить поле',
    editNote:
      'Правка не отменяет остальные поля и не запускает разбор заново.',
    proposalNoGround: 'Нет основания',
    proposalNoGroundBody:
      'В образцах для этого поля ничего не нашлось. Впишите сами или оставьте пустым — пустое поле честнее выдуманного.',
    activate: 'Включить аватар',
    saveDraft: 'Сохранить черновик',
    avatarNameLabel: 'Как назвать аватар',
    avatarNameHint:
      'Имя видно в списке аватаров и в строке «тексты пишет…». Его можно поменять позже.',
    avatarNameRequired:
      'Назовите аватар, чтобы его было по чему узнать в списке.',
    activationConsent:
      'Понимаю: после включения новые тексты пишутся этим аватаром. Старые публикации не меняются.',
    activatedAt: (when: string) => `Действует с ${when}`,
    proposalObservationOpens:
      'Каждое наблюдение открывает те предложения образцов, по которым оно посчитано.',
    fieldWhoSpeaks: 'Кто говорит',
    fieldTone: 'Каким тоном',
    fieldAudience: 'К кому обращаемся',
    fieldSentenceLength: 'Длина фраз',
    fieldNeverSay: 'Что никогда не говорим',

    // Screen 05 again, for the path where the five lines are written by hand.
    manualProposalTitle: 'Опишите аватар своими словами',
    manualProposalSubtitle: (filled: number, total: number) =>
      `черновик · заполнено ${filled} из ${total}`,
    manualProposalLead:
      'Пять строк — это весь аватар. Тексты не читаем и не разбираем: чем заполните, тем и собираются новые тексты.',
    manualProposalFields: 'Аватар своими словами',
    manualProposalNote:
      'Каждая строка сохраняется отдельно и переживает перезагрузку. Аватар включается, когда написаны все пять.',
    manualPlaceholders: {
      WHO_SPEAKS: 'Например: мастерская, от лица бригады',
      TONE: 'Например: спокойно и по делу, без обещаний',
      AUDIENCE: 'Например: заказчики, которые читают на бегу',
      SENTENCE_LENGTH: 'Например: короткие фразы, десять-двенадцать слов',
      NEVER_SAY: 'Через точку с запятой: гарантия результата; лидер рынка',
    },


    // Screen 08 — what was not taken from a reference.
    redactionsTitle: 'Что осталось за рамкой',
    redactionsSubtitle: (texts: number, finished: string) =>
      `референс: ${texts} текстов автора · разбор закончен ${finished}`,
    redactionsLead:
      'Из референса взято устройство фраз. Содержание осталось у автора — ниже перечислено всё, что вырезано из разбора, с примерами.',
    redactionsEmpty: 'Вырезать было нечего',
    redactionsEmptyBody:
      'Имён, чисел и ссылок в референсе не нашлось. Пустой список — тоже результат: мы показываем его, а не прячем экран.',
    categoryPerson: 'Имена и всё, что указывает на человека',
    categoryFactNumber: 'Факты и числа автора',
    categoryLink: 'Ссылки и адреса',
    categoryMention: 'Упоминания других людей и организаций',
    categoryVerbatim: 'Целые фразы автора',
    categoryPlaces: (count: number) => `${count} мест`,
    factNumberNote:
      'Числа влияют только на длину фразы, в которой стояли. Сами значения не сохраняются.',
    verbatimNote:
      'Эти обороты встречались у автора как подпись и узнавались бы дословно. Они исключены из профиля целиком.',
    keptTitle: 'Что осталось в профиле',
    similarityTitle: 'Проверка на похожесть',
    similarityBody: (words: number) =>
      `Самое длинное совпадение с текстами автора — ${words} ${words === 1 ? 'слово' : 'слова'}. Это служебный оборот, он встречается у всех.`,
    similarityNoPromise:
      'Мы не обещаем, что личность автора не просочилась: доказуемо чистого разделения стиля и содержания не существует. Мы измеряем утечку по четырём проверкам и показываем измеренное.',
    consentRead: 'Прочитал список. Согласен взять только манеру письма.',
    proceed: 'Продолжить',
    changeReference: 'Сменить референс',
    referenceStep1: 'Референс',
    referenceStep2: 'Разбор',
    referenceStep3: 'Что не взяли',
    referenceStep4: 'Согласие',
    referenceUnreadable: (available: number, total: number) =>
      `Доступно ${available} текста из ${total}. На таком числе манера считается неустойчиво — добавьте ещё или смените референс.`,
    referenceDisabled:
      'Манера чужого автора отключена политикой организации. Доступны пути 1 и 2.',
    consentRecorded: 'Манера взята, содержание нет',
    consentRecordedBody: 'Отчёт сохранён в «Происхождение».',


    // Screen 10 — the applied-voice ribbon.
    ribbonLabel: 'Кто пишет',
    ribbonNeutral: 'Нейтрально · аватар не применён',
    ribbonNeutralBody:
      'Профиля нет, текст собирается нейтральным стилем. Это рабочий режим, а не ошибка.',
    ribbonStaleBody:
      'Контекст собран давно. Факты могли устареть — обновите его перед публикацией.',
    ribbonMovedBody:
      'Черновик собран прошлой версией аватара. Пересборка перепишет только этот текст; опубликованные не меняются.',
    ribbonBuiltOn: (built: string, current: string) =>
      `собрано на ${built}, сейчас действует ${current}`,
    ribbonDays: (days: number) => `${days} дн.`,
    ribbonChange: 'Сменить',
    ribbonRefresh: 'Обновить',
    ribbonRebuild: 'Пересобрать',
    ribbonChoose: 'Выбрать',
    ribbonWhatApplied: 'Что применено',
    ribbonHide: 'Свернуть',
    ribbonDetailAvatar: 'Аватар',
    ribbonDetailVoice: 'Версия аватара',
    ribbonDetailProfile: 'Профиль',
    ribbonDetailContext: 'Контекстный снимок',
    ribbonDetailAge: 'Свежесть',
    ribbonDetailFacts: 'Фактов',
    ribbonDetailEvidence: 'Доказательств',


    // Screen 11 — the material library and the recut.
    materialsTitle: 'Материалы',
    materialsSubtitle: (count: number) =>
      `${count} ${count === 1 ? 'материал' : 'материала'} · переиспользуются в публикациях`,
    materialsEmptyTitle: 'Материалов пока нет',
    materialsEmptyBody:
      'Материал — готовый текст, который живёт отдельно от публикации и перекраивается под площадку. Сохраните черновик как материал, и он появится здесь.',
    materialsColumnCode: 'Код',
    materialsColumnTitle: 'Название',
    materialsColumnFormat: 'Формат',
    materialsColumnPosts: 'Публикаций',
    materialsColumnDrafts: 'Черновиков',
    materialsColumnDate: 'Дата',
    materialsReuse: 'Переиспользовать',
    materialsOrigin: 'Происхождение',
    materialsDerived: 'Сделано из этого материала',
    materialsQueued: 'В очереди',
    materialsDraft: 'Черновик',
    materialsNoChannel: 'канала нет',
    materialsNoChannelNote:
      'Площадки без подключённого канала выбрать нельзя: черновик некуда положить. Канал подключается в разделе каналов.',
    materialsNoChannelAnywhere:
      'Ни одного канала пока не подключено, и перекроить материал некуда: черновик не в чем открыть. Подключите канал в разделе каналов — после этого «Переиспользовать» заработает.',
    languageRu: 'Русский',
    languageEn: 'Английский',
    recutTitle: 'Перекроить под площадку',
    recutVoice: (version: string) => `аватар ${version}`,
    recutWhatChanges: 'Что изменится',
    recutNothingChanges:
      'Ничего не меняется: материал уже в форме этой площадки.',
    recutOpenEditor: 'Открыть в редакторе',
    recutCancel: 'Отменить',
    recutLossy: 'с потерей',
    aspectLength: 'Длина',
    aspectLists: 'Списки',
    aspectImages: 'Фото',
    aspectLinks: 'Ссылки',
    listsBullets: 'перечнем',
    listsInline: 'строкой',
    platformSite: 'Сайт',
    platformTelegram: 'Telegram',
    platformVk: 'ВКонтакте',
    platformNewsletter: 'Рассылка',
    recutDelivery:
      'Перекройка готовит текст. Отправкой занимается публикация — как и для любого другого поста.',


    // Topic radar and brief. These two the design did not draw: they are the
    // last step of the target cycle and were valuable only once voice and
    // sources were in use. Built in the system's language, not invented style.
    radarTitle: 'Радар тем',
    radarSubtitle: 'кандидаты, оценка и причина, по которой тема встала именно здесь',
    radarEmptyTitle: 'Тем пока нет',
    // content-factory-next-fn33.55: «добавить источник» звало туда, где
    // добавить нечего — вкладка источников убрана решением владельца
    // (карта раздела, §3, §4). Подсказка называет два места, которые
    // действительно есть: подписка на «Откуда идеи» и факт прямо здесь.
    radarEmptyBody:
      'Радар берёт темы из подписок и ваших фактов. Заведите подписку на вкладке «Откуда идеи» или запомните факт ниже — кандидаты появятся здесь.',
    radarWhy: 'Почему здесь',
    radarEvidence: 'Фактов',
    radarPick: 'Взять в бриф',
    briefTitle: 'Бриф',
    briefSubtitle: 'о чём текст и на чём он стоит',
    briefGoal: 'Цель',
    briefThesis: 'Тезис',
    briefChannel: 'Канал',
    briefFormat: 'Формат',
    // Not «Факты со ссылками» any more: a link is one of two ways to ground a
    // fact here, and the id from working memory is the other. A heading that
    // names only the link reads as a requirement the form does not have.
    briefFacts: 'Факты и чем они подкреплены',
    briefFactId: 'Id факта из памяти',
    // content-factory-next-fn33.56: вкладки «Происхождение» в продукте нет —
    // она стала витриной «Откуда факты» (карта раздела, §4). И брать id
    // руками обычно не нужно: он подставляется сам, когда факт запоминают
    // здесь же, ниже (content-factory-next-fn33.68).
    briefFactIdHint:
      'Необязательно и обычно не нужно: id подставится сам, когда вы запомните факт ниже. Готовый id можно посмотреть на вкладке «Откуда факты».',
    briefPosition: 'Ваша позиция',
    briefDisagreement: 'С чем можно не согласиться',
    briefAudience: 'Для кого',
    briefBlockedTitle: 'Пока писать не из чего',
    briefBlockedBody:
      'Черновик не создаётся, пока в брифе нет сути. Ниже — то, чего не хватает; ответьте одной фразой на каждое.',
    briefUngrounded:
      'Эти утверждения пока нечем подтвердить — добавьте ссылку или возьмите факт из памяти:',
    briefReady: 'Создать черновик',
    briefReadyNote:
      'Всё на месте: тезис, факты со ссылками, ваша позиция, возражение и адресат.',

    // Screen 06 — the passport.
    passportTitle: 'Аватар',
    passportNoVoice: 'Без аватара',
    passportNoVoiceBody:
      'Тексты собираются нейтральным стилем. Это рабочий режим, а не ошибка.',
    passportWhoSpeaks: 'Кто говорит',
    passportTone: 'Каким тоном',
    passportAudience: 'К кому обращаемся',
    passportNeverSay: 'Что никогда не говорим',
    passportSentenceLength: 'Средняя длина фразы',
    passportSentenceStyle: 'Длина фраз',
    passportDash: 'Тире вместо связки',
    passportVersion: 'Версия',
    passportActiveSince: 'Действует с',
    passportSamples: 'Образцов',
    passportCorpus: 'Объём корпуса',
    // Shown instead of the sample/corpus counts when the active version has
    // no measurement of its own — a hand-written voice, or one activated
    // without an analysis behind it. Zero would say the corpus is empty,
    // which may well be false; this says what is actually true.
    passportUnmeasured:
      'Числа не посчитаны: под эту версию аватара разбор ещё не запускали.',
    passportLowConfidence:
      'Корпус тонкий: профиль посчитан, но на меньшем объёме привычки менее устойчивы.',
    passportExamples: 'Ваши примеры',
    // Сказано, откуда они взялись и чему учат: примеры показывают манеру, а не
    // разрешают брать из них факты. Второе продукт говорит и самой модели.
    passportExamplesHint:
      'Отобраны из ваших же текстов и уходят в промпт как образец манеры. Факты из них не берутся.',
    passportExampleRemove: 'Убрать',
    passportExamplesRefresh: 'Подобрать из моих текстов',
    // «Подобрать заново» не говорило ни откуда берётся, ни что будет с тем,
    // что уже в списке. Обе вещи человек хочет знать до нажатия.
    passportExamplesRefreshHint:
      'Продукт выберет несколько ваших постов из разобранного корпуса и заменит ими нынешний список. Добавленное вручную тоже заменится — сначала скопируйте его, если оно нужно.',
    passportExampleAdd: 'Добавить свой пример',
    passportExampleAddHint:
      'Свой текст в списке примеров работает как показанный образец манеры: модель на него смотрит, но факты из него не берёт. Полезно, когда нужный тон есть в тексте, которого нет в корпусе.',
    passportExampleAddPlaceholder: 'Вставьте свой текст — абзац или короткий пост',
    passportExampleAddSave: 'Добавить',
    passportExampleCancel: 'Отмена',

    // Правка по месту. Раньше эти пять строк правились только в отдельной
    // форме под отдельным заголовком, и человек, увидевший неточность в
    // «Каким тоном», должен был сначала найти ту форму и понять, что это тот
    // же самый голос.
    passportEdit: 'Изменить',
    passportEditSave: 'Сохранить',
    passportEditCancel: 'Отмена',
    passportEditSaved: 'Сохранено. Создана новая версия аватара.',
    passportEditNote:
      'Правка сразу создаёт новую версию: она появится в истории ниже, а старые публикации останутся привязаны к той версии, которой были написаны.',
    passportEditEmpty: 'Строка не может быть пустой.',
    passportHintWhoSpeaks:
      'Одна фраза о том, кто пишет: роль, должность, отношение к делу. Модель читает её первой и от неё отсчитывает всё остальное.',
    passportHintTone:
      'Как звучит текст — спокойно, резко, тепло. Это интонация, а не тема и не словарь.',
    passportHintAudience:
      'Кому адресован текст. От этого зависит, что можно не объяснять и какие слова считаются понятными.',
    passportHintSentenceStyle:
      'Какой длины фразы вы пишете, своими словами. Число рядом посчитано по вашим текстам; эта строка — то, что вы хотите от модели.',
    passportHintNeverSay:
      'Обороты, которых в тексте быть не должно. Перечисляйте через точку с запятой: «мы рады сообщить; уникальное предложение».',
    passportHintExamples:
      'Несколько ваших настоящих текстов уходят в промпт как образец манеры. Это самая сильная часть аватара: показать оказывается точнее, чем описать.',
    confidenceLabel: 'Насколько твёрдо',
    confidenceFirm: 'Корпуса хватает: привычки посчитаны на устойчивом объёме.',
    confidenceFewChars: (missing: string) =>
      `Профиль посчитается, но тексты короткие: ещё ${missing} сделают привычки твёрже.`,
    confidenceFewSamples: (missing: number) =>
      `Профиль посчитается, но текстов мало: ещё ${missing} ${plural(missing, ['штука', 'штуки', 'штук'])} — и мерка похожести начнёт держать порог.`,

    // Screen 07 — the eight scales.
    scalesTitle: 'Профиль стиля',
    scalesSubtitle: 'восемь измерений · один масштаб 0–100',
    scalesYourValue: 'ваше значение',
    scalesYourCorridor: 'ваш коридор',
    // Было «Править коридоры»: слово ничего не называло тому, кто видит его
    // впервые, а нажатие открывало форму ниже экрана — со стороны выглядело
    // так, будто кнопка не работает. Теперь кнопка включает ручки прямо на
    // полосах, и называется тем, что делает.
    scalesEditCorridors: 'Править границы',
    scalesEditDone: 'Готово',
    scalesRecalibrate: 'Пересчитать числа',
    scalesRecalibrateWhy:
      'С тех пор как эти числа сняли, продукт научился считать точнее.',
    scalesRecalibrateWhat:
      'Продукт заново измерит ваши тексты и обновит числа в паспорте и рамки на шкалах. Слова аватара — кто говорит, каким тоном — не изменятся. Платить не нужно, модель не вызывается.',
    scalesRecalibrateMoved: (count: number) =>
      `${count} ${plural(count, ['шкалу', 'шкалы', 'шкал'])} вы двигали сами. ${
        count === 1 ? 'Она останется' : 'Они останутся'
      } как есть — рядом покажем, что намерил продукт, и вы решите.`,
    scalesRecalibrateRunning: 'Считаем заново…',
    scalesRecalibrateDone: 'Готово. Числа пересчитаны по нынешним текстам.',
    scalesMeasuredHere: (low: number, high: number) =>
      `Вы поставили сами. Продукт намерил ${low}–${high}.`,
    scalesTakeMeasured: 'Взять измеренное',
    scalesEditHintTitle: 'Что такое границы',
    scalesEditHint:
      'Полоса — это диапазон, в который попадают почти все ваши фразы по этой шкале. Генератор старается из него не выходить. Потяните края полосы, чтобы задать свой диапазон; заданный вручную переживает пересчёт и помечается точкой.',
    scalesTitleHint:
      'Восемь привычек письма, посчитанных по вашим текстам: длина фраз, доля вопросов, тире вместо связки и так далее. Всё в одном масштабе 0–100, чтобы их можно было сравнить взглядом.',
    scalesLow: 'нижняя граница',
    scalesHigh: 'верхняя граница',
    scalesCorridorSave: 'Сохранить границы',
    scalesCorridorReset: 'Вернуть как было',
    scalesCorridorSaved: 'Границы сохранены.',
    scalesExclude: 'Не проверять эту шкалу',
    scalesExcludeHint:
      'Генератор перестанет сверять текст с этой шкалой. Значение продолжит считаться и показываться — просто не будет требованием.',
    scalesHowToRead: 'Как это читать',
    scalesHowToReadBody:
      'Полоска — ваш коридор: в него попадают 8 из 10 ваших фраз. Черта — среднее значение по образцам.',
    scalesGeneratorBody:
      'Генератор держится коридора. Выйти за него можно вручную — тогда рядом с текстом появится подпись, какая шкала нарушена и на сколько.',
    scalesNoRadarTitle: 'Почему не паутина',
    scalesNoRadarBody:
      'Восемь осей в круге не сравниваются между собой и не читаются вслух. Одинаковые полосы одного масштаба сравниваются взглядом и произносятся словами.',
    scalesLastCheck: 'Последняя проверка текста',
    scalesInCorridor: (count: number) => `${count} шкал в коридоре`,
    scalesOutside: (label: string, value: string) =>
      `${label} ${value} — вне коридора`,
    scalesAbove: 'выше коридора',
    scalesBelow: 'ниже коридора',
    scalesEmptyBody: (positives: number) =>
      `В образцах ${positives} наблюдения — мало, чтобы считать привычкой. Шкала останется пустой.`,
    scalesEmptyNone: 'Наблюдений не хватило. Шкала останется пустой.',
    // Не о корпусе, а о продукте: текстов может быть сколько угодно, а списка
    // слов для этого языка нет. Просить в этом случае «ещё образцов» — просить
    // то, что не поможет.
    scalesNoDictionary:
      'Для этого языка нет словаря, и эта шкала не считается. Дополнительные образцы тут не помогут.',
    scalesFailed: 'Шкала не посчиталась.',
    scalesFailedRest: 'Остальные шкалы посчитаны и действуют.',
    scalesRecount: 'Посчитать заново',
    scalesObservations: 'наблюдений',
    scalesInSamples: 'образцах',
    scalesExample: 'Пример из образца',
    scalesRestricted: 'Шкалы видны, коридоры правит владелец',
    scalesRestrictedBody: 'Значения и примеры фраз доступны полностью.',
    scalesDisabled: 'генератор её не проверяет',

    // Screen 09 — versions and comparison.
    versionsTitle: 'Версии аватара',
    versionsPick: 'Выберите две версии для сравнения',
    versionsTitleHint:
      'Каждый раз, когда голос включают заново или правят его строки, сохраняется новая версия. Старые остаются: публикация помнит, какой версией она написана, и её текст от новой версии не меняется.',
    versionsPickHint:
      'Отметьте две версии — ниже появится таблица «было → стало» по пяти строкам аватара. Больше двух отметить нельзя: сравнение всегда парное.',
    // Раньше третья галочка молча снимала одну из первых двух, и снималась не
    // та, на которую человек нажимал. Теперь лишние флажки просто выключены, и
    // рядом сказано почему.
    versionsPickFull:
      'Выбраны две версии. Снимите одну, чтобы выбрать другую.',
    versionsRestoreHint:
      'Возврат не переписывает историю: он берёт строки старой версии и сохраняет их как новую, поверх нынешней. Тексты, написанные раньше, остаются при своих версиях.',
    versionsActive: 'Действует',
    versionsDraft: 'Черновик',
    versionsArchived: 'Архив',
    versionsRestore: (label: string) => `Вернуть ${label}`,
    versionsNote:
      'Версия создаётся при каждой активации. Публикации помнят, какой версией собраны, — старые тексты не переписываются.',
    versionsRestoreNote: (from: string, to: string) =>
      `Возврат создаст версию ${to} с полями ${from}. История не переписывается.`,
    comparisonTitle: (from: string, to: string) => `Сравнение ${from} → ${to}`,
    comparisonChanged: (changed: number, total: number) =>
      `изменилось ${changed} ${changed === 1 ? 'поле' : 'поля'} из ${total}`,
    comparisonField: 'Поле',
    comparisonWas: 'Было',
    comparisonBecame: 'Стало',
    comparisonMarkChanged: 'Изменено',
    comparisonMarkSame: 'Без изменений',
    comparisonPickTwo: 'Выберите две версии, чтобы увидеть разницу по полям.',
    comparisonEmptyBoth: (names: string) =>
      `Не заполнено ни в одной из версий: ${names}.`,
    comparisonState: 'Что с ней',
    comparisonUnchanged: 'не менялась',
    comparisonChangedMark: 'изменилась',

    // Screen 12 — the avatars of a space.
    avatarsTitle: 'Аватары',
    avatarsSubtitle: 'Люди и бренды, от чьего лица пишет модель',
    avatarsCount: (count: number, limit: number) =>
      `${count} ${plural(count, ['аватар', 'аватара', 'аватаров'])} из ${limit}`,
    avatarsCreate: 'Создать аватар',
    avatarsWritesByDefault: 'Пишет по умолчанию',
    avatarsDefaultLine: (name: string) =>
      `Если не выбрать другой, тексты пишет ${name}.`,
    avatarsDefaultNeutral:
      'Аватар по умолчанию не выбран: тексты собираются нейтральным стилем.',
    avatarsDefaultOverride: 'выбор аватара в черновике переопределяет это',
    avatarsKindPerson: 'Человек · «я»',
    avatarsKindBrand: 'Бренд · «мы»',
    avatarsNotAnalysed: 'Без разбора',
    avatarsNoName: 'Без имени',
    avatarsAnalysed: (samples: number) =>
      `Разобран: ${samples} ${plural(samples, [
        'образец',
        'образца',
        'образцов',
      ])}`,
    avatarsPortraitAccepted: 'портрет принят',
    avatarsNotWriting:
      'Пока не пишет: нет разобранных текстов. Это рабочее состояние, а не ошибка.',
    avatarsOpen: 'Открыть',
    avatarsRename: 'Переименовать',
    avatarsRenameSave: 'Сохранить имя',
    avatarsRenameCancel: 'Отменить',
    avatarsMakeDefault: 'Сделать основным',
    avatarsAlreadyDefault: 'Уже по умолчанию',
    avatarsCannotDefault: 'по умолчанию нельзя без разбора',
    avatarsCollect: 'Собрать образцы',
    avatarsMore: 'Ещё',
    avatarsSwitchKind: (kind: 'PERSON' | 'BRAND') =>
      kind === 'PERSON' ? 'Сделать брендом' : 'Сделать человеком',
    avatarsDelete: 'Удалить',
    avatarsOrder: 'Порядок: по умолчанию первым, дальше по дате создания',
    avatarsMoreNote: 'удаление и смена вида — в меню «Ещё»',
    avatarsEmptyTitle: 'Аватара пока нет',
    avatarsEmptyBody:
      'Тексты собираются нейтральным стилем, пока не появится тот, от чьего лица писать.',
    avatarsLimitTitle: (limit: number) =>
      `${limit} ${plural(limit, [
        'аватар',
        'аватара',
        'аватаров',
      ])} из ${limit}`,
    avatarsLimitBody: 'удалите ненужный или расширьте тариф',
    avatarsRestrictedTitle: 'Аватары заводит владелец',
    avatarsRestrictedBody:
      'Ваша роль — редактор: список виден, выбрать аватар в черновике можно, править нельзя.',
    avatarsErrorTitle: 'Имя не сохранилось',
    avatarsErrorBody: 'Текст остался в поле, аватар по умолчанию не менялся.',
    avatarsRetry: 'Сохранить ещё раз',
    avatarsSuccess: (name: string) => `Теперь пишет ${name}`,
    avatarsDeleteLastTitle: 'Удалить единственный аватар?',
    avatarsDeleteLastBody: (name: string) =>
      `«${name}» — единственный аватар пространства и он же по умолчанию. После удаления писать будет некому: новые тексты собираются нейтральным стилем, пока не появится новый аватар.`,
    avatarsDeleteWhatGoes: 'Что исчезнет вместе с аватаром',
    avatarsDeleteWhatStays:
      'Портрет, пять строк и версии. Образцы и вышедшие публикации остаются: их текст не меняется.',
    avatarsDeleteLastConfirm: 'Удалить и остаться без аватара',
    avatarsDeleteDefaultTitle: (name: string) =>
      `Удалить «${name}» и передать по умолчанию?`,
    avatarsDeleteDefaultBody: (rest: number) =>
      `В пространстве ${
        rest === 1 ? 'останется' : 'останутся'
      } ${rest} ${plural(rest, [
        'аватар',
        'аватара',
        'аватаров',
      ])}. Тексты без явного выбора будет писать тот, кого вы назначите сейчас.`,
    avatarsDeleteSuccessor: 'Кто станет писать по умолчанию',
    avatarsDeleteSuccessorNote:
      'Аватаров без разбора в списке нет: они писать не могут.',
    avatarsDeleteDefaultConfirm: 'Удалить и назначить',
    avatarsDeletePlainTitle: (name: string) => `Удалить «${name}»?`,
    avatarsDeletePlainBody:
      'Аватар по умолчанию не меняется. Вышедшие публикации остаются как есть.',
    avatarsDeletePlainConfirm: 'Удалить аватар',
    avatarsDeleteCancel: 'Отмена',

    // Screen 10 — picking who writes this text.
    ribbonWhoWrites: 'Кто пишет этот текст',
    ribbonSwitchAvatar: 'Сменить аватар',
    ribbonNoAvatar: 'Без аватара · нейтральный стиль',
    ribbonDefaultMark: 'по умолчанию',

    // Экран 10, продолжение — чего этому черновику не хватает.
    // Не предупреждение: предупреждение говорит о свойстве продукта, а эти
    // строки — о свойстве ЭТОГО текста. Пост при этом готов и уходит как есть.
    draftGapLabel: 'Можно добавить',
    draftGapOwnMeasurement: 'В этом посте нет вашего числа.',
    draftGapHabit: (share: number, of: number) =>
      `В своих постах вы приводите его в ${share} % из ${of} ${plural(of, [
        'разобранного поста',
        'разобранных постов',
        'разобранных постов',
      ])}.`,
    draftGapExampleLabel: 'Как это делаете вы',
    draftGapOptional: 'Пост готов и уходит как есть — отвечать не обязательно.',
  },
  en: {
    hintFor: (subject: string) => `Hint: ${subject}`,
    emptyTitle: 'No avatar yet',
    emptyBody:
      'Until an avatar exists, text is written in a neutral style. That is a working mode, not an error.',
    emptyWhatItIs:
      'An avatar is the person text is written as: who they are, how they address a reader, how long they write, and which words they never use.',
    createVoice: 'Create an avatar',
    seeExample: 'See a finished example',
    emptyCollected: (samples: number, characters: number) =>
      `Collection is already under way: ${samples} ${
        samples === 1 ? 'sample' : 'samples'
      } · ${characters.toLocaleString('en-US')} characters. They are kept.`,
    emptyContinue: 'Continue collecting',

    pathsTitle: 'How we will build the avatar',
    pathsStep: 'step 1 of 4 · you can change path at any point',
    pathsLead:
      'All three inputs do the same thing — they build the avatar. Only the source differs: your own head, your past writing, or the manner of an author you like.',
    pathsFooter:
      'you can come back and pick another path later — samples are kept',
    cancel: 'Cancel',
    recommended: 'Recommended',
    path: 'Path',
    manualTitle: 'Fill it in by hand',
    manualBody:
      'You write what tone the brand speaks in. Nothing is read and nothing is analysed.',
    manualTime: '10–15 min',
    manualNeeds: 'no',
    manualFields: '5',
    ownTitle: 'Build it from my own texts',
    ownBody:
      'We read what you have already written and show your own manner as numbers. You accept it or edit it.',
    ownTime: '5 min + analysis',
    ownNeeds: 'from 15,000',
    ownSources: '5',
    referenceTitle: 'Take the manner of an author you like',
    referenceBody:
      'We take the manner of writing, not the person. Rhythm and phrase construction are extracted from the reference — and nothing of its content.',
    referenceTake: 'Taken',
    referenceLeave: 'Not taken',
    referenceTakeItems: [
      'phrase length and rhythm',
      'punctuation habits',
      'share of questions and lists',
    ],
    referenceLeaveItems: [
      'names and biography',
      'facts and figures',
      'quotes and whole phrases',
    ],
    nameAuthor: 'Name the author',
    labelTime: 'Time',
    labelNeedsTexts: 'Texts needed',
    labelFields: 'Fields to fill',
    labelNeedsChars: 'Characters needed',
    labelSources: 'Sources',

    samplesTitle: 'Build it from my own texts',
    samplesSubtitle: 'draft · saved as you go',
    samplesWhere: 'Where to take texts from',
    samplesNote:
      'Someone else’s texts are not used on this path. Every sample stays visible and is deleted one at a time.',
    collected: 'Collected',
    ofMinimum: 'characters of the minimum',
    minimumNeeded: 'Minimum needed',
    shortfall: 'Short of the floor',
    shortfallBody: (missing: string) =>
      `Add ${missing} more characters. On less than that the analysis finds accidental habits rather than settled ones, and the avatar will be wrong.`,
    shortfallSamples: (missing: number) =>
      `And ${missing} more ${missing === 1 ? 'sample' : 'samples'}: short-form writing compensates with count, not only volume.`,
    collectedSamples: 'Collected samples',
    deleteSelected: 'Delete selected',
    nextAnalysis: 'Next — analysis',
    opensAt: 'opens at 15,000 characters',
    saveAndLeave: 'Save and leave',
    columnCode: 'Code',
    columnWhat: 'What it is',
    columnFrom: 'From',
    columnChars: 'Chars',
    columnDate: 'Date',
    emptyCorpusTitle: 'No samples yet',
    emptyCorpusBody:
      'Start with any source on the left. Six to eight posts is usually enough.',
    sourceOwnPosts: 'My published posts',
    sourceOwnPostsHint: 'connected channels',
    sourceTelegram: 'Telegram Desktop export',
    sourceTelegramHint: 'the result.json file from “Export chat history”',
    sourcePaste: 'Paste text',
    sourcePasteHint: `paste straight into the field · up to ${pasteCharLimitLabel(
      'en'
    )} characters`,
    sourceFile: 'Upload files',
    sourceFileHint:
      'txt, md, docx, pdf, result.json · up to 20 MB, 10 files at a time',
    uploadSend: (count: number) =>
      `Upload ${count} ${count === 1 ? 'file' : 'files'}`,
    uploadSending: (count: number) =>
      `Sending ${count} ${count === 1 ? 'file' : 'files'}…`,
    uploadClear: 'Clear the selection',
    uploadRights: 'I confirm the right to use these texts for analysis',
    uploadRetention: 'Erase the source text after',
    uploadReading:
      'The files are being read on the server. The answer arrives once all of them are read: each one will say whether it was accepted.',
    sourceUrl: 'An allowed site or RSS feed',
    sourceUrlHint: 'we read only what you point at',
    choose: 'Choose',
    upload: 'Upload',
    paste: 'Paste',
    setAddress: 'Set address',
    originOwnPost: 'my posts',
    originTelegram: 'telegram',
    originPaste: 'pasted',
    originFile: 'file',
    originSource: 'site',
    secretRemoved: 'secret removed',
    duplicateSkipped: 'already in the corpus',

    analysisTitle: 'Reading your texts',
    analysisSubtitle: (samples: number, chars: string) =>
      `${samples} samples · ${chars} characters`,
    analysisProgressHeading: 'What is running now',
    analysisStageMeasuring: 'counting sentence length, punctuation and repetition',
    analysisStageAssisting: 'drafting the avatar',
    analysisNote:
      'This is still arithmetic over your texts: words, marks and repeats. The model joins on the next step, once the counts need to become wording.',
    analysisMeasuredHeading: 'What already shows in your texts',
    analysisHoldout: (count: number) =>
      count === 1
        ? 'One sample is held back for checking: later writing is compared against it, so it stays out of the measurement.'
        : `${count} samples are held back for checking: later writing is compared against them, so they stay out of the measurement.`,
    analysisAwaiting: 'Numbers appear once the analysis finishes counting.',
    analysisEmptyTitle: 'The first numbers arrive in a few seconds',
    analysisEmptyBody:
      'Only what is already counted is shown — empty cells are not filled with a guess.',
    analysisSentenceLength: 'Sentence length',
    analysisSentenceLengthUnit: 'words on average',
    analysisLexicon: 'Vocabulary',
    analysisPunctuation: 'Punctuation habits',
    analysisPunctuationDash: 'a dash instead of a copula',
    analysisPunctuationColon: 'a colon before a list',
    analysisPunctuationQuestion: 'a question at the end',
    analysisPunctuationExclaim: 'an exclamation',
    analysisNoData: 'not counted',
    analysisRejectedTitle: 'Left out of the count',
    analysisRejectedReasons: {
      AI_ARTEFACT: 'traces of generation',
      TOO_SHORT: 'too short',
      LANGUAGE: 'wrong language',
    },
    analysisNext: 'Next — proposal',
    analysisStop: 'Stop the analysis',
    analysisRetry: 'Resume the analysis',
    analysisErrorTitle: 'The analysis was cut off',
    analysisErrorFallback: 'The analysis could not finish.',
    analysisRestrictedTitle: 'The analysis is visible, not runnable',
    analysisRestrictedBody:
      'Your role is read-only. The numbers and observations are fully visible.',
    analysisDisabledFallback: 'This step is skipped by an organisation setting.',
    analysisLoading: 'Reading the samples',
    analysisDone: 'The analysis is finished',
    analysisCountedOnly: 'Counted, but no proposal',

    proposalTitle: 'Here is what came out of your texts',
    proposalSubtitle: (accepted: number, total: number) =>
      `draft · ${accepted} of ${total} fields accepted`,
    proposalFields: 'Proposed avatar',
    portraitTitle: 'Avatar',
    portraitHint:
      'Who this is, not what their style is like. The model writes as them, and where this and the other fields disagree, the person wins. Edit freely — this is your person.',
    proposalWhy: 'Why this was proposed',
    proposalObservation: 'Observation',
    stateAccepted: 'Accepted',
    stateEditing: 'Being edited',
    stateUndecided: 'Undecided',
    accept: 'Accept',
    edit: 'Edit',
    saveField: 'Save field',
    editNote:
      'Editing one field does not undo the others and does not restart the analysis.',
    proposalNoGround: 'No grounds',
    proposalNoGroundBody:
      'Nothing was found in the samples for this field. Write it yourself or leave it empty — an empty field is honester than an invented one.',
    activate: 'Turn the avatar on',
    saveDraft: 'Save draft',
    avatarNameLabel: 'What to call this avatar',
    avatarNameHint:
      'The name shows in the avatar list and in the «written by…» line. It can be changed later.',
    avatarNameRequired:
      'Give the avatar a name, so it can be told apart in the list.',
    activationConsent:
      'I understand: after this, new text is written as this avatar. Existing posts do not change.',
    activatedAt: (when: string) => `Active since ${when}`,
    proposalObservationOpens:
      'Each observation opens the sample sentences it was computed from.',
    fieldWhoSpeaks: 'Who speaks',
    fieldTone: 'In what tone',
    fieldAudience: 'Who is addressed',
    fieldSentenceLength: 'Phrase length',
    fieldNeverSay: 'What is never said',

    manualProposalTitle: 'Describe the avatar in your own words',
    manualProposalSubtitle: (filled: number, total: number) =>
      `draft · ${filled} of ${total} written`,
    manualProposalLead:
      'Five lines are the whole avatar. Nothing is read and nothing is measured: new text is written the way you fill these in.',
    manualProposalFields: 'The avatar in your own words',
    manualProposalNote:
      'Each line is saved on its own and survives a reload. The avatar switches on once all five are written.',
    manualPlaceholders: {
      WHO_SPEAKS: 'For example: a workshop, speaking as the crew',
      TONE: 'For example: calm and matter-of-fact, no promises',
      AUDIENCE: 'For example: clients who read on the move',
      SENTENCE_LENGTH: 'For example: short phrases, ten to twelve words',
      NEVER_SAY: 'Separated by semicolons: guaranteed result; market leader',
    },

    redactionsTitle: 'What stayed outside',
    redactionsSubtitle: (texts: number, finished: string) =>
      `reference: ${texts} texts by the author · analysis finished ${finished}`,
    redactionsLead:
      'What was taken from the reference is how phrases are built. The content stayed with the author — everything cut out of the analysis is listed below, with examples.',
    redactionsEmpty: 'There was nothing to cut',
    redactionsEmptyBody:
      'No names, figures or links were found in the reference. An empty list is a result too: we show it rather than hiding the screen.',
    categoryPerson: 'Names and anything pointing at a person',
    categoryFactNumber: 'The author’s facts and figures',
    categoryLink: 'Links and addresses',
    categoryMention: 'Mentions of other people and organisations',
    categoryVerbatim: 'Whole phrases of the author',
    categoryPlaces: (count: number) => `${count} places`,
    factNumberNote:
      'Figures affect only the length of the phrase they stood in. The values themselves are not kept.',
    verbatimNote:
      'These turns of phrase read as the author’s signature and would be recognised word for word. They are excluded from the profile entirely.',
    keptTitle: 'What stayed in the profile',
    similarityTitle: 'Similarity check',
    similarityBody: (words: number) =>
      `The longest match with the author’s texts is ${words} words. That is a service phrase; everybody uses it.`,
    similarityNoPromise:
      'We do not promise that the author’s identity did not leak: a provably clean separation of style from content does not exist. We measure leakage on four checks and show what was measured.',
    consentRead:
      'I have read the list. I agree to take only the manner of writing.',
    proceed: 'Continue',
    changeReference: 'Change reference',
    referenceStep1: 'Reference',
    referenceStep2: 'Analysis',
    referenceStep3: 'Not taken',
    referenceStep4: 'Consent',
    referenceUnreadable: (available: number, total: number) =>
      `${available} of ${total} texts are available. Manner measured on that few is unstable — add more or change the reference.`,
    referenceDisabled:
      'The reference path is disabled by organisation policy. Paths 1 and 2 are open.',
    consentRecorded: 'Manner taken, content not',
    consentRecordedBody: 'The report is kept in Provenance.',

    ribbonLabel: 'Who writes',
    ribbonNeutral: 'Neutral · no avatar applied',
    ribbonNeutralBody:
      'There is no profile, so the text is written in a neutral style. That is a working mode, not an error.',
    ribbonStaleBody:
      'The context was built a while ago. Facts may have aged — refresh it before publishing.',
    ribbonMovedBody:
      'This draft was assembled by an earlier version of the avatar. Rebuilding rewrites only this text; published posts do not change.',
    ribbonBuiltOn: (built: string, current: string) =>
      `built on ${built}, ${current} is in force now`,
    ribbonDays: (days: number) => `${days} d.`,
    ribbonChange: 'Change',
    ribbonRefresh: 'Refresh',
    ribbonRebuild: 'Rebuild',
    ribbonChoose: 'Choose',
    ribbonWhatApplied: 'What applied',
    ribbonHide: 'Collapse',
    ribbonDetailAvatar: 'Avatar',
    ribbonDetailVoice: 'Avatar version',
    ribbonDetailProfile: 'Profile',
    ribbonDetailContext: 'Context snapshot',
    ribbonDetailAge: 'Freshness',
    ribbonDetailFacts: 'Facts',
    ribbonDetailEvidence: 'Evidence',

    materialsTitle: 'Material',
    materialsSubtitle: (count: number) =>
      `${count} pieces · reused across posts`,
    materialsEmptyTitle: 'No material yet',
    materialsEmptyBody:
      'A piece of material is a finished text that lives apart from any post and is recut for a platform. Save a draft as material and it appears here.',
    materialsColumnCode: 'Code',
    materialsColumnTitle: 'Title',
    materialsColumnFormat: 'Format',
    materialsColumnPosts: 'Posts',
    materialsColumnDrafts: 'Drafts',
    materialsColumnDate: 'Date',
    materialsReuse: 'Reuse',
    materialsOrigin: 'Provenance',
    materialsDerived: 'Made from this piece',
    materialsQueued: 'Queued',
    materialsDraft: 'Draft',
    materialsNoChannel: 'no channel',
    materialsNoChannelNote:
      'A platform with no connected channel cannot be chosen: there is nowhere to put the draft. Channels are connected in the channels section.',
    materialsNoChannelAnywhere:
      'No channel is connected yet, so there is nowhere to recut this piece to: the draft would have nothing to open in. Connect a channel in the channels section and “Reuse” starts working.',
    languageRu: 'Russian',
    languageEn: 'English',
    recutTitle: 'Recut for a platform',
    recutVoice: (version: string) => `avatar ${version}`,
    recutWhatChanges: 'What changes',
    recutNothingChanges:
      'Nothing changes: the piece is already in this platform’s shape.',
    recutOpenEditor: 'Open in the editor',
    recutCancel: 'Cancel',
    recutLossy: 'with loss',
    aspectLength: 'Length',
    aspectLists: 'Lists',
    aspectImages: 'Photos',
    aspectLinks: 'Links',
    listsBullets: 'bulleted',
    listsInline: 'inline',
    platformSite: 'Site',
    platformTelegram: 'Telegram',
    platformVk: 'VK',
    platformNewsletter: 'Newsletter',
    recutDelivery:
      'The recut prepares the text. Sending it is publishing’s job — the same as for any other post.',

    radarTitle: 'Topic radar',
    radarSubtitle: 'candidates, a score, and the reason a topic ranked where it did',
    radarEmptyTitle: 'No topics yet',
    radarEmptyBody:
      'The radar takes topics from your subscriptions and your facts. Add a subscription on the "Where ideas come from" tab, or remember a fact below, and candidates appear here.',
    radarWhy: 'Why here',
    radarEvidence: 'Facts',
    radarPick: 'Take into a brief',
    briefTitle: 'Brief',
    briefSubtitle: 'what the text is about and what it rests on',
    briefGoal: 'Goal',
    briefThesis: 'Thesis',
    briefChannel: 'Channel',
    briefFormat: 'Format',
    briefFacts: 'Facts and what backs them',
    briefFactId: 'Memory fact id',
    briefFactIdHint:
      'Optional, and usually unnecessary: the id fills itself in when you remember a fact below. You can also look one up on the "Where facts come from" tab.',
    briefPosition: 'Your position',
    briefDisagreement: 'What could be disagreed with',
    briefAudience: 'Who it is for',
    briefBlockedTitle: 'There is nothing to write from yet',
    briefBlockedBody:
      'A draft is not created until the brief has substance. Below is what is missing; answer each in one sentence.',
    briefUngrounded:
      'These claims have nothing behind them yet — add a source or take a fact from memory:',
    briefReady: 'Create the draft',
    briefReadyNote:
      'Everything is here: a thesis, facts with sources, your position, an objection and an audience.',
    passportTitle: 'Avatar',
    passportNoVoice: 'No avatar',
    passportNoVoiceBody:
      'Text is written in a neutral style. That is a working mode, not an error.',
    passportWhoSpeaks: 'Who speaks',
    passportTone: 'In what tone',
    passportAudience: 'Who is addressed',
    passportNeverSay: 'What is never said',
    passportSentenceLength: 'Average phrase length',
    passportSentenceStyle: 'Phrase length',
    passportDash: 'Dash instead of a copula',
    passportVersion: 'Version',
    passportActiveSince: 'Active since',
    passportSamples: 'Samples',
    passportCorpus: 'Corpus size',
    // Shown instead of the sample/corpus counts when the active version has
    // no measurement of its own — a hand-written voice, or one activated
    // without an analysis behind it. Zero would say the corpus is empty,
    // which may well be false; this says what is actually true.
    passportUnmeasured:
      'No numbers here: no analysis has run for this version of the avatar yet.',
    passportLowConfidence:
      'The corpus is thin: the profile was computed, but habits settle less firmly on less text.',
    passportExamples: 'Your examples',
    passportExamplesHint:
      'Picked from your own texts and sent to the model as a sample of manner. Facts are never taken from them.',
    passportExampleRemove: 'Remove',
    passportExamplesRefresh: 'Pick from my texts',
    passportExamplesRefreshHint:
      'The product picks a few of your own posts from the measured corpus and replaces the current list with them. Anything added by hand is replaced too — copy it first if you need it.',
    passportExampleAdd: 'Add my own example',
    passportExampleAddHint:
      'Your own text in this list works as a shown sample of manner: the model looks at it and takes no facts from it. Useful when the tone you want lives in a text the corpus does not hold.',
    passportExampleAddPlaceholder: 'Paste your text — a paragraph or a short post',
    passportExampleAddSave: 'Add',
    passportExampleCancel: 'Cancel',

    passportEdit: 'Edit',
    passportEditSave: 'Save',
    passportEditCancel: 'Cancel',
    passportEditSaved: 'Saved. A new version of the avatar was created.',
    passportEditNote:
      'An edit creates a new version at once: it shows up in the history below, and posts already written stay attached to the version that wrote them.',
    passportEditEmpty: 'The line cannot be empty.',
    passportHintWhoSpeaks:
      'One sentence about who is writing: role, job, relationship to the work. The model reads it first and measures everything else from it.',
    passportHintTone:
      'How the text sounds — calm, blunt, warm. This is intonation, not subject matter and not vocabulary.',
    passportHintAudience:
      'Who the text is addressed to. It decides what can go unexplained and which words count as known.',
    passportHintSentenceStyle:
      'How long your sentences run, in your own words. The number beside it is measured from your texts; this line is what you want from the model.',
    passportHintNeverSay:
      'Turns of phrase that must not appear. List them separated by semicolons: "we are pleased to announce; unique offer".',
    passportHintExamples:
      'A few of your real texts go into the prompt as a sample of manner. This is the strongest part of an avatar: showing turns out to be more precise than describing.',
    confidenceLabel: 'How firmly',
    confidenceFirm: 'The corpus is enough: the habits rest on a settled volume.',
    confidenceFewChars: (missing: string) =>
      `The profile will compute, but the texts are short: another ${missing} would make the habits firmer.`,
    confidenceFewSamples: (missing: number) =>
      `The profile will compute, but there are few texts: ${missing} more and the likeness measure starts holding its threshold.`,

    scalesTitle: 'Style profile',
    scalesSubtitle: 'eight measurements · one 0–100 scale',
    scalesYourValue: 'your value',
    scalesYourCorridor: 'your corridor',
    scalesEditCorridors: 'Edit the range',
    scalesEditDone: 'Done',
    scalesRecalibrate: 'Recount the numbers',
    scalesRecalibrateWhy:
      'The product has learnt to measure more precisely since these numbers were taken.',
    scalesRecalibrateWhat:
      'The product measures your texts again and updates the numbers on the card and the frames on the bars. The avatar’s words — who speaks, in what tone — do not change. Nothing to pay: no model is called.',
    scalesRecalibrateMoved: (count: number) =>
      count === 1
        ? 'You moved one bar yourself. It stays as it is — we will show what the product measured beside it, and you decide.'
        : `You moved ${count} bars yourself. They stay as they are — we will show what the product measured beside them, and you decide.`,
    scalesRecalibrateRunning: 'Measuring again…',
    scalesRecalibrateDone: 'Done. The numbers were recounted from your current texts.',
    scalesMeasuredHere: (low: number, high: number) =>
      `You set this yourself. The product measured ${low}–${high}.`,
    scalesTakeMeasured: 'Take the measured one',
    scalesEditHintTitle: 'What the range is',
    scalesEditHint:
      'The bar is the span almost all of your phrases fall into on this scale. The generator tries to stay inside it. Drag either end to set your own span; one set by hand survives recomputation and is marked with a dot.',
    scalesTitleHint:
      'Eight writing habits measured from your texts: sentence length, the share of questions, a dash instead of a copula and so on. All on one 0–100 scale, so they can be compared by eye.',
    scalesLow: 'lower bound',
    scalesHigh: 'upper bound',
    scalesCorridorSave: 'Save the range',
    scalesCorridorReset: 'Put it back',
    scalesCorridorSaved: 'The range was saved.',
    scalesExclude: 'Do not check this scale',
    scalesExcludeHint:
      'The generator stops checking text against this scale. The value keeps being measured and shown — it simply stops being a requirement.',
    scalesHowToRead: 'How to read this',
    scalesHowToReadBody:
      'The bar is your corridor: 8 of your 10 phrases fall inside it. The mark is the average across your samples.',
    scalesGeneratorBody:
      'The generator stays inside the corridor. You can step outside it by hand — then a line beside the text says which scale was broken and by how much.',
    scalesNoRadarTitle: 'Why not a radar chart',
    scalesNoRadarBody:
      'Eight axes in a circle cannot be compared with each other and cannot be read aloud. Identical bars on one scale compare at a glance and can be said in words.',
    scalesLastCheck: 'Last text check',
    scalesInCorridor: (count: number) => `${count} scales inside the corridor`,
    scalesOutside: (label: string, value: string) =>
      `${label} ${value} — outside the corridor`,
    scalesAbove: 'above the corridor',
    scalesBelow: 'below the corridor',
    scalesEmptyBody: (positives: number) =>
      `${positives} observations in the samples — too few to call a habit. This scale stays empty.`,
    scalesEmptyNone: 'Not enough observations. This scale stays empty.',
    scalesNoDictionary:
      'This language has no word list, so this scale is not measured. More samples will not help.',
    scalesFailed: 'This scale did not compute.',
    scalesFailedRest: 'The other scales are computed and in force.',
    scalesRecount: 'Compute again',
    scalesObservations: 'observations',
    scalesInSamples: 'samples',
    scalesExample: 'Example from sample',
    scalesRestricted: 'Scales are visible; the owner edits the corridors',
    scalesRestrictedBody: 'Values and example phrases are fully available.',
    scalesDisabled: 'the generator does not check it',

    versionsTitle: 'Avatar versions',
    versionsPick: 'Pick two versions to compare',
    versionsTitleHint:
      'Every time the voice is activated again, or one of its lines is edited, a new version is saved. The old ones stay: a post remembers which version wrote it, and its text does not change when a new one arrives.',
    versionsPickHint:
      'Tick two versions and a "was → became" table appears below, across the avatar’s five lines. More than two cannot be ticked: a comparison is always between a pair.',
    versionsPickFull: 'Two versions are picked. Untick one to pick another.',
    versionsRestoreHint:
      'Restoring does not rewrite the history: it takes the old version’s lines and saves them as a new version on top of the current one. Texts written earlier stay attached to their own versions.',
    versionsActive: 'Active',
    versionsDraft: 'Draft',
    versionsArchived: 'Archived',
    versionsRestore: (label: string) => `Restore ${label}`,
    versionsNote:
      'A version is created on every activation. Posts remember which version wrote them — old text is never rewritten.',
    versionsRestoreNote: (from: string, to: string) =>
      `Restoring creates version ${to} carrying the fields of ${from}. History is not rewritten.`,
    comparisonTitle: (from: string, to: string) => `Comparing ${from} → ${to}`,
    comparisonChanged: (changed: number, total: number) =>
      `${changed} of ${total} fields changed`,
    comparisonField: 'Field',
    comparisonWas: 'Was',
    comparisonBecame: 'Became',
    comparisonMarkChanged: 'Changed',
    comparisonMarkSame: 'Unchanged',
    comparisonPickTwo: 'Pick two versions to see the field-by-field difference.',
    comparisonEmptyBoth: (names: string) =>
      `Filled in neither version: ${names}.`,
    comparisonState: 'State',
    comparisonUnchanged: 'unchanged',
    comparisonChangedMark: 'changed',

    avatarsTitle: 'Avatars',
    avatarsSubtitle: 'The people and brands the model writes as',
    avatarsCount: (count: number, limit: number) =>
      `${count} of ${limit} avatars`,
    avatarsCreate: 'New avatar',
    avatarsWritesByDefault: 'Writes by default',
    avatarsDefaultLine: (name: string) =>
      `Unless another one is picked, ${name} writes.`,
    avatarsDefaultNeutral:
      'No default avatar: text is written in a neutral style.',
    avatarsDefaultOverride: 'picking an avatar in a draft overrides this',
    avatarsKindPerson: 'Person · “I”',
    avatarsKindBrand: 'Brand · “we”',
    avatarsNotAnalysed: 'Not analysed',
    avatarsNoName: 'Untitled',
    avatarsAnalysed: (samples: number) => `Analysed: ${samples} samples`,
    avatarsPortraitAccepted: 'portrait accepted',
    avatarsNotWriting:
      'Does not write yet: no analysed texts. That is a working state, not an error.',
    avatarsOpen: 'Open',
    avatarsRename: 'Rename',
    avatarsRenameSave: 'Save name',
    avatarsRenameCancel: 'Cancel',
    avatarsMakeDefault: 'Make default',
    avatarsAlreadyDefault: 'Already the default',
    avatarsCannotDefault: 'cannot be the default without an analysis',
    avatarsCollect: 'Collect samples',
    avatarsMore: 'More',
    avatarsSwitchKind: (kind: 'PERSON' | 'BRAND') =>
      kind === 'PERSON' ? 'Make it a brand' : 'Make it a person',
    avatarsDelete: 'Delete',
    avatarsOrder: 'Order: default first, then by creation date',
    avatarsMoreNote: 'deleting and changing the kind live in the “More” menu',
    avatarsEmptyTitle: 'No avatar yet',
    avatarsEmptyBody:
      'Text is written in a neutral style until there is somebody to write as.',
    avatarsLimitTitle: (limit: number) => `${limit} of ${limit} avatars`,
    avatarsLimitBody: 'delete one you do not need, or raise the plan',
    avatarsRestrictedTitle: 'The owner creates avatars',
    avatarsRestrictedBody:
      'Your role is editor: the list is visible and you may pick an avatar in a draft, but not edit one.',
    avatarsErrorTitle: 'The name was not saved',
    avatarsErrorBody:
      'The text stayed in the field and the default avatar did not change.',
    avatarsRetry: 'Save again',
    avatarsSuccess: (name: string) => `${name} writes now`,
    avatarsDeleteLastTitle: 'Delete the only avatar?',
    avatarsDeleteLastBody: (name: string) =>
      `“${name}” is the only avatar of this space and its default. After the deletion nobody writes: new text is assembled in a neutral style until another avatar exists.`,
    avatarsDeleteWhatGoes: 'What goes with the avatar',
    avatarsDeleteWhatStays:
      'The portrait, the five lines and the versions. Samples and published posts stay: their text does not change.',
    avatarsDeleteLastConfirm: 'Delete and write with no avatar',
    avatarsDeleteDefaultTitle: (name: string) =>
      `Delete “${name}” and hand over the default?`,
    avatarsDeleteDefaultBody: (rest: number) =>
      `${rest} avatars stay in this space. Text with no explicit choice will be written by whoever you name now.`,
    avatarsDeleteSuccessor: 'Who writes by default now',
    avatarsDeleteSuccessorNote:
      'Unanalysed avatars are not on this list: they cannot write.',
    avatarsDeleteDefaultConfirm: 'Delete and hand over',
    avatarsDeletePlainTitle: (name: string) => `Delete “${name}”?`,
    avatarsDeletePlainBody:
      'The default avatar does not change. Published posts stay as they are.',
    avatarsDeletePlainConfirm: 'Delete the avatar',
    avatarsDeleteCancel: 'Cancel',

    ribbonWhoWrites: 'Who writes this text',
    ribbonSwitchAvatar: 'Switch avatar',
    ribbonNoAvatar: 'No avatar · neutral style',
    ribbonDefaultMark: 'default',

    // Screen 10, continued — what this draft is missing.
    draftGapLabel: 'You could add',
    draftGapOwnMeasurement: 'This post carries no figure of yours.',
    draftGapHabit: (share: number, of: number) =>
      `Your own posts carry one in ${share}% of the ${of} analysed.`,
    draftGapExampleLabel: 'How you do it',
    draftGapOptional: 'The post is ready and goes as it is — answering is optional.',
  },
} as const;

export type VoiceCopy = (typeof voiceCopy)[VoiceLocale];

/**
 * The floor, read from the contract rather than retyped here.
 *
 * It used to be two constants copied into this file, and the samples screen
 * recomputed readiness from them — a third copy of a rule the server also
 * holds. The rule is no longer a constant: how many texts a corpus needs
 * depends on how long its texts are, so a retyped `8` is wrong rather than
 * merely duplicated.
 */
export {
  LOW_CONFIDENCE_CHARS,
  LOW_CONFIDENCE_SAMPLES,
  MIN_CORPUS_CHARS,
  MIN_CORPUS_SAMPLES,
  confidenceReasonsFor,
  requiredSamples,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

export const formatChars = (value: number, locale: VoiceLocale): string =>
  new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(value);

/**
 * A file's weight, in the unit a person recognises it by.
 *
 * Kilobytes below a megabyte and one decimal above it: «0,4 МБ» reads as
 * nothing at all, and «1258291 байт» is a number nobody compares to a ceiling
 * stated in megabytes.
 */
export const formatBytes = (value: number, locale: VoiceLocale): string => {
  const format = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    maximumFractionDigits: value < 1024 * 1024 ? 0 : 1,
  });
  return value < 1024 * 1024
    ? `${format.format(Math.max(1, Math.round(value / 1024)))} ${
        locale === 'ru' ? 'КБ' : 'KB'
      }`
    : `${format.format(value / (1024 * 1024))} ${
        locale === 'ru' ? 'МБ' : 'MB'
      }`;
};

/**
 * The eight captions, taken from the design word for word.
 *
 * A caption here is not decoration: it is what the number means. "Ставит тире
 * вместо связки" tells the reader the scale is about a choice between two
 * spellings, which is also why its denominator is not every sentence.
 */
/** The eight scales' names, kept beside the scales themselves. */
export { STYLE_SCALE_LABELS as scaleLabels } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types';

import type { StyleScaleKey } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types';

export type { StyleScaleKey };

/** The order the design lists them in, and therefore the order screens use. */
export const SCALE_ORDER = [
  'sentenceLength',
  'sentenceSpread',
  'shortSentences',
  'listParagraphs',
  'questions',
  'dashCopula',
  'firstPerson',
  'nominalisation',
] as const satisfies readonly StyleScaleKey[];

/**
 * Each scale's own unit range, mirroring
 * `docs/product/brand-voice-from-samples-spec.md` §3.1 and §3.3.
 *
 * The screen needs it because the bar and the mark have to be placed the same
 * way. The corridor for "насколько длинные фразы" is 10–18 *words*; the value
 * is 14.2 words. Drawing the mark through the domain and the bar as a raw
 * percentage puts them in different coordinate systems, and the corridor then
 * sits somewhere the value can never be — which looks like a working chart and
 * is a lie.
 */
export const SCALE_DOMAIN: Record<StyleScaleKey, [number, number]> = {
  sentenceLength: [4, 40],
  sentenceSpread: [0, 100],
  shortSentences: [0, 100],
  listParagraphs: [0, 100],
  questions: [0, 100],
  dashCopula: [0, 100],
  firstPerson: [0, 100],
  nominalisation: [0, 100],
};

export const toDisplay = (raw: number, key: StyleScaleKey): number => {
  const [min, max] = SCALE_DOMAIN[key];
  return Math.round(
    Math.min(100, Math.max(0, ((raw - min) / (max - min)) * 100))
  );
};

/**
 * The four platforms, named the way a person names them.
 *
 * The recut panel already had this mapping and kept it to itself, so the
 * archive filter, the archive row and the «Занести текст» form went on
 * printing `site`, `telegram`, `vk`, `newsletter`
 * (`content-factory-next-fn33.83`). One dictionary, called from all four
 * places — a second copy is how «ВКонтакте» and «vk» end up naming the same
 * platform on two screens of one section.
 *
 * An unknown value comes back unchanged rather than as a blank: a code nobody
 * translated is at least something a person can report.
 */
export {
  RECUT_PLATFORMS,
  isRecutPlatform,
} from '@contentfactory/nestjs-libraries/content-intelligence/materials/material-presentation';

import { isRecutPlatform } from '@contentfactory/nestjs-libraries/content-intelligence/materials/material-presentation';
import type { RecutPlatform } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/recut';

export const platformLabel = (platform: string, locale: VoiceLocale): string => {
  const t = voiceCopy[locale];
  const names: Record<RecutPlatform, string> = {
    site: t.platformSite,
    telegram: t.platformTelegram,
    vk: t.platformVk,
    newsletter: t.platformNewsletter,
  };
  return isRecutPlatform(platform) ? names[platform] : platform;
};

/** The two content languages, for the same reason and from the same place. */
export const contentLanguageLabel = (
  language: string,
  locale: VoiceLocale
): string => {
  const t = voiceCopy[locale];
  if (language === 'ru') return t.languageRu;
  if (language === 'en') return t.languageEn;
  return language;
};
