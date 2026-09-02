'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { useIntegrationList } from '@contentfactory/frontend/components/launches/helpers/use.integration.list';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Textarea } from '@contentfactory/react/form/textarea';
import { VoiceBriefScreen } from './voice-brief.screen';
import { voiceCopy, type VoiceLocale } from './voice-copy';
import { ContentFactsContainer } from '../content-intelligence/content-facts.container';
import {
  EDITOR_MODAL,
  editorChannels,
  editorDate,
  postEndpoint,
} from './voice-materials.adapter';
import {
  BRIEF_ROUTES,
  briefCopy,
  buildBriefPayload,
  emptyBrief,
  failureNotice,
  jsonReader,
  readBrief,
  readDraftOutcome,
  readFailure,
  screenState,
  type BriefDraft,
  type BriefFailure,
  type BriefReading,
} from './voice-brief.adapter';

/**
 * The Brief tab: the radar, the gate, and the draft that comes out of them.
 *
 * The screen was built by `content-factory-next-36r` and is not touched here.
 * What this owns is the requests, the brief being typed, which topic is
 * picked and what a refusal looks like — the same split
 * `voice-materials.container.tsx` makes, for the same reason.
 *
 * The form lives here rather than in the screen because that is what the
 * contract's registry says: the screen draws the radar, the verdict and the
 * gate, and everything a person is halfway through typing belongs to the
 * interface until it is submitted. The wizard's own intake form sits beside
 * its screen for exactly this reason.
 *
 * Nothing here reaches a platform. `/brief/draft` writes a post in `DRAFT` and
 * hands back its id; it is opened in the product's own editor and published by
 * the ordinary path — the rule `docs/product/migration-map.md` states.
 */

