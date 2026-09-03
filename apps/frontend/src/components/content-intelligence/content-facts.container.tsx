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
import {
  suggestClaimKey,
  type AcceptedEvidence,
} from './content-search.adapter';
import { resolveContentLocale } from './content-section.copy';

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
    evidenceTitle: 'К этому факту привяжется найденное',
    evidenceLead:
      'Фрагмент уже заморожен вместе со ссылкой и датой чтения. Сохраните факт — доказательство встанет на него, но подтверждённым не станет: подтвердить его нужно на витрине «Откуда факты».',
    evidenceDrop: 'Не привязывать',
    evidenceLinked:
      'Доказательство привязано. Подтвердить его можно на витрине «Откуда факты».',
    evidenceLinkFallback:
      'Факт сохранён, а доказательство к нему не привязалось. Найдите факт на витрине и привяжите ещё раз.',
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
    evidenceTitle: 'What was found will attach to this fact',
    evidenceLead:
      'The excerpt is already frozen together with its link and the date it was read. Save the fact and the evidence attaches to it — still unconfirmed: confirm it on the "Where facts come from" screen.',
    evidenceDrop: 'Do not attach',
    evidenceLinked:
      'Evidence attached. Confirm it on the "Where facts come from" screen.',
    evidenceLinkFallback:
      'The fact was saved, but the evidence did not attach to it. Find the fact on the showcase and attach it again.',
  },
} as const;

export function ContentFactsContainer({
  onFactCreated,
  pendingEvidence,
  onEvidenceDropped,
}: {
  /**
   * `content-factory-next-lh5s`: an excerpt the person accepted in the search
   * panel above, already frozen and carrying its id.
   *
   * It arrives here rather than becoming a fact of its own on the way, because
   * a found excerpt is not a claim — a claim is what the person decides the
   * excerpt shows, in their own words. The form is prefilled from it so those
   * words start from what they just read, and the evidence is attached after
   * the fact exists, which is the only order the two doors allow.
   */
  pendingEvidence?: AcceptedEvidence | null;
  /** The person changed their mind before saving. */
  onEvidenceDropped?: () => void;
  /**
   * Fired once a fact is actually saved, with the id the brief needs.
   *
   * Optional, and unused by the door this component was originally built
   * for (`content-facts.adapter.ts`'s doc comment): the "Происхождение" tab
   * had nowhere else for a freshly created id to go but the list below the
   * form. The brief (`content-factory-next-odb8.2`) embeds this same form
   * where the question "чем подтвердишь" is asked and uses the callback to
   * carry the id straight into its own fact row, so a person never retypes
   * or copy-pastes what they just typed here.
   */
  onFactCreated?: (fact: { id: string; claimKey: string; statement: string }) => void;
} = {}) {
  const evidenceId = pendingEvidence?.evidenceId ?? null;
  const request = useFetch();
  const { language } = useVariables();
  const locale: Locale = resolveContentLocale(language);
  const t = copy[locale];
  const read = useMemo(() => jsonReader(request), [request]);

  const facts = useSWR(FACTS_API, () => read(FACTS_API), {
    revalidateOnFocus: false,
  });

  const [draft, setDraft] = useState<FactDraft>(() => emptyFactDraft(locale));
  const [failure, setFailure] = useState<FactFailure | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    A newly accepted excerpt suggests the key, once per excerpt, and nothing
    else. It used to fill the statement too — and a statement is the person's
    own word (§9.5), admitted to the unified context before the evidence is
    confirmed, so the product's text became «own word» by a pre-filled field.
    The excerpt is quoted beside the form instead; the words are theirs
    (`content-factory-next-d1rx`, 03.09.2026).
  */
  useEffect(() => {
    if (!pendingEvidence) return;
    setDraft((current) => ({
      ...current,
      claimKey: current.claimKey || suggestClaimKey(pendingEvidence),
    }));
    setCreated(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceId]);

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
      const id = String(response?.id ?? '');
      setDraft(emptyFactDraft(locale));
      let message = t.created(id);

      /*
        The fact exists; now the excerpt it stands on. Two calls rather than
        one because `CreateContentFactDto` has no `evidenceId` field — evidence
        belongs to a fact that already exists, and inventing a combined door
        here would be a third way to do what two doors already do.

        A failure at this step is reported without losing the fact: the fact is
        saved and its id is in the message, so the person is told what did
        happen and what did not, rather than seeing one red box over both.
      */
      if (id && evidenceId) {
        try {
          await read(`${FACTS_API}/${id}/evidence`, {
            method: 'POST',
            body: JSON.stringify({ evidenceId, stance: 'SUPPORTS' }),
          });
          message = `${message} ${t.evidenceLinked}`;
          onEvidenceDropped?.();
        } catch {
          message = `${message} ${t.evidenceLinkFallback}`;
        }
      }

      setCreated(message);
      await facts.mutate();
      if (id) {
        onFactCreated?.({
          id,
          claimKey: draft.claimKey.trim(),
          statement: draft.statement.trim(),
        });
      }
    } catch (error) {
      setFailure(readFailure(error, t.createFallback));
    } finally {
      setBusy(false);
    }
  }, [
    draft,
    evidenceId,
    facts,
    locale,
    onEvidenceDropped,
    onFactCreated,
    read,
    t,
  ]);

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

      {pendingEvidence && (
        <div
          data-content-facts-pending-evidence={pendingEvidence.evidenceId}
          className="mt-[16px] rounded-[8px] border border-cf-info bg-cf-info-soft p-[12px]"
        >
          <h3 className="cf-label-sm uppercase text-cf-ink">
            {t.evidenceTitle}
          </h3>
          <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
            {pendingEvidence.excerpt}
          </p>
          <div className="mt-[8px] flex flex-wrap items-center gap-[12px]">
            <a
              href={pendingEvidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all cf-caption text-cf-ink underline"
            >
              {pendingEvidence.title || pendingEvidence.url}
            </a>
            {pendingEvidence.retrievedAt && (
              <span className="cf-caption text-cf-ink">
                {pendingEvidence.retrievedAt.slice(0, 10)}
              </span>
            )}
            {onEvidenceDropped && (
              <Button
                type="button"
                variant="quiet"
                density="dense"
                data-content-facts-evidence-drop="true"
                onClick={onEvidenceDropped}
              >
                {t.evidenceDrop}
              </Button>
            )}
          </div>
          <p className="mt-[8px] max-w-[72ch] cf-caption text-cf-ink [text-wrap:pretty]">
            {t.evidenceLead}
          </p>
        </div>
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
