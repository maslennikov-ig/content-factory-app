'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { SelectionRows } from '@contentfactory/frontend/components/content-intelligence/intake/selection-rows';
import { LocalizedReviewChangePreview } from '@contentfactory/frontend/components/content-intelligence/pieces/review-change-preview.localized';
import { Disclosure } from '../ui/disclosure';
import {
  DECIDE_FOR_PERSON_ANSWER,
  selectionAnswer,
  type AgentQuestion,
} from './agent.contract';
import { AgentCard } from './agent.cards';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';
import { AgentMarkdown } from './agent.markdown';

/**
 * «Выбор» (spec §6.2, canvas C `_c_selection`, `kcxz.16`): rows to keep,
 * several at once, and «Решите за меня». The rows are the found-facts rows of
 * `intake.research.tsx` (`SelectionRows`), so a fact looks the same on the
 * entry screen, on the piece page and here.
 *
 * Generic over the payload: `piece_create` asks which facts to keep
 * (`answerKey: 'factKeys'`); review and rewrite changes (`kcxz.13`) arrive in
 * the same shape. The answer is `{ [answerKey]: ids }`, or «Решите за меня»,
 * which keeps the product's own defaults (`selected`) on the server.
 */

export type AgentSelectionQuestion = Extract<AgentQuestion, { kind: 'selection' }>;

export function SelectionCard({
  question,
  busy,
  onAnswer,
  words,
  failure = false,
}: {
  question: AgentSelectionQuestion;
  busy: boolean;
  onAnswer: (resumeData: Record<string, unknown>) => void | Promise<void>;
  words: AgentWords;
  failure?: boolean;
}) {
  const w = words.selection;
  const t = useT();
  const [kept, setKept] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        question.options
          .filter((option) => option.selected)
          .map((option) => option.id)
      )
  );
  const [sent, setSent] = useState<'keep' | 'decide' | 'decline' | null>(null);
  const sending = useRef(false);
  const [rejected, setRejected] = useState(false);
  useEffect(() => { if (failure) { sending.current = false; setSent(null); } }, [failure]);
  const locked = busy || sent !== null;
  // In the order the rows stand, not the order they were ticked.
  const ids = question.options
    .filter((option) => kept.has(option.id))
    .map((option) => option.id);

  const send = async (key: 'keep' | 'decide' | 'decline', resumeData: Record<string, unknown>) => {
    if (sending.current || busy) return;
    sending.current = true;
    setSent(key);
    setRejected(false);
    try { await onAnswer(resumeData); }
    catch { sending.current = false; setSent(null); setRejected(true); }
  };

  if (question.fullPreview) {
    const title = t('assistant_draft_review_title', 'Proposed draft');
    return (
      <AgentCard cardKind="selection" glyph="pen" kind={title} label={title}
        footer={<>
          <Button type="button" density="dense" disabled={locked} loading={sent === 'keep'} loadingLabel={words.question.sending}
            onClick={() => send('keep', selectionAnswer(question, question.options.map(option => option.id)))}>
            {t('assistant_accept_draft', 'Accept')}
          </Button>
          <Button type="button" density="dense" variant="secondary" disabled={locked} loading={sent === 'decline'} loadingLabel={words.question.sending}
            onClick={() => send('decline', selectionAnswer(question, []))}>
            {t('assistant_keep_draft', 'Keep current draft')}
          </Button>
        </>}
      >
        {failure || rejected ? <p role="status" className="cf-body-sm text-cf-warning">{words.question.answerFailed}</p> : null}
        <div data-agent-full-preview="" className="min-w-0">
          {question.fullPreview.title ? <h3 className="mb-[12px] cf-heading-md text-cf-ink [overflow-wrap:anywhere]">{question.fullPreview.title}</h3> : null}
          <AgentMarkdown text={question.fullPreview.text} />
        </div>
        <Disclosure className="mt-[16px] min-w-0 border-t border-cf-border pt-[8px]"
          summary={t('assistant_review_changes', 'Compare changes')}
          contentClassName="flex min-w-0 flex-col gap-[12px] pt-[12px]">
          {question.options.map(option => <div key={option.id} className="min-w-0">
            {option.preview ? <LocalizedReviewChangePreview before={option.preview.before} after={option.preview.after}
              reason={option.preview.reason} fallbackWords={w.preview} />
              : <p className="cf-body-sm text-cf-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{option.label}</p>}
          </div>)}
        </Disclosure>
      </AgentCard>
    );
  }

  return (
    <AgentCard
      cardKind="selection"
      glyph="list"
      kind={w.kind}
      title={question.text}
      label={`${w.kind}: ${question.text}`}
      footer={
        <>
          <Button
            type="button"
            density="dense"
            disabled={locked}
            loading={sent === 'keep'}
            loadingLabel={words.question.sending}
            data-agent-selection-keep={ids.length}
            onClick={() => send('keep', selectionAnswer(question, ids))}
          >
            {ids.length ? w.keep(ids.length) : w.keepNone}
          </Button>
          {question.canDecideForPerson ? (
            <Button
              type="button"
              density="dense"
              variant="secondary"
              disabled={locked}
              loading={sent === 'decide'}
              loadingLabel={words.question.sending}
              onClick={() => send('decide', { ...DECIDE_FOR_PERSON_ANSWER })}
            >
              <AgentGlyph name="spark" size={14} />
              {words.question.decide}
            </Button>
          ) : null}
        </>
      }
    >
      {failure || rejected ? <p role="status" className="cf-body-sm text-cf-warning">{words.question.answerFailed}</p> : null}
      <SelectionRows
        includeLabel={w.include}
        editable
        busy={locked}
        onToggle={(id, selected) =>
          setKept((current) => {
            const next = new Set(current);
            if (selected) next.add(id);
            else next.delete(id);
            return next;
          })
        }
        className="flex min-w-0 flex-col divide-y divide-cf-border border-t border-cf-border"
        rows={question.options.map((option) => {
          const status = option.status ? w.statuses[option.status] : undefined;
          const meta = [option.source, status].filter(Boolean).join(' · ');
          return {
            id: option.id,
            label: option.label,
            selected: kept.has(option.id),
            detail: option.preview ? (
              <Disclosure
                defaultOpen
                summary={t('review_preview_summary', w.preview.summary)}
                contentClassName="min-w-0 pt-[8px]"
              >
                <LocalizedReviewChangePreview
                  before={option.preview.before}
                  after={option.preview.after}
                  reason={option.preview.reason}
                  fallbackWords={w.preview}
                />
              </Disclosure>
            ) : null,
            meta: meta ? (
              <span className="cf-caption text-cf-ink-muted [overflow-wrap:anywhere]">
                {meta}
              </span>
            ) : null,
          };
        })}
      />
    </AgentCard>
  );
}
