'use client';

import { useId } from 'react';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Segmented, type SegmentedOption } from '../../ui/segmented';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  CTA_KINDS,
  EMOJI_LEVELS,
  FORMAT_PREFERENCES,
  HASHTAG_POLICIES,
  LENGTH_PRESETS,
  LENGTH_PRESET_ORDER,
  LINK_POLICIES,
  PROFILE_NOTES_MAX,
  lengthPresetOf,
  type ChannelWritingProfileV1,
  type LengthPreset,
} from './writing-profile.adapter';

type WritingProfileFieldsProps = {
  locale: IntakeLocale;
  profile: ChannelWritingProfileV1;
  disabled?: boolean;
  describedBy?: string;
  onChange: (patch: Partial<ChannelWritingProfileV1>) => void;
};

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
  profile: ChannelWritingProfileV1
): readonly WritingProfileViewRow[] {
  const t = intakeCopy[locale];
  const lengthLabels: Record<LengthPreset, string> = {
    short: t.profileLengthShort,
    ideal: t.profileLengthIdeal,
    long: t.profileLengthLong,
    max: t.profileLengthMax,
  };
  const emojiLabels = {
    none: t.profileEmojiNone,
    few: t.profileEmojiFew,
    free: t.profileEmojiFree,
  } as const;
  const linkLabels = {
    none: t.profileLinkNone,
    end: t.profileLinkEnd,
    inline: t.profileLinkInline,
  } as const;
  const hashtagLabels = {
    none: t.profileHashtagNone,
    end_1_3: t.profileHashtagEnd,
    free: t.profileHashtagFree,
  } as const;
  const ctaLabels = {
    none: t.profileCtaNone,
    question: t.profileCtaQuestion,
    comment: t.profileCtaComment,
    link: t.profileCtaLink,
    subscribe: t.profileCtaSubscribe,
    reply: t.profileCtaReply,
  } as const;
  const formatLabels = {
    auto: t.formatAuto,
    opinion: t.formatOpinion,
    announcement: t.formatAnnouncement,
    list: t.formatList,
    expert: t.formatExpert,
    case: t.formatCase,
    story: t.formatStory,
  } as const;

  return [
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
        profile.notes?.trim() || (locale === 'ru' ? 'не указано' : 'not set'),
    },
  ];
}

/** The one writing-profile form used by the piece dialog and channel page. */
export function WritingProfileFields({
  locale,
  profile,
  disabled = false,
  describedBy,
  onChange,
}: WritingProfileFieldsProps) {
  const t = intakeCopy[locale];
  const notes = profile.notes ?? '';
  const notesId = useId();

  const lengthOptions = options(LENGTH_PRESET_ORDER, {
    short: t.profileLengthShort,
    ideal: t.profileLengthIdeal,
    long: t.profileLengthLong,
    max: t.profileLengthMax,
  });
  const emojiOptions = options(EMOJI_LEVELS, {
    none: t.profileEmojiNone,
    few: t.profileEmojiFew,
    free: t.profileEmojiFree,
  });
  const linkOptions = options(LINK_POLICIES, {
    none: t.profileLinkNone,
    end: t.profileLinkEnd,
    inline: t.profileLinkInline,
  });
  const hashtagOptions = options(HASHTAG_POLICIES, {
    none: t.profileHashtagNone,
    end_1_3: t.profileHashtagEnd,
    free: t.profileHashtagFree,
  });
  const ctaOptions = options(CTA_KINDS, {
    none: t.profileCtaNone,
    question: t.profileCtaQuestion,
    comment: t.profileCtaComment,
    link: t.profileCtaLink,
    subscribe: t.profileCtaSubscribe,
    reply: t.profileCtaReply,
  });
  const formatOptions = options(FORMAT_PREFERENCES, {
    auto: t.formatAuto,
    opinion: t.formatOpinion,
    announcement: t.formatAnnouncement,
    list: t.formatList,
    expert: t.formatExpert,
    case: t.formatCase,
    story: t.formatStory,
  });

  const row = <Value extends string>(
    label: string,
    value: Value,
    choices: readonly SegmentedOption<Value>[],
    change: (value: Value) => void
  ) => (
    <>
      <span className="cf-label-sm uppercase text-cf-ink-muted">{label}</span>
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
      {row(
        t.profileLength,
        lengthPresetOf(profile.lengthPolicy),
        lengthOptions,
        (value) => onChange({ lengthPolicy: LENGTH_PRESETS[value] })
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
        className="cf-label-sm uppercase text-cf-ink-muted"
      >
        {t.profileNotes}
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
