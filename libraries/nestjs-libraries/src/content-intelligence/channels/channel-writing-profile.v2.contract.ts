import type { ChannelWritingProfileV1, ChannelLengthPolicyV1, ChannelWritingProfileResponseV1 } from '../brand-voice/voice-wiring.contract';
export const CHANNEL_WRITING_PROFILE_VERSION = 'channel-writing-profile/v2' as const;
export type ChannelLengthPolicyV2 = ChannelLengthPolicyV1 | 'auto';
export type ChannelWritingProfileV2 = Omit<ChannelWritingProfileV1, 'version' | 'lengthPolicy' | 'emojiLevel' | 'linkPolicy' | 'hashtagPolicy' | 'ctaKind' | 'output'> & {
  version: typeof CHANNEL_WRITING_PROFILE_VERSION;
  lengthPolicy: ChannelLengthPolicyV2;
  emojiLevel: 'none' | 'few' | 'many' | 'auto';
  linkPolicy: ChannelWritingProfileV1['linkPolicy'] | 'auto';
  hashtagPolicy: ChannelWritingProfileV1['hashtagPolicy'] | 'auto';
  ctaKind: ChannelWritingProfileV1['ctaKind'] | 'auto';
};
export type ChannelWritingProfileResponseV2 = Omit<ChannelWritingProfileResponseV1, 'profile'> & { profile: ChannelWritingProfileV2 };
