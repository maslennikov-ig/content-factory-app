import type { PrismaClient, Prisma } from '@prisma/client';
import {
  PUBLICATION_UNCERTAIN_V106,
  PUBLICATION_PREPARATION_FAILED_V106,
  PublicationStoreV106,
  type PublicationKeyV106,
} from './publication-store.v106';
import {
  publicProviderDiagnosticTextV110,
  publicPendingProviderDiagnosticTextV110,
  publicPendingProviderReasonFromTextV110,
  type PublicProviderDiagnosticV110,
} from '../../../integrations/social/provider-error-diagnostic';
import type { PostResponse } from '../../../integrations/social/social.integrations.interface';
import { YOUTUBE_THUMBNAIL_WARNING } from '../../../integrations/publication-warnings';

/** Newly exposed API/agent fields must never reveal historical raw SDK errors. */
export function publicPublicationErrorV110(
  value: unknown,
  identifier: string
): string | null {
  if (
    value === PUBLICATION_UNCERTAIN_V106 ||
    value === PUBLICATION_PREPARATION_FAILED_V106 ||
    value === YOUTUBE_THUMBNAIL_WARNING
  )
    return value;
  const prefix = `${PUBLICATION_UNCERTAIN_V106}\n`;
  const reason = publicPendingProviderReasonFromTextV110(
    identifier,
    typeof value === 'string' && value.startsWith(prefix)
      ? value.slice(prefix.length)
      : undefined
  );
  return reason ? prefix + reason : null;
}

type DiagnosticJournal = {
  version?: number;
  attempts?: Array<{
    operationId: string;
    integrationId: string;
    status: string;
    diagnosticV110?: PublicProviderDiagnosticV110;
  }>;
};

/** Add a static reason to a pending claim; a concurrent confirmed receipt always wins. */
export async function markPublicationUncertainV110(
  client: Pick<PrismaClient, 'post'>,
  key: PublicationKeyV106,
  diagnostic?: PublicProviderDiagnosticV110
) {
  for (let retry = 0; retry < 5; retry++) {
    const post = await client.post.findFirst({ where: {
      id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
    } });
    const journal = post?.publicationJournal as DiagnosticJournal | null;
    if (!post || journal?.version !== 106 || !Array.isArray(journal.attempts))
      return;
    if (
      journal.attempts.some(
        (attempt) =>
          attempt.operationId === key.operationId &&
          attempt.integrationId === key.integrationId &&
          attempt.status === 'confirmed'
      )
    )
      return;
    const pending = journal.attempts.find(
      (attempt) => attempt.status === 'pending'
    );
    if (!pending) return;
    const proposed =
      pending.operationId === key.operationId &&
      pending.integrationId === key.integrationId
        ? diagnostic
        : undefined;
    const selected = publicProviderDiagnosticTextV110(proposed)
      ? proposed
      : publicProviderDiagnosticTextV110(pending.diagnosticV110)
      ? pending.diagnosticV110
      : undefined;
    // Reconstruct the two permitted fields rather than copying an unchecked object.
    const safe = selected
      ? { provider: selected.provider, code: selected.code }
      : undefined;
    const next = safe
      ? {
          ...journal,
          attempts: journal.attempts.map((attempt) =>
            attempt === pending ? { ...attempt, diagnosticV110: safe } : attempt
          ),
        }
      : journal;
    const reason = publicPendingProviderDiagnosticTextV110(safe);
    const result = await client.post.updateMany({
      where: {
        id: key.postId,
        organizationId: key.organizationId,
        integrationId: key.integrationId,
        publicationJournal: { equals: post.publicationJournal! },
        state: { in: ['QUEUE', 'PUBLISHED', 'ERROR'] },
      },
      data: {
        state: 'ERROR',
        error: reason
          ? `${PUBLICATION_UNCERTAIN_V106}\n${reason}`
          : PUBLICATION_UNCERTAIN_V106,
        publicationJournal: next as Prisma.InputJsonValue,
      },
    });
    if (result.count === 1) return;
  }
  throw new Error('Unable to record publication uncertainty');
}

/** Confirmation keeps V106 receipt semantics and removes only our exact stale prefix. */
export async function confirmPublicationV110(
  client: Pick<PrismaClient, 'post'>,
  key: PublicationKeyV106,
  receipts: PostResponse[]
) {
  const confirmed = await new PublicationStoreV106(client).confirm(
    key,
    receipts
  );
  for (let retry = 0; retry < 5; retry++) {
    const post = await client.post.findFirst({ where: {
      id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
    } });
    const journal = post?.publicationJournal as DiagnosticJournal | null;
    const own = journal?.attempts?.find(
      (attempt) =>
        attempt.operationId === key.operationId &&
        attempt.integrationId === key.integrationId
    );
    const reason = publicPendingProviderDiagnosticTextV110(own?.diagnosticV110);
    if (
      !post ||
      post.state !== 'PUBLISHED' ||
      own?.status !== 'confirmed' ||
      !reason
    )
      return confirmed;
    const prefix = `${PUBLICATION_UNCERTAIN_V106}\n${reason}`;
    if (post.error !== prefix && !post.error?.startsWith(prefix + '\n'))
      return confirmed;
    const result = await client.post.updateMany({
      where: {
        id: key.postId,
        organizationId: key.organizationId,
        integrationId: key.integrationId,
        state: 'PUBLISHED',
        error: post.error,
        publicationJournal: { equals: post.publicationJournal! },
      },
      data: {
        error: post.error.slice(prefix.length).replace(/^\n/, '') || null,
      },
    });
    if (result.count === 1) return confirmed;
  }
  throw new Error('Unable to clear confirmed publication diagnostic');
}
