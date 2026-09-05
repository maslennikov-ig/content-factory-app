'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import { Dialog } from '../ui/layers';
import { EmptyState, ErrorState, SkeletonRows, Status } from '../ui/surface';
import {
  FACTS_API,
  buildFactCopyPayload,
  factsListUrl,
  confirmEvidenceUrl,
  copyFactUrl,
  emptyFactCopyDraft,
  failureNotice,
  isUsableFact,
  jsonReader,
  readFactsEnvelope,
  readFailure,
  restoreFactUrl,
  retractFactUrl,
  screenState,
  type FactCopyDraft,
  type FactFailure,
  type FactRow,
  type GroundingMethod,
} from './content-facts.adapter';
import { resolveContentLocale } from './content-section.copy';
import { HighlightedWords, useDebouncedValue } from './content-search-words';
import {
  ContentReadOnlyNote,
  WRITE_ALLOWED,
  readWriteRight,
  type ContentWriteRight,
} from './content-write-right';

/**
 * «Откуда факты» — the witness screen (`content-factory-next-odb8.1`).
 *
 * Replaces the vkladka «Источники» in the working navigation: what stood
 * there was a list, a form and a lifecycle for a `ContentSource` row, and the
 * decision recorded in `docs/product/content-section-map.md` §3 is that a
 * person never understood it in three explanations while it was dead on
 * production for twelve days and nobody noticed. Nothing that ran it is
 * deleted — `source-registry/*` and its tests stay exactly as they were,
 * reachable through `ContentIntelligenceSettings` and its own review scenes.
 * This screen looks at a different, plainer table: `ContentFact`, already
 * built for `content-factory-next-07h`, read through the same
 * `ContentFactService.listFacts` the brief's own catalogue
 * (`content-facts.container.tsx`) already calls.
 *
 * It is a witness, not a workbench (§3: «витрина, а не верстак»). There is no
 * form here — a fact is written in the brief, where the question «чем
 * подтвердишь» is actually asked (`content-facts.container.tsx`, embedded by
 * `content-factory-next-odb8.2`). Two actions live here instead: СНЯТЬ, which
 * this screen only has to *show* — `RETRACTED`/`SUPERSEDED`/`TOMBSTONED`
 * already exist and already leave a fact out of a brief
 * (`UNUSABLE_FACT_STATUSES`) — and КОПИРОВАТЬ И ПОПРАВИТЬ, whose whole reason
 * for existing is the warning in its dialog: the copy's statement changed and
 * the old fact's evidence, if any, no longer confirms it. Editing the old
 * fact in place is refused for exactly that reason, and the backend enforces
 * it structurally — `ContentFactRepository.copyFact` creates a new row and
 * never touches `ContentFactEvidence` for the old one — this dialog is the
 * honest half of that guarantee, not a decoration on top of it.
 */

type Locale = 'ru' | 'en';

const GROUNDING_FILTERS = ['ALL', 'OWN_WORD', 'OWN_MATERIAL', 'SEARCH_RESULT'] as const;
type GroundingFilter = (typeof GROUNDING_FILTERS)[number];

