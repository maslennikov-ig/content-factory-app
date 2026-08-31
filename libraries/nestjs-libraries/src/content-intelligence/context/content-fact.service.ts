import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentFactRepository } from './content-fact.repository';
import { ContentContextError } from './content-context.errors';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

@Injectable()
export class ContentFactService {
  constructor(
    @Inject(ContentFactRepository)
    private readonly repository: ContentFactRepository
  ) {}

  async listFacts(organizationId: string) {
    const facts = await this.repository.listFacts(organizationId);
    return facts.map((fact: any) => ({
      id: fact.id,
      claimKey: fact.claimKey,
      statement: fact.statement,
      language: fact.language,
      temporalKind: fact.temporalKind,
      freshUntil: fact.freshUntil,
      status: fact.status,
      evidence: (fact.evidenceLinks || []).map((link: any) => {
        const removed = Boolean(
          link.evidence.tombstone ||
            link.evidence.snapshot?.purgedAt ||
            link.evidence.snapshot?.source?.archivedAt ||
            link.evidence.snapshot?.source?.purgedAt
        );
        return {
          evidenceId: link.evidenceId,
          stance: link.stance,
          reviewStatus: link.reviewStatus,
          sourceSnapshotId: link.evidence.sourceSnapshotId,
          title: removed
            ? 'SOURCE_REMOVED'
            : link.evidence.snapshot?.normalizedTitle || 'Untitled source',
          sourceState: removed ? 'SOURCE_REMOVED' : 'AVAILABLE',
          freshUntil: link.evidence.freshUntil,
          exposure: link.evidence.exposure,
        };
      }),
    }));
  }

  createFact(
    organizationId: string,
    actorUserId: string,
    input: {
      claimKey: string;
      statement: string;
      language: 'ru' | 'en';
      valueText: string;
      temporalKind: 'CURRENT' | 'DATED' | 'TIMELESS';
      effectiveFrom?: string;
      effectiveTo?: string;
      freshUntil?: string;
    }
  ) {
    const claimKey = normalized(input.claimKey).toLocaleLowerCase();
    const valueText = normalized(input.valueText);
    const valueHash = sha256(valueText.toLocaleLowerCase());
    const effectiveFrom = input.effectiveFrom
      ? new Date(input.effectiveFrom)
      : null;
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    const freshUntil = input.freshUntil ? new Date(input.freshUntil) : null;
    if (
      !claimKey ||
      !valueText ||
      (input.temporalKind === 'CURRENT' && !freshUntil) ||
      (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo)
    ) {
      throw new ContentContextError(
        'CONTENT_CONTEXT_INPUT_INVALID',
        422,
        'Fact lifecycle dates are invalid'
      );
    }
    const dedupeKey = sha256(
      [
        claimKey,
        valueHash,
        effectiveFrom?.toISOString() || '',
        effectiveTo?.toISOString() || '',
      ].join('|')
    );
    return this.repository.createFact(organizationId, actorUserId, {
      claimKey,
      statement: normalized(input.statement),
      language: input.language,
      valueText,
      valueHash,
      dedupeKey,
      temporalKind: input.temporalKind,
      effectiveFrom,
      effectiveTo,
      freshUntil,
      status: 'UNVERIFIED',
      verifiedAt: null,
      lastEvaluatedAt: null,
    });
  }

  linkEvidence(
    organizationId: string,
    actorUserId: string,
    factId: string,
    input: { evidenceId: string; stance: 'SUPPORTS' | 'CONTRADICTS' }
  ) {
    return this.repository.linkEvidence(
      organizationId,
      actorUserId,
      factId,
      input
    );
  }

  reviewEvidenceLink(
    organizationId: string,
    actorUserId: string,
    factId: string,
    evidenceId: string,
    reviewStatus: 'ACCEPTED' | 'REJECTED'
  ) {
    return this.repository.reviewEvidenceLink(
      organizationId,
      actorUserId,
      factId,
      evidenceId,
      reviewStatus,
      new Date()
    );
  }

  assessEvidence(
    organizationId: string,
    actorUserId: string,
    evidenceId: string,
    input: {
      trustTier: string;
      status: string;
      note?: string;
    }
  ) {
    return this.repository.assessEvidence(
      organizationId,
      actorUserId,
      evidenceId,
      input,
      new Date()
    );
  }
}
