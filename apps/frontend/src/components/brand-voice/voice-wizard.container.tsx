'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { Input } from '@contentfactory/react/form/input';
import { Textarea } from '@contentfactory/react/form/textarea';
import type {
  VoicePathKeyV1,
  VoiceScreenStateV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import { VoiceEmptyScreen } from './voice-empty.screen';
import { VoicePathsScreen } from './voice-paths.screen';
import { VoiceSamplesScreen, type SampleOriginLabel } from './voice-samples.screen';
import { VoiceAnalysisScreen } from './voice-analysis.screen';
import { VoiceProposalScreen, type ProposalFieldKey } from './voice-proposal.screen';
import type { VoiceLocale } from './voice-copy';
import {
  ANALYSIS_POLL_MS,
  ANALYSIS_TIMEOUT_MS,
  VOICE_ROUTES,
  buildFilePayload,
  buildIntakePayload,
  chooseFiles,
  emptyIntake,
  intakeNotice,
  pause,
  pickedRefusalNote,
  proposalRoutesFor,
  readAnalysis,
  readOverview,
  readPaths,
  readProposal,
  readSamples,
  shortfallText,
  voiceFailureFrom,
  voiceHttpError,
  wizardCopy,
  type AnalysisReading,
  type IntakeDraft,
  type VoiceFailure,
} from './voice-wizard.adapter';

/**
 * The wizard: no voice yet (01), the three ways in (02), the corpus (03), the
 * analysis, the proposal (05) — on the routes that feed them.
 *
 * The screens were accepted by `36r` and are not redrawn. This owns the
 * requests, the step, and the handful of things the interface itself decides:
 * which rows are ticked, which path was chosen, whether the consent sentence
 * has been read. Everything a person reads about *what is* comes back from the
 * server — the corpus, the decided fields, the shortfall, the reason a door is
 * shut — which is also why a reload loses none of it.
 *
 * Screen 04 stays on this step rather than falling through to the proposal
 * the moment the deterministic pass answers `ready`: the person gets to read
 * what was counted — the vocabulary, the punctuation habits, anything left
 * out — before choosing to move on, the same way every other step in this
 * wizard is a stop rather than a flicker.
 */

export type VoiceWizardStep = 'empty' | 'paths' | 'samples' | 'analysis' | 'proposal';

type Surface = 'overview' | 'paths' | 'samples' | 'analysis' | 'proposal';

type Banner = { tone: 'status' | 'alert'; text: string };

type SurfaceNotice = { surface: Surface; text: string; tone: 'success' };

const BANNER_CLASS =
  'rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]';
const ALERT_CLASS =
  'rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]';

export function VoiceWizardContainer({
  avatarId,
}: {
  /**
   * Which avatar this run of the wizard is building.
   *
   * Only the routes that write or read a *version* carry it: the proposal, its
   * five fields, the portrait and the activation. The corpus does not — samples
   * and measurements belong to the space rather than to an avatar, so scoping
   * `/samples` would promise a separation the storage does not have.
   *
   * Absent means the space's default, which is what all of these meant while a
   * space held one profile.
   */
  avatarId?: string;
} = {}) {
  const request = useFetch();
  const { language } = useVariables();
  const locale: VoiceLocale = String(language ?? 'ru')
    .toLowerCase()
    .startsWith('ru')
    ? 'ru'
    : 'en';
  const w = wizardCopy[locale];

  const [step, setStep] = useState<VoiceWizardStep>('empty');
  const [chosenPath, setChosenPath] = useState<VoicePathKeyV1 | undefined>();
  const [selectedCodes, setSelectedCodes] = useState<readonly string[]>([]);
  const [consentGiven, setConsentGiven] = useState(false);
  const [intake, setIntake] = useState<IntakeDraft | null>(null);
  // The picked files, which only this browser knows about until they are sent.
  const [upload, setUpload] = useState<{
    phase: 'idle' | 'chosen' | 'sending';
    files: File[];
    refused: { name: string; note: string }[];
  }>({ phase: 'idle', files: [], refused: [] });
  const [fileRights, setFileRights] = useState({
    confirmed: false,
    retentionUntil: '',
  });
  const [failure, setFailure] = useState<
    { surface: Surface; failure: VoiceFailure } | null
  >(null);
  const [notice, setNotice] = useState<SurfaceNotice | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState<AnalysisReading | null>(null);
  const [analysisResult, setAnalysisResult] = useState<
    Extract<AnalysisReading, { outcome: 'ready' }> | null
  >(null);
  const [shortfall, setShortfall] = useState<{
    missingChars: number;
    missingSamples: number;
  } | null>(null);
  const analysisRun = useRef(0);
  const analysisAbort = useRef<AbortController | null>(null);

  // Leaving the section ends the run rather than leaving it to finish into a
  // component nobody is looking at any more.
  useEffect(
    () => () => {
      analysisRun.current += 1;
      analysisAbort.current?.abort();
    },
    []
  );

  /** The route, with the avatar it is about. See the prop's own note. */
  const scoped = useCallback(
    (path: string) =>
      avatarId ? `${path}?avatar=${encodeURIComponent(avatarId)}` : path,
    [avatarId]
  );

  const read = useCallback(
    async (route: string, init?: RequestInit) => {
      const response = await request(route, init);
      if (!response.ok) throw await voiceHttpError(response);
      return response.status === 204 ? null : response.json();
    },
    [request]
  );

  const overviewQuery = useSWR(
    scoped(VOICE_ROUTES.overview),
    () => read(scoped(VOICE_ROUTES.overview)),
    { revalidateOnFocus: false }
  );
  const pathsQuery = useSWR(
    step === 'paths' ? VOICE_ROUTES.paths : null,
    () => read(VOICE_ROUTES.paths),
    { revalidateOnFocus: false }
  );
  // Scoped like every other corpus call: since 2026-08-26 a text belongs to an
  // avatar, and an unscoped read would show one avatar the whole space.
  const samplesQuery = useSWR(
    step === 'samples' ? scoped(VOICE_ROUTES.samples) : null,
    () => read(scoped(VOICE_ROUTES.samples)),
    { revalidateOnFocus: false }
  );
  // Which pair of routes screen 05 sits on is the one thing the chosen path
  // decides here. What it *shows* comes back from whichever of them answered.
  const proposalRoutes = proposalRoutesFor(chosenPath);
  const proposalQuery = useSWR(
    step === 'proposal' ? scoped(proposalRoutes.read) : null,
    () => read(scoped(proposalRoutes.read)),
    { revalidateOnFocus: false }
  );

  const overview = useMemo(
    () => readOverview(overviewQuery.data),
    [overviewQuery.data]
  );
  const paths = useMemo(
    () => readPaths(pathsQuery.data, overview.paths),
    [overview.paths, pathsQuery.data]
  );
  const samples = useMemo(
    () => readSamples(samplesQuery.data),
    [samplesQuery.data]
  );
  const proposal = useMemo(
    () => readProposal(proposalQuery.data),
    [proposalQuery.data]
  );

  const canManage = overview.permissions.canCreate;

  /** A refusal a screen has to show, from either the query or an action. */
  const failureOn = (surface: Surface, queryError?: unknown): VoiceFailure | null => {
    if (queryError) return voiceFailureFrom(queryError, locale);
    return failure?.surface === surface ? failure.failure : null;
  };

  const noticeOn = (surface: Surface) =>
    notice?.surface === surface ? notice.text : undefined;

  const fail = useCallback(
    (surface: Surface, error: unknown) => {
      setNotice(null);
      setFailure({ surface, failure: voiceFailureFrom(error, locale) });
    },
    [locale]
  );

  /* --------------------------------------------------------------------
   * Actions
   * ----------------------------------------------------------------- */

  const goTo = useCallback((next: VoiceWizardStep) => {
    setFailure(null);
    setNotice(null);
    setShortfall(null);
    setAnalysisResult(null);
    setStep(next);
  }, []);

  const choosePath = useCallback(
    (path: VoicePathKeyV1) => {
      setChosenPath(path);
      // Filling the five lines by hand needs no corpus, so that path goes
      // straight to screen 05 — where it now has a form of its own to land in
      // rather than a proposal the model never made.
      goTo(path === 'manual' ? 'proposal' : 'samples');
    },
    [goTo]
  );

  /**
   * The analysis, with an end.
   *
   * Three things give it one. The abort cuts a request that never answers, so
   * the spinner cannot outlive it. The run counter drops an answer that
   * arrives after the person moved on, instead of dragging them back. And
   * `pending` is followed rather than parked: the deterministic pass finishes
   * in the POST, the agent pass may not, and a step that stopped reading at
   * the first `pending` would leave a finished analysis unshown.
   */
  const runAnalysis = useCallback(async () => {
    const run = ++analysisRun.current;
    const controller = new AbortController();
    analysisAbort.current = controller;
    const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
    setFailure(null);
    setNotice(null);
    setShortfall(null);
    setProgress(null);
    setAnalysisResult(null);
    setAnalysing(true);
    setStep('analysis');
    try {
      let result = readAnalysis(
        await read(VOICE_ROUTES.analysis, {
          method: 'POST',
          body: JSON.stringify({ language: locale, withAssist: true }),
          signal: controller.signal,
        })
      );
      let asked = 0;
      while (result.outcome === 'pending' && !controller.signal.aborted) {
        if (run !== analysisRun.current) return;
        setProgress(result);
        // The first re-read is immediate — the server has just said it is
        // working — and every one after it waits, so a long run is followed
        // rather than hammered.
        if (asked > 0) await pause(ANALYSIS_POLL_MS, controller.signal);
        asked += 1;
        result = readAnalysis(
          await read(VOICE_ROUTES.analysis, { signal: controller.signal })
        );
      }
      if (run !== analysisRun.current) return;
      if (result.outcome === 'pending') {
        // Aborted mid-flight: the reason is the wizard's own, not the
        // server's, and it goes through the same refusal path as any other.
        throw new Error('voice analysis was cut off');
      }
      if (result.outcome === 'insufficient') {
        // A shortfall is a result. The step goes back to the corpus with the
        // numbers the server counted, and nothing announces itself as broken.
        setShortfall(result.readiness);
        setStep('samples');
        return;
      }
      // Ready stays on screen 04: the person reads what was counted before
      // choosing to move on, rather than being carried past it.
      setAnalysisResult(result);
    } catch (error) {
      if (run !== analysisRun.current) return;
      // The refusal is shown on the screen the run was on, with a way to
      // retry it in place, rather than bounced back to the corpus.
      fail('analysis', error);
      // A model that did not answer takes the proposal with it and nothing
      // else. The server keeps the arithmetic — its own refusal says so — and
      // reading it back is what makes that sentence true on screen: without
      // this the card under the refusal still said «Числа появятся, когда
      // разбор досчитает до конца» over numbers that were already counted,
      // and the only way to see them was to pay for the run again.
      try {
        // Deliberately without the run's own signal: the abort that ended the
        // run must not also cut the read that recovers what it saved.
        const saved = readAnalysis(await read(VOICE_ROUTES.analysis));
        if (run === analysisRun.current && saved.outcome === 'ready') {
          setAnalysisResult(saved);
        }
      } catch {
        // The refusal above is the answer; a second failure adds nothing.
      }
    } finally {
      clearTimeout(timer);
      if (run === analysisRun.current) {
        analysisAbort.current = null;
        setAnalysing(false);
        setProgress(null);
      }
    }
  }, [fail, locale, read]);

  /** Stopping mid-run: the request is cut, and the corpus step is where it left off. */
  const stopAnalysis = useCallback(() => {
    analysisRun.current += 1;
    analysisAbort.current?.abort();
    analysisAbort.current = null;
    setAnalysing(false);
    setProgress(null);
    goTo('samples');
  }, [goTo]);

  const submitIntake = useCallback(async () => {
    if (!intake) return;
    try {
      const response = await read(scoped(VOICE_ROUTES.samples), {
        method: 'POST',
        body: JSON.stringify(buildIntakePayload(intake, chosenPath, locale)),
      });
      setIntake(null);
      setFailure(null);
      setNotice({
        surface: 'samples',
        tone: 'success',
        text: intakeNotice(response, locale),
      });
      await samplesQuery.mutate();
    } catch (error) {
      fail('samples', error);
    }
  }, [chosenPath, fail, intake, locale, read, samplesQuery]);

  /** What the browser will send, and what it refused before sending. */
  const pickFiles = useCallback(
    (files: readonly File[]) => {
      const { picked, refused } = chooseFiles(files);
      setFailure(null);
      setNotice(null);
      setUpload({
        phase: picked.length ? 'chosen' : 'idle',
        files: picked,
        refused: refused.map((one) => ({
          name: one.name,
          note: pickedRefusalNote(one, locale),
        })),
      });
    },
    [locale]
  );

  /**
   * The batch, in one request.
   *
   * One request rather than one per file because the workspace-wide limiter
   * counts requests — ninety an hour, shared with every read this wizard makes
   * — and an afternoon's corpus would spend it a file at a time.
   */
  const sendFiles = useCallback(async () => {
    if (!upload.files.length) return;
    setUpload((current) => ({ ...current, phase: 'sending' }));
    try {
      const response = await read(scoped(VOICE_ROUTES.samplesFiles), {
        method: 'POST',
        body: buildFilePayload(
          upload.files,
          {
            rightsConfirmed: fileRights.confirmed,
            retentionUntil: fileRights.retentionUntil,
          },
          chosenPath,
          locale
        ),
      });
      setFailure(null);
      setUpload({ phase: 'idle', files: [], refused: [] });
      // A partial refusal is the ordinary case, not a failure: what was read
      // is counted, and what was not is named with the reason and the file.
      setNotice({
        surface: 'samples',
        tone: 'success',
        text: intakeNotice(response, locale),
      });
      await samplesQuery.mutate();
    } catch (error) {
      setUpload((current) => ({ ...current, phase: 'chosen' }));
      fail('samples', error);
    }
  }, [
    chosenPath,
    fail,
    fileRights.confirmed,
    fileRights.retentionUntil,
    locale,
    read,
    samplesQuery,
    upload.files,
  ]);

  const deleteSelected = useCallback(async () => {
    if (!selectedCodes.length) return;
    try {
      const response = await read(scoped(VOICE_ROUTES.samples), {
        method: 'DELETE',
        body: JSON.stringify({ codes: [...selectedCodes] }),
      });
      setSelectedCodes([]);
      setFailure(null);
      // A deletion has a consequence the server states — the measurement is
      // marked stale, the numbers below were counted on the old corpus — and
      // it arrives as a sentence rather than as a silent recount.
      const removed = readSamples(response).notice;
      if (removed) {
        setNotice({ surface: 'samples', tone: 'success', text: removed });
      }
      await samplesQuery.mutate(response);
    } catch (error) {
      fail('samples', error);
    }
  }, [fail, read, samplesQuery, selectedCodes]);

  const decideField = useCallback(
    async (
      key: ProposalFieldKey,
      action: 'ACCEPT' | 'EDIT' | 'SAVE',
      text?: string
    ) => {
      try {
        // The text travels with the save. Without it `SAVE` arrived with
        // nothing to save and the server kept the sentence the model wrote.
        const response = await read(scoped(VOICE_ROUTES.proposalField), {
          method: 'POST',
          body: JSON.stringify({
            key,
            action,
            ...(typeof text === 'string' ? { text } : {}),
          }),
        });
        setFailure(null);
        await proposalQuery.mutate(response);
      } catch (error) {
        fail('proposal', error);
      }
    },
    [fail, proposalQuery, read, scoped]
  );

  /** The portrait, decided on its own route: one text, no key. */
  const decidePortrait = useCallback(
    async (action: 'ACCEPT' | 'EDIT' | 'SAVE', text?: string) => {
      try {
        const response = await read(scoped(VOICE_ROUTES.proposalPortrait), {
          method: 'POST',
          body: JSON.stringify({
            action,
            ...(typeof text === 'string' ? { text } : {}),
          }),
        });
        setFailure(null);
        await proposalQuery.mutate(response);
      } catch (error) {
        fail('proposal', error);
      }
    },
    [fail, proposalQuery, read, scoped]
  );

  /** One hand-written line, saved on its own. */
  const saveManualField = useCallback(
    async (key: ProposalFieldKey, text: string) => {
      try {
        const response = await read(scoped(VOICE_ROUTES.proposalManualField), {
          method: 'POST',
          body: JSON.stringify({ key, text }),
        });
        setFailure(null);
        await proposalQuery.mutate(response);
      } catch (error) {
        fail('proposal', error);
      }
    },
    [fail, proposalQuery, read, scoped]
  );

  const activate = useCallback(async () => {
    try {
      await read(scoped(VOICE_ROUTES.proposalActivate), {
        method: 'POST',
        body: JSON.stringify({
          consentGiven,
          ...(chosenPath === 'manual' ? { mode: 'manual' } : {}),
        }),
      });
      setFailure(null);
      setNotice({ surface: 'proposal', tone: 'success', text: w.activated });
      await proposalQuery.mutate();
      await overviewQuery.mutate();
    } catch (error) {
      fail('proposal', error);
    }
  }, [
    chosenPath,
    consentGiven,
    fail,
    overviewQuery,
    proposalQuery,
    read,
    scoped,
    w.activated,
  ]);

  /* --------------------------------------------------------------------
   * What each screen is in
   * ----------------------------------------------------------------- */

  const overviewFailure = failureOn('overview', overviewQuery.error);
  const pathsFailure = failureOn('paths', pathsQuery.error);
  const samplesFailure = failureOn('samples', samplesQuery.error);
  const analysisFailure = failureOn('analysis');
  const proposalFailure = failureOn('proposal', proposalQuery.error);

  const emptyState = overviewFailure
    ? overviewFailure.screenState
    : overviewQuery.isLoading
    ? 'loading'
    : !canManage
    ? 'restricted'
    : overview.state;

  const pathsState = pathsFailure
    ? pathsFailure.screenState
    : pathsQuery.isLoading
    ? 'loading'
    : chosenPath
    ? 'selected'
    : !canManage
    ? 'restricted'
    : paths.state;

  const samplesState = samplesFailure
    ? samplesFailure.screenState
    : samplesQuery.isLoading
    ? 'loading'
    : !canManage
    ? 'restricted'
    : noticeOn('samples')
    ? 'success'
    : selectedCodes.length
    ? 'selected'
    : samples.state;

  const analysisState: VoiceScreenStateV1 = analysisFailure
    ? analysisFailure.screenState
    : analysisResult
    ? 'success'
    : analysing && progress === null
    ? 'loading'
    : !canManage
    ? 'restricted'
    : 'default';

  const proposalReady = proposal.outcome === 'ready' ? proposal : null;
  const proposalState = proposalFailure
    ? proposalFailure.screenState
    : proposalQuery.isLoading
    ? 'loading'
    : !canManage
    ? 'restricted'
    : noticeOn('proposal') && proposalReady?.activatedAt
    ? 'success'
    : proposalReady?.state ?? 'empty';

  const proposalShortfall =
    proposal.outcome === 'insufficient' ? proposal.readiness : null;

  /**
   * The one line the container says for itself.
   *
   * It exists for the two things no accepted screen has a place for: a
   * shortfall discovered after the corpus step already closed, and a refusal
   * on screen 02, whose component carries reasons per path and none for the
   * request itself. The analysis's own progress is screen 04's to show now,
   * not a banner sitting above whichever screen the run happened to start on.
   */
  const missing = shortfall ?? proposalShortfall;
  const banner: Banner | null = missing
    ? { tone: 'status', text: shortfallText(missing, locale) }
    : step === 'paths' && pathsFailure
    ? { tone: 'alert', text: pathsFailure.message }
    : null;

  return (
    <section
      data-voice-wizard={step}
      className="flex min-w-0 flex-col gap-[16px]"
    >
      {banner ? (
        <p
          role={banner.tone === 'alert' ? 'alert' : 'status'}
          data-voice-wizard-note={banner.tone}
          className={banner.tone === 'alert' ? ALERT_CLASS : BANNER_CLASS}
        >
          {banner.text}
        </p>
      ) : null}

      {step === 'empty' ? (
        <VoiceEmptyScreen
          locale={locale}
          state={emptyState}
          note={overviewFailure?.message ?? overview.note}
          onCreate={() => goTo('paths')}
        />
      ) : null}

      {step === 'paths' ? (
        <VoicePathsScreen
          locale={locale}
          state={pathsState}
          selected={chosenPath}
          available={paths.available}
          disabledReasons={paths.disabledReasons}
          onChoose={choosePath}
          onCancel={() => goTo('empty')}
        />
      ) : null}

      {step === 'samples' ? (
        <>
          <VoiceSamplesScreen
            locale={locale}
            state={samplesState}
            samples={samples.samples}
            sources={samples.sources}
            selectedCodes={selectedCodes}
            upload={{
              phase: upload.phase,
              files: upload.files.map((file) => ({
                name: file.name,
                size: file.size,
              })),
              ...(upload.refused.length ? { refused: upload.refused } : {}),
              // Somebody else's writing costs the same two promises whether it
              // was pasted or uploaded, and they are asked in the card the
              // files were picked in.
              ...(chosenPath === 'reference'
                ? {
                    rights: {
                      confirmed: fileRights.confirmed,
                      retentionUntil: fileRights.retentionUntil,
                    },
                  }
                : {}),
            }}
            notice={samplesFailure?.message ?? noticeOn('samples') ?? samples.notice}
            onAdd={(origin: SampleOriginLabel) => setIntake(emptyIntake(origin))}
            onPickFiles={pickFiles}
            onSendFiles={() => void sendFiles()}
            onClearFiles={() =>
              setUpload({ phase: 'idle', files: [], refused: [] })
            }
            onRightsChange={(confirmed) =>
              setFileRights((current) => ({ ...current, confirmed }))
            }
            onRetentionChange={(retentionUntil) =>
              setFileRights((current) => ({ ...current, retentionUntil }))
            }
            onToggle={(code, checked) =>
              setSelectedCodes((current) =>
                checked
                  ? [...current, code]
                  : current.filter((one) => one !== code)
              )
            }
            onDeleteSelected={deleteSelected}
            onNext={runAnalysis}
          />

          {intake ? (
            <form
              data-voice-intake={intake.origin}
              onSubmit={(event) => {
                event.preventDefault();
                void submitIntake();
              }}
              className="flex min-w-0 flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
            >
              <h3 className="cf-label-sm uppercase text-cf-ink-muted">
                {w.intakeTitle}
              </h3>
              <Input
                standalone
                removeError
                name="voice-sample-title"
                label={w.intakeTitleLabel}
                value={intake.title}
                onChange={(event) =>
                  setIntake((current) =>
                    current ? { ...current, title: event.target.value } : current
                  )
                }
              />
              <Textarea
                standalone
                name="voice-sample-text"
                aria-label={w.intakeTextLabel}
                value={intake.text}
                onChange={(event) =>
                  setIntake((current) =>
                    current ? { ...current, text: event.target.value } : current
                  )
                }
              />
              {chosenPath === 'reference' ? (
                <>
                  <CheckboxField
                    checked={intake.rightsConfirmed}
                    onChange={(event) =>
                      setIntake((current) =>
                        current
                          ? { ...current, rightsConfirmed: event.target.checked }
                          : current
                      )
                    }
                    label={
                      <span className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                        {w.intakeRights}
                      </span>
                    }
                  />
                  <Input
                    standalone
                    removeError
                    type="date"
                    name="voice-sample-retention"
                    label={w.intakeRetention}
                    value={intake.retentionUntil}
                    onChange={(event) =>
                      setIntake((current) =>
                        current
                          ? { ...current, retentionUntil: event.target.value }
                          : current
                      )
                    }
                  />
                </>
              ) : null}
              <div className="flex flex-wrap gap-[8px]">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!intake.text.trim()}
                >
                  {w.intakeSubmit}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIntake(null)}
                >
                  {w.intakeCancel}
                </Button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      {step === 'analysis' ? (
        <VoiceAnalysisScreen
          locale={locale}
          state={analysisState}
          progress={progress?.outcome === 'pending' ? progress.progress : undefined}
          stage={progress?.outcome === 'pending' ? progress.stage : undefined}
          sampleCount={analysisResult?.sampleCount}
          charCount={analysisResult?.charCount}
          holdoutCount={analysisResult?.holdoutCount}
          wordCount={analysisResult?.wordCount}
          sentenceCount={analysisResult?.sentenceCount}
          lexicon={analysisResult?.lexicon}
          punctuation={analysisResult?.punctuation}
          rejected={analysisResult?.rejected}
          notice={analysisFailure?.message}
          onContinue={() => goTo('proposal')}
          onRetry={() => void runAnalysis()}
          onStop={stopAnalysis}
        />
      ) : null}

      {step === 'proposal' ? (
        <VoiceProposalScreen
          locale={locale}
          state={proposalState}
          mode={proposalReady?.mode ?? 'assist'}
          portrait={proposalReady?.portrait}
          fields={proposalReady?.fields ?? []}
          observations={proposalReady?.observations ?? []}
          profileLabel={proposalReady?.profileLabel}
          activatedAt={proposalReady?.activatedAt}
          consentGiven={consentGiven}
          notice={proposalFailure?.message ?? proposalReady?.notice}
          onAccept={(key) => void decideField(key, 'ACCEPT')}
          onEdit={(key) => void decideField(key, 'EDIT')}
          onSaveField={(key, text) =>
            void (proposalReady?.mode === 'manual'
              ? saveManualField(key, text)
              : decideField(key, 'SAVE', text))
          }
          onAcceptPortrait={() => void decidePortrait('ACCEPT')}
          onEditPortrait={() => void decidePortrait('EDIT')}
          onSavePortrait={(text) => void decidePortrait('SAVE', text)}
          onConsentChange={setConsentGiven}
          onActivate={() => void activate()}
          onSaveDraft={() => void proposalQuery.mutate()}
        />
      ) : null}

      {step === 'empty' || step === 'paths' || step === 'analysis' ? null : (
        <div className="flex flex-wrap gap-[8px]">
          <Button
            type="button"
            variant="secondary"
            // Back goes where the person came from. The hand-filled path never
            // passed through the corpus, and sending it there would offer to
            // collect texts for a voice that reads none.
            onClick={() =>
              goTo(
                step === 'proposal' && chosenPath !== 'manual'
                  ? 'samples'
                  : 'paths'
              )
            }
          >
            {w.back}
          </Button>
        </div>
      )}
    </section>
  );
}

export default VoiceWizardContainer;
