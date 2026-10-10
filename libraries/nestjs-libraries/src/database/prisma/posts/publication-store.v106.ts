import { Prisma, PrismaClient, type Post } from '@prisma/client';
import type { PostResponse } from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';

export const PUBLICATION_UNCERTAIN_V106 =
  'Результат публикации не подтверждён. Проверьте публикацию в канале; автоматическая повторная отправка заблокирована.';
export const PUBLICATION_PREPARATION_FAILED_V106 =
  'Не удалось подготовить публикацию. Отправка не начиналась; исправьте настройки или повторите попытку.';
const STREAK_FAILED =
  'Публикация подтверждена; не удалось обновить серию публикаций.';

type Attempt = {
  operationId: string;
  integrationId: string;
  status: 'pending' | 'confirmed';
  receipts?: PostResponse[];
  auxiliaryFailure?: 'streak';
};
type Journal = { version: 106; attempts: Attempt[] };
export type PublicationKeyV106 = {
  organizationId: string;
  postId: string;
  integrationId: string;
  operationId: string;
};
export type PublicationResultV106 =
  | { status: 'confirmed'; receipts: PostResponse[] }
  | { status: 'claimed' }
  | { status: 'uncertain' | 'refused' };

function journal(value: Prisma.JsonValue | null, postId: string): Journal {
  if (value === null) return { version: 106, attempts: [] };
  const parsed = value as unknown as Journal;
  if (parsed?.version !== 106 || !Array.isArray(parsed.attempts) ||
      parsed.attempts.some(a => !a || typeof a.operationId !== 'string' ||
        typeof a.integrationId !== 'string' || !['pending', 'confirmed'].includes(a.status) ||
        (a.status === 'confirmed' && !validReceipts(a.receipts, postId))) ||
      new Set(parsed.attempts.map(a => a.operationId)).size !== parsed.attempts.length) {
    throw new Error('Invalid publication journal; sending is blocked');
  }
  return parsed;
}

function validReceipts(receipts: PostResponse[], postId: string): boolean {
  return Array.isArray(receipts) && receipts.length > 0 && receipts.every(r =>
    r?.id === postId && typeof r.postId === 'string' && r.postId.length > 0 &&
    r.postId !== 'missing' && typeof r.releaseURL === 'string' &&
    typeof r.status === 'string');
}

function receiptFields(receipts: PostResponse[]): PostResponse[] {
  return receipts.map(({ id, postId, releaseURL, status }) => ({ id, postId, releaseURL, status }));
}

/** One Post row is the transaction boundary: claim, receipt and projection CAS. */
export class PublicationStoreV106 {
  constructor(private client: Pick<PrismaClient, 'post'>) {}

  private async read(key: PublicationKeyV106) {
    if (key.operationId !== 'initial' && !key.operationId.startsWith('repeat:')) {
      throw new Error('Invalid publication operation');
    }
    return this.client.post.findFirst({ where: {
      id: key.postId, organizationId: key.organizationId,
      integrationId: key.integrationId,
    } });
  }

  private assess(post: Post | null, key: PublicationKeyV106): {
    current: Journal; outcome: Exclude<PublicationResultV106, { status: 'claimed' }> | null;
  } {
    if (!post || post.deletedAt) return { current: { version: 106, attempts: [] }, outcome: { status: 'refused' } };
    const current = journal(post.publicationJournal, key.postId);
    const result = (outcome: Exclude<PublicationResultV106, { status: 'claimed' }> | null) => ({ current, outcome });
    const own = current.attempts.find(a => a.operationId === key.operationId);
    if (own?.integrationId !== undefined && own.integrationId !== key.integrationId) {
      return result({ status: 'uncertain' });
    }
    if (own?.status === 'confirmed') return result({ status: 'confirmed', receipts: own.receipts });
    if (current.attempts.some(a => a.status === 'pending')) return result({ status: 'uncertain' });
    const repeat = key.operationId.startsWith('repeat:');
    if (post.state !== 'QUEUE' && !(repeat && post.state === 'PUBLISHED')) return result({ status: 'refused' });
    // Historical receipts prevent a new initial write; they cannot identify
    // a particular repeat generation and are never used as its receipt.
    if (!repeat && post.releaseId) return result({ status: 'refused' });
    return result(null);
  }

  async inspect(key: PublicationKeyV106): Promise<Exclude<PublicationResultV106, { status: 'claimed' }> | { status: 'ready' }> {
    const { outcome } = this.assess(await this.read(key), key);
    if (outcome?.status === 'uncertain') await this.markUncertain(key);
    return outcome ?? { status: 'ready' };
  }

