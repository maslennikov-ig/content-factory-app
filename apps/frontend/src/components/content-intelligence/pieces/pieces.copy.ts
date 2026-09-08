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
    missingOnLabel: 'Ещё нет в…',
    missingOnAll: 'Где угодно',
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
    noChannelReason: 'Подключите канал, чтобы писать сюда',
    unknownReason: 'Публикации ещё не прочитаны — состояние появится само.',
    cellLabel: (platform: string, state: string) => `${platform}: ${state}`,

    /* --- Строка и её изнанка --------------------------------------------- */
    coreMissing: 'суть не выделена',
    originThought: 'из мысли',
    originLink: 'из ссылки',
    originForeign: 'из чужого поста',
    originLead: 'из повода',
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
      'Модель не ответила — суть собрана из брифа. Проверьте её перед адаптацией.',
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
      'Модель советует переписать. Адаптировать это не мешает — решаете вы.',
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
    ownNumberLabel: 'Можно добавить',
    ownNumberBody: 'В этой заготовке нет вашего числа.',
    ownNumberOptional:
      'Заготовка готова и адаптируется как есть — отвечать не обязательно.',

    /* --- Интервью ---------------------------------------------------------- */
    interviewBadge: 'Уточнение',
    interviewTitle: (count: number) =>
      `${count} ${plural(count, ['вопрос', 'вопроса', 'вопросов'])} — и пишем`,
    interviewLead:
      'Модель предлагает первой. Согласитесь, поправьте или отдайте ей решение.',
    suggestedLead: 'Я думаю, вот так',
    answerYes: 'Так и есть',
    answerFix: 'Поправить',
    answerDecide: 'Реши сама',
    answerSkip: 'Пропустить',
    ownAnswerLabel: 'Ваш ответ',
    ownAnswerHint: 'Пойдёт в текст дословно.',
    skipInterview: 'Пропустить интервью',
    interviewSend: 'Дальше',
    interviewExhausted:
      'Больше спрашивать не будем: два круга — предел. Дальше решает модель.',

    /* --- Уточнение заготовки ----------------------------------------------- */
    // `content-factory-next-m2eg`: вопросы приезжают вместе с заготовкой и
    // живут здесь, рядом с сутью, которую они правят.
    clarifyLead:
      'Заготовка уже сохранена. Ответьте — и суть перепишется с вашими словами; не ответите — останется как есть.',
    clarifySkip: 'Оставить как есть',
    clarifyBusy: 'Переписываем суть…',
    clarifyDone: 'Суть переписана с вашими словами.',
    clarifyFailed: 'Ответ не сохранился. Попробуйте ещё раз.',
  },
  en: {
    title: 'Pieces',
    lead: 'A piece is the substance of what you want to say, with no platform attached. An adaptation is made from it: a post, a caption, an article.',
    subtitle: (count: number) => `${count} ${count === 1 ? 'piece' : 'pieces'}`,
    newPiece: 'New piece',
    searchLabel: 'Search by words',
    searchPlaceholder: 'A word from the title, the substance or the brief…',
    missingOnLabel: 'Not yet on…',
    missingOnAll: 'Anywhere',
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
    noChannelReason: 'Connect a channel to write here',
    unknownReason:
      'The posts have not been read yet — the state will appear on its own.',
    cellLabel: (platform: string, state: string) => `${platform}: ${state}`,

    coreMissing: 'substance not extracted',
    originThought: 'from a thought',
    originLink: 'from a link',
    originForeign: 'from somebody else’s post',
    originLead: 'from a lead',
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
      'The model did not answer — the substance was assembled from the brief. Check it before adapting.',
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
      'The model suggests a rewrite. That does not stop an adaptation — you decide.',
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
    ownNumberLabel: 'You could add',
    ownNumberBody: 'This piece carries no figure of yours.',
    ownNumberOptional:
      'The piece is ready and adapts as it is — answering is optional.',

    interviewBadge: 'One thing to clear up',
    interviewTitle: (count: number) =>
      `${count} ${count === 1 ? 'question' : 'questions'} and we write`,
    interviewLead:
      'The model offers first. Agree, correct it, or hand the decision back.',
    suggestedLead: 'I think it goes like this',
    answerYes: 'That is right',
    answerFix: 'Correct it',
    answerDecide: 'You decide',
    answerSkip: 'Skip',
    ownAnswerLabel: 'Your answer',
    ownAnswerHint: 'It goes into the text word for word.',
    skipInterview: 'Skip the interview',
    interviewSend: 'Next',
    interviewExhausted:
      'We will not ask again: two rounds is the limit. The model decides from here.',

    clarifyLead:
      'The piece is already saved. Answer and the substance is rewritten with your words; leave it and it stays as it is.',
    clarifySkip: 'Leave it as it is',
    clarifyBusy: 'Rewriting the substance…',
    clarifyDone: 'The substance is rewritten with your words.',
    clarifyFailed: 'The answer was not saved. Try again.',
  },
} as const;

export type PiecesWords = (typeof piecesCopy)[PiecesLocale];