export const factsShowcaseCopy = {
  ru: {
    title: 'Откуда факты',
    // content-factory-next-fn33.61: вкладки «Что пишем» на полосе нет —
    // в полосе стоят Аватары, Откуда идеи, Бриф, Материалы, Откуда факты
    // (`content-section.tabs.ts`). Форма добавления факта живёт на вкладке
    // «Бриф», в блоке «Или запомните новый факт»; английская строка ниже
    // называла её правильно всё это время.
    body: 'Что продукт считает правдой о вашем деле и откуда он это взял. Чего здесь нет — он в текст не поставит. Добавляют факты там, где пишут: во вкладке «Бриф».',
    searchLabel: 'Искать по словам',
    searchHint:
      'Ищет по утверждению, теме и значению. Найдётся то, где встречаются все слова.',
    groundingFilterLabel: 'Чем подтверждено',
    groundingAll: 'Все',
    groundingOwnWord: 'Ваше слово',
    groundingOwnMaterial: 'Ваш материал',
    groundingSearchResult: 'Найдено поиском',
    topicFilterLabel: 'Тема',
    topicAll: 'Все темы',
    retractedFilterLabel: 'Снятые',
    retractedHidden: 'Скрыты',
    retractedShown: 'Показаны',
    shown: (visible: number, total: number) => `Показано ${visible} из ${total}`,
    empty: 'Фактов пока нет. Их добавляют во вкладке «Бриф», в момент письма.',
    emptyFiltered: 'Ничего не найдено. Измените фильтры или поиск.',
    loading: 'Загружаем список фактов',
    listFallback: 'Список фактов не загрузился. Попробуйте ещё раз.',
    retry: 'Повторить',
    showFragment: 'показать фрагмент',
    hideFragment: 'скрыть фрагмент',
    retract: 'Снять',
    restore: 'Вернуть',
    copyAction: 'Копировать',
    confirmAction: 'Подтвердить',
    confirming: 'Подтверждаем…',
    retractedMeta: (date: string) => `снят ${date}`,
    supersededMeta: (date: string) => `заменён новым утверждением · ${date}`,
    notInWork: 'в работу не идёт',
    unknownStatusMeta: (status: string) => `статус: ${status}`,
    ownWordMeta: (name: string | null, date: string) =>
      name ? `${name} · ${date}` : date,
    materialMeta: (source: string, date: string) => `${source} · добавлен ${date}`,
    searchMeta: (source: string, date: string) => `${source} · прочитано ${date}`,
    retractFailed: 'Факт не снялся. Попробуйте ещё раз.',
    restoreFailed: 'Факт не вернулся. Попробуйте ещё раз.',
    confirmFailed: 'Не подтвердилось. Попробуйте ещё раз.',
    copyFailed: 'Копия не сохранилась. Ничего не потеряно, проверьте поля и попробуйте ещё раз.',
    copyDialogEyebrow: (date: string) => `КОПИЯ УТВЕРЖДЕНИЯ ОТ ${date}`,
    copyDialogTitle: 'Поправьте и сохраните как новое',
    statementLabel: 'Утверждение',
    warningBody:
      'Прежний фрагмент подтверждал прежнюю формулировку. Вашу он не подтверждает, поэтому к копии не перейдёт.',
    groundedOwnWord: 'Это моё слово — записать под моим именем',
    groundedEvidence: 'Указать другое подтверждение',
    evidenceIdLabel: 'ID доказательства из рабочего пространства',
    save: 'Сохранить как новое',
    saving: 'Сохраняем…',
    cancel: 'Отмена',
    oldUnchanged: 'старое утверждение останется как есть',
    readOnlyRole:
      'Менять факты сейчас может только администратор рабочего пространства. Список остаётся открытым для чтения.',
    readOnlyPlan:
      'Тариф рабочего пространства сейчас не разрешает менять факты. Список остаётся открытым для чтения.',
  },
  en: {
    title: 'Where facts come from',
    body: 'What the product treats as true about your business and where it took that from. Whatever is not here does not go into a text. Facts are added where writing happens: the Brief tab.',
    searchLabel: 'Search by words',
    searchHint:
      'Searches the claim, the topic and the value. A row matches when every word is in it.',
    groundingFilterLabel: 'Grounded by',
    groundingAll: 'All',
    groundingOwnWord: 'Your word',
    groundingOwnMaterial: 'Your material',
    groundingSearchResult: 'Found by search',
    topicFilterLabel: 'Topic',
    topicAll: 'All topics',
    retractedFilterLabel: 'Retracted',
    retractedHidden: 'Hidden',
    retractedShown: 'Shown',
    shown: (visible: number, total: number) => `Showing ${visible} of ${total}`,
    empty: 'No facts yet. They are added on the Brief tab, while writing.',
    emptyFiltered: 'Nothing matches. Try different filters or search.',
    loading: 'Loading the facts',
    listFallback: 'The fact list did not load. Try again.',
    retry: 'Retry',
    showFragment: 'show excerpt',
    hideFragment: 'hide excerpt',
    retract: 'Retract',
    restore: 'Restore',
    copyAction: 'Copy',
    confirmAction: 'Confirm',
    confirming: 'Confirming…',
    retractedMeta: (date: string) => `retracted ${date}`,
    supersededMeta: (date: string) => `replaced by a new statement · ${date}`,
    notInWork: 'not used in drafts',
    unknownStatusMeta: (status: string) => `status: ${status}`,
    ownWordMeta: (name: string | null, date: string) =>
      name ? `${name} · ${date}` : date,
    materialMeta: (source: string, date: string) => `${source} · added ${date}`,
    searchMeta: (source: string, date: string) => `${source} · read ${date}`,
    retractFailed: 'The fact was not retracted. Try again.',
    restoreFailed: 'The fact was not restored. Try again.',
    confirmFailed: 'The confirmation did not go through. Try again.',
    copyFailed: 'The copy was not saved. Nothing is lost — check the fields and try again.',
    copyDialogEyebrow: (date: string) => `COPY OF THE CLAIM FROM ${date}`,
    copyDialogTitle: 'Fix it and save as new',
    statementLabel: 'Statement',
    warningBody:
      'The earlier excerpt confirmed the earlier wording. It does not confirm yours, so it will not carry over to the copy.',
    groundedOwnWord: 'This is my word — record it under my name',
    groundedEvidence: 'Point at another confirmation',
    evidenceIdLabel: 'Evidence id from this workspace',
    save: 'Save as new',
    saving: 'Saving…',
    cancel: 'Cancel',
    oldUnchanged: 'the old statement stays exactly as it is',
    readOnlyRole:
      'Only a workspace administrator may change facts right now. The list stays open to read.',
    readOnlyPlan:
      "This workspace's plan does not allow changing facts right now. The list stays open to read.",
  },
} as const;

