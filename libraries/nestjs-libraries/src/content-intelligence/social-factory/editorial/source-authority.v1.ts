import type { ContentSourceRegistryRepository } from '../../source-registry/source-registry.repository';
import { redactSourceUrl } from '../../source-registry/network-policy';
import type {
  EvidenceV1,
  SocialFactoryRecordV1,
  SocialFactoryStoreV1,
  SourceAdmissionV1,
  SourcePermissionStateV1,
} from '../contracts/social-factory.v1';
export type {
  SourceAdmissionV1,
  SourcePermissionStateV1,
} from '../contracts/social-factory.v1';
import type { DiscoverySourceGrant } from '../discovery/discovery.types';

export type SourceAuthorityPurposeV1 =
  | 'discovery'
  | 'editorial_generation'
  | 'licensed_registry_export_v1';
export type RegistrySourcePermissionV1 = Omit<
  DiscoverySourceGrant,
  'purposes'
> & {
  purposes: ('discovery' | 'editorial' | 'licensed_registry_export_v1')[];
};
/** A's authority reader must distinguish never-configured from revoked/expired. */
export type SourcePermissionAuthorityPortV1 = Pick<
  SocialFactoryStoreV1,
  'read'
> &
  Partial<Pick<SocialFactoryStoreV1, 'readSourcePermissionState'>>;
export interface EditorialSourceDocumentV1 {
  sourceId: string;
  title: string;
  text: string;
  evidence: EvidenceV1[];
  sourceRevision: string;
  permissionRevision: string;
  retainUntil: string | null;
}
export interface EditorialSourceReadResultV1 {
  admissions: SourceAdmissionV1[];
  documents: EditorialSourceDocumentV1[];
  gaps: { sourceId: string; code: string }[];
}

const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const millis = (value: unknown): number =>
  value instanceof Date
    ? value.getTime()
    : typeof value === 'string'
    ? Date.parse(value)
    : NaN;
const metadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const origins = ['first_party', 'web', 'telegram', 'youtube', 'other'];

