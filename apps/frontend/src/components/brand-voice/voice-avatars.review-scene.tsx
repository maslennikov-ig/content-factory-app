'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceAvatarsScreen,
  type AvatarRow,
  type VoiceAvatarsState,
} from './voice-avatars.screen';
import { MAX_AVATARS_PER_SPACE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * Screen 12: the avatars of a space, in nine states.
 *
 * Two of them carry the weight. `disabled` is the ceiling — eight of eight —
 * and it has to read as "delete one or raise the plan" rather than as a
 * failure. `long-content` is a sixty-character name beside seven other
 * avatars, which is where a two-column grid of cards either holds or turns
 * into a wall.
 *
 * The confirmation lives in `selected`, and deliberately in its harder shape:
 * deleting the default while another avatar could take over is the one that
 * asks a question rather than merely warning, and it is the one worth looking
 * at in both themes and both languages.
 */

const AVATARS: readonly AvatarRow[] = [
  {
    id: 'avt-01',
    name: 'Алексей Ким',
    kind: 'PERSON',
    isDefault: true,
    analysed: true,
    versionLabel: 'v3',
    sampleCount: 48,
    createdAt: '12.06.2026',
    activeSince: '14.08.2026',
    hasPortrait: true,
  },
  {
    id: 'avt-02',
    name: 'Служба новостей завода',
    kind: 'BRAND',
    isDefault: false,
    analysed: true,
    versionLabel: 'v1',
    sampleCount: 22,
    createdAt: '03.07.2026',
    activeSince: '03.07.2026',
  },
  {
    id: 'avt-03',
    name: null,
    kind: 'PERSON',
    isDefault: false,
    analysed: false,
    createdAt: '25.08.2026',
  },
  {
    id: 'avt-04',
    name: 'Ирина Гросс',
    kind: 'PERSON',
    isDefault: false,
    analysed: true,
    versionLabel: 'v2',
    sampleCount: 31,
    createdAt: '19.08.2026',
    activeSince: '21.08.2026',
  },
];

/** Eight of eight, and one of them named at the length the design draws. */
const FULL: readonly AvatarRow[] = [
  ...AVATARS,
  {
    id: 'avt-05',
    name: 'Пресс-служба объединения «Севмашэнергоремонт», Урал',
    kind: 'BRAND',
    isDefault: false,
    analysed: true,
    versionLabel: 'v11',
    sampleCount: 96,
    createdAt: '07.08.2026',
    activeSince: '19.08.2026',
  },
  {
    id: 'avt-06',
    name: 'Надежда Ли',
    kind: 'PERSON',
    isDefault: false,
    analysed: true,
    versionLabel: 'v4',
    sampleCount: 57,
    createdAt: '11.08.2026',
    activeSince: '22.08.2026',
  },
  {
    id: 'avt-07',
    name: 'Отдел внутренних коммуникаций',
    kind: 'BRAND',
    isDefault: false,
    analysed: false,
    createdAt: '24.08.2026',
  },
  {
    id: 'avt-08',
    name: 'Виктор Пенкин',
    kind: 'PERSON',
    isDefault: false,
    analysed: true,
    versionLabel: 'v2',
    sampleCount: 18,
    createdAt: '25.08.2026',
    activeSince: '25.08.2026',
  },
];

const rowsFor = (state: string): readonly AvatarRow[] =>
  state === 'empty'
    ? []
    : state === 'disabled' || state === 'long-content'
    ? FULL
    : AVATARS;

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/avatars',
  fixture: { screen: '12', states: 9 },
  notes: {
    default: {
      ru: 'Одна форма карточки: вид — признак внутри, а не колонка. Кто пишет — сказано полосой сверху и меткой на карточке.',
      en: 'One card shape: the kind is a marker inside, not a column. Who writes is said by the band above and by the card marker.',
    },
    empty: {
      ru: 'Аватаров нет: тексты собираются нейтральным стилем. Рабочий режим, а не ошибка.',
      en: 'No avatars: text is written in a neutral style. A working mode, not an error.',
    },
    selected: {
      ru: 'Удаление аватара по умолчанию: продукт не выбирает наследника за человека, а спрашивает. Аватаров без разбора в списке нет.',
      en: 'Deleting the default: the product asks who takes over instead of choosing. Unanalysed avatars are not on the list.',
    },
    success: {
      ru: 'Основной сменился. Сказано именем, а не «сохранено».',
      en: 'The default moved. Said by name, not by "saved".',
    },
    error: {
      ru: 'Имя не сохранилось. Текст остался в поле, аватар по умолчанию не менялся.',
      en: 'The name was not saved. The text stayed in the field and the default did not move.',
    },
    restricted: {
      ru: 'Редактор: список виден и выбрать аватар в черновике можно, править нельзя.',
      en: 'Editor: the list is visible and an avatar can be picked in a draft, but not edited.',
    },
    disabled: {
      ru: 'Восемь из восьми: «Создать» выключено и сказано, что делать дальше.',
      en: 'Eight of eight: "New avatar" is off and the next step is named.',
    },
    'long-content': {
      ru: 'Имя в 50 знаков при восьми аватарах: сетка остаётся в две колонки, карточка растёт вниз.',
      en: 'A 50-character name across eight avatars: the grid stays two columns and the card grows down.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceAvatarsScreen
      locale={locale}
      state={state as VoiceAvatarsState}
      avatars={rowsFor(state)}
      defaultAvatarId={state === 'empty' ? null : 'avt-01'}
      limit={MAX_AVATARS_PER_SPACE}
      canManage={state !== 'restricted'}
      openMenuId={state === 'default' ? 'avt-02' : null}
      renamingId={state === 'error' ? 'avt-04' : null}
      draftName={state === 'error' ? 'Ирина Гросс' : ''}
      confirmDelete={
        state === 'selected'
          ? { avatarId: 'avt-01', successorId: 'avt-02' }
          : null
      }
    />
  ),
});
