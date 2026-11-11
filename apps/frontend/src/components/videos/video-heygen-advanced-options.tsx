'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { Button } from '@contentfactory/react/form/button';
import { Select } from '@contentfactory/react/form/select';
import { LabelledField } from '../ui/field-label';

type Options = {
  draftId: string;
  draftVersion: number;
  selectedVoiceEngine: string | null;
  voice?: {voice: {engineTypes?: string[]}};
  glossaries?: {id: string; name: string}[];
  assets?: {id: string; name: string; type: 'audio' | 'image'; renderQualified: false}[];
  matting?: {matting: 'unknown' | 'supported' | 'unsupported'};
  unavailable?: ('voice' | 'glossaries' | 'assets' | 'matting')[];
};

const copy = {
  ru: {
    load: 'Проверить словари, голос и материалы', loading: 'Проверяю настройки HeyGen…',
    failed: 'Не удалось проверить дополнительные настройки.', retry: 'Повторить проверку',
    glossary: 'Словарь произношений', none: 'Без словаря', saved: 'Сохранённый словарь',
    noGlossaries: 'В этом аккаунте пока нет доступных словарей.',
    voice: 'Движок сохранённого голоса', defaultEngine: 'Настройка голоса в HeyGen',
    advertised: 'Движки из каталога для этого голоса', engineNote: 'Смена движка и модели требует отдельного выбора и проверки совместимости.',
    images: 'Изображение фона', noImage: 'Без изображения', savedImage: 'Сохранённое изображение', audio: 'Исходные записи',
    empty: 'В каталоге нет материалов этого типа.',
    imageNote: 'При сохранении приложение проверит изображение и привяжет его к вашей медиатеке.',
    assetNote: 'Для выбора записи нужны подтверждённый оригинал и совпадение файла с материалом HeyGen.',
    matting: 'Для удаления фона нужно подтверждение поддержки у выбранного образа.',
    saveLook: 'Сохраните выбранный образ, чтобы проверить его возможности.',
    unreadGlossaries: 'HeyGen пока не отдаёт список словарей.',
    unreadVoice: 'HeyGen пока не подтверждает список движков для этого голоса.',
    unreadAssets: 'HeyGen пока не отдаёт список материалов.',
  },
  en: {
    load: 'Check glossaries, voice and assets', loading: 'Checking HeyGen options…',
    failed: 'Could not check advanced options.', retry: 'Try again',
    glossary: 'Pronunciation glossary', none: 'No glossary', saved: 'Saved glossary',
    noGlossaries: 'This account has no available glossaries yet.',
    voice: 'Saved voice engine', defaultEngine: 'Voice setting in HeyGen',
    advertised: 'Engines listed for this voice', engineNote: 'Changing the voice engine or model requires a separate choice and compatibility check.',
    images: 'Background image', noImage: 'No image', savedImage: 'Saved image', audio: 'Original recordings',
    empty: 'The catalog has no assets of this type.',
    imageNote: 'Saving verifies the image and binds it to your library.',
    assetNote: 'Selecting a recording requires a confirmed original and a matching HeyGen asset.',
    matting: 'Background removal requires confirmed support for the selected look.',
    saveLook: 'Save this look to check its capabilities.',
    unreadGlossaries: 'HeyGen could not return the glossary catalog.',
    unreadVoice: 'HeyGen could not verify the engines for this voice.',
    unreadAssets: 'HeyGen could not return the asset catalog.',
  },
} as const;

