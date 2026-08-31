import { Injectable, Optional } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { SourceRegistryError } from './errors';
import { DEFAULT_SOURCE_FETCH_BUDGETS } from './source-fetch.gateway';

type SourceCreateInput = {
  kind: 'MANUAL' | 'URL' | 'RSS';
  displayName: string;
  canonicalKey: string;
  canonicalUrl: string | null;
};

type CompletionInput = {
  organizationId: string;
  sourceId: string;
  runId: string;
  leaseId: string;
  trigger: 'VALIDATE' | 'SYNC_NOW';
  configVersion: number;
  status: 200 | 304;
  requestedUrl: string;
  finalUrl: string;
  redirectChain: string[];
  contentType: string | null;
  charset: string | null;
  compressedBytes: number;
  decompressedBytes: number;
  etag?: string;
  lastModified?: string;
  cacheControl?: string;
  expiresAt?: Date | null;
  freshUntil: Date;
  nextFetchNotBefore: Date;
  contentHash?: string;
  parser?: string;
  parserVersion?: string;
  normalizedTitle?: string | null;
  normalizedText?: string;
  publishedAt?: Date | null;
  externalIdentity?: string | null;
  retrievalProvider: string;
  evidence: Array<{
    excerpt: string;
    locator: Record<string, unknown>;
    structuredData?: Record<string, unknown>;
  }>;
  now: Date;
};

const FETCH_HOPS = DEFAULT_SOURCE_FETCH_BUDGETS.redirects + 1;
const ONE_FETCH_ENVELOPE_MS =
  FETCH_HOPS *
    (DEFAULT_SOURCE_FETCH_BUDGETS.dnsTimeoutMs +
      DEFAULT_SOURCE_FETCH_BUDGETS.totalTimeoutMs) +
  DEFAULT_SOURCE_FETCH_BUDGETS.totalTimeoutMs;
export const SOURCE_WORST_CASE_ENVELOPE_MS = 2 * ONE_FETCH_ENVELOPE_MS + 10_000;
export const SOURCE_RUN_LEASE_MS = SOURCE_WORST_CASE_ENVELOPE_MS + 30_000;

function prismaCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined;
}

const policyFailureCodes = new Set([
  'POLICY_DISABLED',
  'RIGHTS_REQUIRED',
  'ROBOTS_DISALLOWED',
  'TERMS_DENIED',
  'INVALID_URL',
  'UNSUPPORTED_PROTOCOL',
  'UNSUPPORTED_PORT',
  'URL_CREDENTIALS',
  'DNS_UNSAFE',
  'DNS_REBIND_BLOCKED',
  'REDIRECT_UNSAFE',
]);

@Injectable()
export class ContentSourceRegistryRepository {
  constructor(
    private readonly repository: PrismaRepository<any>,
    private readonly transaction: PrismaTransaction,
    @Optional() private readonly clock: () => Date = () => new Date()
  ) {}

  async createOrGet(
    organizationId: string,
    actorUserId: string,
    input: SourceCreateInput
  ) {
    const where = {
      organizationId_kind_canonicalKey: {
        organizationId,
        kind: input.kind,
        canonicalKey: input.canonicalKey,
      },
    };
    const existing = await (
      this.repository.model as any
    ).contentSource.findUnique({
      where,
      include: { currentSnapshot: true },
    });
    if (existing) return { source: existing, created: false };
    try {
      const created = await (this.repository.model as any).contentSource.create(
        {
          data: {
            organizationId,
            ...input,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            robotsState: input.kind === 'MANUAL' ? 'NOT_APPLICABLE' : 'UNKNOWN',
          },
          include: { currentSnapshot: true },
        }
      );
      return { source: created, created: true };
    } catch (error) {
      if (prismaCode(error) !== 'P2002') throw error;
      const raced = await (
        this.repository.model as any
      ).contentSource.findUnique({
        where,
        include: { currentSnapshot: true },
      });
      if (!raced) throw error;
      return { source: raced, created: false };
    }
  }

