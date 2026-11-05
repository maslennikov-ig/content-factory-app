import { readCapabilityContextValue, type ReadableRequestContext } from '../capability.context';
import { unspentFailure } from './selection';

/** Only the server-resolved owned work context selects a card; model text grants no authority. */
export function assertSelectedClipV2(ctx: {requestContext?: ReadableRequestContext}, pilotId: string) {
  const raw = readCapabilityContextValue(ctx.requestContext, 'cf.workContext');
  if (typeof raw !== 'string' || !raw) return;
  let value: {context?: {clipPilotId?: string}; data?: {nativeClip?: {pilotId?: string}}};
  try {value = JSON.parse(raw);} catch {throw unspentFailure('CLIP_SELECTED_PILOT_MISMATCH', 'Reopen the selected scenario in its original chat.');}
  if (value?.context?.clipPilotId && (value.context.clipPilotId !== pilotId || value.data?.nativeClip?.pilotId !== pilotId))
    throw unspentFailure('CLIP_SELECTED_PILOT_MISMATCH', 'Use the exact selected owned scenario version, not another pilot.');
}
