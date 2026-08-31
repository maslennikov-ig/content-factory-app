'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { VoiceWizardContainer } from './voice-wizard.container';
import { VoiceAvatarsContainer } from './voice-avatars.container';
import { VOICE_API_BASE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The «Аватары» tab, and the one decision it makes.
 *
 * A workspace with no voice needs the wizard; a workspace with one needs its
 * avatars. Which of the two it is, is a fact the server already holds, so the
 * tab asks rather than making the person find the right link. This is the only
 * place that choice is made — the wizard and the list each own their own
 * requests, and neither knows about the other.
 *
 * What the tab no longer does is open an avatar. Four screens describing one
 * long-lived object used to appear here on a piece of component state, which
 * meant the object had no address: the back button left the section, a reload
 * dropped the reader back onto the list, and there was no link to send anybody.
 * Opening now navigates to `/content/avatars/<id>`, and this tab is the list
 * again — one screen, one job.
 */

export function VoiceTab() {
  const request = useFetch();
  const router = useRouter();

  /**
   * The fetcher throws on a refusal rather than answering `null`.
   *
   * SWR keys are shared, and the wizard reads this same one: a fetcher that
   * swallows the failure hands it `hasVoice: false`, and the section then says
   * «Голоса бренда пока нет» over a server that only refused to answer. That
   * is a false statement about the workspace — it may well have a voice nobody
   * could read just now. Thrown, the failure reaches whichever container is
   * mounted, and each of them already draws its own error state.
   */
  const overview = useSWR(`${VOICE_API_BASE}/overview`, async (path: string) => {
    const response = await request(path);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw Object.assign(new Error(body?.message ?? 'voice overview failed'), {
        status: response.status,
        code: body?.code,
      });
    }
    return response.json();
  });

  const hasVoice = Boolean(overview.data?.hasVoice);

  // Before the first answer there is nothing honest to show: a list would
  // describe avatars nobody has confirmed exist, and a wizard would invite
  // building one that may already be there. Each container draws its own
  // loading state, so the wait belongs to whichever of them is right.
  if (overview.isLoading) return null;

  if (!hasVoice) {
    return (
      <div className="flex min-w-0 flex-col gap-[16px]">
        <VoiceWizardContainer />
      </div>
    );
  }

  const open = (avatarId: string) =>
    router.push(`/content/avatars/${encodeURIComponent(avatarId)}`);

  return (
    <div className="flex min-w-0 flex-col gap-[16px]">
      {/*
        Both doors lead to the same address. «Собрать образцы» used to mean
        "open this one and start the wizard", which was a second way of being
        on an avatar's screen; the avatar's own page decides that for itself
        now — a voice with no corpus opens straight into the collection step.
      */}
      <VoiceAvatarsContainer onOpenAvatar={open} onCollectFor={open} />
    </div>
  );
}

export default VoiceTab;
