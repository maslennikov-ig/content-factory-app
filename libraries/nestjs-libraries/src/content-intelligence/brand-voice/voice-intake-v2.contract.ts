import type { VoiceSampleIntakeResponseV1 } from './voice-wiring.contract';
import type { TelegramSelection } from './file-intake';

/** Additive upload receipt; V1 remains immutable. */
export type VoiceSampleFileIntakeResponseV2 = VoiceSampleIntakeResponseV1 & {
  telegramSelection: TelegramSelection[];
  analysisSampleCount: number;
};
