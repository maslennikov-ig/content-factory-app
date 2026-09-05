'use client';

import { useCallback } from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * The words on the «Плагины» screen, in the reader's language.
 *
 * `content-factory-next-fn33.28.18`. A plug describes itself in its provider
 * decorator — title, description, one line per field — and that text is
 * English, shipped from the backend as data. The screen printed it verbatim, so
 * a Russian reader got a Russian heading over English cards: half a screen in
 * each language.
 *
 * Translating on the way out of the backend was the other option and is worse.
 * Those decorators are read by the scheduler as well as by this screen, the
 * request that carries them has no reader attached, and the same metadata
 * already crosses to the plug editor. The language belongs where the reader is.
 *
 * So the backend text becomes an identifier and the words come from the locale
 * files. The mapping is written out rather than derived: a plug is added by
 * hand in a provider, and a missing entry has to fall back to the English the
 * backend sent rather than to a key name printed on the card. `methodName` is
 * the stable half of the plug's own identifier (`x-autoRepostPost`,
 * `bluesky-autoRepostPost`), which is why it — and not the title — is the
 * thing looked up: the same plug is declared once per provider.
 */
const PLUG_KEYS: Record<string, string> = {
  autoRepostPost: 'plug_auto_repost_post',
  autoPlugPost: 'plug_auto_plug_post',
};

/**
 * Field names are unique inside a plug, not across the product, and both plugs
 * that ship here reuse `likesAmount` with the same meaning. One entry per name
 * is therefore correct and stays correct until two plugs disagree about a name
 * — at which point this becomes a per-plug lookup, not a longer string.
 */
const FIELD_KEYS: Record<string, string> = {
  likesAmount: 'plug_field_likes_amount',
  post: 'plug_field_post',
};

export type PlugCopy = ReturnType<typeof usePlugCopy>;

export const usePlugCopy = () => {
  const t = useT();

  const plugText = useCallback(
    (methodName: string, part: 'title' | 'description', fallback: string) => {
      const stem = PLUG_KEYS[methodName];
      return stem ? t(`${stem}_${part}`, fallback) : fallback;
    },
    [t]
  );

  const fieldText = useCallback(
    (name: string, part: 'description' | 'placeholder', fallback: string) => {
      const stem = FIELD_KEYS[name];
      return stem ? t(`${stem}_${part}`, fallback) : fallback;
    },
    [t]
  );

  return { plugText, fieldText };
};