/** URL signal only. Callers must also inspect actual persisted source lineage. */
export function sourceOriginFromUrlV1(
  value: unknown
): 'telegram' | 'youtube' | 'web' | null {
  if (!nonempty(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const matches = (domains: string[]) =>
      domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (matches(['t.me', 'telegram.me', 'telegram.org', 'telegram.dog']))
      return 'telegram';
    if (matches(['youtube.com', 'youtu.be', 'youtube-nocookie.com']))
      return 'youtube';
    return 'web';
  } catch {
    return null;
  }
}

/**
 * Shared persisted-grant scope/lifecycle check. This does not replace registry
 * rights/freshness, actual origin/lineage checks or Telegram scoped consent.
 */
export function sourcePermissionFailureV1(
  record: SocialFactoryRecordV1<RegistrySourcePermissionV1>,
  organizationId: string,
  channelId: string,
  sourceId: string,
  purpose: SourceAuthorityPurposeV1 | 'discovery',
  now: number
): string | null {
  if (
    !record ||
    record.organizationId !== organizationId ||
    record.id !== sourceId ||
    String(record.kind) !== 'source_permission'
  )
    return 'SOURCE_PERMISSION_SCOPE_MISMATCH';
  if (
    record.deletedAt ||
    record.invalidatedAt ||
    (record.expiresAt &&
      (!Number.isFinite(millis(record.expiresAt)) ||
        millis(record.expiresAt) <= now))
  )
    return 'SOURCE_PERMISSION_INACTIVE';
  const grant = record.payload;
  if (
    !grant ||
    grant.organizationId !== organizationId ||
    grant.sourceId !== sourceId ||
    !Array.isArray(grant.channelIds) ||
    !grant.channelIds.includes(channelId)
  )
    return 'SOURCE_PERMISSION_SCOPE_MISMATCH';
  if (
    !Number.isInteger(record.revision) ||
    record.revision < 1 ||
    !nonempty(grant.revision) ||
    !nonempty(grant.evidenceId) ||
    !nonempty(grant.sourceContext) ||
    !['owned', 'licensed', 'consented'].includes(grant.basis) ||
    !origins.includes(grant.origin) ||
    !['first_party', 'upload', 'url', 'rss', 'search', 'licensed'].includes(
      grant.acquisition
    )
  )
    return 'SOURCE_PERMISSION_PROVENANCE_REQUIRED';
  if (
    grant.revokedAt !== undefined ||
    !Number.isFinite(millis(grant.expiresAt)) ||
    millis(grant.expiresAt) <= now
  )
    return 'SOURCE_PERMISSION_EXPIRED';
  const permissionPurpose =
    purpose === 'editorial_generation' ? 'editorial' : purpose;
  if (
    !Array.isArray(grant.purposes) ||
    !grant.purposes.includes(permissionPurpose)
  )
    return 'SOURCE_PERMISSION_PURPOSE_REQUIRED';
  if (purpose === 'licensed_registry_export_v1' && grant.basis !== 'licensed')
    return 'SOURCE_EXPORT_LICENSE_REQUIRED';
  return null;
}

/**
 * Reads only registered source snapshots and persisted server permissions.
 * No chat-supplied grant, URL fetch, analytics subscription or model call.
 */
export class EditorialSourceAuthorityV1 {
  constructor(
    private readonly store: SourcePermissionAuthorityPortV1,
    private readonly registry: Pick<
      ContentSourceRegistryRepository,
      'getDraftMaterial'
    >,
    private readonly now: () => Date = () => new Date()
  ) {}

  async read(
    organizationId: string,
    channelId: string,
    sourceIds: readonly string[],
    purpose: SourceAuthorityPurposeV1 = 'editorial_generation'
  ): Promise<EditorialSourceReadResultV1> {
    if (
      !nonempty(organizationId) ||
      !nonempty(channelId) ||
      !Array.isArray(sourceIds) ||
      sourceIds.length > 20 ||
      sourceIds.some((id) => !nonempty(id))
    )
      throw new Error('SOURCE_AUTHORITY_INVALID_INPUT');
    const now = this.now().getTime();
    if (!Number.isFinite(now))
      throw new Error('SOURCE_AUTHORITY_INVALID_CLOCK');
    if (
      !['discovery', 'editorial_generation', 'licensed_registry_export_v1'].includes(purpose)
    )
      throw new Error('SOURCE_AUTHORITY_INVALID_PURPOSE');
    const result: EditorialSourceReadResultV1 = {
      documents: [],
      gaps: [],
      admissions: [],
    };
    for (const sourceId of new Set(sourceIds)) {
      const deny = (code: string) => result.gaps.push({ sourceId, code });
      if (!this.store.readSourcePermissionState) {
        deny('SOURCE_PERMISSION_STATE_UNKNOWN');
        continue;
      }
      let state: SourcePermissionStateV1<RegistrySourcePermissionV1>;
      try {
        state =
          await this.store.readSourcePermissionState<RegistrySourcePermissionV1>(
            organizationId,
            sourceId
          );
      } catch {
        deny('SOURCE_PERMISSION_STATE_UNKNOWN');
        continue;
      }
      if (!state || !['present', 'absent'].includes(state.state)) {
        deny('SOURCE_PERMISSION_STATE_UNKNOWN');
        continue;
      }
      const record = state.state === 'present' ? state.record : null;
      if (record) {
        const failure = sourcePermissionFailureV1(
          record,
          organizationId,
          channelId,
          sourceId,
          purpose,
          now
        );
        if (failure) {
          deny(failure);
          continue;
        }
      } else if (state.state === 'present') {
        deny('SOURCE_PERMISSION_STATE_UNKNOWN');
        continue;
      }
      const grant = record?.payload;
      let material: Awaited<
        ReturnType<ContentSourceRegistryRepository['getDraftMaterial']>
      >;
      try {
        material = await this.registry.getDraftMaterial(
          organizationId,
          sourceId
        );
      } catch {
        deny('SOURCE_REGISTRY_UNAVAILABLE');
        continue;
      }
      const { source, snapshot } = material;
      if (
        !source ||
        !snapshot ||
        source.organizationId !== organizationId ||
        source.id !== sourceId ||
        snapshot.organizationId !== organizationId ||
        snapshot.sourceId !== sourceId ||
        source.currentSnapshotId !== snapshot.id
      ) {
        deny('SOURCE_REGISTRY_SCOPE_MISMATCH');
        continue;
      }
      if (
        source.archivedAt ||
        source.purgedAt ||
        source.desiredState !== 'ACTIVE' ||
        source.rightsState !== 'CONFIRMED' ||
        source.usagePurpose !== 'EVIDENCE' ||
        snapshot.purgedAt ||
        snapshot.supersededAt
      ) {
        deny('SOURCE_REGISTRY_INACTIVE');
        continue;
      }
      if (
        !nonempty(source.rightsConfirmedByUserId) ||
        !Number.isFinite(millis(source.rightsConfirmedAt)) ||
        millis(source.rightsConfirmedAt) > now
      ) {
        deny('SOURCE_RIGHTS_AUTHORITY_REQUIRED');
        continue;
      }
      const freshUntil =
        source.kind === 'MANUAL' ? null : millis(source.freshUntil);
      if (
        source.kind !== 'MANUAL' &&
        (!Number.isFinite(freshUntil) || Number(freshUntil) <= now)
      ) {
        deny('SOURCE_REGISTRY_STALE');
        continue;
      }
      if (
        snapshot.retentionUntil &&
        (!Number.isFinite(millis(snapshot.retentionUntil)) ||
          millis(snapshot.retentionUntil) <= now)
      ) {
        deny('SOURCE_SNAPSHOT_EXPIRED');
        continue;
      }
      const provider = metadata(snapshot.providerMetadata);
      const rows = Array.isArray(material.evidence) ? material.evidence : [];
      const hints: unknown[] = [
        provider.origin,
        provider.originPlatform,
        grant?.origin,
      ];
      const retrievalProvider = snapshot.retrievalProvider?.toLowerCase() || '';
      if (retrievalProvider.startsWith('telegram')) hints.unshift('telegram');
      if (retrievalProvider.startsWith('youtube')) hints.unshift('youtube');
      const contexts: unknown[] = [provider.sourceContext];
      const urlHints: unknown[] = [
        source.canonicalUrl,
        snapshot.requestedCanonicalUrl,
        snapshot.finalCanonicalUrl,
      ];
      for (const row of rows) {
        const locator = metadata(row.locator);
        const structured = metadata(row.structuredData);
        hints.push(
          locator.origin,
          locator.originPlatform,
          structured.origin,
          structured.originPlatform
        );
        contexts.push(locator.sourceContext, structured.sourceContext);
        urlHints.push(locator.sourceUrl, locator.url, structured.sourceUrl);
      }
      const urlOrigins = urlHints.map(sourceOriginFromUrlV1);
      const origin =
        hints.includes('telegram') || urlOrigins.includes('telegram')
          ? 'telegram'
          : hints.includes('youtube') || urlOrigins.includes('youtube')
          ? 'youtube'
          : hints.find(
              (value): value is DiscoverySourceGrant['origin'] =>
                nonempty(value) && origins.includes(value)
            ) ||
            (source.kind === 'MANUAL' &&
            snapshot.retrievalProvider === 'manual-v1' &&
            !urlOrigins.includes('web')
              ? 'first_party'
              : source.kind !== 'MANUAL' && urlOrigins.includes('web')
              ? 'web'
              : 'other');
      if (
        !grant &&
        (purpose === 'licensed_registry_export_v1' ||
          !['first_party', 'web'].includes(origin))
      ) {
        deny('SOURCE_PERMISSION_REQUIRED');
        continue;
      }
      if (
        grant &&
        contexts.some(
          (context) => nonempty(context) && context !== grant.sourceContext
        )
      ) {
        deny('SOURCE_PERMISSION_CONTEXT_MISMATCH');
        continue;
      }
      if (origin === 'telegram') {
        const consent = grant?.telegramConsent;
        if (
          !consent ||
          !nonempty(consent.evidenceId) ||
          consent.context !== grant?.sourceContext ||
          consent.allRelevantUsers !== true ||
          consent.explicitInformedAffirmative !== true ||
          consent.continued !== true
        ) {
          deny('TELEGRAM_SCOPED_CONSENT_REQUIRED');
          continue;
        }
      }
      const deadlines = [
        freshUntil,
        snapshot.retentionUntil ? millis(snapshot.retentionUntil) : null,
        grant ? millis(grant.expiresAt) : null,
      ].filter(
        (value): value is number => value !== null && Number.isFinite(value)
      );
      const retainUntil = deadlines.length
        ? new Date(Math.min(...deadlines)).toISOString()
        : null;
      let sourceUrl: string | undefined;
      try {
        if (nonempty(source.canonicalUrl))
          sourceUrl = redactSourceUrl(source.canonicalUrl);
      } catch {
        deny('SOURCE_REGISTRY_URL_INVALID');
        continue;
      }
      const evidence: EvidenceV1[] = [];
      const excerpts: string[] = [];
      let invalidEvidence = false;
      for (const row of rows.slice(0, 100)) {
        if (
          row.organizationId !== organizationId ||
          row.sourceSnapshotId !== snapshot.id ||
          row.tombstone
        ) {
          invalidEvidence = true;
          break;
        }
        // A 304 may renew the current source without creating new evidence rows.
        // The existing registry service uses source.freshUntil for URL/RSS.
        const rowFresh =
          source.kind === 'MANUAL' && row.freshUntil
            ? millis(row.freshUntil)
            : null;
        if (
          !nonempty(row.id) ||
          !nonempty(row.excerpt) ||
          !Number.isFinite(millis(row.observedAt)) ||
          (rowFresh !== null &&
            (!Number.isFinite(rowFresh) || rowFresh <= now)) ||
          !['FRESH', 'NOT_MONITORED'].includes(row.freshnessStatus)
        )
          continue;
        const expires = [
          ...deadlines,
          ...(rowFresh !== null ? [rowFresh] : []),
        ];
        const item: EvidenceV1 & {
          permissionBasis: 'registry_confirmed' | 'scoped_grant';
          rightsConfirmedAt: string;
        } = {
          id: row.id,
          sourceId,
          source: source.displayName || sourceId,
          ...(sourceUrl ? { sourceUrl } : {}),
          capturedAt: new Date(millis(row.observedAt)).toISOString(),
          ...(expires.length
            ? { expiresAt: new Date(Math.min(...expires)).toISOString() }
            : {}),
          access:
            grant?.basis === 'licensed'
              ? 'licensed'
              : origin === 'first_party'
              ? 'first_party'
              : grant?.acquisition === 'upload'
              ? 'upload'
              : 'public',
          rights: 'permitted',
          factStatus: 'unknown',
          ownerScope: organizationId,
          sourceRevision: snapshot.id,
          originPlatform: origin,
          purpose: purpose === 'editorial_generation' ? 'editorial' : purpose,
          permissionBasis: grant ? 'scoped_grant' : 'registry_confirmed',
          rightsConfirmedAt: new Date(
            millis(source.rightsConfirmedAt)
          ).toISOString(),
          ...(grant
            ? { grantId: grant.evidenceId, consentExpiresAt: grant.expiresAt }
            : {}),
          note: grant
            ? 'Source reuse scope resolved from the persisted server permission; factual truth remains unverified.'
            : 'Rights confirmed by the registered-source draft authority; factual truth remains unverified.',
        };
        evidence.push(item);
        excerpts.push(row.excerpt);
      }
      if (invalidEvidence) {
        deny('SOURCE_EVIDENCE_SCOPE_MISMATCH');
        continue;
      }
      if (!evidence.length) {
        deny('SOURCE_EVIDENCE_UNAVAILABLE');
        continue;
      }
      result.documents.push({
        sourceId,
        title: snapshot.normalizedTitle || source.displayName || sourceId,
        text: excerpts.join('\n\n').slice(0, 5000),
        evidence,
        sourceRevision: snapshot.id,
        permissionRevision:
          grant?.revision || `registry-config:${source.configVersion}`,
        retainUntil,
      });
      result.admissions.push({
        sourceId,
        sourceConfigVersion: source.configVersion,
        snapshotId: snapshot.id,
        rightsConfirmedAt: new Date(
          millis(source.rightsConfirmedAt)
        ).toISOString(),
        permissionRevision: record?.revision ?? null,
      });
    }
    return result;
  }
}