  async claim(key: PublicationKeyV106): Promise<PublicationResultV106> {
    for (let retry = 0; retry < 5; retry++) {
      const post = await this.read(key);
      if (!post) return { status: 'refused' };
      const { current, outcome } = this.assess(post, key);
      if (outcome) {
        if (outcome.status === 'uncertain') await this.markUncertain(key);
        return outcome;
      }
      const next: Journal = { version: 106, attempts: [...current.attempts, {
        operationId: key.operationId, integrationId: key.integrationId, status: 'pending',
      }] };
      const result = await this.client.post.updateMany({ where: {
        id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
        deletedAt: null, state: post.state, releaseId: post.releaseId,
        publicationJournal: { equals: post.publicationJournal ?? Prisma.DbNull },
      }, data: {
        publicationJournal: next as unknown as Prisma.InputJsonValue,
        error: PUBLICATION_UNCERTAIN_V106,
      } });
      if (result.count === 1) return { status: 'claimed' };
    }
    throw new Error('Publication claim contention; sending is blocked');
  }

  async confirm(key: PublicationKeyV106, receipts: PostResponse[]) {
    if (!validReceipts(receipts, key.postId)) throw new Error('Invalid provider receipt');
    // Persist the receipt contract, never extra provider payload fields.
    receipts = receiptFields(receipts);
    for (let retry = 0; retry < 5; retry++) {
      const post = await this.read(key);
      if (!post) throw new Error('Publication post not found');
      const current = journal(post.publicationJournal, key.postId);
      const own = current.attempts.find(a => a.operationId === key.operationId &&
        a.integrationId === key.integrationId);
      if (!own) throw new Error('Publication has no durable claim');
      if (own.status === 'confirmed') {
        // JSONB may reorder object keys on read; array order and field values
        // identify this receipt, serialization property order does not.
        if (JSON.stringify(receiptFields(own.receipts)) !== JSON.stringify(receipts)) {
          throw new Error('Conflicting publication receipt');
        }
        return own.receipts;
      }
      const next: Journal = { version: 106, attempts: current.attempts.map(a =>
        a === own ? { ...a, status: 'confirmed', receipts } : a) };
      const result = await this.client.post.updateMany({ where: {
        id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
        publicationJournal: { equals: post.publicationJournal },
      }, data: {
        publicationJournal: next as unknown as Prisma.InputJsonValue,
        state: 'PUBLISHED', releaseId: receipts[0].postId, releaseURL: receipts[0].releaseURL,
        ...(post.error === PUBLICATION_UNCERTAIN_V106 ? { error: null } : {}),
      } });
      if (result.count === 1) return receipts;
    }
    throw new Error('Publication receipt contention; sending is blocked');
  }

  async markUncertain(key: PublicationKeyV106) {
    const post = await this.read(key);
    if (!post) return;
    const current = journal(post.publicationJournal, key.postId);
    if (!current.attempts.some(a => a.status === 'pending')) return;
    await this.client.post.updateMany({ where: {
      id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
      publicationJournal: { equals: post.publicationJournal },
      state: { in: ['QUEUE', 'PUBLISHED', 'ERROR'] },
    }, data: { state: 'ERROR', error: PUBLICATION_UNCERTAIN_V106 } });
  }

  /** Preparation happens before claim; never alter any existing attempt. */
  async markPreparationFailure(key: PublicationKeyV106) {
    for (let retry = 0; retry < 5; retry++) {
      const post = await this.read(key);
      if (!post) return;
      if (this.assess(post, key).outcome) return;
      const result = await this.client.post.updateMany({ where: {
        id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
        publicationJournal: { equals: post.publicationJournal ?? Prisma.DbNull },
        state: post.state, releaseId: post.releaseId, deletedAt: null,
      }, data: {
        ...(post.state === 'QUEUE' ? { state: 'ERROR' } : {}),
        error: PUBLICATION_PREPARATION_FAILED_V106,
      } });
      if (result.count === 1) return;
    }
    throw new Error('Unable to record known preparation failure; sending is blocked');
  }

  async recordStreakFailure(key: PublicationKeyV106) {
    for (let retry = 0; retry < 5; retry++) {
      const post = await this.read(key);
      if (!post) return;
      const current = journal(post.publicationJournal, key.postId);
      const own = current.attempts.find(a => a.operationId === key.operationId && a.status === 'confirmed');
      if (!own) return;
      const next: Journal = { version: 106, attempts: current.attempts.map(a =>
        a === own ? { ...a, auxiliaryFailure: 'streak' } : a) };
      const result = await this.client.post.updateMany({ where: {
        id: key.postId, organizationId: key.organizationId, integrationId: key.integrationId,
        publicationJournal: { equals: post.publicationJournal },
      }, data: { publicationJournal: next as unknown as Prisma.InputJsonValue,
        ...(post.state === 'PUBLISHED' && !post.error ? { error: STREAK_FAILED } : {}),
      } });
      if (result.count === 1) return;
    }
    throw new Error('Unable to record auxiliary publication failure');
  }
}
