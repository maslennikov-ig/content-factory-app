'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import {
  CLAIM_KEY_PATTERN,
  FACTS_API,
  buildFactCreatePayload,
  emptyFactDraft,
  failureNotice,
  isUsableFact,
  jsonReader,
  readFactsEnvelope,
  readFailure,
  screenState,
  type FactDraft,
  type FactFailure,
  type FactLanguage,
  type FactRow,
  type FactTemporalKind,
} from './content-facts.adapter';

/**
 * The door into working memory that `BriefFactV1.factId` was written for.
 *
 * `POST /content-intelligence/facts` and its list existed before this file
 * did — reachable from a client, from tests, from nowhere a person could click.
 * A statement in a brief could only be grounded by pasting a URL a reader could
 * check for themselves; the workspace's own remembered facts, the half
 * `groundedBrief` verifies against this organization's memory, had no way in.
 *
 * The form lives here rather than in a screen file, the same split
 * `voice-materials.container.tsx` and `voice-brief.container.tsx` make: a
 * half-typed claim belongs to the interface until it is sent, and this section
 * has no separate screen component to own it. The refusal reading is not
 * reinvented — `content-facts.adapter.ts` imports it from
 * `voice-materials.adapter.ts`, the same source `voice-brief.adapter.ts` reads
 * from, because the fact catalogue answers behind the same `aiCreate` policy as
 * every other write under `/content-intelligence`.
 */

type Locale = FactLanguage;

const copy = {
  ru: {
    title: 'Факты рабочей памяти',
    body: 'Утверждение, которое можно назвать в брифе по идентификатору. Бриф отклонит id, которого нет в списке.',
    empty: 'Фактов пока нет. Первый добавленный появится в списке ниже.',
    formTitle: 'Добавить факт',
    claimKey: 'Ключ утверждения',
    claimKeyHelp: 'Формат «тема|атрибут», например pricing|trial_length.',
    statement: 'Утверждение',
    valueText: 'Значение',
    language: 'Язык',
    temporalKind: 'Тип во времени',
    temporalCurrent: 'Действует сейчас',
    temporalDated: 'Привязано к периоду',
    temporalTimeless: 'Не устаревает',
    effectiveFrom: 'Действует с',
    effectiveTo: 'Действует по',
    freshUntil: 'Свежо до',
    freshUntilRequiredHint: 'Для «Действует сейчас» дата обязательна — иначе факт не пройдёт проверку.',
    submit: 'Сохранить факт',
    submitting: 'Сохраняем…',
    created: (id: string) => `Факт сохранён. Идентификатор для брифа: ${id}`,
    listLoading: 'Загружаем список фактов',
    idLabel: 'id',
    statusLabel: {
      UNVERIFIED: 'Не проверен',
      VERIFIED: 'Подтверждён',
      CONFLICTED: 'Противоречие',
      STALE: 'Устарел',
      TOMBSTONED: 'Удалён',
      RETRACTED: 'Отозван',
      SUPERSEDED: 'Заменён',
    } as Record<string, string>,
    unusable: 'Бриф не примет этот id: факт больше не действует.',
    copyId: 'Скопировать id',
    copiedId: 'Скопирован',
    listCapped:
      'Показаны первые 100 фактов по алфавиту ключа. Идентификатор только что сохранённого факта всегда есть в сообщении выше.',
    createFallback:
      'Факт не сохранился. Ничего не потеряно — проверьте поля и попробуйте ещё раз.',
    listFallback: 'Список фактов не загрузился. Попробуйте ещё раз.',
  },
  en: {
    title: 'Working memory facts',
    body: 'A claim a brief can cite by id. The brief refuses an id that is not in this list.',
    empty: 'No facts yet. The first one you add appears in the list below.',
    formTitle: 'Add a fact',
    claimKey: 'Claim key',
    claimKeyHelp: 'Shape is "topic|attribute", e.g. pricing|trial_length.',
    statement: 'Statement',
    valueText: 'Value',
    language: 'Language',
    temporalKind: 'How it ages',
    temporalCurrent: 'Holds right now',
    temporalDated: 'Tied to a period',
    temporalTimeless: 'Never goes stale',
    effectiveFrom: 'Effective from',
    effectiveTo: 'Effective to',
    freshUntil: 'Fresh until',
    freshUntilRequiredHint:
      'Required for "Holds right now" — without it the fact fails validation.',
    submit: 'Save fact',
    submitting: 'Saving…',
    created: (id: string) => `Fact saved. Id for the brief: ${id}`,
    listLoading: 'Loading the facts',
    idLabel: 'id',
    statusLabel: {
      UNVERIFIED: 'Unverified',
      VERIFIED: 'Verified',
      CONFLICTED: 'Conflicted',
      STALE: 'Stale',
      TOMBSTONED: 'Removed',
      RETRACTED: 'Retracted',
      SUPERSEDED: 'Superseded',
    } as Record<string, string>,
    unusable: 'The brief will refuse this id: the fact no longer holds.',
    copyId: 'Copy id',
    copiedId: 'Copied',
    listCapped:
      'The first 100 facts by key are shown. The id of a fact you just saved is always in the message above.',
    createFallback:
      'The fact was not saved. Nothing is lost — check the fields and try again.',
    listFallback: 'The fact list did not load. Try again.',
  },
} as const;

