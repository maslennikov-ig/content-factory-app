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
const ruDays = (count: number) => plural(count, ['день', 'дня', 'дней']);
const enDays = (count: number) => (count === 1 ? 'day' : 'days');

export const calendarPlanningCopy = {
  ru: {
    title: 'Что публикуем',
    schedule: '+ Запланировать',
    allChannels: 'Все каналы',
    channelsLink: 'Все каналы →',
    noDate: 'Дата не выбрана',
    search: 'Поиск по заголовку и каналу',
    ready: 'Готовые адаптации',
    readyAt: 'готово',
    newPiece: 'Новая заготовка',
    cancel: 'Отмена',
    placeAt: (time: string) => `Поставить на ${time}`,
    choose: 'Выбрать',
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
    legendLabel: 'Подсказка: состояния постов',
    legendHint:
      '«в плане» — время забронировано, пост выйдет после «Запланировать»; «в очереди» — выйдет сам в своё время.',
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
    // «Впереди N дней» (`97dq.59`).
    ahead: (count: number, until: string) =>
      count ? `впереди ${count} ${ruDays(count)} · до ${until}` : 'впереди пусто',
    aheadChannel: (count: number, until: string) =>
      `${count} ${ruDays(count)} · до ${until}`,
    aheadEmptyFrom: (day: string) => `пусто с ${day}`,
    aheadByChannel: 'По каналам',
    aheadHintLabel: 'Подсказка: впереди дней',
    aheadHint:
      'Сколько дней подряд, начиная с сегодня, в каждом есть пост «в плане» или «в очереди» в выбранных каналах.',
    aheadCardTitle: 'План впереди',
    aheadCardDays: (count: number) => `${ruDays(count)} впереди`,
    aheadCardStrip:
      'следующие 14 дней · закрашено — есть пост в плане или в очереди',
    aheadCardHint:
      'Дни подряд с сегодняшнего, в каждом из которых стоит пост «в плане» или «в очереди». Считается по всем каналам.',
    aheadError: 'Не удалось посчитать, на сколько дней вперёд есть план.',
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
      'Сама не опубликуется: в канале режим «Бронь». Выйдет после «Запланировать».',
    explainAutopilot: 'Выйдет сама в это время.',
    explainDraft:
      'Лежит черновиком с этим временем: в канале режим «Без плана». Выйдет после «Запланировать».',
    chooseAnother: 'Выбрать другую',
    openAndEdit: 'Открыть и поправить',
    done: 'Готово',
  },
  en: {
    title: 'What are we publishing?',
    schedule: '+ Schedule',
    allChannels: 'All channels',
    channelsLink: 'All channels →',
    noDate: 'Date not selected',
    search: 'Search by title or channel',
    ready: 'Ready adaptations',
    readyAt: 'ready',
    newPiece: 'New piece',
    cancel: 'Cancel',
    placeAt: (time: string) => `Place at ${time}`,
    choose: 'Choose',
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
    legendLabel: 'Hint: post states',
    legendHint:
      '“planned” — the time is held and the post goes out after “Schedule”; “queued” — it goes out by itself on time.',
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
    ahead: (count: number, until: string) =>
      count ? `${count} ${enDays(count)} ahead · until ${until}` : 'nothing ahead',
    aheadChannel: (count: number, until: string) =>
      `${count} ${enDays(count)} · until ${until}`,
    aheadEmptyFrom: (day: string) => `empty from ${day}`,
    aheadByChannel: 'By channel',
    aheadHintLabel: 'Hint: days ahead',
    aheadHint:
      'How many days in a row, starting today, each hold a planned or queued post in the selected channels.',
    aheadCardTitle: 'Plan ahead',
    aheadCardDays: (count: number) => `${enDays(count)} ahead`,
    aheadCardStrip: 'next 14 days · filled — a planned or queued post',
    aheadCardHint:
      'Days in a row from today that each hold a planned or queued post. Counted across all channels.',
    aheadError: 'Could not count how many days ahead are planned.',
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
      'It will not publish by itself: the channel is in “Reserve” mode. It goes out after “Schedule”.',
    explainAutopilot: 'It goes out by itself at this time.',
    explainDraft:
      'It stays a draft with this time: the channel is in “No plan” mode. It goes out after “Schedule”.',
    chooseAnother: 'Choose another',
    openAndEdit: 'Open and edit',
    done: 'Done',
  },
} as const;
