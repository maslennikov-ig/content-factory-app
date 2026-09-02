import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CONTENT_CONTEXT_MAX_EVIDENCE_V1,
  CONTENT_CONTEXT_MAX_FACTS_V1,
  CONTENT_CONTEXT_MAX_RENDERED_CHARACTERS_V1,
  CONTENT_EVIDENCE_REQUIRED,
  type ContentContextEnvelopeV1,
  type ResolvedBrandProfileContextV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import { ContentContextError } from './content-context.errors';
import { ContentContextRepository } from './content-context.repository';
import { BrandProfileContextService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service';
import type {
  BrandProfileContextPortV1,
  ContentContextBuildInputV1,
  ContentContextEnvelopeResultV1,
  ContentContextRepositoryPortV1,
  EvidenceCandidateV1,
  FactCandidateV1,
  StoredContextItemV1,
  StoredContextSnapshotV1,
} from './content-context.types';

const CONTEXT_TTL_MS = 15 * 60 * 1000;
const MAX_EXCERPT_CHARACTERS = 800;
const SELECTION_ALGORITHM_VERSION = 1;

type RejectionReason = ContentContextEnvelopeV1['rejected'][number]['reason'];

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function cleanText(value: string | null | undefined, maximum: number) {
  return (value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maximum);
}

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function sourceRemoved(evidence: EvidenceCandidateV1) {
  const source = evidence.snapshot.source;
  return Boolean(
    evidence.tombstone ||
      evidence.snapshot.purgedAt ||
      source?.archivedAt ||
      source?.purgedAt
  );
}

function sourceAllowed(evidence: EvidenceCandidateV1) {
  if (sourceRemoved(evidence)) return false;
  const source = evidence.snapshot.source;
  if (!source) return evidence.snapshot.kind === 'SEARCH_PROVIDER_RESULT';
  // A style reference is read for how it is written, never for what it says.
  // It is refused here rather than filtered later because this is the one
  // place that decides what may enter a generation context, and a rule that
  // lives anywhere else is a rule a future branch can route around.
  if (source.usagePurpose === 'STYLE_REFERENCE') return false;
  return (
    source.organizationId === evidence.organizationId &&
    source.desiredState === 'ACTIVE' &&
    source.rightsState === 'CONFIRMED' &&
    ['ALLOWED', 'NOT_APPLICABLE'].includes(source.robotsState) &&
    source.currentSnapshotId === evidence.sourceSnapshotId
  );
}

function evidenceFresh(evidence: EvidenceCandidateV1, asOf: Date) {
  const source = evidence.snapshot.source;
  if (source) {
    return Boolean(
      source.freshUntil && source.freshUntil.getTime() >= asOf.getTime()
    );
  }
  if (evidence.snapshot.kind !== 'SEARCH_PROVIDER_RESULT') return false;
  const freshUntil = evidence.freshUntil || evidence.snapshot.freshUntil;
  return (
    evidence.freshnessStatus === 'FRESH' &&
    Boolean(freshUntil) &&
    (freshUntil as Date).getTime() >= asOf.getTime()
  );
}

function evidenceAccepted(evidence: EvidenceCandidateV1) {
  return (
    evidence.assessment?.status === 'ACCEPTED' &&
    evidence.assessment.trustTier !== 'BLOCKED'
  );
}

function trustRank(evidence: EvidenceCandidateV1) {
  return (
    {
      OWNER_VERIFIED: 5,
      OFFICIAL: 4,
      CURATED: 3,
      UNRATED: 1,
      BLOCKED: 0,
    }[evidence.assessment?.trustTier || 'UNRATED'] || 0
  );
}

function profileEnvelope(profile: ResolvedBrandProfileContextV1) {
  if (profile.applied.mode === 'profile') {
    return {
      mode: 'resolved' as const,
      versionId: profile.applied.versionId,
      versionNumber: profile.applied.versionNumber,
      contentDigest: profile.applied.contentDigest,
    };
  }
  return {
    mode: 'neutral_fallback' as const,
    reason:
      profile.applied.reason === 'explicit_none'
        ? ('EXPLICIT_NONE' as const)
        : profile.applied.reason === 'legacy_request'
        ? ('LEGACY_REQUEST' as const)
        : ('NO_PROFILE' as const),
  };
}

function storedProfile(snapshot: StoredContextSnapshotV1) {
  if (snapshot.profile) return profileEnvelope(snapshot.profile);
  if (snapshot.brandProfileVersionId && snapshot.brandProfileVersion) {
    return {
      mode: 'resolved' as const,
      versionId: snapshot.brandProfileVersionId,
      versionNumber: snapshot.brandProfileVersion.versionNumber,
      contentDigest:
        snapshot.profileContentDigest ||
        snapshot.brandProfileVersion.contentDigest,
    };
  }
  return {
    mode: 'neutral_fallback' as const,
    reason:
      snapshot.profileFallbackReason === 'explicit_none'
        ? ('EXPLICIT_NONE' as const)
        : snapshot.profileFallbackReason === 'legacy_request'
        ? ('LEGACY_REQUEST' as const)
        : ('NO_PROFILE' as const),
  };
}

function lexicalScore(query: string, fact: FactCandidateV1) {
  if (fact.lexicalScore !== undefined) return fact.lexicalScore;
  const terms = new Set(
    query
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 2)
  );
  return fact.statement
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => terms.has(term)).length;
}

