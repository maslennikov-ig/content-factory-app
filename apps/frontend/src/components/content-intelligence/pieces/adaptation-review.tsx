'use client';
import { Textarea } from '@contentfactory/react/form/textarea';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { useEffect, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import {
  Menu,
  MenuButton,
  MenuList,
} from '@contentfactory/react/choice/choice.menu';
import { Hint } from '@contentfactory/react/layout/hint';
import { DescribedMenuItem } from '../../ui/layers';
import { Progress } from '../../ui/progress';
import { Disclosure } from '../../ui/disclosure';
import {
  ReviewQuestions,
  type PendingReviewQuestions,
} from './review-questions';
import { sentenceChanges } from './core-answer-diff';
import {
  REVIEW_VERSION,
  type ReviewChange,
  type ReviewV2,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/review.v2.contract';

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
    .filter((c) => c.basket !== 'ask' && (c.target ?? 'body') === 'body')
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
        <Hint label={`${locale === 'ru' ? 'Почему' : 'Why'}: ${c.id}`}>
          {c.why}
        </Hint>
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
export function AdaptationReview({
  pieceId,
  adaptationId,
  workspaceId,
  locale,
  disabled,
  onAccepted,
  onPublish,
  onQuestions,
}: {
  pieceId: string;
  adaptationId?: string;
  workspaceId: string;
  locale: 'ru' | 'en';
  disabled?: boolean;
  onAccepted: () => void;
  onPublish?: () => void;
  onQuestions?: (pending: PendingReviewQuestions | null) => void;
}) {
  const ru = locale === 'ru',
    request = useFetch();
  const [open, setOpen] = useState(false),
    [rewrite, setRewrite] = useState(false),
    [web, setWeb] = useState(false),
    [instruction, setInstruction] = useState(''),
    [result, setResult] = useState<ReviewV2 | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [variant, setVariant] = useState<string | undefined>(),
    [busy, setBusy] = useState<'run' | 'accept' | null>(null),
    [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null),
    [stale, setStale] = useState(false);
  const active = useRef<AbortController | null>(null);
  const menuElement = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!menuElement.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const base = `/content-intelligence/pieces/${encodeURIComponent(pieceId)}${
    adaptationId ? `/adaptations/${encodeURIComponent(adaptationId)}` : ''
  }`;
  useEffect(() => {
    try {
      setLast(window.localStorage.getItem(reviewModeKey(workspaceId)));
    } catch {}
    setStale(false);
    setResult(null);
    setError(null);
    setRewrite(false);
    setWeb(false);
    setOpen(false);
    setInstruction('');
    setBusy(null);
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [workspaceId, pieceId, adaptationId]);
  async function run(mode?: string, customInstruction?: string) {
    const human = customInstruction ?? instruction;
    if (active.current || disabled || (!mode && !human.trim())) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy('run');
    setStale(false);
    if (mode) {
      setLast(mode);
      try {
        window.localStorage.setItem(reviewModeKey(workspaceId), mode);
      } catch {}
    }
    setOpen(false);
    setWeb(false);
    setError(null);
    setResult(null);
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
        body.version !== REVIEW_VERSION ||
        !Array.isArray(body.changes) ||
        typeof body.token !== 'string'
      )
        throw new Error(
          ru ? 'Неполный результат проверки.' : 'Incomplete review.'
        );
      if (!abort.signal.aborted) {
        setResult(body);
        const asked = body.changes.filter(
          (change: ReviewChange) => change.basket === 'ask'
        );
        onQuestions?.(
          asked.length
            ? { token: body.token, adaptationId, questions: asked }
            : null
        );
        setSelected(
          body.changes
            .filter((c: ReviewChange) => c.basket !== 'ask')
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
        setResult(null);
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
  const cost = ru
    ? 'Один вызов модели · расход по роли «проверка»'
    : 'One model call · review usage';
  const questions = result?.changes.filter((c) => c.basket === 'ask') ?? [];
  const editable = result?.changes.filter((c) => c.basket !== 'ask') ?? [];
  return (
    <div
      className="flex w-full min-w-0 flex-col gap-[12px]"
      data-adaptation-review={adaptationId ?? 'core'}
    >
      <div className="flex flex-wrap items-center gap-[8px]">
        {onPublish ? (
          <Button
            variant="primary"
            density="dense"
            disabled={disabled || !!busy}
            onClick={onPublish}
          >
            {ru ? 'Опубликовать' : 'Publish'}
          </Button>
        ) : null}
        {!adaptationId ? (
          <Button
            variant="secondary"
            density="dense"
            disabled={disabled || !!busy}
            onClick={() => setRewrite((v) => !v)}
          >
            {ru ? 'Перегенерировать' : 'Regenerate'}
          </Button>
        ) : (
          <Menu open={open} onOpenChange={setOpen}>
            <div className="relative" ref={menuElement}>
              <MenuButton
                disabled={disabled || !!busy}
                className={buttonClassName({
                  variant: 'secondary',
                  density: 'dense',
                })}
              >
                {ru ? 'Ещё ▾' : 'More ▾'}
              </MenuButton>
              {open ? (
                <MenuList className="absolute start-0 top-full z-20 mt-[4px] flex w-[320px] max-w-[calc(100vw-64px)] flex-col rounded-[8px] border border-cf-border-strong bg-cf-surface-raised p-[8px]">
                  <DescribedMenuItem
                    title={ru ? 'Перегенерировать' : 'Regenerate'}
                    description={cost}
                    onClick={() => {
                      setOpen(false);
                      setRewrite(true);
                    }}
                  />
                  {(['slop', 'facts', 'both'] as const).map((mode) => (
                    <DescribedMenuItem
                      key={mode}
                      title={
                        ru
                          ? {
                              slop: 'Убрать штампы',
                              facts: 'Сверить с сутью',
                              both: 'И то и другое',
                            }[mode]
                          : {
                              slop: 'Remove cliches',
                              facts: 'Compare with core',
                              both: 'Both',
                            }[mode]
                      }
                      description={
                        cost +
                        (last === mode
                          ? ru
                            ? ' · Последний выбор'
                            : ' · Last choice'
                          : '')
                      }
                      onClick={() => void run(mode)}
                    />
                  ))}
                  <DescribedMenuItem
                    title={
                      ru ? 'Проверить факты поиском' : 'Check facts with search'
                    }
                    description={
                      (ru
                        ? 'Поиск + модели · отдельный расход'
                        : 'Search + models · additional usage') +
                      (last === 'web'
                        ? ru
                          ? ' · Последний выбор'
                          : ' · Last choice'
                        : '')
                    }
                    onClick={() => {
                      setOpen(false);
                      setWeb(true);
                    }}
                  />
                </MenuList>
              ) : null}
            </div>
          </Menu>
        )}
      </div>
      {rewrite ? (
        <section className="flex flex-col gap-[8px]">
          <label className="flex flex-col gap-[8px] cf-label-md text-cf-ink">
            {ru ? 'Что перегенерировать?' : 'What should change?'}
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
            {(ru
              ? ['Только заголовок', 'Весь текст']
              : ['Only title', 'Whole text']
            ).map((value) => (
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
          <p className="cf-caption text-cf-ink-muted">{cost}</p>
          <Button
            variant="primary"
            density="dense"
            disabled={disabled || !instruction.trim()}
            loading={busy === 'run'}
            loadingLabel={ru ? 'Перегенерируем…' : 'Regenerating…'}
            onClick={() => void run()}
          >
            {ru ? 'Перегенерировать' : 'Regenerate'}
          </Button>
        </section>
      ) : null}
      {web ? (
        <section className="flex flex-col gap-[8px]">
          <p className="cf-body-sm text-cf-ink-muted">
            {ru
              ? 'Поиск и модели расходуют лимит ИИ. Для поиска используются первые 5000 знаков. Источники могут охватить не все утверждения.'
              : 'Search and models consume AI allowance. Search uses the first 5000 characters; sources may not cover every claim.'}
          </p>
          <Button
            variant="primary"
            loading={busy === 'run'}
            onClick={() => void run('web')}
          >
            {ru ? 'Запустить поиск и проверку' : 'Run search and review'}
          </Button>
          <Button variant="quiet" onClick={() => setWeb(false)}>
            {ru ? 'Отмена' : 'Cancel'}
          </Button>
        </section>
      ) : null}
      {busy ? (
        <Progress
          mode="indeterminate"
          label={
            busy === 'accept'
              ? ru
                ? 'Сохраняем…'
                : 'Saving…'
              : ru
              ? 'Проверяем текст…'
              : 'Reviewing…'
          }
        />
      ) : null}
      {error ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <section className="flex flex-col gap-[12px] border-t border-cf-border pt-[12px]">
          {!result.changes.length ? (
            <p role="status" className="cf-body-sm text-cf-ink-muted">
              {ru ? 'Правки не понадобились.' : 'No changes needed.'}{' '}
              {result.summary}
            </p>
          ) : (
            <>
              <p className="cf-body-sm text-cf-ink-muted">{result.summary}</p>
              <ReviewText
                text={result.originalText}
                changes={result.changes}
                locale={locale}
              />
              <p className="cf-caption text-cf-ink-muted">
                {ru
                  ? `Штампы: было ${result.slopBefore} → стало ${result.slopAfter}. Бесплатный подсчёт по каталогу; «Убрать штампы» — вызов модели по этому списку.`
                  : `Cliches: ${result.slopBefore} → ${result.slopAfter}. Free catalog count; removing them calls a model with this list.`}
              </p>
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
                            {c.basket === 'silent'
                              ? ru
                                ? 'Исправление опечатки: '
                                : 'Typo: '
                              : ''}
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
              {questions.length ? (
                onQuestions ? (
                  <a
                    href="#piece-text-sources"
                    className="cf-body-sm text-cf-ink underline"
                  >
                    {ru
                      ? 'Ответить на вопросы в «Опорах текста»'
                      : 'Answer questions in Text sources'}
                  </a>
                ) : (
                  <ReviewQuestions
                    pieceId={pieceId}
                    pending={{ token: result.token, adaptationId, questions }}
                    locale={locale}
                    disabled={disabled || !!busy}
                    onSaved={(remaining) => {
                      setResult(
                        remaining
                          ? {
                              ...result,
                              token: remaining.token,
                              changes: remaining.questions,
                            }
                          : null
                      );
                      onAccepted();
                    }}
                  />
                )
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
                    {ru ? 'Принять выбранные' : 'Accept selected'}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  density="dense"
                  disabled={!!busy}
                  onClick={() => setResult(null)}
                >
                  {ru ? 'Оставить как было' : 'Leave unchanged'}
                </Button>
              </div>
            </>
          )}
          {result.sources?.length ? (
            <Disclosure summary={ru ? 'Источники поиска' : 'Search sources'}>
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
            </Disclosure>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
export const reviewModeKey = (workspaceId: string) =>
  `cf:adaptation-review-mode:${workspaceId}`;
