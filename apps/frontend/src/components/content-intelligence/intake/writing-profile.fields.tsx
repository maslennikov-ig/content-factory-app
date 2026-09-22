'use client';

import { Hint } from '@contentfactory/react/layout/hint';
import { useCallback, useId, type ReactNode } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Segmented, type SegmentedOption } from '../../ui/segmented';
import {
  AVATAR_ROUTES,
  mapAvatars,
} from '../../brand-voice/voice-avatars.adapter';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  CHANNEL_ADDRESS_FORMS,
  CTA_KINDS,
  EMOJI_LEVELS,
  FORMAT_PREFERENCES,
  HASHTAG_POLICIES,
  LENGTH_PRESETS,
  LENGTH_PRESET_ORDER,
  LINK_POLICIES,
  PROFILE_NOTES_MAX,
  lengthPresetOf,
  type ChannelAddressForm,
  type ChannelWritingProfileV1,
  type LengthPreset,
} from './writing-profile.adapter';

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

type WritingProfileFieldsProps = {
  locale: IntakeLocale;
  profile: ChannelWritingProfileV1;
  /**
   * Аватары пространства. Выбор «Кто говорит здесь» появляется только при
   * двух и более: при одном выбирать не из чего (правило «решать за
   * человека», PRODUCT §6).
   */
  avatars?: readonly WritingProfileAvatar[];
  disabled?: boolean;
  describedBy?: string;
  onChange: (patch: Partial<ChannelWritingProfileV1>) => void;
};

const addressLabels = (
  t: (typeof intakeCopy)[IntakeLocale]
): Record<ChannelAddressForm, string> => ({
  avatar: t.profileAddressAvatar,
  ty: t.profileAddressTy,
  vy: t.profileAddressVy,
});

const speakerName = (
  t: (typeof intakeCopy)[IntakeLocale],
  avatars: readonly WritingProfileAvatar[],
  id: string | null | undefined
) =>
  id
    ? avatars.find((avatar) => avatar.id === id)?.name ??
      t.profileSpeakerUnnamed
    : t.profileSpeakerDefault;

export type WritingProfileViewRow = {
  key: string;
  value: string;
};

const options = <Value extends string>(
  values: readonly Value[],
  labels: Record<Value, string>
): readonly SegmentedOption<Value>[] =>
  values.map((value) => ({ value, label: labels[value] }));

/** Human-readable field values shared by the inline view and the edit form. */
export function writingProfileViewRows(
  locale: IntakeLocale,
  profile: ChannelWritingProfileV1,
  avatars: readonly WritingProfileAvatar[] = []
): readonly WritingProfileViewRow[] {
  const t = intakeCopy[locale];
  const lengthLabels: Record<LengthPreset, string> = {
    auto: t.profileAuto,
    short: t.profileLengthShort,
    ideal: t.profileLengthIdeal,
    long: t.profileLengthLong,
    max: t.profileLengthMax,
  };
  const emojiLabels = {
    none: t.profileEmojiNone,
    few: t.profileEmojiFew,
    many: t.profileEmojiFree,
    auto: t.profileAuto,
  } as const;
  const linkLabels = {
    none: t.profileLinkNone,
    end: t.profileLinkEnd,
    inline: t.profileLinkInline,
    auto: t.profileAuto,
  } as const;
  const hashtagLabels = {
    none: t.profileHashtagNone,
    end_1_3: t.profileHashtagEnd,
    free: t.profileHashtagFree,
    auto: t.profileAuto,
  } as const;
  const ctaLabels = {
    none: t.profileCtaNone,
    question: t.profileCtaQuestion,
    comment: t.profileCtaComment,
    link: t.profileCtaLink,
    subscribe: t.profileCtaSubscribe,
    reply: t.profileCtaReply,
    auto: t.profileAuto,
  } as const;
  const formatLabels = {
    auto: t.profileAuto,
    opinion: t.formatOpinion,
    announcement: t.formatAnnouncement,
    list: t.formatList,
    expert: t.formatExpert,
    case: t.formatCase,
    story: t.formatStory,
  } as const;

  return [
    ...(avatars.length > 1
      ? [
          {
            key: t.profileSpeaker,
            value: speakerName(t, avatars, profile.brandProfileId),
          },
        ]
      : []),
    {
      key: t.profileAddress,
      value: addressLabels(t)[profile.addressForm ?? 'avatar'],
    },
    {
      key: t.profileLength,
      value: lengthLabels[lengthPresetOf(profile.lengthPolicy)],
    },
    { key: t.profileEmoji, value: emojiLabels[profile.emojiLevel] },
    { key: t.profileLink, value: linkLabels[profile.linkPolicy] },
    { key: t.profileHashtag, value: hashtagLabels[profile.hashtagPolicy] },
    { key: t.profileCta, value: ctaLabels[profile.ctaKind] },
    { key: t.profileFormat, value: formatLabels[profile.formatPreference] },
    {
      key: t.profileNotes,
      value:
        profile.notes?.trim() || t.profileNotSet,
    },
  ];
}

