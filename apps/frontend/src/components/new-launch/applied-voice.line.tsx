'use client';

import type { FC } from 'react';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import {
  VoiceRibbon,
  type RibbonDetails,
  type RibbonState,
} from '@contentfactory/frontend/components/brand-voice/voice-ribbon';

/**
 * Which voice is writing, in the generator and on the result.
 *
 * This started as one line of text — enough to stop the reader guessing after
 * `content-factory-next-36r.10` removed the personal/company select, and
 * deliberately temporary. `36r.13` replaced its body with the four-state
 * ribbon, which answers the question the line could not: whether the version
 * that wrote the draft is still the version in force, and whether the context
 * behind it has aged.
 *
 * The name and the props stay, so the two hosts did not have to change; what
 * changed is that both now render the same strip as everywhere else. A second
 * component doing nearly this is how two screens start disagreeing about what
 * "applied" means.
 */
export type AppliedVoice = Readonly<{
  label: string | null;
  versionNumber: number;
  /** Set when the draft was built by a version that is no longer in force. */
  currentVersionNumber?: number;
  contextLabel?: string;
  contextAgeDays?: number;
  factCount?: number;
  evidenceCount?: number;
}>;

/** Stale after this. Two months is where a batch stops describing today. */
const STALE_AFTER_DAYS = 30;

const stateFor = (voice: AppliedVoice | null): RibbonState => {
  if (!voice) return 'no-profile';
  if (
    voice.currentVersionNumber !== undefined &&
    voice.currentVersionNumber !== voice.versionNumber
  ) {
    return 'voice-moved';
  }
  if ((voice.contextAgeDays ?? 0) > STALE_AFTER_DAYS) return 'stale-context';
  return 'fresh';
};

export const AppliedVoiceLine: FC<{
  voice: AppliedVoice | null;
  loading?: boolean;
}> = ({ voice, loading }) => {
  const { language } = useVariables();
  const locale = language.toLowerCase().startsWith('ru') ? 'ru' : 'en';

  const details: RibbonDetails = voice
    ? {
        versionLabel: `v${voice.versionNumber}`,
        currentVersionLabel:
          voice.currentVersionNumber === undefined
            ? undefined
            : `v${voice.currentVersionNumber}`,
        profileLabel: voice.label ?? undefined,
        contextLabel: voice.contextLabel,
        contextAgeDays: voice.contextAgeDays,
        factCount: voice.factCount,
        evidenceCount: voice.evidenceCount,
      }
    : {};

  return (
    <div data-testid="applied-voice" aria-busy={loading ? 'true' : undefined}>
      <VoiceRibbon
        locale={locale}
        state={loading ? 'no-profile' : stateFor(voice)}
        details={details}
      />
    </div>
  );
};
