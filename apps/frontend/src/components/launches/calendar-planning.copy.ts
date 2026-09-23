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
    empty: 'Готовых адаптаций пока нет',
    emptyHint:
      'Тексты под каналы рождаются в разделе «Контент»: мысль → заготовка → адаптация. Готовая адаптация появится здесь, пока она не поставлена в план.',
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
    empty: 'No ready adaptations yet',
    emptyHint:
      'Channel texts start in Content: idea → piece → adaptation. A ready adaptation appears here until it is scheduled.',
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
  },
} as const;