/** The one writing-profile form used by the piece dialog and channel page. */
export function WritingProfileFields({
  locale,
  profile,
  avatars = [],
  disabled = false,
  describedBy,
  onChange,
}: WritingProfileFieldsProps) {
  const t = intakeCopy[locale];
  const notes = profile.notes ?? '';
  const notesId = useId();
  const speakerId = useId();

  const lengthOptions = options(LENGTH_PRESET_ORDER, {
    auto: t.profileAuto,
    short: t.profileLengthShort,
    ideal: t.profileLengthIdeal,
    long: t.profileLengthLong,
    max: t.profileLengthMax,
  });
  const emojiOptions = options(EMOJI_LEVELS, {
    none: t.profileEmojiNone,
    few: t.profileEmojiFew,
    many: t.profileEmojiFree,
    auto: t.profileAuto,
  });
  const linkOptions = options(LINK_POLICIES, {
    none: t.profileLinkNone,
    end: t.profileLinkEnd,
    inline: t.profileLinkInline,
    auto: t.profileAuto,
  });
  const hashtagOptions = options(HASHTAG_POLICIES, {
    none: t.profileHashtagNone,
    end_1_3: t.profileHashtagEnd,
    free: t.profileHashtagFree,
    auto: t.profileAuto,
  });
  const ctaOptions = options(CTA_KINDS, {
    none: t.profileCtaNone,
    question: t.profileCtaQuestion,
    comment: t.profileCtaComment,
    link: t.profileCtaLink,
    subscribe: t.profileCtaSubscribe,
    reply: t.profileCtaReply,
    auto: t.profileAuto,
  });
  const formatOptions = options(FORMAT_PREFERENCES, {
    auto: t.profileAuto,
    opinion: t.formatOpinion,
    announcement: t.formatAnnouncement,
    list: t.formatList,
    expert: t.formatExpert,
    case: t.formatCase,
    story: t.formatStory,
  });

  const hints: Record<string, string> = {
    [t.profileAddress]: t.profileHintAddress,
    [t.profileLength]: t.profileHintLength,
    [t.profileEmoji]: t.profileHintEmoji,
    [t.profileLink]: t.profileHintLink,
    [t.profileHashtag]: t.profileHintHashtag,
    [t.profileCta]: t.profileHintCta,
    [t.profileFormat]: t.profileHintFormat,
  };
  const addressOptions = options(CHANNEL_ADDRESS_FORMS, addressLabels(t));
  const labelClass = 'flex items-center gap-[4px] cf-label-sm uppercase text-cf-ink-muted';
  const fieldLabel = (label: string, hint: ReactNode) => (
    <>
      {label}
      <Hint label={t.profileHintFor(label)}>{hint}</Hint>
    </>
  );
  const row = <Value extends string>(
    label: string,
    value: Value,
    choices: readonly SegmentedOption<Value>[],
    change: (value: Value) => void
  ) => (
    <>
      <span className={labelClass}>{fieldLabel(label, hints[label])}</span>
      <Segmented
        label={label}
        value={value}
        options={choices}
        onChange={change}
        className="max-w-full flex-wrap [&_button]:whitespace-normal"
      />
    </>
  );

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={describedBy}
      className="grid min-w-0 grid-cols-1 gap-x-[16px] gap-y-[12px] sm:grid-cols-[160px_minmax(0,1fr)] sm:items-start"
    >
      {avatars.length > 1 ? (
        <>
          <label htmlFor={speakerId} className={labelClass}>
            {fieldLabel(t.profileSpeaker, t.profileHintSpeaker)}
          </label>
          <Select
            standalone
            disableForm
            id={speakerId}
            name="writing-profile-speaker"
            aria-label={t.profileSpeaker}
            className="w-full max-w-[320px]"
            value={profile.brandProfileId ?? ''}
            onChange={(event) =>
              onChange({ brandProfileId: event.target.value || null })
            }
          >
            <option value="">{t.profileSpeakerDefault}</option>
            {avatars.map((avatar) => (
              <option key={avatar.id} value={avatar.id}>
                {avatar.name ?? t.profileSpeakerUnnamed}
              </option>
            ))}
          </Select>
        </>
      ) : null}
      {row(
        t.profileAddress,
        profile.addressForm ?? 'avatar',
        addressOptions,
        (addressForm) => onChange({ addressForm })
      )}
      {row(
        t.profileLength,
        lengthPresetOf(profile.lengthPolicy),
        lengthOptions,
        (value) => onChange({ lengthPolicy: value === 'auto' ? 'auto' : LENGTH_PRESETS[value] })
      )}
      {row(t.profileEmoji, profile.emojiLevel, emojiOptions, (emojiLevel) =>
        onChange({ emojiLevel })
      )}
      {row(t.profileLink, profile.linkPolicy, linkOptions, (linkPolicy) =>
        onChange({ linkPolicy })
      )}
      {row(
        t.profileHashtag,
        profile.hashtagPolicy,
        hashtagOptions,
        (hashtagPolicy) => onChange({ hashtagPolicy })
      )}
      {row(t.profileCta, profile.ctaKind, ctaOptions, (ctaKind) =>
        onChange({ ctaKind })
      )}
      {row(
        t.profileFormat,
        profile.formatPreference,
        formatOptions,
        (formatPreference) => onChange({ formatPreference })
      )}

      <label
        htmlFor={notesId}
        className={labelClass}
      >
        {fieldLabel(t.profileNotes, t.profileNotesHint)}
      </label>
      <div className="flex min-w-0 flex-col gap-[4px]">
        <Textarea
          standalone
          id={notesId}
          layout="content"
          name="writing-profile-notes"
          aria-label={t.profileNotes}
          maxLength={PROFILE_NOTES_MAX}
          className="w-full"
          value={notes}
          onChange={(event) =>
            onChange({ notes: event.target.value.slice(0, PROFILE_NOTES_MAX) })
          }
        />
        <p className="cf-caption text-cf-ink-muted">
          {`${t.profileNotesHint} ${t.profileNotesCount(
            notes.length,
            PROFILE_NOTES_MAX
          )}`}
        </p>
      </div>
    </fieldset>
  );
}

export default WritingProfileFields;
