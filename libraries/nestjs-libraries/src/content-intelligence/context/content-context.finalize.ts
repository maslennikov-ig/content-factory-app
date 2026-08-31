import { createHash } from 'node:crypto';
import { ContentContextError } from './content-context.errors';

type PrismaClientLike = Record<string, any>;

export type ContentContextDraftBindingV1 = {
  contentContextSnapshotId: string;
  brandProfileVersionId: string | null;
  profileContentDigest: string | null;
  usedCitationIds: string[];
  evidence: Array<{ evidenceId: string; citationId: string }>;
};

function removedEvidence(item: any) {
  const evidence = item.evidence;
  const source = evidence?.snapshot?.source;
  return Boolean(
    item.tombstone ||
      evidence?.tombstone ||
      evidence?.snapshot?.purgedAt ||
      source?.archivedAt ||
      source?.purgedAt ||
      (source &&
        (source.desiredState !== 'ACTIVE' ||
          source.rightsState !== 'CONFIRMED' ||
          !['ALLOWED', 'NOT_APPLICABLE'].includes(source.robotsState) ||
          source.currentSnapshotId !== evidence.sourceSnapshotId))
  );
}

function evidenceCurrentlyUsable(item: any, organizationId: string, now: Date) {
  const evidence = item.evidence;
  const source = evidence?.snapshot?.source;
  const freshUntil = source
    ? source.freshUntil
    : evidence?.freshUntil || evidence?.snapshot?.freshUntil;
  return Boolean(
    evidence &&
      evidence.organizationId === organizationId &&
      !removedEvidence(item) &&
      (source || evidence.freshnessStatus === 'FRESH') &&
      freshUntil &&
      new Date(freshUntil).getTime() >= now.getTime() &&
      evidence.assessment?.status === 'ACCEPTED' &&
      evidence.assessment?.trustTier !== 'BLOCKED' &&
      (source || evidence.snapshot?.kind === 'SEARCH_PROVIDER_RESULT')
  );
}

function invalidated(message: string): never {
  throw new ContentContextError('CONTENT_CONTEXT_INVALIDATED', 409, message);
}

