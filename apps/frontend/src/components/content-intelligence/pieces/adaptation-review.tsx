'use client';

import { useEffect, useRef, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import {
  Menu,
  MenuButton,
  MenuCommand,
  MenuList,
} from '@contentfactory/react/choice/choice.menu';
import {
  ADAPTATION_REVIEW_MODES,
  ADAPTATION_REVIEW_ACTIONS,
  ADAPTATION_REVIEW_VERSION,
  type AdaptationReviewAction,
  type AdaptationReviewResult,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-review.contract';

const copy = {
  ru: {
    review: 'Проверить ▾',
    slop: 'Убрать штампы',
    facts: 'Сверить с сутью заготовки',
    both: 'И то и другое',
    web: 'Проверить поиском',
    webCost: 'Поиск + модели · отдельный расход',
    webWarning:
      'Поиск источников и работа моделей расходуют лимит ИИ. Поиск может сделать несколько обращений; после него — один вызов проверки. Расход зависит от текста и найденных материалов.',
    webLimit:
      'Для поиска используем первые 5000 знаков черновика. Источники могут не охватить все утверждения.',
    webConfirm: 'Запустить поиск и проверку',
    cancel: 'Отмена',
    sources: 'Источники поиска',
    webNote: 'По источникам',
    webScope:
      'Сверка по найденным отрывкам. Это не подтверждение всех фактов: проверьте применимость источников.',
    coverage: (count: number, total: number) =>
      `В запрос поиска вошло ${count} из ${total} знаков черновика.`,

    cost: 'Один вызов модели · расход по роли «проверка»',
    last: 'Последний выбор',
    scope: 'Сверка только с сутью и опорами заготовки, без поиска в интернете.',
    busy: 'Проверяем текст…',
    saving: 'Сохраняем…',
    accept: 'Принять',
    leave: 'Оставить как было',
    error: 'Проверка не удалась. Черновик не изменён.',
    removed: 'Убрано',
    unsupported: 'Не подтверждается сутью',
    diff: 'Изменения текста',
    unchanged: 'Правки не понадобились.',
    webUnchanged:
      'Источники не дали оснований для правок. Это не подтверждение всех утверждений.',
    old: 'Удалённый текст',
    added: 'Добавленный текст',
  },
  en: {
    review: 'Check ▾',
    slop: 'Remove cliches',
    facts: 'Compare with the piece',
    both: 'Both',
    web: 'Check with web search',
    webCost: 'Search + models · additional usage',
    webWarning:
      'Source search and model work consume your AI allowance. Search may make several requests; it is followed by one review call. Usage depends on the draft and the material found.',
    webLimit:
      'Search uses the first 5000 characters of the draft. The sources may not cover every claim.',
    webConfirm: 'Run search and review',
    cancel: 'Cancel',
    sources: 'Search sources',
    webNote: 'Source review',
    webScope:
      'Compared with the excerpts found. This does not verify every fact: check that the sources apply.',
    coverage: (count: number, total: number) =>
      `The search request included ${count} of ${total} draft characters.`,

    cost: 'One model call · review usage',
    last: 'Last choice',
    scope: 'Compared only with the piece and its evidence, without web search.',
    busy: 'Checking the draft…',
    saving: 'Saving…',
    accept: 'Accept',
    leave: 'Leave unchanged',
    error: 'The review failed. The draft has not changed.',
    removed: 'Removed',
    unsupported: 'Unsupported by the piece',
    diff: 'Text changes',
    unchanged: 'No changes needed.',
    webUnchanged:
      'The sources did not support any correction. This does not verify every claim.',
    old: 'Removed text',
    added: 'Added text',
  },
};

/** Linear diff: retain shared whole-word prefix/suffix, mark the changed passage. */
export function reviewDiff(before: string, after: string) {
  const a = before.split(/(\s+)/u),
    b = after.split(/(\s+)/u);
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return {
    prefix: a.slice(0, start).join(''),
    removed: a.slice(start, a.length - end).join(''),
    added: b.slice(start, b.length - end).join(''),
    suffix: end ? a.slice(-end).join('') : '',
  };
}
export const reviewModeKey = (workspaceId: string) =>
  `cf:adaptation-review-mode:${workspaceId}`;

export function AdaptationReview({
  pieceId,
  adaptationId,
  workspaceId,
  locale,
  disabled,
  onAccepted,
}: {
  pieceId: string;
  adaptationId: string;
  workspaceId: string;
  locale: 'ru' | 'en';
  disabled?: boolean;
  onAccepted: () => void;
}) {
  const t = copy[locale],
    request = useFetch();
  const [open, setOpen] = useState(false);
  const [confirmWeb, setConfirmWeb] = useState(false);
  const confirmation = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<AdaptationReviewAction | null>(null);
  const [result, setResult] = useState<AdaptationReviewResult | null>(null);
  const [busy, setBusy] = useState<'review' | 'accept' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const active = useRef<AbortController | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const url = `/content-intelligence/pieces/${encodeURIComponent(
    pieceId
  )}/adaptations/${encodeURIComponent(adaptationId)}/review`;
  useEffect(() => {
    setResult(null);
    setError(null);
    setBusy(null);
    setMode(null);
    setOpen(false);
    setConfirmWeb(false);
    setStale(false);
    try {
      const saved = window.localStorage.getItem(reviewModeKey(workspaceId));
      if (ADAPTATION_REVIEW_ACTIONS.includes(saved as AdaptationReviewAction))
        setMode(saved as AdaptationReviewAction);
    } catch {
      /* Storage is optional in private browser sessions. */
    }
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [workspaceId, pieceId, adaptationId]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (confirmWeb) confirmation.current?.focus();
  }, [confirmWeb]);
  async function run(next: AdaptationReviewAction, confirmed = false) {
    if (active.current || disabled || (next === 'web' && !confirmed)) return;
    setConfirmWeb(false);
    const abort = new AbortController();
    active.current = abort;
    setBusy('review');
    setOpen(false);
    setError(null);
    setResult(null);
    setStale(false);
    setMode(next);
    try {
      window.localStorage.setItem(reviewModeKey(workspaceId), next);
    } catch {
      /* Optional preference. */
    }
    try {
      const response = await request(`${url}?language=${locale}`, {
        method: 'POST',
        body: JSON.stringify({
          mode: next,
          ...(next === 'web' ? { confirmWebSpend: true } : {}),
        }),
        signal: abort.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || t.error);
      if (
        body?.version !== ADAPTATION_REVIEW_VERSION ||
        body.mode !== next ||
        typeof body.text !== 'string' ||
        typeof body.originalText !== 'string' ||
        !Array.isArray(body.notes) ||
        !body.snapshot ||
        (next === 'web' &&
          (!Array.isArray(body.sources) ||
            !body.sources.length ||
            body.sources.some(
              (source: { url?: unknown; title?: unknown; excerpt?: unknown }) =>
                typeof source.url !== 'string' ||
                !source.url.startsWith('https://') ||
                typeof source.title !== 'string' ||
                typeof source.excerpt !== 'string'
            )))
      )
        throw new Error(t.error);
      if (!abort.signal.aborted) setResult(body);
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : t.error);
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(null);
      }
    }
  }
  async function accept() {
    if (!result || active.current || disabled || stale) return;
    const abort = new AbortController();
    active.current = abort;
    setBusy('accept');
    setError(null);
    try {
      const response = await request(`${url}/accept`, {
        method: 'POST',
        body: JSON.stringify({ text: result.text, snapshot: result.snapshot }),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      if (!response.ok) {
        const body = await response.json();
        if (abort.signal.aborted) return;
        if (response.status === 409) setStale(true);
        throw new Error(body?.message || t.error);
      }
      if (!abort.signal.aborted) {
        setResult(null);
        onAccepted();
      }
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : t.error);
    } finally {
      if (active.current === abort) {
        active.current = null;
        setBusy(null);
      }
    }
  }
  const diff = result ? reviewDiff(result.originalText, result.text) : null;
  return (
    <div
      className="flex w-full min-w-0 flex-col gap-[12px]"
      data-adaptation-review={adaptationId}
    >
      <div className="relative self-start" ref={menu}>
        <Menu open={open} onOpenChange={setOpen}>
          <MenuButton
            disabled={disabled || !!busy}
            className={buttonClassName({
              variant: 'secondary',
              density: 'dense',
            })}
          >
            {t.review}
          </MenuButton>
          {open ? (
            <MenuList className="absolute start-0 top-full z-20 mt-[4px] flex w-[320px] max-w-[calc(100vw-64px)] flex-col rounded-[8px] border border-cf-border-strong bg-cf-surface-raised p-[8px]">
              {ADAPTATION_REVIEW_MODES.map((next) => (
                <MenuCommand
                  key={next}
                  layout="content"
                  onClick={() => void run(next)}
                  className="flex-col items-start gap-[4px] rounded-[8px] px-[12px] py-[8px] text-start hover:bg-cf-surface-subtle"
                >
                  <span className="cf-label-md text-cf-ink">{t[next]}</span>
                  <span className="cf-caption text-cf-ink-muted">
                    {t.cost}
                    {mode === next ? ` · ${t.last}` : ''}
                  </span>
                </MenuCommand>
              ))}
              <MenuCommand
                layout="content"
                onClick={() => {
                  setOpen(false);
                  setConfirmWeb(true);
                }}
                className="flex-col items-start gap-[4px] rounded-[8px] border-t border-cf-border px-[12px] py-[8px] text-start hover:bg-cf-surface-subtle"
              >
                <span className="cf-label-md text-cf-ink">{t.web}</span>
                <span className="cf-caption text-cf-ink-muted">
                  {t.webCost}
                  {mode === 'web' ? ` · ${t.last}` : ''}
                </span>
              </MenuCommand>
            </MenuList>
          ) : null}
        </Menu>
      </div>
      {confirmWeb ? (
        <section
          ref={confirmation}
          tabIndex={-1}
          aria-label={t.web}
          className="flex flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-focus"
        >
          <p className="cf-body-sm text-cf-ink">{t.webWarning}</p>
          <p className="cf-body-sm text-cf-ink-muted">{t.webLimit}</p>
          <div className="flex flex-wrap gap-[8px]">
            <Button
              variant="primary"
              density="dense"
              disabled={disabled || !!busy}
              onClick={() => void run('web', true)}
            >
              {t.webConfirm}
            </Button>
            <Button
              variant="secondary"
              density="dense"
              onClick={() => setConfirmWeb(false)}
            >
              {t.cancel}
            </Button>
          </div>
        </section>
      ) : null}
      {busy ? (
        <p role="status" className="cf-body-sm text-cf-ink-muted">
          {busy === 'review' ? t.busy : t.saving}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
      {result && diff ? (
        <section
          aria-label={t.diff}
          className="flex min-w-0 flex-col gap-[12px] border-t border-cf-border pt-[12px]"
        >
          <p className="cf-caption text-cf-ink-muted">
            {t[result.mode]} · {result.mode === 'web' ? t.webCost : t.cost}
          </p>
          {result.mode !== 'slop' ? (
            <p className="cf-body-sm text-cf-ink-muted">
              {result.mode === 'web' ? t.webScope : t.scope}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap break-words cf-body-sm text-cf-ink">
            {diff.prefix}
            {diff.removed ? (
              <del aria-label={t.old} className="bg-cf-danger-soft">
                {diff.removed}
              </del>
            ) : null}
            {diff.added ? (
              <ins aria-label={t.added} className="bg-cf-accent-soft">
                {diff.added}
              </ins>
            ) : null}
            {diff.suffix}
          </p>
          {result.notes.length ? (
            <ul className="flex flex-col gap-[4px] cf-body-sm text-cf-ink-muted">
              {result.notes.map((note, index) => (
                <li key={index}>
                  {note.kind === 'slop'
                    ? t.removed
                    : result.mode === 'web'
                    ? t.webNote
                    : t.unsupported}
                  : {note.text}
                  {result.mode === 'web'
                    ? note.sourceUrls?.map((url) => {
                        const source = result.sources?.find(
                          (item) => item.url === url
                        );
                        return source ? (
                          <a
                            key={url}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="ms-[8px] underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-focus"
                          >
                            {source.title}
                          </a>
                        ) : null;
                      })
                    : null}
                </li>
              ))}
            </ul>
          ) : result.text === result.originalText ? (
            <p className="cf-body-sm text-cf-ink-muted">
              {result.mode === 'web' ? t.webUnchanged : t.unchanged}
            </p>
          ) : null}
          {result.mode === 'web' && result.sources?.length ? (
            <div className="flex flex-col gap-[8px]">
              <h3 className="cf-label-md text-cf-ink">{t.sources}</h3>
              <p className="cf-caption text-cf-ink-muted">
                {t.coverage(
                  result.searchedChars ?? 0,
                  result.originalText.length
                )}
              </p>
              <ul className="flex flex-col gap-[8px]">
                {result.sources.map((source) => (
                  <li
                    key={source.url}
                    className="flex min-w-0 flex-col gap-[4px]"
                  >
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-words cf-body-sm text-cf-ink underline underline-offset-2 hover:text-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-cf-focus"
                    >
                      {source.title}
                    </a>
                    <p className="break-words cf-body-sm text-cf-ink-muted">
                      {source.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-[8px]">
            <Button
              variant="primary"
              density="dense"
              disabled={
                disabled ||
                !!busy ||
                stale ||
                result.text === result.originalText
              }
              onClick={() => void accept()}
            >
              {t.accept}
            </Button>
            <Button
              variant="secondary"
              density="dense"
              disabled={!!busy}
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              {t.leave}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
