import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentFactRepository } from './content-fact.repository';
import { ContentContextError } from './content-context.errors';
import { searchWords } from '../search-terms';
import {
  humanize,
  topicKey,
} from '@contentfactory/nestjs-libraries/content-intelligence/brief/content-brief.radar';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalized(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * The three ways of standing behind a claim, named the way the witness
 * screen names them: «ваше слово», «ваш материал», «найдено поиском».
 *
 * `content-factory-next-lh5s` has not shipped the producer for
 * `SEARCH_PROVIDER_RESULT` snapshots yet, so `SEARCH_RESULT` is real code
 * with no real data behind it today — the map document is explicit that the
 * screen must be able to show it rather than pretend it does not exist, and
 * that nothing here may fabricate a row to demonstrate it.
 */
type GroundingMethod = 'OWN_WORD' | 'OWN_MATERIAL' | 'SEARCH_RESULT';

type Grounding = {
  method: GroundingMethod;
  evidenceId?: string | null;
  excerpt?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  observedAt?: string | Date | null;
};

/**
 * Which evidence link, if any, is worth showing on the row.
 *
 * An accepted, supporting link is the one that actually grounds the fact; a
 * fact with only a proposed or contradicting link still gets a row — nothing
 * on the witness screen hides evidence, it just prefers the honest one.
 */
function primaryEvidenceLink(evidenceLinks: any[]) {
  if (!evidenceLinks.length) return null;
  return (
    evidenceLinks.find(
      (link) => link.reviewStatus === 'ACCEPTED' && link.stance === 'SUPPORTS'
    ) || evidenceLinks[0]
  );
}

function groundingFor(evidenceLinks: any[]): Grounding {
  const link = primaryEvidenceLink(evidenceLinks || []);
  if (!link) return { method: 'OWN_WORD', evidenceId: null };
  const evidence = link.evidence;
  const snapshot = evidence?.snapshot;
  const source = snapshot?.source;
  const sourceGone = Boolean(source?.archivedAt || source?.purgedAt);
  if (source && !sourceGone) {
    return {
      method: 'OWN_MATERIAL',
      evidenceId: link.evidenceId,
      excerpt: evidence.excerpt ?? null,
      sourceLabel: source.displayName ?? null,
      sourceUrl: source.canonicalUrl ?? null,
      observedAt: snapshot?.observedAt ?? null,
    };
  }
  if (snapshot?.kind === 'SEARCH_PROVIDER_RESULT') {
    return {
      method: 'SEARCH_RESULT',
      evidenceId: link.evidenceId,
      excerpt: evidence.excerpt ?? null,
      sourceUrl: snapshot.finalCanonicalUrl || snapshot.requestedCanonicalUrl || null,
      observedAt: snapshot?.observedAt ?? null,
    };
  }
  // Evidence exists but resolves to nothing a reader could still check — a
  // source archived after the fact was made, or a snapshot kind this screen
  // does not recognise. Claiming a grounding that no longer points anywhere
  // is worse than the plain word.
  return { method: 'OWN_WORD', evidenceId: null };
}

/**
 * True only for a still-pending «найдено поиском» row: grounded in a search
 * result whose link or whose evidence assessment has not been accepted yet.
 * The witness screen (`content-factory-next-tyrk`, §5) offers «Подтвердить»
 * exactly here — everywhere else the two existing actions are the whole
 * story (map document §8.2).
 */
function needsLookFor(evidenceLinks: any[]): boolean {
  const link = primaryEvidenceLink(evidenceLinks || []);
  if (!link) return false;
  const grounding = groundingFor(evidenceLinks);
  if (grounding.method !== 'SEARCH_RESULT') return false;
  return (
    link.reviewStatus !== 'ACCEPTED' ||
    link.evidence?.assessment?.status !== 'ACCEPTED'
  );
}

@Injectable()
export class ContentFactService {
  constructor(
    @Inject(ContentFactRepository)
    private readonly repository: ContentFactRepository
  ) {}

  /**
   * `q` — поиск по словам (`content-factory-next-odb8.4`). Без него вызов
   * тот же, что был: бриф зовёт `listFacts(organizationId)` за всем каталогом
   * и ничего об этом параметре знать не должен.
   */
  async listFacts(organizationId: string, q?: string) {
    const facts = await this.repository.listFacts(organizationId, searchWords(q));
    return facts.map((fact: any) => ({
      id: fact.id,
      claimKey: fact.claimKey,
      // The witness screen (`content-factory-next-odb8.1`) filters by topic,
      // and a claim key is already `topic|attribute` — reusing the radar's
      // own split keeps one parser for the shape instead of a second one
      // guessing at it from the frontend.
      topic: topicKey(fact.claimKey || ''),
      topicLabel: humanize(topicKey(fact.claimKey || '')),
      statement: fact.statement,
      language: fact.language,
      temporalKind: fact.temporalKind,
      freshUntil: fact.freshUntil,
      status: fact.status,
      supersedesFactId: fact.supersedesFactId ?? null,
      createdAt: fact.createdAt,
      updatedAt: fact.updatedAt,
      createdByName:
        [fact.createdByUser?.name, fact.createdByUser?.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || null,
      grounding: groundingFor(fact.evidenceLinks || []),
      needsLook: needsLookFor(fact.evidenceLinks || []),
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
    // «Ваше слово» (`content-factory-next-tyrk`, owner decision 02.09.2026):
    // material a person adds themselves is confirmed the moment they add it.
    // A fact typed here has no evidence yet by construction, so `VERIFIED`
    // is not a claim that anything was checked — it is the honest status for
    // a claim that stands on the person's own say-so.
    const now = new Date();
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
      status: 'VERIFIED',
      verifiedAt: now,
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
      input,
      new Date()
    );
  }

  /**
   * «Найдено поиском» → confirmed: the one gesture that accepts a search
   * result's assessment, accepts the link it is cited through, and
   * re-verifies the fact — all three in one transaction
   * (`ContentFactRepository.confirmEvidence`).
   */
  confirmEvidence(
    organizationId: string,
    actorUserId: string,
    factId: string,
    evidenceId: string
  ) {
    return this.repository.confirmEvidence(
      organizationId,
      actorUserId,
      factId,
      evidenceId,
      new Date()
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

  /** СНЯТЬ: the fact stops being offered to a brief. Its history stays. */
  retractFact(organizationId: string, actorUserId: string, factId: string) {
    return this.repository.retractFact(
      organizationId,
      actorUserId,
      factId,
      new Date()
    );
  }

  /** «Вернуть»: the retracted row's only action. */
  restoreFact(organizationId: string, actorUserId: string, factId: string) {
    return this.repository.restoreFact(
      organizationId,
      actorUserId,
      factId,
      new Date()
    );
  }

  /**
   * КОПИРОВАТЬ И ПОПРАВИТЬ: a new fact, predeclared from the one it replaces,
   * grounded on its own rather than on the fragment that stopped matching the
   * moment the statement changed.
   */
  copyFact(
    organizationId: string,
    actorUserId: string,
    factId: string,
    input: {
      statement: string;
      valueText?: string;
      evidenceId?: string;
      stance?: 'SUPPORTS' | 'CONTRADICTS';
    }
  ) {
    const statement = normalized(input.statement);
    // The mockup (`Facts.dc.html`, screen 23) shows one field to edit. When
    // the value is not given separately it is the statement itself — a
    // simplification of the full create form, not a second meaning for
    // `valueText`.
    const valueText = normalized(input.valueText || input.statement);
    if (!statement || !valueText) {
      throw new ContentContextError(
        'CONTENT_CONTEXT_INPUT_INVALID',
        422,
        'A copied fact needs a statement'
      );
    }
    const valueHash = sha256(valueText.toLocaleLowerCase());
    // Tied to the fact being replaced rather than to the moment of the call:
    // a double-submitted copy must land on the same new row, the same
    // guarantee `createFact`'s own `dedupeKey` gives an ordinary fact.
    const dedupeKey = sha256(['copy', factId, valueHash].join('|'));
    return this.repository.copyFact(
      organizationId,
      actorUserId,
      factId,
      {
        statement,
        valueText,
        valueHash,
        dedupeKey,
        evidenceId: input.evidenceId,
        stance: input.stance,
      },
      new Date()
    );
  }
}