export async function validateContentContextForDraft(
  client: PrismaClientLike,
  input: {
    organizationId: string;
    contentContextSnapshotId: string;
    requestedBrandProfileVersionId?: string;
    usedCitationIds?: string[];
    now?: Date;
  }
): Promise<ContentContextDraftBindingV1> {
  const snapshot = await client.contentContextSnapshot.findFirst({
    where: {
      organizationId: input.organizationId,
      id: input.contentContextSnapshotId,
    },
    include: {
      brandProfileVersion: { include: { profile: true } },
      items: {
        orderBy: { ordinal: 'asc' },
        include: {
          fact: {
            include: {
              evidenceLinks: {
                include: {
                  evidence: {
                    include: {
                      assessment: true,
                      snapshot: { include: { source: true } },
                    },
                  },
                },
              },
            },
          },
          evidence: {
            include: {
              assessment: true,
              snapshot: { include: { source: true } },
            },
          },
        },
      },
    },
  });
  if (!snapshot) {
    throw new ContentContextError(
      'CONTENT_CONTEXT_NOT_FOUND',
      404,
      'Content context was not found'
    );
  }

  const now = input.now || new Date();
  if (
    snapshot.invalidatedAt ||
    !['READY', 'PARTIAL', 'UNAVAILABLE'].includes(snapshot.status) ||
    snapshot.generationPolicy === 'EVIDENCE_REQUIRED' ||
    new Date(snapshot.expiresAt).getTime() < now.getTime()
  ) {
    invalidated('Content context is no longer available for a draft');
  }
  if (
    input.requestedBrandProfileVersionId !== undefined &&
    input.requestedBrandProfileVersionId !== snapshot.brandProfileVersionId
  ) {
    throw new ContentContextError(
      'CONTENT_CONTEXT_PROFILE_MISMATCH',
      409,
      'Brand profile does not match the resolved context'
    );
  }
  if (snapshot.brandProfileVersionId) {
    const profile = snapshot.brandProfileVersion;
    if (
      !profile ||
      profile.organizationId !== input.organizationId ||
      profile.lifecycle !== 'PUBLISHED' ||
      profile.profile?.deletedAt ||
      profile.contentDigest !== snapshot.profileContentDigest
    ) {
      invalidated('Resolved brand profile is no longer available');
    }
  }

  const requested = [...new Set(input.usedCitationIds || [])].sort();
  if (
    requested.some(
      (citationId) =>
        typeof citationId !== 'string' || !/^([FE])[1-8]$/.test(citationId)
    )
  ) {
    throw new ContentContextError(
      'CONTENT_CONTEXT_CITATIONS_INVALID',
      422,
      'Citation identifiers are invalid'
    );
  }
  const itemsByCitation = new Map(
    (snapshot.items || []).map((item: any) => [item.citationId, item])
  );
  if (requested.some((citationId) => !itemsByCitation.has(citationId))) {
    throw new ContentContextError(
      'CONTENT_CONTEXT_CITATIONS_INVALID',
      422,
      'Citation does not belong to the resolved context'
    );
  }
  if (snapshot.generationPolicy === 'ALLOW_GROUNDED' && !requested.length) {
    throw new ContentContextError(
      'CONTENT_CONTEXT_CITATIONS_INVALID',
      422,
      'Grounded drafts require at least one context citation'
    );
  }

  const evidence = new Map<
    string,
    { evidenceId: string; citationId: string }
  >();
  for (const citationId of requested) {
    const item: any = itemsByCitation.get(citationId);
    if (item.evidenceId) {
      if (!evidenceCurrentlyUsable(item, input.organizationId, now)) {
        invalidated('Selected evidence is no longer eligible');
      }
      evidence.set(item.evidenceId, {
        evidenceId: item.evidenceId,
        citationId,
      });
    }
    if (item.factId) {
      if (
        !item.fact ||
        item.fact.status !== 'VERIFIED' ||
        !item.factStatement ||
        !item.statementHash ||
        createHash('sha256').update(item.factStatement).digest('hex') !==
          item.statementHash ||
        !item.factFreshUntil ||
        new Date(item.factFreshUntil).getTime() < now.getTime()
      ) {
        invalidated('Selected fact is no longer verified');
      }
      const frozenEvidenceCitationIds = Array.isArray(
        item.factEvidenceCitationIds
      )
        ? [...new Set(item.factEvidenceCitationIds)].sort()
        : [];
      if (!frozenEvidenceCitationIds.length) {
        invalidated('Selected fact no longer has accepted fresh support');
      }
      for (const evidenceCitationId of frozenEvidenceCitationIds) {
        const evidenceItem: any = itemsByCitation.get(evidenceCitationId);
        if (
          !evidenceItem?.evidenceId ||
          !evidenceCurrentlyUsable(evidenceItem, input.organizationId, now)
        ) {
          invalidated('Selected fact no longer has accepted fresh support');
        }
        evidence.set(evidenceItem.evidenceId, {
          evidenceId: evidenceItem.evidenceId,
          citationId,
        });
      }
    }
  }

  return {
    contentContextSnapshotId: snapshot.id,
    brandProfileVersionId: snapshot.brandProfileVersionId || null,
    profileContentDigest: snapshot.profileContentDigest || null,
    usedCitationIds: requested,
    evidence: [...evidence.values()].sort((left, right) =>
      left.evidenceId.localeCompare(right.evidenceId)
    ),
  };
}

export async function writeContentContextDraftProvenance(
  client: PrismaClientLike,
  input: {
    organizationId: string;
    postId: string;
    content: string;
    binding: ContentContextDraftBindingV1;
  }
) {
  const outputHash = createHash('sha256').update(input.content).digest('hex');
  const unique = {
    organizationId_postId_contentContextSnapshotId: {
      organizationId: input.organizationId,
      postId: input.postId,
      contentContextSnapshotId: input.binding.contentContextSnapshotId,
    },
  };
  await client.contentOutputContext.upsert({
    where: unique,
    create: {
      organizationId: input.organizationId,
      postId: input.postId,
      contentContextSnapshotId: input.binding.contentContextSnapshotId,
      brandProfileVersionId: input.binding.brandProfileVersionId,
      profileContentDigest: input.binding.profileContentDigest,
      usedCitationIds: input.binding.usedCitationIds,
      finalizedAt: new Date(),
      outputHash,
      validationStatus: 'VALID',
    },
    update: {
      brandProfileVersionId: input.binding.brandProfileVersionId,
      profileContentDigest: input.binding.profileContentDigest,
      usedCitationIds: input.binding.usedCitationIds,
      finalizedAt: new Date(),
      outputHash,
      validationStatus: 'VALID',
    },
  });
  await client.draftEvidence.deleteMany({
    where: { organizationId: input.organizationId, postId: input.postId },
  });
  if (input.binding.evidence.length) {
    await client.draftEvidence.createMany({
      data: input.binding.evidence.map((item) => ({
        organizationId: input.organizationId,
        postId: input.postId,
        evidenceId: item.evidenceId,
        contentContextSnapshotId: input.binding.contentContextSnapshotId,
        role: 'CITED',
        contextContractVersion: 'content-context/v1',
        citationId: item.citationId,
        tombstone: null,
      })),
    });
  }
}
