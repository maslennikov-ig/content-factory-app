import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { SocialFactoryRepository } from '../../content-intelligence/social-factory/social-factory.repository';
import type { SocialFactoryRecordV1 } from '../../content-intelligence/social-factory/contracts/social-factory.v1';
import type { OriginalAuthorRequest } from '../../chat/capabilities/capability.types';
import { HeygenSubscriptionProvider } from '../providers/heygen-subscription.provider';
import { VideoConnectionService } from './video-connection.service';
import { VideoSubscriptionRuntime } from './video-provider-registry';
import { recoverHeygenConsentResponseV1, validateHeygenConsentUrlV1 } from './video-heygen-consent-link.v1';
import { heygenConsentFailureReasonV1, type HeygenConsentFailureReasonV1 } from './video-heygen-consent-issue.v1';
import { parseVideoV1, videoErrorV1 } from '../video-brief.v1';

const KIND = 'heygen_avatar_consent' as const;
const TTL = 24 * 60 * 60 * 1000;
const privateId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
export const heygenConsentIntentInputV1 = z.object({connectionId: z.string().uuid(), avatarId: privateId, groupId: privateId, reissue: z.boolean().optional()}).strict();
type Selection = {connectionId: string; avatarId: string; groupId: string; reissue?: boolean};
type PreviousAttempt = {attemptId: string; requestMessageId: string; state: 'uncertain' | 'ready'; issuedAt: string | null; expiresAt: string | null; failureReason?: HeygenConsentFailureReasonV1; encryptedProviderResponse?: string};
type Intent = Selection & {
  actorId: string; accountGeneration: number; ownerThreadId: string; requestMessageId: string; name: string;
  state: 'reserved' | 'dispatching' | 'ready' | 'uncertain'; attemptId: string;
  issuedAt: string | null; expiresAt: string | null; encryptedUrl?: string; attemptHistory?: PreviousAttempt[]; failureReason?: HeygenConsentFailureReasonV1; encryptedProviderResponse?: string;
};
export type HeygenConsentIntentReceiptV1 = {
  handle: string; ownerThreadId: string; name: string;
  state: 'reserved' | 'ready' | 'uncertain' | 'expired' | 'not_needed' | 'unknown';
  issuedAt: string | null; expiresAt: string | null; readOnly: false; renderQualified: false; failureReason?: HeygenConsentFailureReasonV1;
};
const handlePattern = /^[a-f0-9]{64}$/;
/** Conservative direct authorization; quotations and supplied material grant nothing. */
const directConsentText = (text: string) => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`|«[^»]*»|“[^”]*”|"[^"]*"/g, '')
    .split(/\n\s*\n/).filter(paragraph => !/^\s*(?:(?:вот\s+)?(?:текст|материал|цитата|пример|reference|example|source)(?=\s|[:—-]|$)|>)/i.test(paragraph))
    .join('\n').split('\n').filter(line => !/^\s*>/.test(line)).join('\n')
    .replace(/(?:говорится|написано|в\s+(?:статье|тексте|примере)|\bquoted\b|\bit says\b)[^.!?;\n]*/giu, '');
export const isHeygenConsentIntentV1 = (text: string): boolean => {
  const direct = directConsentText(text);
  if (/(?:не\s+(?:созда|выда|покаж|показ|получ|запраш|запрос|отправ|присыл|генерир)\p{L}*|\b(?:do not|don't|never)\s+(?:create|issue|show|get|send|request))[^,.!?;\n]{0,80}(?:ссылк\p{L}*|\blink\b|\burl\b)/iu.test(direct) ||
    /(?:ссылк\p{L}*|\blink\b|\burl\b)[^,.!?;\n]{0,40}\sне\s+(?:созда|выда|покаж|показ|получ|запраш|запрос)\p{L}*/iu.test(direct)) return false;
  if (!/соглас|подтвержден|consent/iu.test(direct)) return false;
  return /(?:покаж\p{L}*|показ\p{L}*|дай(?:те)?|выда\p{L}*|созда\p{L}*|подготов\p{L}*|получ\p{L}*|сформиру\p{L}*|отправ\p{L}*|пришл\p{L}*|запрос\p{L}*|\b(?:show|give|issue|create|prepare|get|send|request)(?:s|ing)?\b)[^.!?;\n]{0,100}(?:ссылк\p{L}*|\blink\b|\burl\b)/iu.test(direct);
};
/** A fresh authored instruction is required; a generic request never replaces an uncertain attempt. */
export const isHeygenConsentReplacementV1 = (text: string): boolean => isHeygenConsentIntentV1(text) &&
  directConsentText(text).split(/[.!?;\n]/).some(clause => isHeygenConsentIntentV1(clause) &&
    /(?:нов\p{L}*|друг\p{L}*|\bnew\b|\banother\b)[^.!?;\n]{0,50}(?:ссылк\p{L}*|\blink\b|\burl\b)/iu.test(clause));
const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw Object.assign(new Error('Consent request stopped.'), {name: 'AbortError'});
};
const safeFailure = (error: unknown): never => {
  const code = (error as {getResponse?: () => {code?: unknown}})?.getResponse?.()?.code;
  return videoErrorV1(typeof code === 'string' && /^VIDEO_[A-Z0-9_]+$/.test(code) ? code : 'VIDEO_AVATAR_CONSENT_UNAVAILABLE', 409);
};

/** One durable issuance per actor/account/group; no lease or replay after dispatch. */
@Injectable()
export class HeygenConsentIntentServiceV1 {
  constructor(readonly store: SocialFactoryRepository, readonly connections: VideoConnectionService,
    readonly provider: HeygenSubscriptionProvider, readonly runtime: VideoSubscriptionRuntime) {}

  private handle(org: string, actor: string, connectionId: string, groupId: string) {
    const secret = process.env.JWT_SECRET;
    if (!secret) return videoErrorV1('VIDEO_AVATAR_CONSENT_UNAVAILABLE', 409);
    return createHmac('sha256', secret).update('heygen-avatar-consent:v1:')
      .update(JSON.stringify([org, actor, connectionId, groupId])).digest('hex');
  }
  private receipt(row: SocialFactoryRecordV1<Intent>, state?: HeygenConsentIntentReceiptV1['state']): HeygenConsentIntentReceiptV1 {
    const p = row.payload;
    return {handle: row.id, ownerThreadId: p.ownerThreadId, name: p.name,
      state: state ?? (p.state === 'dispatching' ? 'uncertain' : p.state === 'ready' && (!Number.isFinite(Date.parse(p.expiresAt ?? '')) || Date.parse(p.expiresAt!) <= this.runtime.now().getTime()) ? 'expired' : p.state),
      issuedAt: p.issuedAt, expiresAt: p.expiresAt, readOnly: false, renderQualified: false,
      ...(p.state === 'uncertain' && p.failureReason ? {failureReason: p.failureReason} : {})};
  }
  private async save(row: SocialFactoryRecordV1<Intent>, payload: Intent) {
    // Keep the dedup tombstone live forever; only the URL in its payload expires.
    return this.store.put<Intent>({organizationId: row.organizationId, kind: KIND, id: row.id, expectedRevision: row.revision, payload});
  }
  private async current(org: string, handle: string) { return this.store.read<Intent>(org, KIND, handle); }

  async request(org: string, actor: string, threadId: string, author: OriginalAuthorRequest, value: unknown,
    options: {signal?: AbortSignal} = {}): Promise<HeygenConsentIntentReceiptV1> {
    const input = parseVideoV1(heygenConsentIntentInputV1, value) as Selection;
    if (!threadId || !author?.messageId || typeof author.text !== 'string' || !isHeygenConsentIntentV1(author.text)) return videoErrorV1('VIDEO_REQUEST_NOT_AUTHORED', 409);
    if (input.reissue && !isHeygenConsentReplacementV1(author.text)) return videoErrorV1('VIDEO_REQUEST_NOT_AUTHORED', 409);
    aborted(options.signal);
    const credential = await this.connections.token(org, actor, input.connectionId, undefined, 'discovery', {allowRefresh: false});
    if (credential.connection.provider !== 'heygen') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
    const def = await this.connections.connectable(org, 'heygen');
    const guard = async () => {aborted(options.signal); await credential.assertUsable(); aborted(options.signal);};
    const owned = await this.provider.readOwnedAvatarGroup(def, credential.token, {avatarId: input.avatarId, groupId: input.groupId}, guard);
    await guard();
    const handle = this.handle(org, actor, input.connectionId, owned.groupId);
    const existing = await this.current(org, handle);
    const noIssue = owned.consentState === 'accepted' || owned.consentState === 'not_applicable' ? 'not_needed'
      : !['pending', 'rejected'].includes(owned.consentStatus ?? '') ? 'unknown' : null;
    if (noIssue) return {handle, ownerThreadId: existing?.payload.ownerThreadId ?? threadId, name: owned.name, state: noIssue,
      issuedAt: existing?.payload.issuedAt ?? null, expiresAt: existing?.payload.expiresAt ?? null, readOnly: false, renderQualified: false};
    // Reopen the exact saved provider reply before considering a replacement.
    // The account, group, current status and conservative expiry are rechecked;
    // this path performs no provider mutation.
    if (existing?.payload.state === 'uncertain' && existing.payload.encryptedProviderResponse &&
      existing.payload.accountGeneration === credential.connection.generation && owned.consentStatus === 'pending' &&
      Number.isFinite(Date.parse(existing.payload.expiresAt ?? '')) && Date.parse(existing.payload.expiresAt!) > this.runtime.now().getTime()) {
      let recovered: {groupId: string; url: string} | null = null;
      try { recovered = recoverHeygenConsentResponseV1(JSON.parse(AuthService.fixedDecryption(existing.payload.encryptedProviderResponse)), owned.groupId); } catch { /* Not a verified recoverable reply. */ }
      if (recovered) {
        await guard();
        try { return this.receipt(await this.save(existing, {...existing.payload, state: 'ready', encryptedUrl: AuthService.fixedEncryption(recovered.url)})); }
        catch {
          const winner = await this.current(org, handle);
          return winner ? this.receipt(winner) : this.receipt(existing);
        }
      }
    }
    if (existing?.payload.state === 'reserved' && input.reissue) {
      if ((existing.payload.attemptHistory ?? []).some(item => item.requestMessageId === author.messageId)) return this.receipt(existing);
      if (existing.payload.requestMessageId === author.messageId) return this.receipt(existing);
    }
    let previous: PreviousAttempt[] | undefined;
    if (existing && existing.payload.state !== 'reserved') {
      const p = existing.payload;
      const expiredReady = p.state === 'ready' && Number.isFinite(Date.parse(p.expiresAt ?? '')) && Date.parse(p.expiresAt!) <= this.runtime.now().getTime();
      const eligible = p.state === 'uncertain' || expiredReady;
      const used = [p.requestMessageId, ...(p.attemptHistory ?? []).map(item => item.requestMessageId)].includes(author.messageId);
      if (!input.reissue || !eligible) return this.receipt(existing);
      if (used) return this.receipt(existing);
      if ((p.attemptHistory?.length ?? 0) >= 20) return videoErrorV1('VIDEO_AVATAR_CONSENT_UNAVAILABLE', 409);
      previous = [...(p.attemptHistory ?? []), {attemptId: p.attemptId, requestMessageId: p.requestMessageId, state: p.state as 'uncertain' | 'ready', issuedAt: p.issuedAt, expiresAt: p.expiresAt, ...(p.failureReason ? {failureReason: p.failureReason} : {}), ...(p.encryptedProviderResponse ? {encryptedProviderResponse: p.encryptedProviderResponse} : {})}];
    }
    let row: SocialFactoryRecordV1<Intent>;
    const payload: Intent = {connectionId: input.connectionId, avatarId: input.avatarId, groupId: owned.groupId, actorId: actor, accountGeneration: credential.connection.generation,
      ownerThreadId: threadId, requestMessageId: author.messageId, name: owned.name, state: 'reserved', attemptId: randomUUID(), issuedAt: null, expiresAt: null,
      ...(previous ? {attemptHistory: previous} : existing?.payload.attemptHistory ? {attemptHistory: existing.payload.attemptHistory} : {})};
    try {
      row = existing ? await this.save(existing, payload) : await this.store.put<Intent>({organizationId: org, kind: KIND, id: handle, expectedRevision: 0, payload});
    } catch (error) {
      const winner = await this.current(org, handle);
      if (winner) return this.receipt(winner);
      return safeFailure(error);
    }
    let dispatched = false;
    try {
      const result = await this.provider.requestOwnedAvatarConsent(def, credential.token, {avatarId: input.avatarId, groupId: owned.groupId}, guard, async () => {
        await guard();
        const issuedAt = this.runtime.now();
        row = await this.save(row, {...row.payload, state: 'dispatching', issuedAt: issuedAt.toISOString(), expiresAt: new Date(issuedAt.getTime() + TTL).toISOString()});
        dispatched = true;
      });
      if (result.kind !== 'issued') return this.receipt(row, result.kind);
      // A provider receipt without a durable dispatch marker is also unsafe to replay.
      if (!dispatched) {
        row = await this.save(row, {...row.payload, state: 'uncertain'});
        return this.receipt(row);
      }
      await guard();
      const url = validateHeygenConsentUrlV1(result.consentUrl);
      row = await this.save(row, {...row.payload, state: 'ready', encryptedUrl: AuthService.fixedEncryption(url),
        issuedAt: row.payload.issuedAt, expiresAt: row.payload.expiresAt});
      return this.receipt(row);
    } catch (error) {
      if (dispatched) {
        const encrypted = (error as {encryptedProviderResponse?: unknown})?.encryptedProviderResponse;
        try { row = await this.save(row, {...row.payload, state: 'uncertain', failureReason: heygenConsentFailureReasonV1(error),
          ...(typeof encrypted === 'string' && encrypted.length <= 3 * 1024 * 1024 ? {encryptedProviderResponse: encrypted} : {})}); } catch { /* The persisted dispatching marker still forbids replay. */ }
        return this.receipt(row, 'uncertain');
      }
      const winner = await this.current(org, handle);
      if (winner && (winner.revision !== row.revision || winner.payload.state !== 'reserved')) return this.receipt(winner);
      if ((error as Error)?.name === 'AbortError') throw error;
      return safeFailure(error);
    }
  }

  /** Browser-only secret read. The controller separately proves ownership of this chat. */
  async readLink(org: string, actor: string, threadId: string, handle: string): Promise<{url: string; expiresAt: string}> {
    if (!handlePattern.test(handle)) return videoErrorV1('VIDEO_AVATAR_CONSENT_UNAVAILABLE', 404);
    const row = await this.current(org, handle), p = row?.payload;
    if (!p || p.actorId !== actor || p.ownerThreadId !== threadId || p.state !== 'ready' || !p.encryptedUrl ||
      !p.expiresAt || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= this.runtime.now().getTime()) return videoErrorV1('VIDEO_AVATAR_CONSENT_UNAVAILABLE', 404);
    const credential = await this.connections.token(org, actor, p.connectionId, p.accountGeneration, 'discovery', {allowRefresh: false});
    if (credential.connection.provider !== 'heygen') return videoErrorV1('VIDEO_PROVIDER_INVALID', 409);
    const def = await this.connections.connectable(org, 'heygen');
    const owned = await this.provider.readOwnedAvatarGroup(def, credential.token, {avatarId: p.avatarId, groupId: p.groupId}, credential.assertUsable);
    await credential.assertUsable();
    if (!['pending', 'rejected'].includes(owned.consentStatus ?? '') || owned.consentState === 'not_applicable') return videoErrorV1('VIDEO_AVATAR_CONSENT_UNAVAILABLE', 409);
    try { return {url: validateHeygenConsentUrlV1(AuthService.fixedDecryption(p.encryptedUrl)), expiresAt: p.expiresAt}; }
    catch { return videoErrorV1('VIDEO_AVATAR_CONSENT_UNAVAILABLE', 409); }
  }
}