export function ContentFactsContainer() {
  const request = useFetch();
  const { language } = useVariables();
  const locale: Locale = String(language ?? 'ru').toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
  const t = copy[locale];
  const read = useMemo(() => jsonReader(request), [request]);

  const facts = useSWR(FACTS_API, () => read(FACTS_API), {
    revalidateOnFocus: false,
  });

  const [draft, setDraft] = useState<FactDraft>(() => emptyFactDraft(locale));
  const [failure, setFailure] = useState<FactFailure | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The id is the whole point of this list, and it is a cuid nobody retypes.
   *
   * Read after mount rather than during render: this is a client component
   * but Next still renders it on the server, where `navigator` does not
   * exist, and branching on it during render would make the first client
   * paint disagree with the server's. The button simply does not appear
   * where the clipboard is unavailable — the id itself stays selectable
   * text, so nothing is lost, only made harder.
   */
  const [canCopy, setCanCopy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  useEffect(() => {
    setCanCopy(typeof navigator !== 'undefined' && !!navigator.clipboard);
  }, []);

  const copyId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
    } catch {
      // A clipboard the browser refused is not a failure worth a red box
      // over a list that is still readable. The id stays on screen.
      setCopiedId(null);
    }
  }, []);

  const rows: readonly FactRow[] = readFactsEnvelope(facts.data);
  const claimKeyValid =
    draft.claimKey.trim() === '' || CLAIM_KEY_PATTERN.test(draft.claimKey.trim());

  const submit = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    setCreated(null);
    try {
      const response = await read(FACTS_API, {
        method: 'POST',
        body: JSON.stringify(buildFactCreatePayload(draft)),
      });
      setDraft(emptyFactDraft(locale));
      setCreated(t.created(String(response?.id ?? '')));
      await facts.mutate();
    } catch (error) {
      setFailure(readFailure(error, t.createFallback));
    } finally {
      setBusy(false);
    }
  }, [draft, facts, locale, read, t]);

  const shownFailure =
    failure ?? (facts.error ? readFailure(facts.error, t.listFallback) : null);
  const state = screenState({
    failure: shownFailure,
    busy,
    loaded: !!facts.data || !!facts.error,
  });

  return (
    <section
      data-content-intelligence-section="facts"
      aria-labelledby="content-facts-title"
      className="scroll-mt-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
    >
      <h2
        id="content-facts-title"
        tabIndex={-1}
        className="cf-heading-md text-cf-ink [text-wrap:balance]"
      >
        {t.title}
      </h2>
      <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t.body}
      </p>

      {shownFailure && (
        <p
          role="alert"
          className="mt-[16px] rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {failureNotice(shownFailure)}
        </p>
      )}
      {!shownFailure && created && (
        <p
          role="status"
          className="mt-[16px] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {created}
        </p>
      )}

      <form
        data-content-facts-form="true"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="mt-[16px] grid gap-x-[16px] gap-y-[12px] md:grid-cols-2"
      >
        <h3 className="mb-[4px] cf-label-md text-cf-ink md:col-span-2">
          {t.formTitle}
        </h3>
        <Input
          disableForm
          fieldClassName="md:col-span-2"
          label={t.claimKey}
          helper={t.claimKeyHelp}
          error={!claimKeyValid ? t.claimKeyHelp : undefined}
          name="claimKey"
          placeholder="pricing|trial_length"
          value={draft.claimKey}
          onChange={(event) =>
            setDraft((current) => ({ ...current, claimKey: event.target.value }))
          }
          disabled={busy}
          required
        />
        <Select
          disableForm
          label={t.language}
          name="language"
          value={draft.language}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              language: event.target.value as FactLanguage,
            }))
          }
          disabled={busy}
        >
          <option value="ru">ru</option>
          <option value="en">en</option>
        </Select>
        <Select
          disableForm
          label={t.temporalKind}
          name="temporalKind"
          value={draft.temporalKind}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              temporalKind: event.target.value as FactTemporalKind,
            }))
          }
          disabled={busy}
        >
          <option value="TIMELESS">{t.temporalTimeless}</option>
          <option value="DATED">{t.temporalDated}</option>
          <option value="CURRENT">{t.temporalCurrent}</option>
        </Select>
        <Textarea
          disableForm
          fieldClassName="md:col-span-2"
          label={t.statement}
          name="statement"
          value={draft.statement}
          onChange={(event) =>
            setDraft((current) => ({ ...current, statement: event.target.value }))
          }
          disabled={busy}
          required
        />
        <Input
          disableForm
          fieldClassName="md:col-span-2"
          label={t.valueText}
          name="valueText"
          value={draft.valueText}
          onChange={(event) =>
            setDraft((current) => ({ ...current, valueText: event.target.value }))
          }
          disabled={busy}
          required
        />
        <Input
          disableForm
          label={t.freshUntil}
          helper={
            draft.temporalKind === 'CURRENT' ? t.freshUntilRequiredHint : undefined
          }
          type="date"
          name="freshUntil"
          value={draft.freshUntil}
          onChange={(event) =>
            setDraft((current) => ({ ...current, freshUntil: event.target.value }))
          }
          disabled={busy}
          required={draft.temporalKind === 'CURRENT'}
        />
        <Input
          disableForm
          label={t.effectiveFrom}
          type="date"
          name="effectiveFrom"
          value={draft.effectiveFrom}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              effectiveFrom: event.target.value,
            }))
          }
          disabled={busy}
        />
        <Input
          disableForm
          label={t.effectiveTo}
          type="date"
          name="effectiveTo"
          value={draft.effectiveTo}
          onChange={(event) =>
            setDraft((current) => ({ ...current, effectiveTo: event.target.value }))
          }
          disabled={busy}
        />
        <div className="md:col-span-2">
          <Button type="submit" variant="primary" disabled={busy || !claimKeyValid}>
            {busy ? t.submitting : t.submit}
          </Button>
        </div>
      </form>

      <div className="mt-[20px] border-t border-cf-border pt-[16px]">
        {state === 'loading' && !facts.data ? (
          <p aria-busy="true" className="cf-body-sm text-cf-ink-muted">
            {t.listLoading}
          </p>
        ) : rows.length === 0 ? (
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.empty}</p>
        ) : (
          <ul className="divide-y divide-cf-border">
            {rows.map((fact) => {
              const usable = isUsableFact(fact.status);
              return (
                <li
                  key={fact.id}
                  data-content-fact-id={fact.id}
                  data-content-fact-usable={String(usable)}
                  className="py-[12px]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-[8px]">
                    <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
                      {fact.statement}
                    </p>
                    {/*
                      A status this screen does not know is printed as it
                      arrived. `ContentFact.status` is a free `String` column,
                      so the nearest known word would be a guess wearing the
                      confidence of a label.
                    */}
                    <span className="cf-caption text-cf-ink-muted">
                      {t.statusLabel[fact.status] ?? fact.status}
                    </span>
                  </div>
                  <div className="mt-[4px] flex flex-wrap items-center gap-[8px]">
                    <p className="break-all cf-caption text-cf-ink-muted">
                      {fact.claimKey} · {t.idLabel}: {fact.id}
                    </p>
                    {canCopy && (
                      <Button
                        type="button"
                        variant="quiet"
                        density="dense"
                        data-content-fact-copy={fact.id}
                        onClick={() => void copyId(fact.id)}
                      >
                        {copiedId === fact.id ? t.copiedId : t.copyId}
                      </Button>
                    )}
                  </div>
                  {!usable && (
                    <p className="mt-[4px] max-w-[72ch] cf-caption text-cf-ink [text-wrap:pretty]">
                      {t.unusable}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {/*
          `listFacts` answers with `take: 100`, ordered by claim key rather
          than by age. Said plainly, because the sentence at the top of this
          card — the brief refuses an id that is not in this list — stops
          being true at the hundred-and-first fact, and a person hunting a
          missing id deserves to know the list is the thing that is short.
        */}
        {rows.length >= 100 && (
          <p className="mt-[12px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.listCapped}
          </p>
        )}
      </div>
    </section>
  );
}

export default ContentFactsContainer;
