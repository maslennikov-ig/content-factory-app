'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  AVATAR_ROUTES,
  mapAvatars,
} from '../../brand-voice/voice-avatars.adapter';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  type ChannelWritingProfileV1,
  type LengthPreset,
} from './writing-profile.adapter';
import { emojiLevelWord } from './emoji-words';
import { EMOJI_STOPS } from '@contentfactory/nestjs-libraries/content-intelligence/channels/emoji-ceiling';

/** Один аватар пространства, как его видит выбор «Кто говорит здесь». */
export type WritingProfileAvatar = {
  id: string;
  name: string | null;
};

/**
 * Аватары пространства для выбора «Кто говорит здесь».
 *
 * Та же дверь, что у экрана аватаров, и то же чтение `mapAvatars`: второй
 * разбор одного ответа — это второе мнение о том, какие аватары есть. Пока
 * ответа нет или дверь отказала, список пуст, и выбор просто не рисуется —
 * карточка канала от этого не ломается, в ней остаётся «По умолчанию».
 */
export function useWritingProfileAvatars(
  enabled = true
): readonly WritingProfileAvatar[] {
  const request = useFetch();
  const load = useCallback(async () => {
    const response = await request(AVATAR_ROUTES.list);
    if (!response.ok) throw new Error('avatars unavailable');
    return mapAvatars(await response.json()).avatars;
  }, [request]);
  const { data } = useSWR(
    enabled ? `writing-profile:${AVATAR_ROUTES.list}` : null,
    load,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return (data ?? [])
    .filter((avatar) => avatar.id)
    .map(({ id, name }) => ({ id, name }));
}

/**
 * Слова значений карточки — одни для карточки канала и для «Для этого
 * поста» (`97dq.48`): пост выбирает из тех же значений, что канал, и
 * называть их по-другому значило бы завести второе мнение о том, что такое
 * «мало эмодзи».
 */
export function writingProfileLabels(locale: IntakeLocale) {
  const t = intakeCopy[locale];
  return {
    length: {
      auto: t.profileAuto,
      short: t.profileLengthShort,
      ideal: t.profileLengthIdeal,
      long: t.profileLengthLong,
      max: t.profileLengthMax,
    } as Record<LengthPreset, string>,
    // Пять плотностей словами и «выберем сами» (`97dq.96`).
    emoji: Object.fromEntries(
      [...EMOJI_STOPS, 'auto' as const].map((level) => [
        level,
        emojiLevelWord(locale, level),
      ])
    ) as Record<ChannelWritingProfileV1['emojiLevel'], string>,
    link: {
      none: t.profileLinkNone,
      end: t.profileLinkEnd,
      inline: t.profileLinkInline,
      auto: t.profileAuto,
    } as Record<ChannelWritingProfileV1['linkPolicy'], string>,
    hashtag: {
      none: t.profileHashtagNone,
      end_1_3: t.profileHashtagEnd,
      free: t.profileHashtagFree,
      auto: t.profileAuto,
    } as Record<ChannelWritingProfileV1['hashtagPolicy'], string>,
    cta: {
      none: t.profileCtaNone,
      question: t.profileCtaQuestion,
      comment: t.profileCtaComment,
      link: t.profileCtaLink,
      subscribe: t.profileCtaSubscribe,
      reply: t.profileCtaReply,
      auto: t.profileAuto,
    } as Record<ChannelWritingProfileV1['ctaKind'], string>,
    format: {
      auto: t.profileAuto,
      opinion: t.formatOpinion,
      announcement: t.formatAnnouncement,
      list: t.formatList,
      expert: t.formatExpert,
      case: t.formatCase,
      story: t.formatStory,
    } as Record<ChannelWritingProfileV1['formatPreference'], string>,
  };
}