function statusFor(
  hasSelected: boolean,
  hasRejected: boolean,
  freshnessMode: ContentContextBuildInputV1['freshnessMode'],
  sawStale: boolean,
  sawConflict: boolean
): {
  status: ContentContextEnvelopeV1['status'];
  policy: ContentContextEnvelopeV1['generationPolicy'];
} {
  if (freshnessMode === 'REQUIRE_CURRENT' && !hasSelected) {
    return {
      status: sawConflict
        ? 'BLOCKED_CONFLICT'
        : sawStale
        ? 'BLOCKED_STALE'
        : 'UNAVAILABLE',
      policy: 'EVIDENCE_REQUIRED',
    };
  }
  if (!hasSelected) return { status: 'UNAVAILABLE', policy: 'ALLOW_USER_ONLY' };
  return {
    status: hasRejected ? 'PARTIAL' : 'READY',
    policy: 'ALLOW_GROUNDED',
  };
}

@Injectable()
export class ContentContextBuilderV1 {
  constructor(
    @Inject(ContentContextRepository)
    private readonly repository: ContentContextRepositoryPortV1,
    @Inject(BrandProfileContextService)
    private readonly brandProfiles: BrandProfileContextPortV1,
    @Optional()
    @Inject('CONTENT_CONTEXT_CLOCK')
    private readonly injectedClock?: () => Date
  ) {}

  private clock() {
    return this.injectedClock ? this.injectedClock() : new Date();
  }

