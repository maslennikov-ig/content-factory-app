'use client';

import { FC } from 'react';

/**
 * Почему главная кнопка окна поста не нажимается — словами.
 *
 * Найдено 04.09.2026 на живом прогоне (`content-factory-next-fn33.27`).
 * Человек нажал «Исследовать текущий черновик», получил проверенный контекст,
 * и с этой минуты «Добавить в календарь» перестала нажиматься навсегда: в
 * `manage.modal.tsx` она выключена, пока у поста есть `provenance`. Это
 * решение продукта, а не поломка — пост с проверенным контекстом уходит
 * только в черновик. Но единственная подпись, которую окно при этом
 * показывало, была «Проверьте круги выше»: она отправляла человека к кругам,
 * где ни один щелчок ничем не помогает. Круг при этом выбирается исправно —
 * проверено на стенде под ролью USER, — так что причина неудачи и надпись о
 * ней говорили о разных вещах.
 *
 * Здесь считается только причина. Ни одна кнопка отсюда не открывается:
 * дверь остаётся закрытой ровно там, где её закрыл контентный контракт.
 */
export type ComposeBlockReason =
  | 'none'
  | 'locked'
  | 'context-loading'
  | 'context-error'
  | 'evidence-required'
  | 'context-review-required'
  | 'context-save-draft-first';

export interface ComposeBlockReasonInput {
  locked?: boolean;
  contentIntelligenceLoadState: 'idle' | 'loading' | 'ready' | 'error';
  contentIntelligenceFailure:
    | 'CONTENT_EVIDENCE_REQUIRED'
    | 'CONTEXT_UNAVAILABLE'
    | null;
  provenanceErrorCode?: 'CONTENT_EVIDENCE_REQUIRED' | null;
  hasProvenance: boolean;
  /**
   * Когда человек сказал, что проверил подтверждения. Пусто — планирование
   * закрыто; дата — открыто. Решение принимает человек, а не расчёт.
   */
  contextReviewedAt?: string | null;
  /** Сохранён ли пост: у нового поста ещё нет адреса, которому сказать «проверено». */
  postSaved?: boolean;
}

/**
 * Порядок причин — порядок, в котором они снимаются.
 *
 * «Нет выбранного канала» здесь намеренно не считается: об этом говорит сама
 * подпись кнопки, и повторять её второй строкой значило бы дважды сказать
 * человеку то единственное, что он и так видит. Эта строка существует ради
 * причин, которые выбор канала не снимает.
 */
export function composeBlockReason(
  input: ComposeBlockReasonInput
): ComposeBlockReason {
  if (input.locked) return 'locked';
  if (input.contentIntelligenceLoadState === 'loading') {
    return 'context-loading';
  }
  if (
    input.contentIntelligenceFailure === 'CONTENT_EVIDENCE_REQUIRED' ||
    input.provenanceErrorCode === 'CONTENT_EVIDENCE_REQUIRED'
  ) {
    return 'evidence-required';
  }
  if (input.contentIntelligenceLoadState === 'error') return 'context-error';
  if (input.hasProvenance && !input.contextReviewedAt) {
    // Порядок здесь — порядок шагов человека: сначала у поста должен появиться
    // адрес, и только потом ему есть чему сказать «подтверждения проверены».
    return input.postSaved
      ? 'context-review-required'
      : 'context-save-draft-first';
  }
  return 'none';
}

export const COMPOSE_BLOCK_REASON_COPY: Record<
  Exclude<ComposeBlockReason, 'none'>,
  { key: string; fallback: string }
> = {
  locked: {
    key: 'compose_blocked_locked',
    fallback:
      'This post is open for editing, so the channel choice and sending are closed.',
  },
  'context-loading': {
    key: 'compose_blocked_context_loading',
    fallback:
      'The context is still being verified. The buttons open when the check finishes.',
  },
  'context-error': {
    key: 'compose_blocked_context_error',
    fallback:
      'The context could not be verified, so this post cannot be scheduled or saved yet. Run the check again.',
  },
  'evidence-required': {
    key: 'compose_blocked_evidence_required',
    fallback:
      'Current evidence is required. Verify the context before this draft can be saved.',
  },
  'context-review-required': {
    key: 'compose_blocked_context_review_required',
    fallback:
      'This post was assembled from evidence. Check the evidence and confirm it — that opens scheduling.',
  },
  'context-save-draft-first': {
    key: 'compose_blocked_context_save_draft_first',
    fallback:
      'This post was assembled from evidence. Save it as a draft first, then confirm the evidence — that opens scheduling.',
  },
};

/**
 * Строка причины рядом с кнопками.
 *
 * `role="status"` — потому что она появляется в ответ на действие человека и
 * должна быть услышана без перевода фокуса. Цвет приглушённый и один: цвет
 * здесь ничего не значит сам по себе, значение несёт текст.
 */
export const ComposeBlockReasonNote: FC<{
  reason: ComposeBlockReason;
  t: (key: string, fallback: string) => string;
}> = ({ reason, t }) => {
  if (reason === 'none') return null;
  const copy = COMPOSE_BLOCK_REASON_COPY[reason];
  return (
    <p
      role="status"
      data-compose-block-reason={reason}
      className="max-w-[52ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
    >
      {t(copy.key, copy.fallback)}
    </p>
  );
};