/**
 * The screen's own words, exported for the review scene
 * (`content-factory-next-cl19`) so the state a reviewer looks at is drawn
 * with the same sentences as the screen and cannot drift from them.
 */
const copy = factsShowcaseCopy;

const GROUNDING_LABEL: Record<GroundingMethod, (t: (typeof copy)[Locale]) => string> = {
  OWN_WORD: (t) => t.groundingOwnWord,
  OWN_MATERIAL: (t) => t.groundingOwnMaterial,
  SEARCH_RESULT: (t) => t.groundingSearchResult,
};

const formatDate = (value: string | null, locale: Locale) =>
  value
    ? new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
      }).format(new Date(value))
    : '—';

const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const GROUNDING_TONE: Record<GroundingMethod, 'neutral' | 'accent' | 'info'> = {
  OWN_WORD: 'neutral',
  OWN_MATERIAL: 'accent',
  SEARCH_RESULT: 'info',
};

function GroundingBadge({
  method,
  t,
}: {
  method: GroundingMethod;
  t: (typeof copy)[Locale];
}) {
  return (
    <Status tone={GROUNDING_TONE[method]}>{GROUNDING_LABEL[method](t)}</Status>
  );
}

export function FactRowView({
  fact,
  locale,
  t,
  query = '',
  busy,
  canWrite,
  noteId,
  expanded,
  onToggleExcerpt,
  onRetract,
  onRestore,
  onCopy,
  onConfirm,
}: {
  fact: FactRow;
  /** Что искали — подсветить в утверждении ровно эти слова. */
  query?: string;
  locale: Locale;
  t: (typeof copy)[Locale];
  busy: boolean;
  /**
   * Whether the server has already refused a write on this screen
   * (`content-factory-next-cl19`). The actions stay in place and go dead
   * rather than disappearing: the row is read alongside them, and a control
   * that vanishes mid-screen leaves a person looking for what they just saw.
   */
  canWrite: boolean;
  /** The read-only note every dead control points at, so none is a blank. */
  noteId?: string;
  expanded: boolean;
  onToggleExcerpt: () => void;
  onRetract: () => void;
  onRestore: () => void;
  onCopy: () => void;
  onConfirm: () => void;
}) {
  const blocked = busy || !canWrite;
  const explains = canWrite ? undefined : noteId;
  const usable = isUsableFact(fact.status);
  const date = formatDate(fact.updatedAt ?? fact.createdAt, locale);

  if (!usable) {
    const meta =
      fact.status === 'RETRACTED'
        ? t.retractedMeta(date)
        : fact.status === 'SUPERSEDED'
        ? t.supersededMeta(date)
        : t.unknownStatusMeta(fact.status);
    return (
      <li
        data-content-fact-row={fact.id}
        data-content-fact-usable="false"
        className="flex items-start gap-[16px] py-[16px] opacity-[.55]"
      >
        <div className="min-w-0 flex-1">
          <p className="max-w-[72ch] cf-body-md text-cf-ink line-through [text-wrap:pretty]">
            <HighlightedWords text={fact.statement} query={query} />
          </p>
          <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
            <span className="cf-caption text-cf-ink-muted">{meta}</span>
            <span className="cf-caption text-cf-ink-muted">
              {t.notInWork}
            </span>
          </div>
        </div>
        {/*
          «Вернуть» only ever offers RETRACTED a way back. A SUPERSEDED row
          got there through КОПИРОВАТЬ И ПОПРАВИТЬ, and restoring it would
          put the corrected fact and the one it replaced back in work at
          once, sharing a claimKey with disagreeing statements — the exact
          thing copy-not-edit exists to prevent
          (`ContentFactRepository.restoreFact` refuses it server-side too).
          An unrecognised status offers no button either: this screen does
          not know it is safe to act on.
        */}
        {fact.status === 'RETRACTED' && (
          <div className="flex shrink-0 gap-[8px]">
            <span className="flex min-h-[44px] items-center sm:min-h-0">
              <Button
                density="dense"
                variant="secondary"
                disabled={blocked}
                aria-describedby={explains}
                onClick={onRestore}
              >
                {t.restore}
              </Button>
            </span>
          </div>
        )}
      </li>
    );
  }

  const grounding = fact.grounding;
  const groundingDate = formatDate(grounding.observedAt, locale);
  const groundingMeta =
    grounding.method === 'OWN_MATERIAL'
      ? t.materialMeta(grounding.sourceLabel || '—', groundingDate)
      : grounding.method === 'SEARCH_RESULT'
      ? t.searchMeta(hostOf(grounding.sourceUrl) || '—', groundingDate)
      : t.ownWordMeta(fact.createdByName, formatDate(fact.createdAt, locale));

  return (
    <li
      data-content-fact-row={fact.id}
      data-content-fact-usable="true"
      className="flex items-start gap-[16px] py-[16px]"
    >
      <div className="min-w-0 flex-1">
        <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
          <HighlightedWords text={fact.statement} query={query} />
        </p>
        <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
          <GroundingBadge method={grounding.method} t={t} />
          <span className="cf-caption text-cf-ink-muted">{groundingMeta}</span>
          {grounding.excerpt && (
            <Button
              type="button"
              variant="quiet"
              density="dense"
              className="text-cf-accent"
              onClick={onToggleExcerpt}
            >
              {expanded ? t.hideFragment : t.showFragment}
            </Button>
          )}
        </div>
        {expanded && grounding.excerpt && (
          <div className="mt-[8px] max-w-[80ch] rounded-[8px] bg-cf-surface-subtle p-[12px]">
            <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
              «{grounding.excerpt}»
            </p>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-[8px]">
        {fact.needsLook && (
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button
              density="dense"
              variant="primary"
              disabled={blocked}
              aria-describedby={explains}
              data-content-fact-confirm={fact.id}
              onClick={onConfirm}
            >
              {t.confirmAction}
            </Button>
          </span>
        )}
        <span className="flex min-h-[44px] items-center sm:min-h-0">
          <Button
            density="dense"
            variant="secondary"
            disabled={blocked}
            aria-describedby={explains}
            onClick={onCopy}
          >
            {t.copyAction}
          </Button>
        </span>
        <span className="flex min-h-[44px] items-center sm:min-h-0">
          <Button
            density="dense"
            variant="secondary"
            disabled={blocked}
            aria-describedby={explains}
            onClick={onRetract}
          >
            {t.retract}
          </Button>
        </span>
      </div>
    </li>
  );
}

export function ContentFactsShowcase() {
  const request = useFetch();
  const { language } = useVariables();
  const locale: Locale = resolveContentLocale(language);
  const t = copy[locale];
  const read = useMemo(() => jsonReader(request), [request]);

  /*
    Поиск спрашивает сервер (`content-factory-next-odb8.4`). До этого поле
    отбирало уже полученные строки у себя, а каталог приходит с `take: 100` —
    то есть поиск честно не видел ничего, что не попало в первую сотню, и
    молчал об этом. Набранное ждёт 300 мс и только потом становится адресом.
  */
  const [search, setSearch] = useState('');
  const settledSearch = useDebouncedValue(search);
  const factsUrl = factsListUrl(settledSearch);
  const facts = useSWR(factsUrl, () => read(factsUrl), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const [groundingFilter, setGroundingFilter] = useState<GroundingFilter>('ALL');
  const [topicFilter, setTopicFilter] = useState('ALL');
  const [showRetracted, setShowRetracted] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionFactId, setActionFactId] = useState<string | null>(null);
  const [actionFailure, setActionFailure] = useState<FactFailure | null>(null);
  const [copyTarget, setCopyTarget] = useState<FactRow | null>(null);
  const [copyDraft, setCopyDraft] = useState<FactCopyDraft | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyFailure, setCopyFailure] = useState<FactFailure | null>(null);
  /**
   * What the server has said about the right to write here
   * (`content-factory-next-cl19`). It starts allowed and is never guessed:
   * the doors behind these actions carry `Sections.AI`, a plan section every
   * member passes on an instance without billing, so a screen that decided
   * for itself would hide a working button.
   */
  const [writeRight, setWriteRight] = useState<ContentWriteRight>(WRITE_ALLOWED);
  const canWrite = writeRight.allowed;
  const readOnlyNoteId = 'content-facts-read-only';

  const rows: readonly FactRow[] = readFactsEnvelope(facts.data);

  const topics = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (row.topic) seen.set(row.topic, row.topicLabel || row.topic);
    }
    return [...seen.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [rows]);

  const visibleRows = useMemo(() => {
    // Отбор по словам сделан сервером: повторять его здесь значило бы
    // спрятать факт, который подошёл по теме или по значению, а не по
    // тексту утверждения — то есть спорить с собственным ответом.
    return rows
      .filter((row) => (showRetracted ? true : isUsableFact(row.status)))
      .filter((row) =>
        groundingFilter === 'ALL' ? true : row.grounding.method === groundingFilter
      )
      .filter((row) => (topicFilter === 'ALL' ? true : row.topic === topicFilter))
      .slice()
      .sort((left, right) => {
        const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightDate - leftDate;
      });
  }, [rows, groundingFilter, topicFilter, showRetracted]);

  const toggleExcerpt = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (factId: string, url: string, fallback: string) => {
      setActionFactId(factId);
      setActionFailure(null);
      try {
        await read(url, { method: 'POST', body: JSON.stringify({}) });
        await facts.mutate();
      } catch (error) {
        const right = readWriteRight(error);
        // A refusal by right is not a thing that went wrong: repeating it
        // produces the same answer, so the screen changes instead of
        // printing a sentence built from a status code.
        if (!right.allowed) setWriteRight(right);
        else setActionFailure(readFailure(error, fallback));
      } finally {
        setActionFactId(null);
      }
    },
    [facts, read]
  );

  const openCopy = useCallback((row: FactRow) => {
    setCopyTarget(row);
    setCopyDraft(emptyFactCopyDraft(row.statement));
    setCopyFailure(null);
  }, []);

  const closeCopy = useCallback(() => {
    setCopyTarget(null);
    setCopyDraft(null);
  }, []);

  const submitCopy = useCallback(async () => {
    if (!copyTarget || !copyDraft) return;
    setCopyBusy(true);
    setCopyFailure(null);
    try {
      await read(copyFactUrl(copyTarget.id), {
        method: 'POST',
        body: JSON.stringify(buildFactCopyPayload(copyDraft)),
      });
      await facts.mutate();
      closeCopy();
    } catch (error) {
      const right = readWriteRight(error);
      if (!right.allowed) {
        // Nothing in the dialog can be saved now, and leaving it open over a
        // dead «Сохранить» would ask the person to keep typing into it.
        setWriteRight(right);
        closeCopy();
      } else {
        setCopyFailure(readFailure(error, t.copyFailed));
      }
    } finally {
      setCopyBusy(false);
    }
  }, [copyTarget, copyDraft, read, facts, closeCopy, t.copyFailed]);

  const listFailure =
    facts.error && !facts.data ? readFailure(facts.error, t.listFallback) : null;
  const state = canWrite
    ? screenState({
        failure: listFailure,
        busy: false,
        loaded: !!facts.data || !!facts.error,
      })
    : 'restricted';

  return (
    <section
      data-content-intelligence-section="facts-showcase"
      data-content-fact-showcase-state={state}
      aria-labelledby="content-facts-showcase-title"
      className="flex min-w-0 flex-col gap-[16px]"
    >
      <div className="flex flex-col gap-[4px]">
        <h2
          id="content-facts-showcase-title"
          tabIndex={-1}
          className="cf-heading-md text-cf-ink [text-wrap:balance]"
        >
          {t.title}
        </h2>
        <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.body}
        </p>
      </div>

      {listFailure ? (
        <ErrorState
          title={failureNotice(listFailure)}
          action={
            <Button variant="secondary" onClick={() => void facts.mutate()}>
              {t.retry}
            </Button>
          }
        />
      ) : state === 'loading' && !facts.data ? (
        <SkeletonRows rows={3} label={t.loading} className="[&>*]:h-[56px]" />
      ) : rows.length === 0 && !settledSearch.trim() ? (
        /*
          Пусто по-настоящему — фактов нет ни одного. Пусто из-за поиска — это
          другое состояние: там ниже «ничего не найдено», и поле остаётся на
          экране, иначе человек, набравший слово с опечаткой, теряет вместе с
          ответом и само поле, которым мог бы поправить запрос.
        */
        <EmptyState title={t.empty} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-[8px]">
            <Input
              disableForm
              type="search"
              aria-label={t.searchLabel}
              placeholder={t.searchLabel}
              title={t.searchHint}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fieldClassName="min-w-[200px] max-w-[320px] flex-1"
            />
            <Select
              disableForm
              label={t.groundingFilterLabel}
              name="groundingFilter"
              value={groundingFilter}
              onChange={(event) =>
                setGroundingFilter(event.target.value as GroundingFilter)
              }
            >
              <option value="ALL">{t.groundingAll}</option>
              <option value="OWN_WORD">{t.groundingOwnWord}</option>
              <option value="OWN_MATERIAL">{t.groundingOwnMaterial}</option>
              <option value="SEARCH_RESULT">{t.groundingSearchResult}</option>
            </Select>
            {topics.length > 0 && (
              <Select
                disableForm
                label={t.topicFilterLabel}
                name="topicFilter"
                value={topicFilter}
                onChange={(event) => setTopicFilter(event.target.value)}
              >
                <option value="ALL">{t.topicAll}</option>
                {topics.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
            <Select
              disableForm
              label={t.retractedFilterLabel}
              name="retractedFilter"
              value={showRetracted ? 'SHOWN' : 'HIDDEN'}
              onChange={(event) => setShowRetracted(event.target.value === 'SHOWN')}
            >
              <option value="HIDDEN">{t.retractedHidden}</option>
              <option value="SHOWN">{t.retractedShown}</option>
            </Select>
            <span className="ml-auto cf-caption text-cf-ink-muted">
              {t.shown(visibleRows.length, rows.length)}
            </span>
          </div>

          {actionFailure && <ErrorState title={failureNotice(actionFailure)} />}

          {!canWrite && (
            <ContentReadOnlyNote
              id={readOnlyNoteId}
              surface="facts"
              refusal={writeRight.refusal ?? 'plan'}
            >
              {writeRight.refusal === 'role' ? t.readOnlyRole : t.readOnlyPlan}
            </ContentReadOnlyNote>
          )}

          {visibleRows.length === 0 ? (
            <EmptyState title={t.emptyFiltered} />
          ) : (
            <ul className="divide-y divide-cf-border rounded-[8px] border border-cf-border bg-cf-surface px-[16px]">
              {visibleRows.map((fact) => (
                <FactRowView
                  key={fact.id}
                  fact={fact}
                  locale={locale}
                  t={t}
                  query={settledSearch}
                  busy={actionFactId === fact.id}
                  canWrite={canWrite}
                  noteId={readOnlyNoteId}
                  expanded={expanded.has(fact.id)}
                  onToggleExcerpt={() => toggleExcerpt(fact.id)}
                  onRetract={() =>
                    void runAction(fact.id, retractFactUrl(fact.id), t.retractFailed)
                  }
                  onRestore={() =>
                    void runAction(fact.id, restoreFactUrl(fact.id), t.restoreFailed)
                  }
                  onCopy={() => openCopy(fact)}
                  onConfirm={() =>
                    fact.grounding.evidenceId &&
                    void runAction(
                      fact.id,
                      confirmEvidenceUrl(fact.id, fact.grounding.evidenceId),
                      t.confirmFailed
                    )
                  }
                />
              ))}
            </ul>
          )}
        </>
      )}

      {copyTarget && copyDraft && (
        <Dialog
          open
          onClose={closeCopy}
          title={
            <span className="flex flex-col gap-[4px]">
              <span className="cf-caption text-cf-ink-muted">
                {t.copyDialogEyebrow(formatDate(copyTarget.createdAt, locale))}
              </span>
              <span>{t.copyDialogTitle}</span>
            </span>
          }
          footer={
            <>
              <Button variant="secondary" onClick={closeCopy}>
                {t.cancel}
              </Button>
              <Button
                variant="primary"
                disabled={copyBusy || !copyDraft.statement.trim()}
                onClick={() => void submitCopy()}
              >
                {copyBusy ? t.saving : t.save}
              </Button>
            </>
          }
        >
          <form
            data-content-fact-copy-form="true"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCopy();
            }}
            className="flex flex-col gap-[16px]"
          >
            {copyFailure && <ErrorState title={failureNotice(copyFailure)} />}
            <div className="flex flex-col gap-[8px]">
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {t.statementLabel}
              </p>
              <Textarea
                standalone
                layout="content"
                name="copy-statement"
                aria-label={t.statementLabel}
                value={copyDraft.statement}
                onChange={(event) =>
                  setCopyDraft((current) =>
                    current ? { ...current, statement: event.target.value } : current
                  )
                }
              />
            </div>

            <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[12px]">
              <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                {t.warningBody}
              </p>
              <RadioGroup
                value={copyDraft.groundedIn}
                onChange={(value) =>
                  setCopyDraft((current) =>
                    current
                      ? { ...current, groundedIn: value as FactCopyDraft['groundedIn'] }
                      : current
                  )
                }
                aria-label={t.warningBody}
                className="flex flex-col gap-[8px]"
              >
                <RadioOption
                  value="OWN_WORD"
                  layout="content"
                  className="flex items-center gap-[8px] text-start cf-body-sm text-cf-ink"
                >
                  <span
                    aria-hidden
                    className={clsx(
                      'flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border',
                      copyDraft.groundedIn === 'OWN_WORD'
                        ? 'border-cf-accent'
                        : 'border-cf-border-control'
                    )}
                  >
                    {copyDraft.groundedIn === 'OWN_WORD' && (
                      <span className="h-[8px] w-[8px] rounded-full bg-cf-accent" />
                    )}
                  </span>
                  {t.groundedOwnWord}
                </RadioOption>
                <RadioOption
                  value="EVIDENCE"
                  layout="content"
                  className="flex items-center gap-[8px] text-start cf-body-sm text-cf-ink"
                >
                  <span
                    aria-hidden
                    className={clsx(
                      'flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border',
                      copyDraft.groundedIn === 'EVIDENCE'
                        ? 'border-cf-accent'
                        : 'border-cf-border-control'
                    )}
                  >
                    {copyDraft.groundedIn === 'EVIDENCE' && (
                      <span className="h-[8px] w-[8px] rounded-full bg-cf-accent" />
                    )}
                  </span>
                  {t.groundedEvidence}
                </RadioOption>
              </RadioGroup>
              {copyDraft.groundedIn === 'EVIDENCE' && (
                <Input
                  disableForm
                  label={t.evidenceIdLabel}
                  name="copy-evidence-id"
                  value={copyDraft.evidenceId}
                  onChange={(event) =>
                    setCopyDraft((current) =>
                      current ? { ...current, evidenceId: event.target.value } : current
                    )
                  }
                />
              )}
            </div>

            <p className="cf-caption text-cf-ink-muted">{t.oldUnchanged}</p>
          </form>
        </Dialog>
      )}
    </section>
  );
}

export default ContentFactsShowcase;
