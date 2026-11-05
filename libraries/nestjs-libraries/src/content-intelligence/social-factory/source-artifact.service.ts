import { HttpException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertResolvedSourceArtifactCurrentV1, SourceArtifactRepositoryV1 } from './source-artifact.repository';
import { ResolvedSourceArtifactSchemaV1, type ResolvedSourceArtifactV1, type SourceArtifactDraftEditInputV1, type SourceArtifactSelectionV1 } from './contracts/source-artifact.v1';

@Injectable()
export class SourceArtifactServiceV1 {
  constructor(private readonly repository: SourceArtifactRepositoryV1) {}
  resolve(organizationId: string, actorId: string, selection: SourceArtifactSelectionV1, transaction?: Prisma.TransactionClient) {
    return this.repository.resolve(organizationId, actorId, selection, transaction);
  }
  editDraft(organizationId: string, actorId: string, input: SourceArtifactDraftEditInputV1) { return this.repository.editDraft(organizationId, actorId, input); }
  async assertCurrent(organizationId: string, actorId: string, artifact: ResolvedSourceArtifactV1, transaction?: Prisma.TransactionClient): Promise<ResolvedSourceArtifactV1> {
    if (transaction) return assertResolvedSourceArtifactCurrentV1(transaction, organizationId, actorId, artifact);
    const parsed = ResolvedSourceArtifactSchemaV1.safeParse(artifact);
    if (!parsed.success) throw new HttpException({ code: 'SOURCE_ARTIFACT_INPUT_INVALID' }, 400);
    if (parsed.data.actorId !== actorId || parsed.data.organizationId !== organizationId) throw new HttpException({ code: 'SOURCE_ARTIFACT_ACCESS_DENIED' }, 403);
    const current = await this.resolve(organizationId, actorId, parsed.data.ref, transaction);
    if (current.contentDigest !== parsed.data.contentDigest || current.title !== parsed.data.title || current.text !== parsed.data.text || current.locale !== parsed.data.locale) {
      throw new HttpException({ code: 'SOURCE_ARTIFACT_STALE' }, 409);
    }
    return current;
  }
}
