export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { VoiceAvatarScreen } from '@contentfactory/frontend/components/brand-voice/voice-avatar.screen';

/**
 * One avatar, at an address.
 *
 * The four screens that describe an avatar — the passport, the eight scales,
 * what a reference left out, the version history — used to open over the list
 * on a piece of component state. Nothing named the avatar being read: the back
 * button left the section entirely, a reload dropped whoever had it open back
 * onto the list, and there was no link to send somebody who should look at a
 * particular voice. A workspace holds up to eight of these and they are
 * long-lived, edited objects; an object like that has an address.
 */
export const metadata: Metadata = {
  title: 'Avatar',
  description: '',
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VoiceAvatarScreen avatarId={id} />;
}
