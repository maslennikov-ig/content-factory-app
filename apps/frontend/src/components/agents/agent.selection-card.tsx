'use client';

import { useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { SelectionRows } from '@contentfactory/frontend/components/content-intelligence/intake/selection-rows';
import {
  DECIDE_FOR_PERSON_ANSWER,
  selectionAnswer,
  type AgentQuestion,
} from './agent.contract';
import { AgentCard } from './agent.cards';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';

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
}: {
  question: AgentSelectionQuestion;
  busy: boolean;
  onAnswer: (resumeData: Record<string, unknown>) => void;
  words: AgentWords;
}) {
  const w = words.selection;
  const [kept, setKept] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        question.options
          .filter((option) => option.selected)
          .map((option) => option.id)
      )
  );
  const [sent, setSent] = useState<'keep' | 'decide' | null>(null);
  const locked = busy || sent !== null;
  // In the order the rows stand, not the order they were ticked.
  const ids = question.options
    .filter((option) => kept.has(option.id))
    .map((option) => option.id);

  const send = (key: 'keep' | 'decide', resumeData: Record<string, unknown>) => {
    setSent(key);
    onAnswer(resumeData);
  };

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