export function VideoHeygenAdvancedOptions({actorKey, draftId, version, disabled, glossaryId, onGlossaryChange,
  backgroundAssetId, onBackgroundChange, appearanceMatches}: {
  actorKey: string;
  draftId: string;
  version: number;
  disabled: boolean;
  glossaryId: string;
  onGlossaryChange: (id: string) => void;
  backgroundAssetId: string;
  onBackgroundChange: (id: string) => void;
  appearanceMatches: boolean;
}) {
  const request = useFetch();
  const w = copy[useInterfaceLanguage().startsWith('ru') ? 'ru' : 'en'];
  const [opened, setOpened] = useState(false);
  const state = useSWR<Options>(opened ? ['heygen-advanced-options-v1', actorKey, draftId, version] : null, async () => {
    const response = await request(`/media/video-v2/drafts/${encodeURIComponent(draftId)}/heygen-options?version=${version}`);
    if (!response.ok) throw new Error('read');
    const value = await response.json();
    if (value.draftId !== draftId || value.draftVersion !== version) throw new Error('stale');
    return value;
  }, {revalidateOnFocus: false, shouldRetryOnError: false});

  if (!opened) return <div><Button variant="quiet" disabled={disabled} onClick={() => setOpened(true)}>{w.load}</Button></div>;
  if (state.error) return <p role="alert" className="cf-body-sm text-cf-danger">{w.failed} <Button variant="quiet" onClick={() => state.mutate()}>{w.retry}</Button></p>;
  if (!state.data) return <p role="status" className="cf-body-sm text-cf-ink-muted">{w.loading}</p>;

  const {glossaries = [], assets = [], selectedVoiceEngine, voice, unavailable = []} = state.data;
  const images = assets.filter(asset => asset.type === 'image');
  const recordings = assets.filter(asset => asset.type === 'audio');
  return <div className="flex min-w-0 flex-col gap-[8px] border-t border-cf-border pt-[12px]">
    <LabelledField id="heygen-glossary" label={w.glossary}>
      <Select standalone id="heygen-glossary" disabled={disabled || (!glossaries.length && !glossaryId)}
        value={glossaryId} onChange={event => onGlossaryChange(event.target.value)}>
        <option value="">{w.none}</option>
        {glossaryId && !glossaries.some(option => option.id === glossaryId) && <option value={glossaryId} disabled>{w.saved}</option>}
        {glossaries.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </Select>
    </LabelledField>
    {!glossaries.length && <p className="cf-body-sm text-cf-ink-muted">{unavailable.includes('glossaries') ? w.unreadGlossaries : w.noGlossaries}</p>}
    <p className="cf-body-sm">{w.voice} · {selectedVoiceEngine ?? w.defaultEngine}</p>
    {!!voice?.voice.engineTypes?.length && <p className="cf-body-sm text-cf-ink-muted">{w.advertised} · {voice.voice.engineTypes.join(', ')}. {w.engineNote}</p>}
    {unavailable.includes('voice')&&<p className="cf-body-sm text-cf-ink-muted">{w.unreadVoice}</p>}
    <LabelledField id="heygen-background-image" label={w.images}>
      <Select standalone id="heygen-background-image" disabled={disabled || (!images.length && !backgroundAssetId)}
        value={backgroundAssetId} onChange={event => onBackgroundChange(event.target.value)}>
        <option value="">{w.noImage}</option>
        {backgroundAssetId && !images.some(image => image.id === backgroundAssetId) && <option disabled value={backgroundAssetId}>{w.savedImage}</option>}
        {images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
      </Select>
    </LabelledField>
    <p className="cf-body-sm text-cf-ink-muted">{images.length ? w.imageNote : unavailable.includes('assets') ? w.unreadAssets : w.empty}</p>
    <p className="cf-label-md">{w.audio}</p>
    {recordings.length > 0
      ? <ul className="break-words cf-body-sm text-cf-ink-muted">{recordings.map(asset => <li key={asset.id}>{asset.name}</li>)}</ul>
      : <p className="cf-body-sm text-cf-ink-muted">{unavailable.includes('assets') ? w.unreadAssets : w.empty}</p>}
    <p className="cf-body-sm text-cf-ink-muted">{w.assetNote}</p>
    <p className="cf-body-sm text-cf-ink-muted">{appearanceMatches ? w.matting : w.saveLook}</p>
  </div>;
}
