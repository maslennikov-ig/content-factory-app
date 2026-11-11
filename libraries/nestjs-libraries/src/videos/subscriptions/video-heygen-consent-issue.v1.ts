import { z } from 'zod';
import { videoErrorV1 } from '../video-brief.v1';
import type { HeygenOwnedAvatarGroupV1, HeygenConsentStatusV1 } from './video-heygen-owned-catalog.v1';

/** Historical authenticated schema; every issuance checks the current individual tool too. */
export const HEYGEN_AVATAR_CONSENT_ISSUE_SCHEMA_V1 = '26fc11aa782efba1a5a8a8e6694dbae89b87d2c28b6b7b6a07cc655b151a9568';
export type HeygenConsentFailureReasonV1 = 'provider_tool_error' | 'provider_response_invalid' | 'timeout' | 'transport_error' | 'unknown';
/** A fixed category only; provider response bodies and error messages are never retained. */
export function heygenConsentFailureReasonV1(error: unknown): HeygenConsentFailureReasonV1 {
  const response = (error as {getResponse?: () => unknown})?.getResponse?.();
  const obj = response && typeof response === 'object' ? response as Record<string, unknown> : {};
  const valid = ['provider_tool_error','provider_response_invalid','timeout','transport_error','unknown'];
  if (typeof obj.reason === 'string' && valid.includes(obj.reason)) return obj.reason as HeygenConsentFailureReasonV1;
  switch (obj.code) {
    case 'VIDEO_PROVIDER_TOOL_ERROR': return 'provider_tool_error';
    case 'VIDEO_PROVIDER_RESPONSE_INVALID': return 'provider_response_invalid';
    case 'VIDEO_RESPONSE_TIMEOUT': return 'timeout';
    case 'VIDEO_MCP_UNAVAILABLE': return 'transport_error';
    default: return 'unknown';
  }
}
const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const input = z.object({avatarId: id, groupId: id}).strict();
export function heygenOwnedConsentIssueInputV1(raw: unknown) {
  const parsed = input.safeParse(raw);
  return parsed.success ? parsed.data as {avatarId: string; groupId: string} : videoErrorV1('VIDEO_SUBSCRIPTION_OPTION_UNAVAILABLE', 409);
}
export type HeygenConsentNoIssueV1 = {kind: 'not_needed' | 'unknown'; avatarId: string; groupId: string; consentStatus: HeygenConsentStatusV1; readOnly: true; renderQualified: false};
export type HeygenConsentIssueResultV1 = HeygenConsentNoIssueV1 | {kind: 'issued'; avatarId: string; groupId: string; consentUrl: string};
/** Pending means awaiting the subject OR review, not proof of an absent link. Durable dedup belongs to the caller. */
export function heygenConsentIssueDecisionV1(current: HeygenOwnedAvatarGroupV1): HeygenConsentNoIssueV1 | null {
  const base = {avatarId: current.avatarId, groupId: current.groupId, consentStatus: current.consentStatus, readOnly: true as const, renderQualified: false as const};
  if (current.consentStatus === 'accepted' || current.consentState === 'not_applicable') return {kind: 'not_needed', ...base};
  if (['pending', 'rejected'].includes(current.consentStatus ?? '') && !['photo', 'prompt'].includes(current.groupType ?? '')) return null;
  return {kind: 'unknown', ...base};
}
