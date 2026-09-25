/**
 * Слова планирования в календаре: окно «Что публикуем» и пустые слоты сетки.
 *
 * `97dq.50`, вариант A холста одиннадцатого захода (23.09.2026). Пустой слот
 * везде говорит одно и то же — «добавить пост на это время», — поэтому его
 * подписи живут здесь, рядом с окном, которое он открывает.
 */

import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';

/** 1 слот, 2 слота, 5 слотов, 21 слот — общим `plural`. */
const ruSlots = (count: number) =>
  `${count} ${plural(count, ['слот', 'слота', 'слотов'])}`;
/** 1 пост, 3 поста, 5 постов. */
const ruPosts = (count: number) => plural(count, ['пост', 'поста', 'постов']);
const enPosts = (count: number) => (count === 1 ? 'post' : 'posts');

export const calendarPlanningCopy = {
  ru: {
    title: 'Что публикуем',
    schedule: '+ Запланировать',
    allChannels: 'Все каналы',
    channelsLink: 'Все каналы →',
    noDate: 'Дата не выбрана',
    search: 'Поиск: заголовок, код cnt- или канал',
    // Фильтры «Что публикуем» (`97dq.72`).
    channelFilter: 'Канал',
    channelFilterHintLabel: 'Подсказка: канал',
    channelFilterHint:
      'Показывает адаптации одного канала. «Все каналы» — адаптации всех каналов этого слота.',
    stateFilter: 'Состояние адаптации',
    stateFilterWords: {
      all: 'Все',
      free: 'Свободные',
      reserved: 'В плане',
      queued: 'В очереди',
    },
    stateFilterHintLabel: 'Подсказка: состояние адаптации',
    stateFilterHint:
      '«Свободные» ещё без времени. «В плане» — время забронировано, пост ждёт подтверждения. «В очереди» — выйдет сам в своё время. Число — сколько таких сейчас в списке.',
    ready: 'Готовые адаптации',
    readyAt: 'готово',
    newPiece: 'Новая заготовка',
    cancel: 'Отмена',
    placeAt: (time: string) => `Поставить на ${time}`,
    choose: 'Выбрать',
    // Шапка календаря (`97dq.74`): кнопки и полосы вместо кликабельных div.
    toolbarPrevious: 'Назад',
    toolbarNext: 'Вперёд',
    toolbarListState: 'Какие посты показать',
    // Поиск по словам в списке постов (`odb8.4.1`).
    listSearch: 'Поиск по тексту постов',
    listSearchPlaceholder: 'Слова из поста',
    listSearchHintLabel: 'Подсказка: поиск по тексту постов',
    listSearchHint:
      'Показывает посты, в тексте которых есть все набранные слова — в любом порядке, большими или маленькими буквами. Отбор по состоянию, каналу и этапу остаётся.',
    listSearchEmpty: (query: string) => `Нет постов со словами «${query}».`,
    toolbarPeriod: 'Период: день, неделя или месяц',
    toolbarView: 'Вид: календарь или список',
    toolbarViewCalendar: 'Календарь',
    toolbarViewList: 'Список',
    // Где адаптация стоит сейчас (`97dq.57`).
    slotReserved: 'в плане',
    slotQueued: 'в очереди',
    slotFree: 'свободна',
    slotAutopilot: 'автопилот',
    placing: 'Ставим…',
    placeFailed: 'Не удалось поставить адаптацию на это время. Попробуйте ещё раз.',
    empty: 'Готовых адаптаций пока нет',
    emptyHint:
      'Тексты под каналы рождаются в разделе «Контент»: мысль → заготовка → адаптация. Готовая адаптация появится здесь — со временем, если она уже в плане или в очереди.',
    content: 'В контент →',
    noMatches: 'Ничего не найдено',
    reset: 'Сбросить поиск и фильтр',
    loading: 'Загружаем адаптации',
    error: 'Не удалось загрузить адаптации',
    retry: 'Повторить',
    readonly: 'Планирование доступно редактору рабочего пространства.',
    noChannels: 'Для поста нужен канал. Подключите его в разделе «Каналы».',
    origin: 'из заготовки',
    originOpen: 'открыть',
    addPostAt: (time: string) => `Добавить пост на ${time}`,
    morePostAt: (time: string) => `Ещё пост на ${time}`,
    slotOf: (count: number) => (count > 1 ? 'слоты каналов' : 'слот канала'),
    slots: (count: number) => ruSlots(count),
    slotsOpenDay: (count: number, day: string) =>
      `${ruSlots(count)} на ${day} — открыть день`,
    dayOtherTime:
      'Другое время — кнопкой «Запланировать» вверху. Слоты берутся из расписания каналов.',
    // Много каналов в одно время (`97dq.59`, холст C2 A).
    stateDraft: 'черновик',
    statePublished: 'вышел',
    stateError: 'не ушло',
    legendHint:
      '«в плане» — время забронировано, пост выйдет после вашего «Подтвердить»; «в очереди» — выйдет сам в своё время.',
    channels: (count: number) =>
      `${count} ${plural(count, ['канал', 'канала', 'каналов'])}`,
    channelsShort: (count: number) => `${count} кан.`,
    freeNone: 'свободно: нет',
    freeLeft: (count: number) =>
      `ещё свободно у ${count} ${plural(count, ['канала', 'каналов', 'каналов'])}`,
    moreRows: (count: number) => `ещё ${count}`,
    lessRows: 'свернуть',
    groupOpen: (time: string, count: number) =>
      `${time}: ${count} ${plural(count, ['канал', 'канала', 'каналов'])} — показать посты`,
    // План впереди (`97dq.59`, счётчики с `97dq.73`): в постах, не в днях подряд.
    aheadChip: (count: number, until: string) =>
      count
        ? `В плане ${count} ${ruPosts(count)}${until ? ` · до ${until}` : ''}`
        : 'План пуст',
    aheadChannel: (count: number, until: string) =>
      count ? `${count} ${ruPosts(count)}${until ? ` · до ${until}` : ''}` : 'пусто',
    aheadByChannel: 'По каналам',
    aheadHintLabel: 'Подсказка: план впереди',
    aheadHint:
      'Сколько постов стоит впереди, с сегодняшнего дня: и «в плане» (время забронировано, пост ждёт подтверждения), и «в очереди» (выйдет сам). «До» — последний день, на который что-то стоит. Наведите, чтобы увидеть по каналам.',
    aheadError: 'Не удалось посчитать план впереди.',
    aheadLoading: 'Считаем план впереди',
    aheadHintFor: (subject: string) => `Подсказка: ${subject.toLocaleLowerCase('ru')}`,
    aheadTitle: 'План впереди',
    aheadDescription:
      'Что уже стоит в календаре с сегодняшнего дня и где план кончается. Все каналы, ваш часовой пояс; период и канал выше сюда не относятся.',
    today: 'сегодня',
    kpiAhead: 'Постов впереди',
    kpiAheadSplit: (reserved: number, queued: number) =>
      `в плане ${reserved} · в очереди ${queued}`,
    kpiAheadHint:
      'Все посты с сегодняшнего дня, которые стоят в календаре. «В плане» ждут подтверждения, «в очереди» выйдут сами.',
    kpiDays: 'Дней с постами из ближайших 14',
    kpiDaysValue: (count: number, of: number) => `${count} из ${of}`,
    kpiDaysHint:
      'Сколько из ближайших 14 дней, считая сегодня, имеют хотя бы один пост — в плане, в очереди или уже вышедший сегодня.',
    kpiUntil: 'План до',
    kpiUntilNone: 'плана нет',
    kpiUntilHint:
      'Последний день, на который стоит пост в плане или в очереди. Дальше этого дня календарь пуст.',
    kpiEmpty: 'Первый пустой день',
    kpiEmptyHint:
      'Ближайший день, начиная с сегодня, без единого поста. С него стоит продолжать план.',
    stripTitle: 'Ближайшие 14 дней',
    stripHint:
      'Каждая клетка — день, число в ней — сколько постов в этот день. Цвет берётся у самого «сильного» поста дня: в очереди, потом в плане, потом вышедший.',
    stripDay: (day: string, reserved: number, queued: number, published: number) =>
      `${day ? `${day}: ` : ''}в плане ${reserved}, в очереди ${queued}, вышло ${published}`,
    stripLegend: {
      queued: 'выйдет сам',
      reserved: 'ждёт подтверждения',
      published: 'уже вышел сегодня',
      empty: 'пусто — постов нет',
    },
    tableTitle: 'По каналам',
    tableHint:
      'Та же картина по каждому каналу: сколько постов впереди, сколько вышло за последние 7 дней, до какого дня хватает плана и где первый пустой день.',
    tableEmpty: 'Подключённых каналов пока нет',
    colChannel: 'Канал',
    colReserved: 'В плане',
    colQueued: 'В очереди',
    colPublished: 'Вышло за 7 дней',
    colUntil: 'План до',
    colEmpty: 'Первый пустой день',
    aheadEmptyTitle: 'Впереди ничего не стоит',
    aheadEmptyBody:
      'Поставьте готовую адаптацию на время в календаре — она появится здесь.',
    aheadEmptyAction: 'Открыть календарь',
    // Окно после «Поставить на ЧЧ:ММ» (`97dq.59`, холст C3 A).
    placedReserved: 'Стоит в плане',
    placedQueued: 'Стоит в очереди',
    placedDraft: 'Стоит в календаре',
    modeReserve: 'бронь',
    modeAutopilot: 'автопилот',
    modeDraft: 'без плана',
    modeHintLabel: 'Подсказка: режим плана',
    modeHint:
      'Режим «План» канала задаётся на карточке «Как пишем» в разделе «Каналы».',
    explainReserve:
      'Сама не опубликуется: в канале режим «Бронь». Выйдет после вашего «Подтвердить».',
    explainAutopilot: 'Выйдет сама в это время.',
    explainDraft:
      'Лежит черновиком с этим временем: в канале режим «Без плана». Выйдет после «Запланировать».',
    chooseAnother: 'Выбрать другую',
    openAndEdit: 'Открыть и поправить',
    done: 'Готово',
    // Шапка календаря, вариант A (`97dq.82`).
    channelsButton: 'Каналы',
    channelsSettingsTitle: 'Каналы и их настройки',
    aheadLegendHintLabel: 'Подсказка: план впереди и состояния постов',
    aheadLegendTitle: 'Состояния постов в календаре',
  },
  en: {
    title: 'What are we publishing?',
    schedule: '+ Schedule',
    allChannels: 'All channels',
    channelsLink: 'All channels →',
    noDate: 'Date not selected',
    search: 'Search: title, cnt- code or channel',
    channelFilter: 'Channel',
    channelFilterHintLabel: 'Hint: channel',
    channelFilterHint:
      'Shows one channel’s adaptations. “All channels” shows every channel of this slot.',
    stateFilter: 'Adaptation state',
    stateFilterWords: {
      all: 'All',
      free: 'Free',
      reserved: 'Planned',
      queued: 'Queued',
    },
    stateFilterHintLabel: 'Hint: adaptation state',
    stateFilterHint:
      '“Free” has no time yet. “Planned” holds a time and waits for confirmation. “Queued” goes out by itself on time. The number is how many are in the list now.',
    ready: 'Ready adaptations',
    readyAt: 'ready',
    newPiece: 'New piece',
    cancel: 'Cancel',
    placeAt: (time: string) => `Place at ${time}`,
    choose: 'Choose',
    toolbarPrevious: 'Previous',
    toolbarNext: 'Next',
    toolbarListState: 'Which posts to show',
    listSearch: 'Search the posts’ text',
    listSearchPlaceholder: 'Words from the post',
    listSearchHintLabel: 'Hint: search the posts’ text',
    listSearchHint:
      'Shows the posts whose text has every word you type — in any order, in capitals or not. The state, channel and stage filters still apply.',
    listSearchEmpty: (query: string) => `No posts with the words “${query}”.`,
    toolbarPeriod: 'Period: day, week or month',
    toolbarView: 'View: calendar or list',
    toolbarViewCalendar: 'Calendar',
    toolbarViewList: 'List',
    slotReserved: 'planned',
    slotQueued: 'queued',
    slotFree: 'free',
    slotAutopilot: 'autopilot',
    placing: 'Placing…',
    placeFailed: 'The adaptation could not be placed at this time. Try again.',
    empty: 'No ready adaptations yet',
    emptyHint:
      'Channel texts start in Content: idea → piece → adaptation. A ready adaptation appears here — with its time if it is already planned or queued.',
    content: 'Go to Content →',
    noMatches: 'No matches',
    reset: 'Clear search and filter',
    loading: 'Loading adaptations',
    error: 'Could not load adaptations',
    retry: 'Try again',
    readonly: 'Planning is available to workspace editors.',
    noChannels: 'A post needs a channel. Connect one in Channels.',
    origin: 'from piece',
    originOpen: 'open',
    addPostAt: (time: string) => `Add a post at ${time}`,
    morePostAt: (time: string) => `Another post at ${time}`,
    slotOf: (count: number) => (count > 1 ? 'channel slots' : 'channel slot'),
    slots: (count: number) => `${count} ${count === 1 ? 'slot' : 'slots'}`,
    slotsOpenDay: (count: number, day: string) =>
      `${count} ${count === 1 ? 'slot' : 'slots'} on ${day} — open the day`,
    dayOtherTime:
      'Another time — use «Schedule» above. Slots come from the channels’ schedules.',
    stateDraft: 'draft',
    statePublished: 'out',
    stateError: 'failed',
    legendHint:
      '“planned” — the time is held and the post goes out after your “Confirm”; “queued” — it goes out by itself on time.',
    channels: (count: number) =>
      `${count} ${count === 1 ? 'channel' : 'channels'}`,
    channelsShort: (count: number) => `${count} ch.`,
    freeNone: 'free: none',
    freeLeft: (count: number) =>
      `still free in ${count} ${count === 1 ? 'channel' : 'channels'}`,
    moreRows: (count: number) => `${count} more`,
    lessRows: 'collapse',
    groupOpen: (time: string, count: number) =>
      `${time}: ${count} ${count === 1 ? 'channel' : 'channels'} — show posts`,
    aheadChip: (count: number, until: string) =>
      count
        ? `${count} ${enPosts(count)} planned${until ? ` · until ${until}` : ''}`
        : 'Plan is empty',
    aheadChannel: (count: number, until: string) =>
      count ? `${count} ${enPosts(count)}${until ? ` · until ${until}` : ''}` : 'empty',
    aheadByChannel: 'By channel',
    aheadHintLabel: 'Hint: plan ahead',
    aheadHint:
      'How many posts stand ahead from today: both “planned” (the time is held, the post waits for confirmation) and “queued” (it goes out by itself). “Until” is the last day that holds anything. Hover to see each channel.',
    aheadError: 'Could not count the plan ahead.',
    aheadLoading: 'Counting the plan ahead',
    aheadHintFor: (subject: string) => `Hint: ${subject.toLocaleLowerCase('en')}`,
    aheadTitle: 'Plan ahead',
    aheadDescription:
      'What already stands on the calendar from today, and where the plan ends. All channels, your time zone; the period and channel above do not apply here.',
    today: 'today',
    kpiAhead: 'Posts ahead',
    kpiAheadSplit: (reserved: number, queued: number) =>
      `planned ${reserved} · queued ${queued}`,
    kpiAheadHint:
      'Every post from today on that stands on the calendar. “Planned” ones wait for confirmation, “queued” ones go out by themselves.',
    kpiDays: 'Days with posts in the next 14',
    kpiDaysValue: (count: number, of: number) => `${count} of ${of}`,
    kpiDaysHint:
      'How many of the next 14 days, today included, hold at least one post — planned, queued, or already out today.',
    kpiUntil: 'Plan until',
    kpiUntilNone: 'no plan',
    kpiUntilHint:
      'The last day with a planned or queued post. Past it the calendar is empty.',
    kpiEmpty: 'First empty day',
    kpiEmptyHint:
      'The nearest day, from today on, without a single post. That is where the plan should continue.',
    stripTitle: 'Next 14 days',
    stripHint:
      'Each cell is a day; its number is how many posts it holds. The colour is that of the day’s strongest post: queued, then planned, then already out.',
    stripDay: (day: string, reserved: number, queued: number, published: number) =>
      `${day ? `${day}: ` : ''}planned ${reserved}, queued ${queued}, out ${published}`,
    stripLegend: {
      queued: 'goes out by itself',
      reserved: 'waits for confirmation',
      published: 'already out today',
      empty: 'empty — no posts',
    },
    tableTitle: 'By channel',
    tableHint:
      'The same picture per channel: posts ahead, posts out in the last 7 days, how far the plan reaches, and the first empty day.',
    tableEmpty: 'No connected channels yet',
    colChannel: 'Channel',
    colReserved: 'Planned',
    colQueued: 'Queued',
    colPublished: 'Out in 7 days',
    colUntil: 'Plan until',
    colEmpty: 'First empty day',
    aheadEmptyTitle: 'Nothing stands ahead',
    aheadEmptyBody:
      'Place a ready adaptation at a time on the calendar and it appears here.',
    aheadEmptyAction: 'Open the calendar',
    placedReserved: 'Planned',
    placedQueued: 'Queued',
    placedDraft: 'On the calendar',
    modeReserve: 'reserve',
    modeAutopilot: 'autopilot',
    modeDraft: 'no plan',
    modeHintLabel: 'Hint: plan mode',
    modeHint:
      'A channel’s plan mode is set on its “How we write” card in Channels.',
    explainReserve:
      'It will not publish by itself: the channel is in “Reserve” mode. It goes out after your “Confirm”.',
    explainAutopilot: 'It goes out by itself at this time.',
    explainDraft:
      'It stays a draft with this time: the channel is in “No plan” mode. It goes out after “Schedule”.',
    chooseAnother: 'Choose another',
    openAndEdit: 'Open and edit',
    done: 'Done',
    // Calendar header, direction A (`97dq.82`).
    channelsButton: 'Channels',
    channelsSettingsTitle: 'Channels and their settings',
    aheadLegendHintLabel: 'Hint: the plan ahead and post states',
    aheadLegendTitle: 'Post states on the calendar',
  },
} as const;