  async build(
    organizationId: string,
    request: ContentContextBuildInputV1
  ): Promise<ContentContextEnvelopeResultV1> {
    const asOf = new Date(request.asOf);
    if (!organizationId || Number.isNaN(asOf.getTime())) {
      throw new ContentContextError(
        'CONTENT_CONTEXT_INPUT_INVALID',
        400,
        'Context input is invalid'
      );
    }
    const profile = await this.brandProfiles.resolve(
      organizationId,
      request.brandProfileSelection,
      request.provider
    );
    const candidates = await this.repository.findCandidates(
      organizationId,
      request
    );
    const rejected = new Map<string, RejectionReason>();
    let sawStale = false;
    let sawConflict = false;

    const ranked = candidates.facts
      .filter((fact) => fact.organizationId === organizationId)
      .map((fact) => {
        const acceptedContradiction = fact.evidenceLinks.some(
          (link) =>
            link.reviewStatus === 'ACCEPTED' &&
            link.stance === 'CONTRADICTS' &&
            link.evidence.organizationId === organizationId &&
            !sourceRemoved(link.evidence)
        );
        if (fact.status === 'CONFLICTED' || acceptedContradiction) {
          rejected.set(fact.id, 'CONFLICTED');
          sawConflict = true;
          return null;
        }
        if (fact.status !== 'VERIFIED' || !fact.verifiedAt) {
          rejected.set(fact.id, 'UNVERIFIED');
          return null;
        }
        const supports = fact.evidenceLinks
          .filter(
            (link) =>
              link.reviewStatus === 'ACCEPTED' &&
              link.stance === 'SUPPORTS' &&
              link.evidence.organizationId === organizationId &&
              evidenceAccepted(link.evidence) &&
              sourceAllowed(link.evidence)
          )
          .map((link) => link.evidence);
        if (!supports.length) {
          // «Ваше слово» (`content-factory-next-tyrk`): a fact with no
          // evidence links at all, or only links still `PROPOSED`, has
          // nothing here to accept or refuse — it stands on the person's own
          // say-so from the moment they typed it
          // (`ContentFactService.createFact`). An `ACCEPTED` link whose
          // evidence turned out unusable is a different story and keeps
          // today's rejection reason below; this only covers the case where
          // nothing was ever accepted to begin with.
          const ownWord = fact.evidenceLinks.every(
            (link) => link.reviewStatus === 'PROPOSED'
          );
          if (ownWord) {
            // Own word still ages. A `CURRENT` fact carries its own
            // `freshUntil` from the moment it was typed
            // (`CreateContentFactDto` requires it for that temporal kind);
            // once that date passes, admitting the fact unchanged would let
            // a stale claim — "we have 12 employees right now" past its own
            // stated horizon — stand as current. A `TIMELESS`/`DATED` fact
            // carries no `freshUntil` at all and is unaffected.
            if (fact.freshUntil && fact.freshUntil.getTime() < asOf.getTime()) {
              rejected.set(fact.id, 'STALE');
              sawStale = true;
              return null;
            }
            return {
              fact,
              supports: [] as EvidenceCandidateV1[],
              trust: 0,
              lexical: lexicalScore(request.query, fact),
            };
          }
          rejected.set(
            fact.id,
            fact.evidenceLinks.some((link) => sourceRemoved(link.evidence))
              ? 'DELETED'
              : 'UNVERIFIED'
          );
          return null;
        }
        const freshSupports = supports
          .filter((item) => evidenceFresh(item, asOf))
          .sort((left, right) => left.id.localeCompare(right.id));
        if (
          !fact.freshUntil ||
          fact.freshUntil.getTime() < asOf.getTime() ||
          !freshSupports.length
        ) {
          rejected.set(fact.id, 'STALE');
          sawStale = true;
          return null;
        }
        return {
          fact,
          supports: freshSupports,
          trust: Math.max(...freshSupports.map(trustRank)),
          lexical: lexicalScore(request.query, fact),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort(
        (left, right) =>
          Number(Boolean(right.fact.explicit)) -
            Number(Boolean(left.fact.explicit)) ||
          right.trust - left.trust ||
          right.lexical - left.lexical ||
          // «Ваше слово» carries no `freshUntil` of its own supports — it
          // sorts after anything that does rather than crashing on a null.
          (right.fact.freshUntil ? right.fact.freshUntil.getTime() : 0) -
            (left.fact.freshUntil ? left.fact.freshUntil.getTime() : 0) ||
          left.fact.id.localeCompare(right.fact.id)
      );

    const selectedFacts: FactCandidateV1[] = [];
    const selectedEvidence: EvidenceCandidateV1[] = [];
    const evidenceIds = new Set<string>();
    const profileCharacters = cleanText(
      JSON.stringify(profile.effectiveVoice || {}),
      CONTENT_CONTEXT_MAX_RENDERED_CHARACTERS_V1
    ).length;
    let renderedCharacters = profileCharacters;

    for (const candidate of ranked) {
      if (selectedFacts.length >= CONTENT_CONTEXT_MAX_FACTS_V1) {
        rejected.set(candidate.fact.id, 'OVER_BUDGET');
        continue;
      }
      const newEvidence = candidate.supports.filter(
        (item) => !evidenceIds.has(item.id)
      );
      if (
        selectedEvidence.length + newEvidence.length >
        CONTENT_CONTEXT_MAX_EVIDENCE_V1
      ) {
        rejected.set(candidate.fact.id, 'OVER_BUDGET');
        continue;
      }
      const factText = cleanText(candidate.fact.statement, 4_000);
      const evidenceCharacters = newEvidence.reduce(
        (total, item) =>
          total + cleanText(item.excerpt, MAX_EXCERPT_CHARACTERS).length,
        0
      );
      if (
        renderedCharacters + factText.length + evidenceCharacters >
        CONTENT_CONTEXT_MAX_RENDERED_CHARACTERS_V1
      ) {
        rejected.set(candidate.fact.id, 'OVER_BUDGET');
        continue;
      }
      selectedFacts.push(candidate.fact);
      renderedCharacters += factText.length + evidenceCharacters;
      for (const item of newEvidence) {
        evidenceIds.add(item.id);
        selectedEvidence.push(item);
      }
    }

    for (const item of [...candidates.evidence].sort((left, right) =>
      left.id.localeCompare(right.id)
    )) {
      if (item.organizationId !== organizationId || evidenceIds.has(item.id)) {
        continue;
      }
      if (!sourceAllowed(item)) {
        rejected.set(item.id, 'DELETED');
        continue;
      }
      if (!evidenceAccepted(item)) {
        rejected.set(item.id, 'UNVERIFIED');
        continue;
      }
      if (!evidenceFresh(item, asOf)) {
        rejected.set(item.id, 'STALE');
        sawStale = true;
        continue;
      }
      const excerpt = cleanText(item.excerpt, MAX_EXCERPT_CHARACTERS);
      if (
        selectedEvidence.length >= CONTENT_CONTEXT_MAX_EVIDENCE_V1 ||
        renderedCharacters + excerpt.length >
          CONTENT_CONTEXT_MAX_RENDERED_CHARACTERS_V1
      ) {
        rejected.set(item.id, 'OVER_BUDGET');
        continue;
      }
      evidenceIds.add(item.id);
      selectedEvidence.push(item);
      renderedCharacters += excerpt.length;
    }

    const factCitations = new Map(
      selectedFacts.map((fact, index) => [fact.id, `F${index + 1}`])
    );
    const evidenceCitations = new Map(
      selectedEvidence.map((item, index) => [item.id, `E${index + 1}`])
    );
    const items: StoredContextItemV1[] = [];
    for (const fact of selectedFacts) {
      items.push({
        ordinal: items.length + 1,
        citationId: factCitations.get(fact.id)!,
        factId: fact.id,
        evidenceId: null,
        inclusionReason: fact.explicit ? 'EXPLICIT' : 'RANKED',
        statementHash: sha256(cleanText(fact.statement, 4_000)),
        excerptHash: null,
        factStatement: cleanText(fact.statement, 4_000),
        factTemporalKind: fact.temporalKind,
        factVerifiedAt: fact.verifiedAt,
        factFreshUntil: fact.freshUntil,
        factEvidenceCitationIds: fact.evidenceLinks
          .filter(
            (link) =>
              link.stance === 'SUPPORTS' &&
              link.reviewStatus === 'ACCEPTED' &&
              evidenceCitations.has(link.evidence.id)
          )
          .map((link) => evidenceCitations.get(link.evidence.id)!)
          .sort(),
        tombstone: null,
        fact,
      });
    }
    for (const item of selectedEvidence) {
      items.push({
        ordinal: items.length + 1,
        citationId: evidenceCitations.get(item.id)!,
        factId: null,
        evidenceId: item.id,
        inclusionReason: item.explicit ? 'EXPLICIT' : 'FACT_SUPPORT',
        statementHash: null,
        excerptHash:
          item.excerptHash ||
          sha256(cleanText(item.excerpt, MAX_EXCERPT_CHARACTERS)),
        factStatement: null,
        factTemporalKind: null,
        factVerifiedAt: null,
        factFreshUntil: null,
        factEvidenceCitationIds: null,
        tombstone: null,
        evidence: item,
      });
    }

    const status = statusFor(
      selectedFacts.length > 0 || selectedEvidence.length > 0,
      rejected.size > 0,
      request.freshnessMode,
      sawStale,
      sawConflict
    );
    const builtAt = this.clock();
    const sortedRejections = [...rejected.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([itemId, reason]) => ({ itemId, reason }));
    const snapshot = await this.repository.createSnapshot(
      organizationId,
      {
        contractVersion: 'content-context/v1',
        consumer: request.consumer,
        purpose: request.purpose,
        queryHash: sha256(request.query.trim().toLocaleLowerCase()),
        language: request.language,
        freshnessMode: request.freshnessMode,
        asOf,
        builtAt,
        expiresAt: new Date(builtAt.getTime() + CONTEXT_TTL_MS),
        status: status.status,
        generationPolicy: status.policy,
        brandProfileVersionId:
          profile.applied.mode === 'profile' ? profile.applied.versionId : null,
        profileContentDigest:
          profile.applied.mode === 'profile'
            ? profile.applied.contentDigest
            : null,
        profileFallbackReason:
          profile.applied.mode === 'neutral_fallback'
            ? profile.applied.reason
            : null,
        selectionAlgorithmVersion: SELECTION_ALGORITHM_VERSION,
        trustPolicyVersion: 1,
        freshnessPolicyVersion: 1,
        maxFacts: CONTENT_CONTEXT_MAX_FACTS_V1,
        maxEvidence: CONTENT_CONTEXT_MAX_EVIDENCE_V1,
        maxRenderedCharacters: CONTENT_CONTEXT_MAX_RENDERED_CHARACTERS_V1,
        selectedFactCount: selectedFacts.length,
        selectedEvidenceCount: selectedEvidence.length,
        rejectedCount: sortedRejections.length,
        rejectionReasons: sortedRejections,
        invalidatedAt: null,
        profile,
      },
      items
    );
    return this.render(snapshot);
  }

  async get(
    organizationId: string,
    id: string
  ): Promise<ContentContextEnvelopeResultV1> {
    const snapshot = await this.repository.getSnapshot(organizationId, id);
    if (!snapshot) {
      throw new ContentContextError(
        'CONTENT_CONTEXT_NOT_FOUND',
        404,
        'Content context was not found'
      );
    }
    return this.render(snapshot);
  }

  async withModelAdmission<T>(
    context: ContentContextEnvelopeResultV1,
    operation: () => Promise<T>
  ): Promise<T> {
    if (context.generationPolicy === 'EVIDENCE_REQUIRED') {
      throw new ContentContextError(
        CONTENT_EVIDENCE_REQUIRED,
        409,
        'Current evidence is required before generation'
      );
    }
    return operation();
  }

  private render(
    snapshot: StoredContextSnapshotV1
  ): ContentContextEnvelopeResultV1 {
    const evidenceItems = snapshot.items
      .filter((item) => item.evidenceId && item.evidence)
      .sort((left, right) => left.ordinal - right.ordinal);
    const facts = snapshot.items
      .filter((item) => item.factId && item.factStatement)
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((item) => ({
        citationId: item.citationId,
        factId: item.factId!,
        statement: item.factStatement || '',
        temporalKind: item.factTemporalKind as 'CURRENT' | 'DATED' | 'TIMELESS',
        verifiedAt: iso(item.factVerifiedAt)!,
        freshUntil: iso(item.factFreshUntil)!,
        evidenceCitationIds: [...(item.factEvidenceCitationIds || [])],
      }));
    const evidence = evidenceItems.map((item) => {
      const value = item.evidence!;
      const removed = item.tombstone || sourceRemoved(value);
      const internal = value.exposure === 'INTERNAL_ONLY';
      return {
        citationId: item.citationId,
        evidenceId: item.evidenceId!,
        sourceSnapshotId: value.sourceSnapshotId,
        title: removed
          ? 'SOURCE_REMOVED'
          : cleanText(value.snapshot.normalizedTitle || 'Untitled source', 500),
        excerpt: removed
          ? 'SOURCE_REMOVED'
          : cleanText(value.excerpt, MAX_EXCERPT_CHARACTERS),
        url:
          removed || internal
            ? null
            : safeUrl(value.snapshot.finalCanonicalUrl),
        exposure: (internal ? 'INTERNAL_ONLY' : 'PUBLIC') as
          | 'PUBLIC'
          | 'INTERNAL_ONLY',
        publishedAt: removed ? null : iso(value.snapshot.publishedAt),
        retrievedAt: iso(value.observedAt)!,
      };
    });
    const rejected = (snapshot.rejectionReasons || []).map((item) => ({
      itemId: item.itemId,
      reason: item.reason as RejectionReason,
    }));
    const selectionHash = sha256(
      JSON.stringify({
        facts: facts.map((fact) => fact.factId),
        evidence: evidence.map((item) => item.evidenceId),
        profile: storedProfile(snapshot),
        queryHash: snapshot.queryHash,
        asOf: iso(snapshot.asOf),
      })
    );
    const renderedCharacterCount = Math.min(
      snapshot.maxRenderedCharacters,
      facts.reduce((total, fact) => total + fact.statement.length, 0) +
        evidence.reduce((total, item) => total + item.excerpt.length, 0)
    );
    return {
      contractVersion: 'content-context/v1',
      contentContextSnapshotId: snapshot.id,
      status: snapshot.status,
      generationPolicy: snapshot.generationPolicy,
      errorCode:
        snapshot.generationPolicy === 'EVIDENCE_REQUIRED'
          ? CONTENT_EVIDENCE_REQUIRED
          : null,
      builtAt: iso(snapshot.builtAt)!,
      expiresAt: iso(snapshot.expiresAt)!,
      profile: storedProfile(snapshot),
      facts,
      evidence,
      rejected,
      renderedCharacterCount,
      selectionHash,
    };
  }
}