  listSources(organizationId: string) {
    return (this.repository.model as any).contentSource.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: {
        currentSnapshot: {
          select: {
            id: true,
            observedAt: true,
            validatedAt: true,
            freshUntil: true,
            normalizedTitle: true,
            retrievalProvider: true,
            _count: { select: { evidence: true } },
          },
        },
      },
    });
  }

  async getById(organizationId: string, id: string) {
    const source = await (this.repository.model as any).contentSource.findFirst(
      {
        where: { organizationId, id, archivedAt: null },
        include: {
          currentSnapshot: {
            select: {
              id: true,
              etag: true,
              lastModified: true,
              contentHash: true,
              observedAt: true,
              validatedAt: true,
              freshUntil: true,
              normalizedTitle: true,
              retrievalProvider: true,
            },
          },
        },
      }
    );
    if (!source) {
      throw new SourceRegistryError(
        'SOURCE_NOT_FOUND',
        'Source was not found',
        404
      );
    }
    return source;
  }

  async updateRights(
    organizationId: string,
    id: string,
    actorUserId: string,
    confirmed: boolean,
    note: string | undefined,
    now: Date
  ) {
    const changed = await (
      this.repository.model as any
    ).contentSource.updateMany({
      where: { organizationId, id, archivedAt: null },
      data: {
        rightsState: confirmed ? 'CONFIRMED' : 'DENIED',
        rightsConfirmedByUserId: confirmed ? actorUserId : null,
        rightsConfirmedAt: confirmed ? now : null,
        rightsNote: note?.trim() || null,
        updatedByUserId: actorUserId,
        configVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new SourceRegistryError(
        'SOURCE_NOT_FOUND',
        'Source was not found',
        404
      );
    }
    return this.getById(organizationId, id);
  }

  async activate(organizationId: string, id: string, actorUserId: string) {
    const changed = await (
      this.repository.model as any
    ).contentSource.updateMany({
      where: {
        organizationId,
        id,
        archivedAt: null,
        rightsState: 'CONFIRMED',
        robotsState: { in: ['ALLOWED', 'NOT_APPLICABLE'] },
        currentSnapshotId: { not: null },
      },
      data: {
        desiredState: 'ACTIVE',
        updatedByUserId: actorUserId,
        configVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new SourceRegistryError(
        'RIGHTS_REQUIRED',
        'Source must have confirmed rights and a current allowed validation snapshot',
        409
      );
    }
    return this.getById(organizationId, id);
  }

  async archive(
    organizationId: string,
    id: string,
    actorUserId: string,
    now: Date
  ) {
    const changed = await (
      this.repository.model as any
    ).contentSource.updateMany({
      where: { organizationId, id, archivedAt: null },
      data: {
        desiredState: 'ARCHIVED',
        archivedAt: now,
        archivedByUserId: actorUserId,
        updatedByUserId: actorUserId,
        configVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new SourceRegistryError(
        'SOURCE_NOT_FOUND',
        'Source was not found',
        404
      );
    }
    return { archived: true };
  }

  async recordValidationPolicyFailure(
    organizationId: string,
    id: string,
    code: string,
    robotsState: 'DISALLOWED' | undefined,
    now: Date,
    configVersion: number,
    expectedDesiredState: 'DRAFT' | 'ACTIVE'
  ) {
    const changed = await (
      this.repository.model as any
    ).contentSource.updateMany({
      where: {
        organizationId,
        id,
        archivedAt: null,
        configVersion,
        desiredState: expectedDesiredState,
        rightsState: 'CONFIRMED',
      },
      data: {
        healthState: 'POLICY_BLOCKED',
        ...(robotsState ? { robotsState } : {}),
        lastValidatedAt: now,
        lastErrorCode: code,
        configVersion: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new SourceRegistryError(
        'SOURCE_CONFLICT',
        'Source changed while policy validation was running',
        409
      );
    }
  }

  async createManualSource(
    organizationId: string,
    actorUserId: string,
    input: SourceCreateInput,
    normalizedText: string,
    contentHash: string,
    now: Date
  ) {
    const where = {
      organizationId_kind_canonicalKey: {
        organizationId,
        kind: input.kind,
        canonicalKey: input.canonicalKey,
      },
    };
    try {
      return await (this.transaction.model as any).$transaction(
        async (database: any) => {
          const existing = await database.contentSource.findUnique({
            where,
            include: { currentSnapshot: true },
          });
          if (existing) return { source: existing, created: false };
          const created = await database.contentSource.create({
            data: {
              organizationId,
              ...input,
              createdByUserId: actorUserId,
              updatedByUserId: actorUserId,
              robotsState: 'NOT_APPLICABLE',
            },
          });
          const sourceId = created.id;
          const run = await database.sourceSyncRun.create({
            data: {
              organizationId,
              sourceId,
              configVersion: 1,
              runKey: `manual:${sourceId}:1`,
              trigger: 'MANUAL',
              queuedAt: now,
              startedAt: now,
              finishedAt: now,
              status: 'SUCCEEDED',
              policyDecisions: { network: 'not-applicable' },
              parserOutcome: 'CREATED',
            },
          });
          const snapshot = await database.sourceSnapshot.create({
            data: {
              organizationId,
              sourceId,
              syncRunId: run.id,
              sequence: 1,
              observedAt: now,
              validatedAt: now,
              contentHash,
              parser: 'manual-text',
              parserVersion: '1',
              normalizedText,
              retrievalProvider: 'manual-v1',
              retentionUntil: new Date(
                now.getTime() + 90 * 24 * 60 * 60 * 1_000
              ),
              evidence: {
                create: [
                  {
                    organizationId,
                    excerpt: normalizedText.slice(0, 4_096),
                    locator: { kind: 'manual-document' },
                    observedAt: now,
                    freshnessStatus: 'NOT_MONITORED',
                  },
                ],
              },
            },
          });
          const source = await database.contentSource.update({
            where: { organizationId_id: { organizationId, id: sourceId } },
            data: {
              currentSnapshotId: snapshot.id,
              healthState: 'FRESH',
              lastValidatedAt: now,
              lastSuccessAt: now,
            },
          });
          await database.sourceSyncRun.update?.({
            where: { organizationId_id: { organizationId, id: run.id } },
            data: { resultSnapshotId: snapshot.id },
          });
          return { source, created: true };
        },
        { isolationLevel: 'Serializable' }
      );
    } catch (error) {
      if (prismaCode(error) !== 'P2002') throw error;
      const existing = await (
        this.repository.model as any
      ).contentSource.findUnique({ where, include: { currentSnapshot: true } });
      if (!existing) throw error;
      return { source: existing, created: false };
    }
  }

  async startSyncRun(
    organizationId: string,
    sourceId: string,
    configVersion: number,
    runKey: string,
    now: Date,
    trigger: 'VALIDATE' | 'SYNC_NOW' = 'SYNC_NOW'
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await (this.transaction.model as any).$transaction(
          async (database: any) => {
            const existing = await database.sourceSyncRun.findUnique({
              where: { organizationId_runKey: { organizationId, runKey } },
            });
            if (existing) {
              if (existing.sourceId !== sourceId) {
                throw new SourceRegistryError(
                  'SOURCE_CONFLICT',
                  'Sync key is already in use',
                  409
                );
              }
              return {
                id: existing.id,
                duplicate: true,
                resultSnapshotId: existing.resultSnapshotId,
                status: existing.status,
              };
            }
            const active = await database.sourceSyncRun.findFirst({
              where: {
                organizationId,
                sourceId,
                status: 'RUNNING',
                leaseExpiresAt: { gt: now },
              },
              select: { id: true },
            });
            if (active) {
              throw new SourceRegistryError(
                'SOURCE_CONFLICT',
                'Source synchronization is already running',
                409
              );
            }
            const run = await database.sourceSyncRun.create({
              data: {
                organizationId,
                sourceId,
                configVersion,
                runKey,
                trigger,
                queuedAt: now,
                startedAt: now,
                status: 'RUNNING',
                leaseId: runKey,
                leaseExpiresAt: new Date(now.getTime() + SOURCE_RUN_LEASE_MS),
                policyDecisions: {
                  capability: 'allowed',
                  rights: 'confirmed',
                  robots: 'allowed',
                },
              },
            });
            return {
              id: run.id,
              duplicate: false,
              resultSnapshotId: null as string | null,
              leaseId: runKey,
            };
          },
          { isolationLevel: 'Serializable' }
        );
      } catch (error) {
        if (prismaCode(error) === 'P2034' && attempt < 2) continue;
        if (prismaCode(error) !== 'P2002') throw error;
        const existing = await (
          this.repository.model as any
        ).sourceSyncRun.findUnique({
          where: { organizationId_runKey: { organizationId, runKey } },
        });
        if (!existing || existing.sourceId !== sourceId) throw error;
        return {
          id: existing.id,
          duplicate: true,
          resultSnapshotId: existing.resultSnapshotId,
          status: existing.status,
        };
      }
    }
    throw new SourceRegistryError(
      'SOURCE_CONFLICT',
      'Source write conflict',
      409
    );
  }

  async completeSync(input: CompletionInput) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await (this.transaction.model as any).$transaction(
          async (database: any) => {
            const leaseCheckNow = this.clock();
            const leasedRun = await database.sourceSyncRun.findFirst({
              where: {
                organizationId: input.organizationId,
                id: input.runId,
                sourceId: input.sourceId,
                leaseId: input.leaseId,
                status: 'RUNNING',
                leaseExpiresAt: { gt: leaseCheckNow },
              },
              select: { id: true },
            });
            if (!leasedRun) {
              throw new SourceRegistryError(
                'SOURCE_CONFLICT',
                'Source synchronization lease expired or changed',
                409
              );
            }
            const source = await database.contentSource.findFirst({
              where: {
                organizationId: input.organizationId,
                id: input.sourceId,
                archivedAt: null,
              },
              include: { currentSnapshot: true },
            });
            if (!source) {
              throw new SourceRegistryError(
                'SOURCE_NOT_FOUND',
                'Source was not found',
                404
              );
            }
            if (
              source.configVersion !== input.configVersion ||
              source.desiredState !==
                (input.trigger === 'VALIDATE' ? 'DRAFT' : 'ACTIVE') ||
              source.rightsState !== 'CONFIRMED' ||
              (input.trigger === 'SYNC_NOW' && source.robotsState !== 'ALLOWED')
            ) {
              throw new SourceRegistryError(
                'SOURCE_CONFLICT',
                'Source changed while synchronization was running',
                409
              );
            }
            if (input.status === 304 && !source.currentSnapshot) {
              throw new SourceRegistryError(
                'SOURCE_CONFLICT',
                'Source returned not-modified without a current snapshot',
                409
              );
            }

            const reusable =
              source.currentSnapshot &&
              (input.status === 304 ||
                (input.contentHash &&
                  source.currentSnapshot.contentHash === input.contentHash));
            let snapshotId = reusable ? source.currentSnapshot.id : null;
            if (!snapshotId) {
              const latest = await database.sourceSnapshot.findFirst({
                where: {
                  organizationId: input.organizationId,
                  sourceId: input.sourceId,
                },
                orderBy: { sequence: 'desc' },
                select: { sequence: true },
              });
              const snapshot = await database.sourceSnapshot.create({
                data: {
                  organizationId: input.organizationId,
                  sourceId: input.sourceId,
                  syncRunId: input.runId,
                  supersedesSnapshotId: source.currentSnapshotId,
                  sequence: (latest?.sequence || 0) + 1,
                  observedAt: input.now,
                  validatedAt: input.now,
                  publishedAt: input.publishedAt || null,
                  requestedCanonicalUrl: input.requestedUrl,
                  finalCanonicalUrl: input.finalUrl,
                  redirectChain: input.redirectChain,
                  etag: input.etag || null,
                  lastModified: input.lastModified || null,
                  cacheControl: input.cacheControl || null,
                  expiresAt: input.expiresAt || null,
                  freshUntil: input.freshUntil,
                  contentType: input.contentType,
                  charset: input.charset,
                  compressedBytes: input.compressedBytes,
                  decompressedBytes: input.decompressedBytes,
                  contentHash: input.contentHash,
                  parser: input.parser,
                  parserVersion: input.parserVersion,
                  normalizedTitle: input.normalizedTitle,
                  normalizedText: input.normalizedText,
                  externalIdentity: input.externalIdentity,
                  retrievalProvider: input.retrievalProvider,
                  retentionUntil: new Date(
                    input.now.getTime() + 90 * 24 * 60 * 60 * 1_000
                  ),
                  evidence: {
                    create: input.evidence.map((evidence) => ({
                      organizationId: input.organizationId,
                      excerpt: evidence.excerpt,
                      locator: evidence.locator,
                      structuredData: evidence.structuredData,
                      observedAt: input.now,
                      freshUntil: input.freshUntil,
                      freshnessStatus: 'FRESH',
                    })),
                  },
                },
              });
              snapshotId = snapshot.id;
              if (source.currentSnapshotId) {
                await database.sourceSnapshot.updateMany({
                  where: {
                    organizationId: input.organizationId,
                    id: source.currentSnapshotId,
                    supersededAt: null,
                  },
                  data: {
                    supersededAt: input.now,
                    retentionUntil: new Date(
                      input.now.getTime() + 90 * 24 * 60 * 60 * 1_000
                    ),
                  },
                });
              }
            }

            const sourceCommitted = await database.contentSource.updateMany({
              where: {
                organizationId: input.organizationId,
                id: input.sourceId,
                archivedAt: null,
                configVersion: input.configVersion,
                desiredState: input.trigger === 'VALIDATE' ? 'DRAFT' : 'ACTIVE',
                rightsState: 'CONFIRMED',
                robotsState:
                  input.trigger === 'VALIDATE'
                    ? { in: ['UNKNOWN', 'DISALLOWED', 'ALLOWED'] }
                    : 'ALLOWED',
              },
              data: {
                currentSnapshotId: snapshotId,
                healthState: 'FRESH',
                lastValidatedAt: input.now,
                lastSuccessAt: input.now,
                freshUntil: input.freshUntil,
                nextFetchNotBefore: input.nextFetchNotBefore,
                lastErrorCode: null,
                ...(input.trigger === 'VALIDATE'
                  ? { robotsState: 'ALLOWED' }
                  : {}),
              },
            });
            if (sourceCommitted.count !== 1) {
              throw new SourceRegistryError(
                'SOURCE_CONFLICT',
                'Source changed while synchronization was running',
                409
              );
            }
            const commitNow = this.clock();
            const committed = await database.sourceSyncRun.updateMany({
              where: {
                organizationId: input.organizationId,
                id: input.runId,
                sourceId: input.sourceId,
                leaseId: input.leaseId,
                status: 'RUNNING',
                leaseExpiresAt: { gt: commitNow },
              },
              data: {
                status: 'SUCCEEDED',
                finishedAt: commitNow,
                resultSnapshotId: snapshotId,
                httpStatus: input.status,
                redirectCount: Math.max(0, input.redirectChain.length - 1),
                compressedBytes: input.compressedBytes,
                decompressedBytes: input.decompressedBytes,
                parserOutcome: reusable ? 'REUSED' : 'CREATED',
                leaseId: null,
                leaseExpiresAt: null,
              },
            });
            if (committed.count !== 1) {
              throw new SourceRegistryError(
                'SOURCE_CONFLICT',
                'Source synchronization lease expired or changed',
                409
              );
            }
            return { snapshotId, reused: Boolean(reusable) };
          },
          { isolationLevel: 'Serializable' }
        );
      } catch (error) {
        if (prismaCode(error) !== 'P2034' || attempt === 2) throw error;
      }
    }
    throw new SourceRegistryError(
      'SOURCE_CONFLICT',
      'Source write conflict',
      409
    );
  }

  async failSync(
    organizationId: string,
    sourceId: string,
    runId: string,
    leaseId: string,
    code: string,
    _now: Date
  ) {
    return (this.transaction.model as any).$transaction(
      async (database: any) => {
        const failedAt = this.clock();
        const failed = await database.sourceSyncRun.updateMany({
          where: {
            organizationId,
            id: runId,
            sourceId,
            leaseId,
            status: 'RUNNING',
            leaseExpiresAt: { gt: failedAt },
          },
          data: {
            status: 'FAILED',
            finishedAt: failedAt,
            errorCode: code,
            leaseId: null,
            leaseExpiresAt: null,
          },
        });
        if (failed.count !== 1) {
          throw new SourceRegistryError(
            'SOURCE_CONFLICT',
            'Source synchronization lease expired or changed',
            409
          );
        }
        await database.contentSource.updateMany({
          where: { organizationId, id: sourceId, archivedAt: null },
          data: {
            healthState: policyFailureCodes.has(code)
              ? 'POLICY_BLOCKED'
              : 'ERROR',
            lastErrorCode: code,
          },
        });
      }
    );
  }

  async getDraftMaterial(organizationId: string, sourceId: string) {
    const source = await (this.repository.model as any).contentSource.findFirst(
      {
        where: {
          organizationId,
          id: sourceId,
          archivedAt: null,
          desiredState: 'ACTIVE',
          rightsState: 'CONFIRMED',
        },
        include: {
          currentSnapshot: {
            include: {
              evidence: {
                where: { tombstone: null },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      }
    );
    if (!source || !source.currentSnapshot || source.currentSnapshot.purgedAt) {
      throw new SourceRegistryError(
        'SOURCE_NOT_FOUND',
        'Source material was not found',
        404
      );
    }
    return {
      source,
      snapshot: source.currentSnapshot,
      evidence: source.currentSnapshot.evidence,
    };
  }
}
