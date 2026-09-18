import type {
  ReviewProposal as ReviewProposalV2,
  ReviewSnapshotV2,
  ReviewChange,
} from './review.v2.contract';
export {
  applyReviewChanges,
  syncEmbeddedTitle,
  type ReviewChange,
  type ReviewSnapshotV2,
} from './review.v2.contract';

export const REVIEW_VERSION = 'adaptation-review/v3' as const;
export const REVIEW_VERSIONS = [
  'adaptation-review/v2',
  REVIEW_VERSION,
] as const;

/** Одна находка каталога так, как её показывают: правило и отрывок. */
export type ReviewCatalogFinding = { ruleId: string; excerpt: string };

/**
 * Что из каталога ушло и что осталось после правок (`97dq.3`).
 *
 * Считается по текстам до и после, а не со слов модели, и поэтому строка
 * «Штампов по каталогу: было N → стало M» имеет право быть показанной.
 * `slopBefore`/`slopAfter` — те же числа счётчиками; `slopAfter` может быть
 * больше длины `remaining`, если правка внесла новый штамп.
 */
export type ReviewCatalogDelta = {
  removed: ReviewCatalogFinding[];
  remaining: ReviewCatalogFinding[];
};

export type ReviewV3 = {
  version: typeof REVIEW_VERSION;
  originalText: string;
  text: string;
  title: string;
  changes: ReviewChange[];
  verdict: 'clean' | 'review' | 'rewrite';
  summary: string;
  token: string;
  slopBefore: number;
  slopAfter: number;
  sources?: ReviewProposalV2['sources'];
  /** Необязательно: подписанные предложения прежних сборок его не несут. */
  catalog?: ReviewCatalogDelta;
  /**
   * Проверка фактов поиском: что нашли, что искали, что купили.
   *
   * Три числа, потому что три разных вопроса, и складывать их нельзя:
   * `extracted` — сколько проверяемых утверждений вернул разбор, `unphrased` —
   * сколько из них ИИ не смог выразить поисковым запросом, `claims` — по
   * скольким запрос действительно купили (бюджет уровня режет хвост, и
   * `extracted` бывает больше суммы двух других). `searched: false` при
   * `extracted: 0` значит «проверять нечего»; при `extracted > 0` — «нашли, но
   * не смогли спросить», и это разные слова в `summary`.
   */
  factCheck?: {
    claims: number;
    queries: string[];
    /** `false`, когда поиск не покупали вовсе. */
    searched: boolean;
    extracted?: number;
    unphrased?: number;
  };
};

export type ReviewProposalV3 = Omit<ReviewV3, 'token'> & {
  organizationId: string;
  pieceId: string;
  adaptationId?: string;
  expires: number;
  language: 'ru' | 'en';
  snapshot?: ReviewSnapshotV2;
  pieceSnapshot: { body: string; brief: unknown; title: string };
};

/** Old tabs may still submit a v2 token after the server starts issuing v3. */
export type ReadableReviewProposal = ReviewProposalV2 | ReviewProposalV3;
