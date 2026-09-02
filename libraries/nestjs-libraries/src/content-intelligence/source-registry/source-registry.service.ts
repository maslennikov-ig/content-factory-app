import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { SourceRegistryError, asSafeSourceError } from './errors';
import { canonicalizeSourceUrl, redactSourceUrl } from './network-policy';
import { SourceFetchGateway, SourceFetchResult } from './source-fetch.gateway';
import { ParsedSourcePayload, parseSourcePayload } from './source-parser';
import {
  assertDomainAllowed,
  assertRobotsAllowed,
  parseDeniedDomains,
  robotsUrlFor,
} from './source-access-policy';
import { calculateSourceFreshness } from './source-freshness';
import { ContentSourceRegistryRepository } from './source-registry.repository';
import {
  AcceptSearchResultInput,
  normalizeSearchResultAcceptance,
} from './search-evidence';

export type SourceRegistryCapabilities = {
  directFetch?: boolean;
  periodicSync?: boolean;
  telegramIngest?: boolean;
};

export type SourceRegistryPolicy = { deniedDomains?: string[] };

type SourceParserAdapter = {
  parse(
    kind: 'URL' | 'RSS',
    body: Buffer,
    metadata: { contentType: string; charset?: string | null }
  ): ParsedSourcePayload;
};

const defaultParser: SourceParserAdapter = {
  parse: parseSourcePayload,
};

function normalizedManualText(value: string | undefined): string {
  const text = (value || '').replace(/\r\n?/gu, '\n').trim();
  if (!text) {
    throw new SourceRegistryError(
      'PARSE_FAILED',
      'Manual source text is required',
      422
    );
  }
  if (text.length > 2_000_000) {
    throw new SourceRegistryError(
      'RESPONSE_TOO_LARGE',
      'Manual source text is too large',
      413
    );
  }
  return text;
}

function sourceHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class ContentSourceRegistryService {
  private readonly capabilities: Required<SourceRegistryCapabilities>;
  private readonly parser: SourceParserAdapter;
  private readonly now: () => Date;
  private readonly deniedDomains: string[];

  constructor(
    private readonly repository: ContentSourceRegistryRepository,
    private readonly gateway: SourceFetchGateway,
    @Optional() capabilities: SourceRegistryCapabilities = {},
    @Optional() parser: SourceParserAdapter = defaultParser,
    @Optional() now: () => Date = () => new Date(),
    @Optional() policy: SourceRegistryPolicy = {}
  ) {
    this.capabilities = {
      directFetch:
        capabilities.directFetch ?? process.env.SOURCE_DIRECT_FETCH === 'true',
      periodicSync:
        capabilities.periodicSync ??
        process.env.SOURCE_PERIODIC_SYNC === 'true',
      telegramIngest:
        capabilities.telegramIngest ??
        process.env.SOURCE_TELEGRAM_INGEST === 'true',
    };
    this.parser = parser || defaultParser;
    this.now = now || (() => new Date());
    this.deniedDomains =
      policy.deniedDomains ||
      parseDeniedDomains(process.env.SOURCE_DENIED_DOMAINS);
  }

  private presentSource(source: any) {
    const { canonicalKey: _canonicalKey, ...visible } = source;
    const currentSnapshot = source.currentSnapshot
      ? {
          observedAt: source.currentSnapshot.observedAt,
          freshUntil:
            source.freshUntil || source.currentSnapshot.freshUntil || null,
          evidenceCount:
            source.currentSnapshot.evidenceCount ??
            source.currentSnapshot._count?.evidence ??
            0,
        }
      : null;
    return {
      ...visible,
      healthState:
        source.healthState === 'FRESH' &&
        source.freshUntil &&
        source.freshUntil <= this.now()
          ? 'STALE'
          : source.healthState,
      canonicalUrl: source.canonicalUrl
        ? redactSourceUrl(source.canonicalUrl)
        : null,
      currentSnapshot,
    };
  }

  async createSource(
    organizationId: string,
    actorUserId: string,
    input: {
      kind: 'MANUAL' | 'URL' | 'RSS';
      displayName: string;
      canonicalUrl?: string;
      manualText?: string;
    }
  ) {
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new SourceRegistryError(
        'PARSE_FAILED',
        'Source name is required',
        422
      );
    }
    const manualText =
      input.kind === 'MANUAL' ? normalizedManualText(input.manualText) : null;
    const canonicalUrl =
      input.kind === 'MANUAL'
        ? null
        : canonicalizeSourceUrl(input.canonicalUrl || '');
    const canonicalKey =
      input.kind === 'MANUAL'
        ? `manual:${sourceHash(manualText as string)}`
        : (canonicalUrl as string);
    const persistenceInput = {
      kind: input.kind,
      displayName,
      canonicalKey,
      canonicalUrl,
    };
    const result = manualText
      ? await this.repository.createManualSource(
          organizationId,
          actorUserId,
          persistenceInput,
          manualText,
          sourceHash(manualText),
          this.now()
        )
      : await this.repository.createOrGet(
          organizationId,
          actorUserId,
          persistenceInput
        );
    return {
      source: this.presentSource(result.source),
      created: result.created,
    };
  }

  async listSources(organizationId: string) {
    const sources = await this.repository.listSources(organizationId);
    return {
      sources: sources.map((source: any) => this.presentSource(source)),
      capabilities: {
        directFetch: this.capabilities.directFetch,
        validate: this.capabilities.directFetch,
        sync: this.capabilities.directFetch,
      },
    };
  }

  async getSource(organizationId: string, sourceId: string) {
    return this.presentSource(
      await this.repository.getById(organizationId, sourceId)
    );
  }

  async confirmRights(
    organizationId: string,
    sourceId: string,
    actorUserId: string,
    input: { confirmed: boolean; note?: string }
  ) {
    return this.presentSource(
      await this.repository.updateRights(
        organizationId,
        sourceId,
        actorUserId,
        input.confirmed,
        input.note,
        this.now()
      )
    );
  }

  async activateSource(
    organizationId: string,
    sourceId: string,
    actorUserId: string
  ) {
    return this.presentSource(
      await this.repository.activate(organizationId, sourceId, actorUserId)
    );
  }

  archiveSource(organizationId: string, sourceId: string, actorUserId: string) {
    return this.repository.archive(
      organizationId,
      sourceId,
      actorUserId,
      this.now()
    );
  }

  async validateSource(
    organizationId: string,
    sourceId: string,
    _actorUserId: string,
    runKey: string = randomUUID()
  ) {
    if (!this.capabilities.directFetch) {
      throw new SourceRegistryError(
        'POLICY_DISABLED',
        'Direct source fetching is disabled',
        403
      );
    }
    const source = await this.repository.getById(organizationId, sourceId);
    if (source.kind !== 'URL' && source.kind !== 'RSS') {
      throw new SourceRegistryError(
        'POLICY_DISABLED',
        'Manual sources do not require validation',
        409
      );
    }
    if (source.rightsState !== 'CONFIRMED') {
      throw new SourceRegistryError(
        'RIGHTS_REQUIRED',
        'Source rights are not confirmed',
        409
      );
    }
    if (source.desiredState !== 'DRAFT') {
      throw new SourceRegistryError(
        'SOURCE_CONFLICT',
        'Only draft sources can be validated',
        409
      );
    }
    try {
      assertDomainAllowed(source.canonicalUrl, this.deniedDomains);
      const robots = await this.gateway.fetch(
        robotsUrlFor(source.canonicalUrl),
        'ROBOTS',
        {},
        (url) => assertDomainAllowed(url, this.deniedDomains)
      );
      assertRobotsAllowed(robots.body, source.canonicalUrl);
    } catch (error) {
      const safe = asSafeSourceError(error);
      await this.repository.recordValidationPolicyFailure?.(
        organizationId,
        sourceId,
        safe.code,
        safe.code === 'ROBOTS_DISALLOWED' ? 'DISALLOWED' : undefined,
        this.now(),
        source.configVersion,
        'DRAFT'
      );
      throw safe;
    }
    return this.fetchAndCommit(source, organizationId, runKey, 'VALIDATE');
  }

  private async fetchAndCommit(
    source: any,
    organizationId: string,
    runKey: string,
    trigger: 'VALIDATE' | 'SYNC_NOW'
  ) {
    try {
      assertDomainAllowed(source.canonicalUrl, this.deniedDomains);
    } catch (error) {
      const safe = asSafeSourceError(error);
      await this.repository.recordValidationPolicyFailure?.(
        organizationId,
        source.id,
        safe.code,
        undefined,
        this.now(),
        source.configVersion,
        trigger === 'VALIDATE' ? 'DRAFT' : 'ACTIVE'
      );
      throw safe;
    }
    const run = await this.repository.startSyncRun(
      organizationId,
      source.id,
      source.configVersion,
      runKey,
      this.now(),
      trigger
    );
    // `=== true` (not a bare truthy check) matters here: this repo builds
    // with strictNullChecks off, and under that setting TS only narrows a
    // discriminated union on a boolean literal field via an equality check,
    // not via truthiness. A plain `if (run.duplicate)` leaves `run` typed as
    // the full StartSyncRunResult union afterwards, so `run.leaseId` below
    // would not type-check.
    if (run.duplicate === true) {
      if (run.status === 'SUCCEEDED' && run.resultSnapshotId) {
        return { snapshotId: run.resultSnapshotId, reused: true };
      }
      return { syncRunId: run.id, status: run.status || 'RUNNING' };
    }
    try {
      const fetched: SourceFetchResult = await this.gateway.fetch(
        source.canonicalUrl,
        source.kind,
        {
          etag: source.currentSnapshot?.etag || undefined,
          lastModified: source.currentSnapshot?.lastModified || undefined,
        },
        (url) => assertDomainAllowed(url, this.deniedDomains)
      );
      let parsed: ParsedSourcePayload | undefined;
      let contentHash: string | undefined;
      if (fetched.status === 200) {
        parsed = this.parser.parse(source.kind, fetched.body, {
          contentType: fetched.contentType as string,
          charset: fetched.charset,
        });
        contentHash = sourceHash(parsed.text);
      }
      const now = this.now();
      const freshness = calculateSourceFreshness({
        now,
        cacheControl: fetched.headers.cacheControl,
        expires: fetched.headers.expires,
        rssTtlMinutes: parsed?.rssTtlMinutes,
      });
      if (!freshness.storable) {
        throw new SourceRegistryError(
          'POLICY_DISABLED',
          'Source forbids reusable storage',
          409
        );
      }
      return await this.repository.completeSync({
        organizationId,
        sourceId: source.id,
        runId: run.id,
        leaseId: run.leaseId,
        trigger,
        configVersion: source.configVersion,
        status: fetched.status,
        requestedUrl: fetched.requestedUrl,
        finalUrl: fetched.finalUrl,
        redirectChain: fetched.redirectChain,
        contentType: fetched.contentType,
        charset: fetched.charset,
        compressedBytes: fetched.compressedBytes,
        decompressedBytes: fetched.decompressedBytes,
        etag: fetched.headers.etag,
        lastModified: fetched.headers.lastModified,
        cacheControl: fetched.headers.cacheControl,
        expiresAt:
          fetched.headers.expires &&
          Number.isFinite(Date.parse(fetched.headers.expires))
            ? new Date(fetched.headers.expires)
            : null,
        freshUntil: freshness.freshUntil,
        nextFetchNotBefore: freshness.nextFetchNotBefore,
        contentHash,
        parser: parsed?.parser,
        parserVersion: parsed?.parserVersion,
        normalizedTitle: parsed?.title,
        normalizedText: parsed?.text,
        publishedAt: parsed?.publishedAt,
        externalIdentity: parsed?.externalIdentity,
        retrievalProvider: 'direct-fetch-v1',
        evidence: parsed?.evidence || [],
        now,
      });
    } catch (error) {
      const safe = asSafeSourceError(error);
      await this.repository.failSync?.(
        organizationId,
        source.id,
        run.id,
        run.leaseId,
        safe.code,
        this.now()
      );
      throw safe;
    }
  }

  async syncNow(
    organizationId: string,
    sourceId: string,
    _actorUserId: string,
    runKey: string = randomUUID()
  ) {
    if (!this.capabilities.directFetch) {
      throw new SourceRegistryError(
        'POLICY_DISABLED',
        'Direct source fetching is disabled',
        403
      );
    }
    const source = await this.repository.getById(organizationId, sourceId);
    if (source.kind !== 'URL' && source.kind !== 'RSS') {
      throw new SourceRegistryError(
        'POLICY_DISABLED',
        'Manual sources do not sync',
        409
      );
    }
    if (source.rightsState !== 'CONFIRMED') {
      throw new SourceRegistryError(
        'RIGHTS_REQUIRED',
        'Source rights are not confirmed',
        409
      );
    }
    if (source.desiredState !== 'ACTIVE') {
      throw new SourceRegistryError(
        'SOURCE_INACTIVE',
        'Source is not active',
        409
      );
    }
    if (source.robotsState !== 'ALLOWED') {
      throw new SourceRegistryError(
        'ROBOTS_DISALLOWED',
        'Robots policy does not allow source synchronization',
        409
      );
    }
    try {
      assertDomainAllowed(source.canonicalUrl, this.deniedDomains);
      const robots = await this.gateway.fetch(
        robotsUrlFor(source.canonicalUrl),
        'ROBOTS',
        {},
        (url) => assertDomainAllowed(url, this.deniedDomains)
      );
      assertRobotsAllowed(robots.body, source.canonicalUrl);
    } catch (error) {
      const safe = asSafeSourceError(error);
      await this.repository.recordValidationPolicyFailure?.(
        organizationId,
        sourceId,
        safe.code,
        safe.code === 'ROBOTS_DISALLOWED' ? 'DISALLOWED' : undefined,
        this.now(),
        source.configVersion,
        'ACTIVE'
      );
      throw safe;
    }
    return this.fetchAndCommit(source, organizationId, runKey, 'SYNC_NOW');
  }

  async getDraftMaterial(organizationId: string, sourceId: string) {
    const material = await this.repository.getDraftMaterial(
      organizationId,
      sourceId
    );
    return {
      sourceId: material.source.id,
      snapshotId: material.snapshot.id,
      evidence: material.evidence.map((evidence: any) => ({
        evidenceId: evidence.id,
        excerpt: evidence.excerpt,
        observedAt: evidence.observedAt.toISOString(),
        freshUntil:
          material.source.kind === 'MANUAL'
            ? evidence.freshUntil?.toISOString() || null
            : material.source.freshUntil?.toISOString() || null,
        freshnessStatus:
          material.source.kind === 'MANUAL'
            ? evidence.freshnessStatus
            : material.source.freshUntil &&
              material.source.freshUntil > this.now()
            ? 'FRESH'
            : 'STALE',
        provenance: {
          kind: material.source.kind,
          retrievalProvider: material.snapshot.retrievalProvider,
        },
      })),
      trace: {
        contractVersion: 'source-draft-material/v1',
        builtAt: this.now().toISOString(),
      },
    };
  }

  /**
   * `content-factory-next-lh5s`: the moment a person accepts one web-research
   * result — a fact/source pair from `WebResearchService.research(...)` —
   * turns it into real evidence: a frozen excerpt, its link and the date it
   * was read, exactly what the owner asked for and nothing more. This never
   * creates a `ContentSource`, never enqueues a sync, and never touches the
   * network gateway; `normalizeSearchResultAcceptance` only canonicalizes the
   * URL for storage, it does not fetch it.
   */
  async acceptSearchResult(
    organizationId: string,
    input: Omit<AcceptSearchResultInput, 'organizationId' | 'now'>
  ) {
    const payload = normalizeSearchResultAcceptance({
      ...input,
      organizationId,
      now: this.now(),
    });
    const snapshot = await this.repository.createSearchProviderEvidence(
      payload
    );
    const evidence = snapshot.evidence[0];
    return {
      evidenceId: evidence.id,
      sourceSnapshotId: snapshot.id,
      url: snapshot.finalCanonicalUrl,
      title: snapshot.normalizedTitle,
      excerpt: evidence.excerpt,
      provider: input.provider,
      publishedAt: snapshot.publishedAt
        ? snapshot.publishedAt.toISOString()
        : null,
      retrievedAt: evidence.observedAt.toISOString(),
      freshUntil: evidence.freshUntil.toISOString(),
    };
  }
}
