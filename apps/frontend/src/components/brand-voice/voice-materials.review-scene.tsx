'use client';

import { defineVoiceScene } from './voice.review-scenes';
import {
  VoiceMaterialsScreen,
  type MaterialRow,
  type RecutChange,
  type VoiceMaterialsState,
} from './voice-materials.screen';

/**
 * Screen 11: the library and the recut panel.
 *
 * `selected` is the state worth looking at: a row open on its provenance with
 * the recut panel beside it, which is the only place a person sees where a
 * post came from and where it is about to go at the same time.
 */

const MATERIALS: MaterialRow[] = [
  {
    code: 'cnt-01',
    title: 'Почему мы поменяли поставщика подшипников',
    format: 'длинный',
    postCount: 3,
    date: '05.08.26',
    voiceVersion: 'v3',
  },
  {
    code: 'cnt-02',
    title: 'Итоги наладки линии',
    format: 'короткий',
    postCount: 1,
    date: '12.08.26',
    voiceVersion: 'v3',
  },
  {
    code: 'cnt-03',
    title: 'Разбор простоя на участке термообработки',
    format: 'длинный',
    postCount: 0,
    queuedCount: 2,
    date: '14.08.26',
    voiceVersion: 'v2',
  },
];

const CHANGES: RecutChange[] = [
  { aspect: 'length', from: '312', to: '1 400', lossy: false },
  { aspect: 'lists', from: 'inline', to: 'bullets', lossy: false },
  { aspect: 'images', from: '1', to: '3', lossy: false },
];

const LOSSY: RecutChange[] = [
  { aspect: 'length', from: '6 200', to: '4 096', lossy: true },
  { aspect: 'images', from: '3', to: '1', lossy: true },
];

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/materials',
  fixture: { screen: '11', materials: MATERIALS.length },
  notes: {
    default: {
      ru: 'Плотная таблица: код, название, формат, сколько публикаций вышло. «Переиспользовать» открывает перекройку.',
      en: 'A dense table: code, title, format, how many posts came out. "Reuse" opens the recut.',
    },
    empty: {
      ru: 'Материалов нет. Сказано, что это за сущность и как она здесь появляется.',
      en: 'No material. It says what a piece is and how one gets here.',
    },
    selected: {
      ru: 'Строка раскрыта в происхождение, рядом — перекройка: откуда пришло и куда пойдёт, на одном экране.',
      en: 'A row open on its provenance beside the recut: where it came from and where it goes, on one screen.',
    },
    success: {
      ru: 'Перекройка готова. Отправкой занимается публикация — перекройка только готовит текст.',
      en: 'The recut is ready. Publishing sends it; the recut only prepares the text.',
    },
    error: {
      ru: 'Библиотека не загрузилась, материалы целы.',
      en: 'The library did not load; the material is intact.',
    },
    restricted: {
      ru: 'Библиотека читается, перекройка — действие владельца.',
      en: 'The library is readable; recutting is the owner’s action.',
    },
    disabled: {
      ru: 'Перекройка выключена: видно, что изменится, но открыть редактор нельзя.',
      en: 'Recutting is off: what would change is visible, opening the editor is not.',
    },
    'long-content': {
      ru: 'Потеря названа потерей: 6 200 → 4 096 знаков и 3 → 1 фото помечены, а не описаны как адаптация.',
      en: 'A loss is named a loss: 6,200 → 4,096 chars and 3 → 1 photos are marked, not described as adaptation.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceMaterialsScreen
      locale={locale}
      state={state as VoiceMaterialsState}
      materials={state === 'empty' ? [] : MATERIALS}
      expandedCode={state === 'selected' ? 'cnt-01' : undefined}
      derived={[
        { platform: 'telegram', state: 'PUBLISHED', date: '05.08.26' },
        { platform: 'vk', state: 'PUBLISHED', date: '06.08.26' },
        { platform: 'newsletter', state: 'QUEUED', date: '—' },
      ]}
      recut={
        ['selected', 'success', 'disabled', 'long-content'].includes(state)
          ? {
              code: 'cnt-01',
              platform: state === 'long-content' ? 'telegram' : 'site',
              voiceVersion: 'v3',
              changes: state === 'long-content' ? LOSSY : CHANGES,
            }
          : undefined
      }
    />
  ),
});
