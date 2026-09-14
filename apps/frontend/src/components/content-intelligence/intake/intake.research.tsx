'use client';

import type { ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { intakeCopy, type IntakeLocale } from './intake.copy';

/**
 * Итог ресерча «сделали за вас» — вариант 1, выбранный владельцем 13.09.2026
 * (`content-factory-next-75xn.18`, макет «Опоры после ресерча»).
 *
 * Продукт сам поправил числа, которые расходятся с источниками, показал правки
 * прямо в мысли человека и объяснил каждую одной строкой с цитатой. Человеку
 * остаётся нажать «Продолжить с правками» или вернуть своё — по строке или
 * все разом. Найденное сверх сказанного стоит ниже с галочкой, уже отмеченной.
 *
 * Строки-поправки (`correction` у строки с `origin: 'search'`) не рисуются как
 * отдельные факты: их представляет строка вердикта «расходится» с кнопкой.
 */

export type ResearchOutcomeFact = {
  statement: string;
  sourceUrl?: string | null;
  origin?: string;
  kind?: string;
  status?: string;
  selected?: boolean;
  factKey?: string;
  quote?: string | null;
  note?: string | null;
  correction?: { original: string; replacement: string } | null;
};

export type ResearchOutcomeCorrection = {
  factKey: string;
  original: string;
  replacement: string;
  sourceUrl: string | null;
  quote: string | null;
  note: string | null;
  accepted: boolean;
};

export type ResearchOutcomeSummary = {
  confirmed: number;
  conflicting: number;
  unverified: number;
  found: number;
  sources: number;
  encyclopedic: number;
};

const hostOf = (url: string | null | undefined): string => {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const isCorrectionTwin = (fact: ResearchOutcomeFact) =>
  !!fact.correction && fact.origin === 'search' && fact.kind !== 'found';

/**
 * Строки, у которых есть что открыть. Неподтверждённое утверждение автора не
 * является результатом ресерча и поэтому не занимает место на экране.
 */
export const sourcedResearchFacts = (facts: readonly ResearchOutcomeFact[]) =>
  facts.filter(
    (fact) =>
      Boolean(fact.sourceUrl) &&
      (fact.kind === 'found' ||
        fact.status === 'confirmed' ||
        fact.status === 'conflicting')
  );

/* Иконки состояний: штрих, 16px, перекрашиваются через currentColor. */
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[16px] shrink-0">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-[16px] shrink-0">
    <path d="M8 3v6M8 12v.01" />
    <path d="M8 1.8l6.2 11H1.8z" />
  </svg>
);
const SourceLink = ({ url, label }: { url: string | null | undefined; label: string }) =>
  url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${label}: ${hostOf(url)}`}
      className="cf-body-sm text-cf-accent underline underline-offset-2 hover:text-cf-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
    >
      {hostOf(url)}
    </a>
  ) : null;

/**
 * Мысль человека с правками: заменяемые слова зачёркнуты, замена выделена;
 * снятая поправка оставляет слова как есть с пунктирным подчёркиванием.
 * Ищется первое вхождение без учёта регистра; не нашлось — правка видна
 * только строкой ниже.
 */
function markedThought(
  input: string,
  corrections: readonly ResearchOutcomeCorrection[]
): ReactNode[] {
  const parts: ReactNode[] = [];
  let rest = input;
  let key = 0;
  const pending = [...corrections];
  while (rest.length) {
    let best: { index: number; correction: ResearchOutcomeCorrection } | null = null;
    for (const correction of pending) {
      const index = rest.toLocaleLowerCase().indexOf(correction.original.toLocaleLowerCase());
      if (index >= 0 && (!best || index < best.index)) best = { index, correction };
    }
    if (!best) {
      parts.push(rest);
      break;
    }
    const { index, correction } = best;
    pending.splice(pending.indexOf(correction), 1);
    if (index > 0) parts.push(rest.slice(0, index));
    const original = rest.slice(index, index + correction.original.length);
    if (correction.accepted) {
      parts.push(
        <s key={`s-${key}`} data-intake-correction="struck" className="text-cf-ink-muted">
          {original}
        </s>,
        ' ',
        <mark key={`m-${key}`} data-intake-correction="replacement" className="cf-label-md rounded-[4px] bg-cf-accent-soft px-[4px] text-cf-accent">
          {correction.replacement}
        </mark>
      );
    } else {
      parts.push(
        <span key={`k-${key}`} data-intake-correction="kept" className="border-b-2 border-dotted border-cf-border-control">
          {original}
        </span>
      );
    }
    key += 1;
    rest = rest.slice(index + correction.original.length);
  }
  return parts;
}

/**
 * Общие строки результата ресерча. Их же показывает страница заготовки, чтобы
 * утверждение, цитата и адрес не расходились между двумя экранами.
 */
export function ResearchEvidenceRows({
  locale,
  facts,
  corrections = [],
  pending = false,
  busy = false,
  editableFound = false,
  onToggleCorrection,
  onToggleFound,
}: {
  locale: IntakeLocale;
  facts: readonly ResearchOutcomeFact[];
  corrections?: readonly ResearchOutcomeCorrection[];
  pending?: boolean;
  busy?: boolean;
  editableFound?: boolean;
  onToggleCorrection?: (factKey: string) => void;
  onToggleFound?: (factKey: string, selected: boolean) => void;
}) {
  const t = intakeCopy[locale];
  const visible = sourcedResearchFacts(facts);
  const claims = visible.filter(
    (fact) => fact.kind !== 'found' && !isCorrectionTwin(fact)
  );
  const found = visible.filter((fact) => fact.kind === 'found');
  const correctionByOriginal = new Map(
    corrections.map((row) => [row.original, row])
  );
  if (!claims.length && !found.length) return null;

  return (
    <>
      {claims.length ? (
        <ul
          className="flex min-w-0 flex-col divide-y divide-cf-border border-t border-cf-border"
          data-intake-research-claims="true"
        >
          {claims.map((fact, index) => {
            const correction = fact.correction
              ? correctionByOriginal.get(fact.correction.original) ?? null
              : null;
            const status =
              fact.status === 'conflicting' ? 'conflicting' : 'confirmed';
            return (
              <li
                key={fact.factKey ?? `${fact.statement}-${index}`}
                data-intake-claim-status={status}
                className="flex min-w-0 items-start gap-[12px] py-[12px]"
              >
                <span
                  className={
                    status === 'confirmed'
                      ? 'text-cf-accent'
                      : 'text-cf-danger'
                  }
                >
                  {status === 'confirmed' ? <CheckIcon /> : <AlertIcon />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
                  <p className="cf-body-md text-cf-ink [text-wrap:pretty]">
                    {status === 'conflicting' && correction ? (
                      <>
                        <span className="cf-label-md">
                          {correction.original} → {correction.replacement}.
                        </span>{' '}
                        {fact.note}
                      </>
                    ) : status === 'conflicting' ? (
                      <>
                        <span className="cf-label-md">{fact.statement}.</span>{' '}
                        {fact.note || t.researchConflictNoFix}
                      </>
                    ) : (
                      <>
                        <span className="cf-label-md">{fact.statement}.</span>{' '}
                        {fact.note}
                      </>
                    )}
                  </p>
                  {fact.quote ? (
                    <p
                      className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                      data-intake-claim-quote="true"
                    >
                      «{fact.quote}»
                    </p>
                  ) : null}
                  <SourceLink url={fact.sourceUrl} label={t.researchSourceOf} />
                </div>
                {status === 'conflicting' &&
                correction &&
                pending &&
                onToggleCorrection ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    data-intake-correction-toggle={
                      correction.accepted ? 'accepted' : 'kept'
                    }
                    onClick={() => onToggleCorrection(correction.factKey)}
                  >
                    {correction.accepted
                      ? t.researchKeepMine
                      : t.researchAcceptFix}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {found.length ? (
        <div
          className="flex min-w-0 flex-col gap-[4px]"
          data-intake-research-found="true"
        >
          <span className="cf-label-sm uppercase text-cf-ink-muted">
            {t.researchFoundTitle}
          </span>
          {editableFound ? (
            <p className="cf-caption text-cf-ink-muted">
              {t.researchFoundHint}
            </p>
          ) : null}
          <ul className="flex min-w-0 flex-col divide-y divide-cf-border">
            {found.map((fact, index) => (
              <li
                key={fact.factKey ?? `${fact.statement}-${index}`}
                className="flex min-w-0 items-start gap-[12px] py-[8px]"
              >
                {editableFound && onToggleFound ? (
                  <CheckboxField
                    aria-label={`${t.researchInclude}: ${fact.statement}`}
                    checked={fact.selected === true}
                    disabled={busy}
                    onChange={(event) =>
                      onToggleFound(
                        fact.factKey ?? fact.statement,
                        event.target.checked
                      )
                    }
                    label={<span className="sr-only">{t.researchInclude}</span>}
                    className="min-h-0 py-0"
                  />
                ) : (
                  <span
                    className={
                      fact.selected
                        ? 'text-cf-accent'
                        : 'text-cf-ink-muted'
                    }
                  >
                    <CheckIcon />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
                  <p className="cf-body-md text-cf-ink [text-wrap:pretty]">
                    {fact.statement}
                  </p>
                  {fact.quote ? (
                    <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                      «{fact.quote}»
                    </p>
                  ) : null}
                  <SourceLink url={fact.sourceUrl} label={t.researchSourceOf} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </>
  );
}

export function ResearchOutcome({
  locale,
  level,
  input,
  inputKind,
  facts,
  corrections,
  summary,
  pending,
  busy = false,
  onToggleCorrection,
  onToggleFound,
  onContinue,
}: {
  locale: IntakeLocale;
  level: 'quick' | 'standard' | 'deep';
  input: string;
  inputKind: string | null;
  facts: readonly ResearchOutcomeFact[];
  corrections: readonly ResearchOutcomeCorrection[];
  summary: ResearchOutcomeSummary | null;
  /** Ход стоит на выборе: кнопки продолжения видны. */
  pending: boolean;
  busy?: boolean;
  onToggleCorrection: (factKey: string) => void;
  onToggleFound: (factKey: string, selected: boolean) => void;
  onContinue: (mode: 'with-fixes' | 'keep-mine') => void;
}) {
  const t = intakeCopy[locale];
  const visibleFacts = sourcedResearchFacts(facts);
  const claims = visibleFacts.filter(
    (fact) => fact.kind !== 'found' && !isCorrectionTwin(fact)
  );
  const found = visibleFacts.filter((fact) => fact.kind === 'found');
  const accepted = corrections.filter((row) => row.accepted).length;
  const corrected = corrections.length;
  const confirmed = claims.filter((fact) => fact.status === 'confirmed').length;
  const hosts = [...new Set(facts.map((fact) => hostOf(fact.sourceUrl)).filter(Boolean))];

  return (
    <section
      aria-label={t.researchOutcomeTitle}
      data-intake-research-outcome="true"
      className="flex min-w-0 flex-col gap-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <div className="flex flex-wrap items-baseline gap-[8px]">
        <h3 className="cf-heading-md text-cf-ink">{t.researchOutcomeTitle}</h3>
        <span className="cf-caption text-cf-ink-muted" data-intake-research-level={level}>
          {t.researchLevelNames[level]}
          {summary ? ` · ${t.researchSourcesLine(summary.sources, summary.encyclopedic)}` : ''}
        </span>
      </div>

      {summary && summary.sources === 0 ? (
        <p className="cf-body-sm text-cf-ink-muted">{t.researchNoSources}</p>
      ) : null}

      {claims.length ? (
        <div className="flex flex-wrap items-center gap-[12px] rounded-[8px] bg-cf-surface-subtle px-[12px] py-[8px]" data-intake-research-summary="true">
          <span className="inline-flex items-center gap-[4px] cf-body-sm text-cf-ink">
            <span className="text-cf-accent"><CheckIcon /></span>
            {t.researchSummaryConfirmed(confirmed)}
          </span>
          <span className="inline-flex items-center gap-[4px] cf-body-sm text-cf-ink">
            <span className="text-cf-danger"><AlertIcon /></span>
            {t.researchSummaryCorrected(corrected)}
          </span>
          {found.length ? (
            <span className="inline-flex items-center gap-[4px] cf-body-sm text-cf-ink-muted">
              {t.researchSummaryFound(found.length)}
            </span>
          ) : null}
        </div>
      ) : null}

      {inputKind === 'thought' && corrections.length ? (
        <div className="flex min-w-0 flex-col gap-[4px]">
          <span className="cf-label-sm uppercase text-cf-ink-muted">{t.researchThoughtTitle}</span>
          <p className="cf-body-lg text-cf-ink [text-wrap:pretty]" data-intake-research-thought="true">
            {markedThought(input, corrections)}
          </p>
        </div>
      ) : null}

      <ResearchEvidenceRows
        locale={locale}
        facts={visibleFacts}
        corrections={corrections}
        pending={pending}
        busy={busy}
        editableFound={pending}
        onToggleCorrection={onToggleCorrection}
        onToggleFound={onToggleFound}
      />

      {pending ? (
        <div className="flex flex-wrap items-center gap-[8px]">
          <Button type="button" variant="primary" disabled={busy} onClick={() => onContinue('with-fixes')} data-intake-research-continue="true">
            {accepted ? t.researchContinueWithFixes : t.researchContinuePlain}
          </Button>
          {accepted ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onContinue('keep-mine')} data-intake-research-keep-mine="true">
              {t.researchKeepMyNumbers}
            </Button>
          ) : null}
          {hosts.length ? (
            <span className="cf-caption min-w-0 flex-1 truncate text-cf-ink-muted" title={hosts.join(' · ')}>
              {hosts.join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
