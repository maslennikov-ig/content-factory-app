import { createHash } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { ContentFactRepository } from './content-fact.repository';
import { ContentContextError } from './content-context.errors';
import { factMomentOver } from './fact-valid-until';
import { searchWords } from '../search-terms';
import { TextSearchService } from '../search/text-search.service';
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

type FactInput = {
  claimKey: string;
  statement: string;
  language: 'ru' | 'en';
  valueText: string;
  temporalKind: 'CURRENT' | 'DATED' | 'TIMELESS';
  effectiveFrom?: string;
  effectiveTo?: string;
  freshUntil?: string;
};

@Injectable()
export class ContentFactService {
  constructor(
    @Inject(ContentFactRepository)
    private readonly repository: ContentFactRepository,
    /**
     * Внутренний поиск области (`content-factory-next-m2eg.19`).
     *
     * Необязательный и последний: наборы собирают сервис руками. Без него
     * витрина ищет по словам через базу — ровно как с 05.09.2026.
     *
     * `@Inject` обязателен рядом с `@Optional()`: тип — объединение с `null`,
     * и `emitDecoratorMetadata` пишет для него `Object`. Без явного токена
     * Nest подставил бы `undefined` молча.
     */
    @Optional()
    @Inject(TextSearchService)
    private readonly search: TextSearchService | null = null
  ) {}

  /**
   * `q` — поиск по словам (`content-factory-next-odb8.4`). Без него вызов
   * тот же, что был: бриф зовёт `listFacts(organizationId)` за всем каталогом
   * и ничего об этом параметре знать не должен.
   *
   * С 07.09.2026 первым спрашивают внутренний индекс: он знает стемминг, и
   * «сроки» находят «срок» (`content-factory-next-m2eg.19`). Отбор при этом
   * тот же — встретиться должно каждое слово.
   *
   * Индекс отвечает идентификаторами, а каталог всё равно читается из базы:
   * утверждение приезжает со своими доказательствами, оценками и автором, а
   * этого в индексе нет и не должно быть — иначе память фактов оказалась бы
   * в двух местах сразу. Каталог области читается целиком и без запроса — это
   * тот самый вызов, которым живёт бриф, — так что цена уже известна.
   */
  async listFacts(organizationId: string, q?: string) {
    const matched = await this.search?.matchingIds(
      organizationId,
      q ?? '',
      'FACT'
    );
    const facts = matched
      ? (await this.repository.listFacts(organizationId, [])).filter(
          (fact: any) => matched.has(fact.id)
        )
      : await this.repository.listFacts(organizationId, searchWords(q));
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
      // What `factRecordAdmission` reads with the status and `freshUntil`:
      // the chat's `inWork` is the builder's rule, not a guess (W4-24 F5).
      verifiedAt: fact.verifiedAt ?? null,
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

  /**
   * One fact by id, in this workspace only (`kcxz.24`): `null` when there is
   * none — another workspace's id reads the same as a missing one.
   */
  async fact(
    organizationId: string,
    factId: string
  ): Promise<{
    id: string;
    statement: string;
    status: string;
    verifiedAt: Date | null;
    freshUntil: Date | null;
  } | null> {
    return (await this.repository.findFact(organizationId, factId)) ?? null;
  }

  createFact(organizationId: string, actorUserId: string, input: FactInput) {
    const record = this.factRecord(input);
    // Только что записанное утверждение должно находиться сразу
    // (`content-factory-next-m2eg.19`). Сброс, а не дозапись: правила сборки
    // документа живут в одном месте.
    this.search?.invalidate(organizationId);
    return this.repository.createFact(organizationId, actorUserId, record);
  }

  /**
   * The chat's «добавь факт» (review W4-24 F2): the same record as
   * `createFact`, answered with the row as stored and whether it was there
   * before — the same statement is the same fact (the dedupe key), and it
   * keeps its own status; a new «Свежо до» named for it is set when it is in
   * work (`redateFact`, walk review F1). The caller says so instead of echoing
   * what it asked for. A tombstoned row is returned as it is: the caller
   * refuses it, as the form's upsert leaves it untouched.
   */
  async addFact(organizationId: string, actorUserId: string, input: FactInput) {
    const record = this.factRecord(input);
    const known = await this.repository.findFactByDedupeKey(
      organizationId,
      record.dedupeKey
    );
    if (known) {
      // A new day named for a fact in work is set (owner 29.09.2026, walk
      // review F1): the person tells the agent the new day. A retracted,
      // replaced or removed row keeps its own, as before.
      const asked = record.freshUntil;
      const stored = known.freshUntil ? new Date(known.freshUntil).getTime() : null;
      if (asked && stored !== asked.getTime()) {
        const redated = await this.repository.redateFact(
          organizationId,
          actorUserId,
          known.id,
          asked,
          new Date()
        );
        if (redated) {
          this.search?.invalidate(organizationId);
          return { fact: redated, existed: true as const, redated: true as const };
        }
      }
      return { fact: known, existed: true as const };
    }
    this.search?.invalidate(organizationId);
    const fact = await this.repository.createFact(organizationId, actorUserId, record);
    return { fact, existed: false as const };
  }

  /** What `createFact` stores: normalised, keyed for dedupe, «ваше слово». */
  private factRecord(input: FactInput) {
    const claimKey = normalized(input.claimKey).toLocaleLowerCase();
    const valueText = normalized(input.valueText);
    const valueHash = sha256(valueText.toLocaleLowerCase());
    const effectiveFrom = input.effectiveFrom
      ? new Date(input.effectiveFrom)
      : null;
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    const freshUntil = input.freshUntil ? new Date(input.freshUntil) : null;
    // An impossible day (`2026-13-01`) is an invalid date, not a missing one:
    // refused here with the product code rather than by the database.
    const invalidDate = [effectiveFrom, effectiveTo, freshUntil].some(
      (date) => date && Number.isNaN(date.getTime())
    );
    if (
      !claimKey ||
      !valueText ||
      invalidDate ||
      (input.temporalKind === 'CURRENT' && !freshUntil) ||
      (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo)
    ) {
      throw new ContentContextError(
        'CONTENT_CONTEXT_INPUT_INVALID',
        422,
        'Fact lifecycle dates are invalid'
      );
    }
    // «Свежо до» already over: out of date the moment it is stored (W4 walk
    // P3-D). The form and the chat refuse the day; this refuses the moment
    // for every caller of the door.
    if (freshUntil && factMomentOver(freshUntil)) {
      // In the language the fact is written in — the form's interface, the
      // chat's person (walk recheck P3-b).
      throw new ContentContextError(
        'CONTENT_CONTEXT_INPUT_INVALID',
        422,
        input.language === 'ru'
          ? 'День «Свежо до» уже прошёл — факт сразу устарел бы; ничего не добавлено.'
          : 'The «Fresh until» day is already over, so the fact would be out of date at once; nothing was added.'
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
    return {
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
      lastEvaluatedAt: null as Date | null,
    };
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
