import type { ChannelWritingProfileV1, ChannelLengthPolicyV1, ChannelWritingProfileResponseV1 } from '../brand-voice/voice-wiring.contract';
import type { EmojiLevel } from './emoji-ceiling';
export const CHANNEL_WRITING_PROFILE_VERSION = 'channel-writing-profile/v2' as const;
export type ChannelLengthPolicyV2 = ChannelLengthPolicyV1 | 'auto';
export type ChannelWritingProfileV2 = Omit<ChannelWritingProfileV1, 'version' | 'lengthPolicy' | 'emojiLevel' | 'linkPolicy' | 'hashtagPolicy' | 'ctaKind' | 'output'> & {
  version: typeof CHANNEL_WRITING_PROFILE_VERSION;
  lengthPolicy: ChannelLengthPolicyV2;
  /** The five densities of `97dq.96` or `auto`; old stops are read into them (`emoji-ceiling.ts`). */
  emojiLevel: EmojiLevel;
  linkPolicy: ChannelWritingProfileV1['linkPolicy'] | 'auto';
  hashtagPolicy: ChannelWritingProfileV1['hashtagPolicy'] | 'auto';
  ctaKind: ChannelWritingProfileV1['ctaKind'] | 'auto';
  /**
   * Аватар канала (`content-factory-next-97dq.38`): кто говорит в этом канале.
   * `null` или отсутствие — аватар области по умолчанию, как до волны.
   */
  brandProfileId?: string | null;
  /**
   * Обращение к читателю в этом канале. `avatar` или отсутствие — как решил
   * аватар (`voice.addressForm`), а если и он молчит — как до волны.
   */
  addressForm?: ChannelAddressFormV2;
};
/** «Как в аватаре» · на «ты» · на «вы». */
export type ChannelAddressFormV2 = 'avatar' | 'ty' | 'vy';
export const CHANNEL_ADDRESS_FORMS = ['avatar', 'ty', 'vy'] as const;
export type ChannelWritingProfileResponseV2 = Omit<ChannelWritingProfileResponseV1, 'profile'> & { profile: ChannelWritingProfileV2 };
