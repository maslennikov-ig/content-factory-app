'use client';
import { Textarea } from '@contentfactory/react/form/textarea';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { useEffect, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Hint } from '@contentfactory/react/layout/hint';
import { WorkingLine } from '../../ui/working-line';
import { Disclosure } from '../../ui/disclosure';
import { sentenceChanges } from './core-answer-diff';
import { ResearchOutcome } from '../intake/intake.research';
import {
  ResearchLevelSelect,
  type ResearchLevel,
} from '../intake/research-level-select';
import {
  REVIEW_VERSIONS,
  type ReviewChange,
  type ReviewV3,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/review.v3.contract';
import {
  PIECE_RESEARCH_VERSIONS,
  type ReadablePieceResearchPreview,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece-research.contract';
import { piecesCopy } from './pieces.copy';

/**
 * Сколько отрывков каталога показать, прежде чем сказать «и ещё K».
 *
 * Список существует, чтобы человек увидел, что ушли именно его штампы, а не
 * какие-то. Двадцать строк этого не показывают — их пролистывают.
 */
const CATALOG_SHOWN = 5;

const isEditableReviewChange = (change: ReviewChange): boolean =>
  change.basket !== 'ask' &&
  (change.excerpt !== change.replacement ||
    Boolean(change.variants?.some((variant) => variant !== change.excerpt)));

/**
 * Что умеет ряд действий над текстом.
 *
 * Один ряд на суть и на адаптацию (`97dq.39`, C5): до волны суть несла три
 * видимые кнопки, а адаптация прятала свои за меню «Ещё», и «Убрать следы ИИ»
 * у сути не было вовсе. Теперь ряд один, а различие — список возможностей,
 * названный вызывающим: у сути — ресерч, у адаптации — следы ИИ.
 */
export type ReviewAction = 'research' | 'slop' | 'checkFacts' | 'rewrite';

export const CORE_REVIEW_ACTIONS: readonly ReviewAction[] = [
  'research',
  'checkFacts',
  'rewrite',
];
export const ADAPTATION_REVIEW_ACTIONS: readonly ReviewAction[] = [
  'slop',
  'checkFacts',
  'rewrite',
];

/** One source text, with local deletions/insertions; unchanged paragraphs occur once. */
export function ReviewText({
  text,
  changes,
  locale,
}: {
  text: string;
  changes: ReviewChange[];
  locale: 'ru' | 'en';
}) {
  const edits = changes
    .filter((c) => isEditableReviewChange(c) && (c.target ?? 'body') === 'body')
    .map((c) => ({ ...c, start: text.indexOf(c.excerpt) }))
    .filter((c) => c.start >= 0)
    .sort((a, b) => a.start - b.start);
  let end = 0;
  const fragments = edits.map((c) => {
    const before = text.slice(end, c.start);
    end = c.start + c.excerpt.length;
    return (
      <span key={c.id}>
        {before}
        <span title={c.why}>
          <del className="bg-cf-danger-soft">{c.excerpt}</del>
          {sentenceChanges(c.excerpt, c.replacement).map((sentence, i) => (
            <ins
              key={i}
              className={
                sentence.changed ? 'bg-cf-accent-soft' : 'no-underline'
              }
            >
              {sentence.text}
            </ins>
          ))}
        </span>
        <Hint label={`${piecesCopy[locale].reviewWhy}: ${c.id}`}>{c.why}</Hint>
      </span>
    );
  });
  return (
    <p className="max-w-[72ch] whitespace-pre-wrap break-words cf-body-sm text-cf-ink">
      {fragments}
      {text.slice(end)}
    </p>
  );
}

/**
 * Ряд действий над текстом и то, что они вернули, — на месте, под рядом.
 *
 * Все действия видны кнопками, а не прячутся в меню: их три, и каждое
 * называет, что станет с текстом. Результат — предложение с подписанными
 * правками — рисуется здесь же, под рядом; ресерч тоже раскрывается на месте,
 * а не окном, — одна поверхность на весь ряд (`97dq.39`, C5).
 */
export function AdaptationReview({
  pieceId,
  adaptationId,
  workspaceId,
  locale,
  disabled,
  onAccepted,
  actions,
}: {
  pieceId: string;
  adaptationId?: string;
  workspaceId: string;
  locale: 'ru' | 'en';
  disabled?: boolean;
  /**
   * Что именно приняли. Счёт штампов до и после нужен странице: она держит
   * «было N → стало M» рядом со строкой качества до следующей перезагрузки,
   * а перечитанная заготовка этих двух чисел уже не несёт.
   */
  onAccepted: (outcome?: { slopBefore: number; slopAfter: number }) => void;
  /** Какие кнопки стоят в ряду; по умолчанию — набор сути или адаптации. */
  actions?: readonly ReviewAction[];
}) {
  const t = piecesCopy[locale],
    request = useFetch();
  const can = new Set<ReviewAction>(
    actions ?? (adaptationId ? ADAPTATION_REVIEW_ACTIONS : CORE_REVIEW_ACTIONS)
  );
  const [rewrite, setRewrite] = useState(false),
    [researchOpen, setResearchOpen] = useState(false),
    [researchDirection, setResearchDirection] = useState(''),
    [researchLevel, setResearchLevel] = useState<ResearchLevel>('standard'),
    [instruction, setInstruction] = useState(''),
    [result, setResult] = useState<ReviewV3 | null>(null),
    [researchPreview, setResearchPreview] =
      useState<ReadablePieceResearchPreview | null>(null),
    [researchExpired, setResearchExpired] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [variant, setVariant] = useState<string | undefined>(),
    [busy, setBusy] = useState<'run' | 'research' | 'accept' | null>(null),
    [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const active = useRef<AbortController | null>(null);
  const base = `/content-intelligence/pieces/${encodeURIComponent(pieceId)}${
    adaptationId ? `/adaptations/${encodeURIComponent(adaptationId)}` : ''
  }`;
  useEffect(() => {
    setStale(false);
    setResult(null);
    setResearchPreview(null);
    setResearchExpired(false);
    setError(null);
    setRewrite(false);
    setResearchOpen(false);
    setResearchDirection('');
    setResearchLevel('standard');
    setInstruction('');
    setBusy(null);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [workspaceId, pieceId, adaptationId]);
  async function run(mode?: 'slop' | 'web', customInstruction?: string) {
    const human = customInstruction ?? instruction;
    if (active.current || disabled || (!mode && !human.trim())) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy('run');
    setStale(false);
    setError(null);
    setResult(null);
    setResearchPreview(null);
    setResearchExpired(false);
    setResearchOpen(false);
    try {
      const response = await request(
        `${base}/${mode ? 'review' : 'rewrite'}?language=${locale}`,
        {
          method: 'POST',
          body: JSON.stringify(
            mode
              ? { mode, ...(mode === 'web' ? { confirmWebSpend: true } : {}) }
              : { instruction: human.trim() }
          ),
          signal: abort.signal,
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      if (
        !REVIEW_VERSIONS.includes(body.version) ||
        !Array.isArray(body.changes) ||
        typeof body.token !== 'string'
      )
        throw new Error(t.reviewIncomplete);
      if (!abort.signal.aborted) {
        setResult(body);
        setSelected(
          body.changes
            .filter(isEditableReviewChange)
            .map((c: ReviewChange) => c.id)
        );
        setVariant(undefined);

        setRewrite(false);
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(null);
      }
    }
  }

  async function startResearch() {
    if (active.current || disabled || adaptationId) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy('research');
    setError(null);
    setResult(null);
    setResearchPreview(null);
    setResearchExpired(false);
    setRewrite(false);
    try {
      const response = await request(`${base}/research?language=${locale}`, {
        method: 'POST',
        body: JSON.stringify({
          confirmWebSpend: true,
          level: researchLevel,
          ...(researchDirection.trim()
            ? { direction: researchDirection.trim() }
            : {}),
        }),
        signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      if (
        !(PIECE_RESEARCH_VERSIONS as readonly string[]).includes(
          body.version
        ) ||
        typeof body.snapshotKey !== 'string' ||
        !['quick', 'standard', 'deep'].includes(body.level) ||
        typeof body.input !== 'string' ||
        !Array.isArray(body.facts) ||
        !Array.isArray(body.corrections) ||
        (body.summary !== null && typeof body.summary !== 'object')
      )
        throw new Error(t.researchIncomplete);
      if (!abort.signal.aborted) {
        setResearchPreview(body);
        setResearchOpen(false);
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(null);
      }
    }
  }

  function toggleResearchCorrection(factKey: string) {
    setResearchPreview((current) => {
      if (!current) return current;
      const correction = current.corrections.find(
        (row) => row.factKey === factKey
      );
      if (!correction) return current;
      const accepted = !correction.accepted;
      return {
        ...current,
        corrections: current.corrections.map((row) =>
          row.factKey === factKey ? { ...row, accepted } : row
        ),
        facts: current.facts.map((fact) => {
          if (fact.factKey === factKey) return { ...fact, selected: accepted };
          if (
            fact.correction?.original === correction.original &&
            fact.origin !== 'search'
          )
            return { ...fact, selected: !accepted };
          return fact;
        }),
      };
    });
  }

  function toggleResearchFound(factKey: string, selectedFact: boolean) {
    setResearchPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        facts: current.facts.map((fact) =>
          (fact.factKey ?? fact.statement) === factKey
            ? { ...fact, selected: selectedFact }
            : fact
        ),
      };
    });
  }

  async function acceptResearch(mode: 'with-fixes' | 'keep-mine') {
    if (!researchPreview || active.current || disabled || researchExpired)
      return;
    const facts =
      mode === 'keep-mine'
        ? researchPreview.facts.map((fact) =>
            fact.correction
              ? { ...fact, selected: fact.origin !== 'search' }
              : fact
          )
        : researchPreview.facts;
    const selectedKeys = facts
      .filter((fact) => fact.selected === true)
      .map((fact) => fact.factKey)
      .filter(
        (factKey): factKey is string =>
          typeof factKey === 'string' && factKey.length > 0
      );
    const abort = new AbortController();
    active.current = abort;
    setBusy('accept');
    setError(null);
    try {
      const response = await request(`${base}/research/accept`, {
        method: 'POST',
        body: JSON.stringify({
          snapshotKey: researchPreview.snapshotKey,
          selectedKeys,
        }),
        signal: abort.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409 || response.status === 410)
          setResearchExpired(true);
        throw new Error(
          typeof body?.message === 'string' ? body.message : t.researchStale
        );
      }
      if (!abort.signal.aborted) {
        setResearchPreview(null);
        setResearchExpired(false);
        onAccepted();
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(null);
      }
    }
  }

  async function accept(chosenVariant?: string) {
    if (!result || active.current || disabled || stale || !selected.length)
      return;
    const abort = new AbortController();
    active.current = abort;
    setBusy('accept');
    setError(null);
    try {
      const response = await request(
        `${base}/${adaptationId ? 'review' : 'rewrite'}/accept`,
        {
          method: 'POST',
          body: JSON.stringify({
            token: result.token,
            selectedIds: selected,
            variant: chosenVariant ?? variant,
          }),
          signal: abort.signal,
        }
      );
      if (!response.ok) {
        const body = await response.json();
        if (response.status === 409) setStale(true);
        throw new Error(body.message);
      }
      if (!abort.signal.aborted) {
        const { slopBefore, slopAfter } = result;
        setResult(null);
        onAccepted({ slopBefore, slopAfter });
      }
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(null);
      }
    }
  }

  const editable = result?.changes.filter(isEditableReviewChange) ?? [];
  const catalogGroups = [
    {
      id: 'removed',
      label: t.catalogRemoved,
      findings: result?.catalog?.removed ?? [],
    },
    {
      id: 'remaining',
      label: t.catalogRemaining,
      findings: result?.catalog?.remaining ?? [],
    },
  ] as const;
  /*
    Проверять было нечего: сверять с источниками в тексте нечего, поиск не
    покупали, и сервер честно вернул чистый вердикт без правок. Это не пустой
    результат и не сбой — это ответ, и он печатается словами сервера вместо
    пустого блока «Принять выбранные».
  */
  const nothingToCheck =
    result?.factCheck?.searched === false && result.factCheck.claims === 0;
  const noChangeNotes =
    result?.changes.filter(
      (change) => change.basket !== 'ask' && !isEditableReviewChange(change)
    ) ?? [];
  const idle = disabled || !!busy;
  return (
    <div
      className="flex w-full min-w-0 flex-col gap-[12px]"
      data-adaptation-review={adaptationId ?? 'core'}
    >
      <div
        role="group"
        aria-label={t.actionsLabel}
        className="flex flex-wrap items-center gap-[8px]"
      >
        {can.has('research') ? (
          <Button
            variant="secondary"
            density="dense"
            disabled={idle}
            aria-expanded={researchOpen}
            data-review-action="research"
            onClick={() => {
              setError(null);
              setRewrite(false);
              setResearchOpen((open) => !open);
            }}
          >
            {t.addResearch}
          </Button>
        ) : null}
        {can.has('slop') ? (
          <Button
            variant="secondary"
            density="dense"
            disabled={idle}
            data-review-action="slop"
            onClick={() => void run('slop')}
          >
            {t.removeAiTells}
          </Button>
        ) : null}
        {can.has('checkFacts') ? (
          /*
            Проверка запускается нажатием, а не окном подтверждения: человек
            выбрал действие словами. О расходе говорит подсказка рядом — её
            читают до нажатия, а не после.
          */
          <span className="inline-flex items-center gap-[4px]">
            <Button
              variant="secondary"
              density="dense"
              disabled={idle}
              data-review-action="checkFacts"
              onClick={() => void run('web')}
            >
              {t.checkFacts}
            </Button>
            <Hint label={t.checkFactsSpendLabel}>{t.checkFactsSpend}</Hint>
          </span>
        ) : null}
        {can.has('rewrite') ? (
          <Button
            variant="secondary"
            density="dense"
            disabled={idle}
            aria-expanded={rewrite}
            data-review-action="rewrite"
            onClick={() => {
              setResearchOpen(false);
              setRewrite((open) => !open);
            }}
          >
            {t.rewriteOpen}
          </Button>
        ) : null}
      </div>
      {rewrite ? (
        <section
          aria-label={t.rewriteOpen}
          className="flex flex-col gap-[8px]"
        >
          <label className="flex flex-col gap-[8px] cf-label-md text-cf-ink">
            {t.rewritePrompt}
            <Textarea
              standalone
              layout="content"
              required
              maxLength={2000}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-[8px]">
            {[t.rewriteOnlyTitle, t.rewriteWholeText].map((value) => (
              <Button
                key={value}
                variant="quiet"
                density="dense"
                onClick={() => setInstruction(value)}
              >
                {value}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <Button
              variant="primary"
              density="dense"
              disabled={disabled || !instruction.trim()}
              loading={busy === 'run'}
              loadingLabel={t.regenerating}
              onClick={() => void run()}
            >
              {t.rewriteRun}
            </Button>
            <Button
              variant="quiet"
              density="dense"
              disabled={busy === 'run'}
              onClick={() => setRewrite(false)}
            >
              {t.cancel}
            </Button>
          </div>
        </section>
      ) : null}
      {researchOpen ? (
        <section
          aria-label={t.addResearch}
          data-review-research="true"
          className="flex flex-col gap-[12px] border-t border-cf-border pt-[12px]"
        >
          <label className="flex flex-col gap-[8px] cf-label-md text-cf-ink">
            {t.researchDirection}
            <Textarea
              standalone
              layout="content"
              maxLength={300}
              disabled={busy === 'research'}
              value={researchDirection}
              onChange={(event) => setResearchDirection(event.target.value)}
            />
          </label>
          <p className="cf-caption text-cf-ink-muted">
            {t.researchDirectionExample}
          </p>
          <ResearchLevelSelect
            locale={locale}
            value={researchLevel}
            disabled={busy === 'research'}
            onChange={setResearchLevel}
          />
          {error ? (
            <p role="alert" className="cf-body-sm text-cf-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-[8px]">
            <Button
              variant="primary"
              density="dense"
              loading={busy === 'research'}
              loadingLabel={t.findingSources}
              onClick={() => void startResearch()}
            >
              {t.runResearch}
            </Button>
            <Button
              variant="quiet"
              density="dense"
              disabled={busy === 'research'}
              onClick={() => setResearchOpen(false)}
            >
              {t.cancel}
            </Button>
          </div>
        </section>
      ) : null}
      {researchPreview ? (
        <ResearchOutcome
          locale={locale}
          level={researchPreview.level}
          input={researchPreview.input}
          inputKind="thought"
          facts={researchPreview.facts}
          corrections={researchPreview.corrections}
          summary={researchPreview.summary}
          pending={!researchExpired}
          busy={busy === 'accept' || !!disabled}
          onToggleCorrection={toggleResearchCorrection}
          onToggleFound={toggleResearchFound}
          onContinue={(mode) => void acceptResearch(mode)}
        />
      ) : null}
      {busy ? (
        <WorkingLine
          label={
            busy === 'accept'
              ? t.saving
              : busy === 'research'
              ? t.findingSources
              : t.reviewing
          }
        />
      ) : null}
      {error && !researchOpen ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <section className="flex flex-col gap-[12px] border-t border-cf-border pt-[12px]">
          {nothingToCheck ? (
            <p
              role="status"
              data-review-nothing-to-check="true"
              className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {result.summary}
            </p>
          ) : !result.changes.length ? (
            <p role="status" className="cf-body-sm text-cf-ink-muted">
              {t.noChangesNeeded} {result.summary}
            </p>
          ) : (
            <>
              <p className="cf-body-sm text-cf-ink-muted">{result.summary}</p>
              {noChangeNotes.map((change) => (
                <p
                  key={change.id}
                  data-review-no-change="true"
                  className="cf-body-sm text-cf-ink-muted"
                >
                  {change.why}
                </p>
              ))}
              <ReviewText
                text={result.originalText}
                changes={result.changes}
                locale={locale}
              />
              <p className="cf-caption text-cf-ink-muted">
                {`${t.slopBeforeAfter(result.slopBefore, result.slopAfter)}. ${
                  t.slopCatalogNote
                }`}
              </p>
              {/*
                Числа «было N → стало M» человек проверить не может, а
                отрывки — может. Списки нарочно не сводят с числами: правка
                умеет внести новый штамп, и `slopAfter` тогда больше, чем
                осталось в каталоге. Подгонять одно под другое значило бы
                соврать ровно там, где строка оправдывается.
              */}
              {result.catalog ? (
                <div
                  data-review-catalog="true"
                  className="flex min-w-0 flex-col gap-[4px]"
                >
                  {catalogGroups.map(({ id, label, findings }) =>
                    findings.length ? (
                      <p
                        key={id}
                        data-review-catalog-group={id}
                        className="min-w-0 max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                      >
                        <span className="text-cf-ink">{label}</span>{' '}
                        {findings
                          .slice(0, CATALOG_SHOWN)
                          .map((finding) => t.quoted(finding.excerpt))
                          .join(', ')}
                        {findings.length > CATALOG_SHOWN
                          ? `, ${t.catalogMore(
                              findings.length - CATALOG_SHOWN
                            )}`
                          : ''}
                      </p>
                    ) : null
                  )}
                </div>
              ) : null}
              {editable.length ? (
                <div className="flex flex-col gap-[8px]">
                  {editable.map((c) => (
                    <div key={c.id} className="cf-body-sm text-cf-ink">
                      <CheckboxField
                        checked={selected.includes(c.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, c.id]
                              : ids.filter((id) => id !== c.id)
                          )
                        }
                        label={
                          <span>
                            {c.basket === 'silent' ? t.typoPrefix : ''}
                            {c.excerpt} → {c.replacement}
                            <span className="block text-cf-ink-muted">
                              {c.why}
                            </span>
                          </span>
                        }
                      />
                      {c.variants ? (
                        <div className="flex flex-wrap gap-[8px]">
                          {c.variants.map((v) => (
                            <Button
                              key={v}
                              variant={variant === v ? 'primary' : 'secondary'}
                              layout="content"
                              disabled={!selected.includes(c.id) || !!busy}
                              onClick={() => {
                                setVariant(v);
                                void accept(v);
                              }}
                            >
                              {v}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-[8px]">
                {editable.length ? (
                  <Button
                    variant="primary"
                    density="dense"
                    loading={busy === 'accept'}
                    disabled={disabled || stale || !selected.length || !!busy}
                    onClick={() => void accept()}
                  >
                    {t.acceptSelected}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  density="dense"
                  disabled={!!busy}
                  onClick={() => setResult(null)}
                >
                  {t.leaveUnchanged}
                </Button>
              </div>
            </>
          )}
          {result.factCheck?.searched ? (
            <p
              data-review-claims="true"
              className="cf-caption text-cf-ink-muted"
            >
              {t.claimsChecked(result.factCheck.claims)}
            </p>
          ) : null}
          {result.sources?.length || result.factCheck?.queries.length ? (
            <Disclosure summary={t.searchSources}>
              {result.factCheck?.queries.length ? (
                <p
                  data-review-queries="true"
                  className="min-w-0 max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                >
                  <span className="text-cf-ink">{t.searchQueries}</span>{' '}
                  {result.factCheck.queries
                    .map((query) => t.quoted(query))
                    .join(', ')}
                </p>
              ) : null}
              {result.sources?.length ? (
                <ul className="flex flex-col gap-[8px]">
                  {result.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="cf-body-sm text-cf-ink underline"
                      >
                        {source.title}
                      </a>
                      <p className="cf-body-sm text-cf-ink-muted">
                        {source.excerpt}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Disclosure>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