export function VoiceBriefContainer() {
  const request = useFetch();
  const modal = useModals();
  const { language } = useVariables();
  const locale: VoiceLocale = String(language ?? 'ru')
    .toLowerCase()
    .startsWith('ru')
    ? 'ru'
    : 'en';
  const t = voiceCopy[locale];
  const w = briefCopy[locale];

  const read = useMemo(() => jsonReader(request), [request]);
  const { data: channels } = useIntegrationList();

  const radar = useSWR(BRIEF_ROUTES.radar, () => read(BRIEF_ROUTES.radar), {
    revalidateOnFocus: false,
  });

  const [draft, setDraft] = useState<BriefDraft>(emptyBrief);
  const [verdict, setVerdict] = useState<BriefReading | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | undefined>();
  const [failure, setFailure] = useState<BriefFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  /**
   * One place a refusal can land.
   *
   * Three actions here can be refused and each refusing differently is how a
   * surface ends up with three ways of saying the same thing and one path that
   * says nothing at all.
   */
  const run = useCallback(
    async (fallback: string, work: () => Promise<void>) => {
      setBusy(true);
      setFailure(null);
      try {
        await work();
      } catch (error) {
        setFailure(readFailure(error, fallback));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  // The radar's answer before anything was typed, and the gate's answer after.
  // The second replaces the first rather than merging with it: a verdict is
  // about the brief as it now stands.
  const shown: BriefReading = useMemo(
    () => verdict ?? readBrief(radar.data),
    [radar.data, verdict]
  );

  const evaluate = useCallback(
    () =>
      run(w.evaluateFailure, async () => {
        const answer = await read(BRIEF_ROUTES.evaluate, {
          method: 'POST',
          body: JSON.stringify({
            ...buildBriefPayload(draft),
            language: locale,
          }),
        });
        setNotice(null);
        setVerdict(readBrief(answer, shown));
      }),
    [draft, locale, read, run, shown, w.evaluateFailure]
  );

  /**
   * The draft, opened in the editor the product already has.
   *
   * The editor is the heaviest tree in the application and this tab must not
   * carry it until somebody asks for it, which is why it arrives here rather
   * than at the top of the file.
   */
  const createDraft = useCallback(
    () =>
      run(w.draftFailure, async () => {
        const outcome = readDraftOutcome(
          await read(BRIEF_ROUTES.draft, {
            method: 'POST',
            body: JSON.stringify({
              ...buildBriefPayload(draft),
              language: locale,
            }),
          })
        );
        if (outcome.outcome === 'insufficient') {
          // Not a failure: the gate answered with what is still missing, and
          // that is the useful half of the answer.
          setVerdict({ ...shown, questions: outcome.questions });
          return;
        }

        const existing = await read(postEndpoint(outcome.postId));
        const [{ AddEditModal }, { ExistingDataContextProvider }] =
          await Promise.all([
            import('@contentfactory/frontend/components/new-launch/add.edit.modal'),
            import(
              '@contentfactory/frontend/components/launches/helpers/use.existing.data'
            ),
          ]);
        const editorChannelList = editorChannels(existing, channels);
        modal.openModal({
          ...EDITOR_MODAL,
          children: (
            <ExistingDataContextProvider value={existing}>
              <AddEditModal
                allIntegrations={editorChannelList.allIntegrations}
                integrations={editorChannelList.integrations}
                date={editorDate(existing)}
                reopenModal={() => createDraft()}
                mutate={() => {
                  // The radar ranks against what the workspace has published;
                  // a new draft is a new candidate's worth of evidence.
                  void radar.mutate();
                }}
              />
            </ExistingDataContextProvider>
          ),
        });
        setOpened(true);
        setNotice(w.draftOpened);
      }),
    [channels, draft, locale, modal, radar, read, run, shown, w.draftFailure, w.draftOpened]
  );

  /**
   * Taking a topic into the brief.
   *
   * It fills the thesis only when the thesis is empty. A topic is a suggestion
   * of what to write about and the thesis is the claim being made; overwriting
   * a sentence somebody already typed would lose the one thing the radar
   * cannot suggest.
   */
  const pickTopic = useCallback(
    (id: string) => {
      const topic = shown.topics.find((one) => one.id === id);
      setSelectedTopicId(id);
      setFailure(null);
      if (!topic) return;
      setNotice(w.picked(topic.title));
      setDraft((current) =>
        current.thesis.trim() ? current : { ...current, thesis: topic.title }
      );
    },
    [shown.topics, w]
  );

  /**
   * A fresh fact from the memory door embedded below, taken straight into
   * the brief being typed.
   *
   * The one empty, untouched row is reused rather than always appending —
   * `emptyBrief()` always starts with exactly one — so opening the tab and
   * saving a fact right away does not leave a blank row above the one that
   * matters. Anything already typed is never overwritten.
   */
  const handleFactCreated = useCallback(
    (fact: { id: string; statement: string }) => {
      setNotice(w.factsMemoryAdded(fact.statement));
      setDraft((current) => {
        const blankIndex = current.facts.findIndex(
          (row) => !row.statement.trim() && !row.sourceUrl.trim() && !row.factId.trim()
        );
        const filled = { statement: fact.statement, sourceUrl: '', factId: fact.id };
        if (blankIndex >= 0) {
          return {
            ...current,
            facts: current.facts.map((row, at) =>
              at === blankIndex ? filled : row
            ),
          };
        }
        return { ...current, facts: [...current.facts, filled] };
      });
    },
    [w]
  );

  const shownFailure =
    failure ?? (radar.error ? readFailure(radar.error, w.radarFailure) : null);

  const field = (
    key: keyof Pick<
      BriefDraft,
      'goal' | 'thesis' | 'channel' | 'format' | 'position' | 'disagreement' | 'audience'
    >,
    label: string,
    long: boolean,
    optional = false
  ) => (
    <div className="min-w-0" key={key}>
      {long ? (
        <>
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {label}
            {optional ? ` · ${w.optional}` : ''}
          </p>
          <Textarea
            standalone
            layout="content"
            name={`brief-${key}`}
            aria-label={label}
            className="mt-[4px] w-full"
            value={draft[key]}
            onChange={(event) =>
              setDraft((current) => ({ ...current, [key]: event.target.value }))
            }
          />
        </>
      ) : (
        <Input
          standalone
          removeError
          name={`brief-${key}`}
          label={optional ? `${label} · ${w.optional}` : label}
          value={draft[key]}
          onChange={(event) =>
            setDraft((current) => ({ ...current, [key]: event.target.value }))
          }
        />
      )}
    </div>
  );

  return (
    <section
      data-content-panel="brief"
      className="flex min-w-0 flex-col gap-[20px]"
    >
      <VoiceBriefScreen
        locale={locale}
        state={screenState({
          failure: shownFailure,
          busy,
          loaded: !!radar.data || !!radar.error,
          opened,
          selected: !!selectedTopicId,
        })}
        topics={shown.topics}
        selectedTopicId={selectedTopicId}
        brief={shown.brief}
        questions={shown.questions}
        ungroundedFacts={shown.ungroundedFacts}
        notice={
          shownFailure ? failureNotice(shownFailure) : notice ?? shown.notice
        }
        onPick={pickTopic}
        onCreateDraft={() => void createDraft()}
      />

      <form
        data-voice-brief-form="true"
        onSubmit={(event) => {
          event.preventDefault();
          void evaluate();
        }}
        className="flex min-w-0 flex-col gap-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
      >
        <div>
          <h3 className="cf-label-sm uppercase text-cf-ink-muted">
            {w.formTitle}
          </h3>
          <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {w.formLead}
          </p>
        </div>

        {field('thesis', t.briefThesis, true)}
        {field('position', t.briefPosition, true)}
        {field('disagreement', t.briefDisagreement, true)}

        <div className="grid min-w-0 gap-[12px] sm:grid-cols-2">
          {field('audience', t.briefAudience, false)}
          {field('channel', t.briefChannel, false, true)}
          {field('goal', t.briefGoal, false, true)}
          {field('format', t.briefFormat, false, true)}
        </div>

        <div className="min-w-0">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.briefFacts}
          </p>
          <div className="mt-[8px] flex flex-col gap-[12px]">
            {draft.facts.map((fact, index) => (
              <div
                key={index}
                data-voice-brief-fact={index}
                className="grid min-w-0 gap-[8px] sm:grid-cols-2"
              >
                <div className="sm:col-span-2">
                  <Input
                    standalone
                    removeError
                    name={`brief-fact-${index}`}
                    label={w.factStatement}
                    value={fact.statement}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        facts: current.facts.map((one, at) =>
                          at === index
                            ? { ...one, statement: event.target.value }
                            : one
                        ),
                      }))
                    }
                  />
                </div>
                <Input
                  standalone
                  removeError
                  name={`brief-fact-source-${index}`}
                  label={w.factSource}
                  value={fact.sourceUrl}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      facts: current.facts.map((one, at) =>
                        at === index
                          ? { ...one, sourceUrl: event.target.value }
                          : one
                      ),
                    }))
                  }
                />
                {/*
                  The other way to ground the same fact: an id from this
                  workspace's own memory instead of a link a reader can check.
                  The hint names exactly where that id comes from — once, on
                  the first row, so adding a second or third fact does not
                  repeat the same sentence down the form.
                */}
                <Input
                  standalone
                  removeError
                  name={`brief-fact-id-${index}`}
                  label={t.briefFactId}
                  helper={index === 0 ? t.briefFactIdHint : undefined}
                  value={fact.factId}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      facts: current.facts.map((one, at) =>
                        at === index
                          ? { ...one, factId: event.target.value }
                          : one
                      ),
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  facts: [
                    ...current.facts,
                    { statement: '', sourceUrl: '', factId: '' },
                  ],
                }))
              }
            >
              {w.addFact}
            </Button>
            {draft.facts.length > 1 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    facts: current.facts.slice(0, -1),
                  }))
                }
              >
                {w.removeFact}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-[8px]">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? w.checking : w.check}
          </Button>
        </div>
      </form>

      {/*
        `content-factory-next-odb8.2`: the door «Откуда факты» only shows,
        right below the question that made it necessary in the first place.
        A sibling of the brief's own `<form>` rather than a child of it — an
        HTML form cannot nest another, and this is the exact form the witness
        screen's rows come from, not a second one guessing at the same DTO.
      */}
      <div className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
        <h4 className="cf-label-sm uppercase text-cf-ink-muted">
          {w.factsMemoryTitle}
        </h4>
        <p className="mt-[4px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {w.factsMemoryLead}
        </p>
        <div className="mt-[12px]">
          <ContentFactsContainer onFactCreated={handleFactCreated} />
        </div>
      </div>
    </section>
  );
}

export default VoiceBriefContainer;
