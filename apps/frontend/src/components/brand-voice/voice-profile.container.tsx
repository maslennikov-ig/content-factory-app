'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useUser } from '../layout/user.context';
import type { ProfileField } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/assist.contract';
import { VoicePassportScreen } from './voice-passport.screen';
import { VoiceScalesScreen, type CorridorEdit } from './voice-scales.screen';
import { VoiceRedactionsScreen } from './voice-redactions.screen';
import { VoiceVersionsScreen } from './voice-versions.screen';
import type { RedactionCategory } from './voice-redactions.screen';
import type { StyleScaleKey, VoiceLocale } from './voice-copy';
import {
  VOICE_ROUTES,
  defaultComparedIds,
  mapPassport,
  mapRedactions,
  mapScales,
  mapVersions,
  readVoice,
  readVoiceFailure,
  surfaceState,
  versionsPath,
  type VoiceFailure,
} from './voice-profile.adapter';

/**
 * One avatar, described by four screens that all edit it where it is shown.
 *
 * Three things used to sit between a person and a change they could see they
 * wanted to make, and all three are gone.
 *
 * The five voice lines were editable only in a second form under «Изменить
 * вручную» — the whole `ContentIntelligenceSettings` brand section, mounted
 * below the card that displayed the same values. One object with two front
 * doors, and the far one was a draft-and-activate flow that asked for all five
 * lines. The near door now works: each line carries its own edit and writes
 * through `/passport/field`, which lays it over the version in force and
 * activates the result. The far door is gone rather than kept in step.
 *
 * The corridors were edited in a panel that opened below the fold, out of
 * sight of both the button that opened it and the bars it described. They are
 * now dragged on the bars, and this container only receives the finished
 * edit.
 *
 * The comparison described whichever pair the server felt like while the
 * screen invited a person to tick any two. The pair is now part of the
 * request, so the ticks and the table cannot disagree.
 */

const copy = {
  ru: {
    failureLead: 'Сервер отказал',
  },
  en: {
    failureLead: 'The server refused',
  },
} as const;

export function VoiceProfileContainer({
  avatarId,
}: {
  /**
   * Whose voice these four screens describe.
   *
   * Absent means the space's default, which is what all of them meant while a
   * space held exactly one profile. When it is given, every path this
   * container touches — including the writes — carries it, so a corridor set
   * while looking at one avatar cannot land on another. It is also part of
   * each SWR key, which is what stops the passport of the avatar just closed
   * being shown for a beat under the name of the one just opened.
   */
  avatarId?: string;
} = {}) {
  const request = useFetch();
  const user = useUser();
  const { language } = useVariables();
  const locale: VoiceLocale = language.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
  const t = copy[locale];

  const [expandedScale, setExpandedScale] = useState<StyleScaleKey | undefined>();
  const [expandedCategory, setExpandedCategory] = useState<
    RedactionCategory | undefined
  >();
  /** `null` means "not touched yet", which is not the same as "nothing picked". */
  const [picked, setPicked] = useState<readonly string[] | null>(null);
  const [restored, setRestored] = useState(false);
  const [passportSaved, setPassportSaved] = useState(false);
  const [corridorSaved, setCorridorSaved] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [recalibrated, setRecalibrated] = useState(false);

  /** The route, with the avatar it is about. See the prop's own note. */
  const scoped = useCallback(
    (path: string) =>
      avatarId ? `${path}?avatar=${encodeURIComponent(avatarId)}` : path,
    [avatarId]
  );
  const read = useCallback(
    (path: string) => readVoice(request, path),
    [request]
  );
  const options = { revalidateOnFocus: false };
  const passportQuery = useSWR(scoped(VOICE_ROUTES.passport), read, options);
  const scalesQuery = useSWR(scoped(VOICE_ROUTES.scales), read, options);
  const redactionsQuery = useSWR(scoped(VOICE_ROUTES.redactions), read, options);
  /**
   * The pair travels in the key, so picking two versions is a read.
   *
   * SWR then caches each comparison under its own address and going back to a
   * pair already looked at costs nothing — which is the behaviour somebody
   * comparing three versions in turn actually has.
   */
  const versionsQuery = useSWR(
    versionsPath(scoped(VOICE_ROUTES.versions), picked ?? []),
    read,
    options
  );

  const failures: ReadonlyArray<readonly [string, VoiceFailure | null]> = [
    ['passport', readVoiceFailure(passportQuery.error)],
    ['scales', readVoiceFailure(scalesQuery.error)],
    ['redactions', readVoiceFailure(redactionsQuery.error)],
    ['versions', readVoiceFailure(versionsQuery.error)],
  ];
  const [passportFailure, scalesFailure, redactionsFailure, versionsFailure] =
    failures.map(([, failure]) => failure);

  const passport = useMemo(
    () => mapPassport(passportQuery.data),
    [passportQuery.data]
  );
  const scales = useMemo(() => mapScales(scalesQuery.data), [scalesQuery.data]);
  const redactions = useMemo(
    () => mapRedactions(redactionsQuery.data),
    [redactionsQuery.data]
  );
  const versions = useMemo(
    () => mapVersions(versionsQuery.data, locale),
    [versionsQuery.data, locale]
  );

  /**
   * Two versions are ticked before anyone ticks anything: the pair the server
   * compared. A comparison the reader has to assemble by hand before it
   * appears reads as a broken table rather than as an invitation.
   */
  const selected = picked ?? defaultComparedIds(versions.versions);

  const mutation = useCallback(
    async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch {
        // The refusal reaches the screen through the query it belongs to; a
        // second copy of it beside the first would say the same thing twice.
      }
    },
    []
  );

  const restore = useCallback(
    (versionId: string) =>
      void mutation(async () => {
        const next = await readVoice(request, scoped(VOICE_ROUTES.restore), {
          method: 'POST',
          body: JSON.stringify({ versionId }),
        });
        // Restoring writes a version and activates it, so the passport above is
        // now describing a different one.
        await versionsQuery.mutate(next, { revalidate: false });
        await passportQuery.mutate();
        setPicked(null);
        setRestored(true);
      }),
    [mutation, passportQuery, request, scoped, versionsQuery]
  );

  /**
   * The author's own examples: one removed, one written, or the whole set
   * picked again.
   *
   * Removal and addition both send what the set is now rather than an index or
   * a delta, because the server is being told the list. An empty list is a
   * legitimate answer — somebody who removed all of them wants none — and
   * asking for a fresh set is a different request, carried by `refresh`.
   */
  const changeExamples = useCallback(
    (body: { texts?: string[]; refresh?: boolean }) =>
      void mutation(async () => {
        const next = await readVoice(request, scoped(VOICE_ROUTES.examples), {
          method: 'POST',
          body: JSON.stringify(body),
        });
        await passportQuery.mutate(next, { revalidate: false });
      }),
    [mutation, passportQuery, request, scoped]
  );

  const currentExamples = () =>
    (passport.voice?.examples ?? []).map((one) => one.text);

  const removeExample = useCallback(
    (index: number) =>
      changeExamples({
        texts: currentExamples().filter((_, position) => position !== index),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [changeExamples, passport.voice]
  );

  const addExample = useCallback(
    (text: string) =>
      changeExamples({ texts: [...currentExamples(), text] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [changeExamples, passport.voice]
  );

  const refreshExamples = useCallback(
    () => changeExamples({ refresh: true }),
    [changeExamples]
  );

  /**
   * One line of the passport, written where it was read.
   *
   * The write activates a new version, so three of the four screens are now
   * describing something older than they think: the passport itself, the
   * version list that gained a row, and the scales, whose header names the
   * version in force. The passport is replaced from the answer and the other
   * two are refetched — cheaper than re-reading the passport twice, and there
   * is nothing in either answer this container could have constructed.
   */
  const editField = useCallback(
    (key: ProfileField, text: string) =>
      void mutation(async () => {
        setPassportSaved(false);
        const next = await readVoice(
          request,
          scoped(VOICE_ROUTES.passportField),
          { method: 'POST', body: JSON.stringify({ key, text }) }
        );
        await passportQuery.mutate(next, { revalidate: false });
        await versionsQuery.mutate();
        await scalesQuery.mutate();
        setPassportSaved(true);
      }),
    [mutation, passportQuery, request, scalesQuery, scoped, versionsQuery]
  );

  const saveCorridor = useCallback(
    (edit: CorridorEdit) =>
      void mutation(async () => {
        setCorridorSaved(false);
        const next = await readVoice(request, scoped(VOICE_ROUTES.corridor), {
          method: 'POST',
          body: JSON.stringify({
            key: edit.key,
            low: edit.low,
            high: edit.high,
            excluded: edit.excluded,
          }),
        });
        await scalesQuery.mutate(next, { revalidate: false });
        setCorridorSaved(true);
      }),
    [mutation, request, scalesQuery, scoped]
  );

  /**
   * Измерить те же тексты заново нынешней меркой.
   *
   * Пишет новое измерение и переставляет на него штамп версии, а границы,
   * подвинутые рукой, переносит на него сервер. Слова голоса не меняются и
   * новой версии не заводится, поэтому паспорт перечитывается, а история —
   * нет: там ничего не появилось.
   */
  const recalibrate = useCallback(
    () =>
      void mutation(async () => {
        setRecalibrating(true);
        setRecalibrated(false);
        try {
          await readVoice(request, scoped(VOICE_ROUTES.recalibrate), {
            method: 'POST',
          });
          await scalesQuery.mutate();
          await passportQuery.mutate();
          setRecalibrated(true);
        } finally {
          setRecalibrating(false);
        }
      }),
    [mutation, passportQuery, request, scalesQuery, scoped]
  );

  const versionsState = restored
    ? 'success'
    : surfaceState({
        loading: versionsQuery.isLoading,
        failure: versionsFailure,
        response: versionsQuery.data,
        fallback: 'empty',
      });

  const canManage = scales.canEditCorridors;
  /**
   * Два условия, и оба обязательны.
   *
   * `isSuperAdmin` — суперадмин инстанса: пересчёт мерки не то, что обычный
   * человек обязан знать, и кнопку для него убрали 28.08 сознательно.
   * `canManage` — право этого пространства, которое маршрут и так требует:
   * кнопка, которую видит тот, кому сервер откажет, — обещание, которое
   * некому сдержать.
   */

  return (
    <div
      data-production-surface="content/brand-voice"
      className="flex min-w-0 flex-col gap-[24px]"
    >
      {failures
        .filter(([, failure]) => failure?.screenState === 'error')
        .map(([surface, failure]) => (
          <p
            key={surface}
            role="alert"
            data-voice-failure={surface}
            className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
          >
            <span className="cf-label-sm text-cf-ink-muted">
              {t.failureLead} · {failure!.code ?? 'HTTP'}
            </span>{' '}
            {failure!.message}
          </p>
        ))}

      <VoicePassportScreen
        locale={locale}
        state={surfaceState({
          loading: passportQuery.isLoading,
          failure: passportFailure,
          response: passportQuery.data,
          fallback: 'empty',
        })}
        voice={passport.voice}
        saved={passportSaved}
        // A reader who may not change the voice is shown no control that will
        // refuse them. `canEditCorridors` is the same permission read from the
        // same answer the scales use: the right to change this profile.
        {...(canManage
          ? {
              onEditField: editField,
              onAddExample: addExample,
              onRemoveExample: removeExample,
              onRefreshExamples: refreshExamples,
            }
          : {})}
      />

      <VoiceScalesScreen
        locale={locale}
        state={surfaceState({
          loading: scalesQuery.isLoading,
          failure: scalesFailure,
          response: scalesQuery.data,
          fallback: 'empty',
        })}
        scales={scales.scales}
        {...(scales.profileLabel ? { profileLabel: scales.profileLabel } : {})}
        {...(scales.versionLabel ? { versionLabel: scales.versionLabel } : {})}
        {...(scales.sampleCount !== undefined
          ? { sampleCount: scales.sampleCount }
          : {})}
        {...(scales.lastCheck ? { lastCheck: scales.lastCheck } : {})}
        {...(expandedScale ? { expandedScale } : {})}
        canEditCorridors={scales.canEditCorridors}
        {...(scales.recalibration && canManage && user?.isSuperAdmin
          ? {
              recalibration: scales.recalibration,
              recalibrating,
              recalibrated,
              onRecalibrate: recalibrate,
            }
          : {})}
        saved={corridorSaved}
        onExpand={(key) =>
          setExpandedScale((current) => (current === key ? undefined : key))
        }
        {...(canManage ? { onSaveCorridor: saveCorridor } : {})}
        // Recomputing a scale belongs to the analysis step: the recount writes
        // a fresh measurement, and a corridor a person set by hand lives on the
        // measurement it was set on. Started from here it would silently
        // discard one, so it is not offered here at all.
      />

      {/* A workspace that never took a reference has no reference report. The
          empty list inside one it did take is a result and is shown; a whole
          screen about a step that never happened is an invented step. */}
      {redactions.referenceCount > 0 || redactionsFailure ? (
        <VoiceRedactionsScreen
          locale={locale}
          // Read-only by design: this is the record of what was cut, and the
          // consent it was cut under was given on the path that cut it.
          state={
            redactionsFailure
              ? redactionsFailure.screenState
              : redactionsQuery.isLoading
              ? 'loading'
              : 'restricted'
          }
          redactions={redactions.redactions}
          kept={redactions.kept}
          referenceCount={redactions.referenceCount}
          finishedAt={redactions.finishedAt}
          longestMatch={redactions.longestMatch}
          {...(redactions.notice ? { notice: redactions.notice } : {})}
          {...(expandedCategory ? { expandedCategory } : {})}
          onExpand={(category) =>
            setExpandedCategory((current) =>
              current === category ? undefined : category
            )
          }
        />
      ) : null}

      <VoiceVersionsScreen
        locale={locale}
        state={versionsState}
        versions={versions.versions}
        selected={selected}
        {...(versions.comparison ? { comparison: versions.comparison } : {})}
        {...(versions.comparisonNotice
          ? { comparisonNotice: versions.comparisonNotice }
          : {})}
        {...(versions.profileLabel
          ? { profileLabel: versions.profileLabel }
          : {})}
        canRestore={versions.canRestore}
        // Two at a time, and a third is refused rather than absorbed. The
        // screen already disables the box; this says the same thing so that
        // the rule lives in the model and not only in the paint. Dropping one
        // of the first two to make room is what made a box the reader had not
        // touched clear itself.
        onToggle={(id, checked) => {
          if (!checked) {
            setPicked(selected.filter((one) => one !== id));
            return;
          }
          if (selected.includes(id) || selected.length >= 2) return;
          setPicked([...selected, id]);
        }}
        onRestore={restore}
      />
    </div>
  );
}

export default VoiceProfileContainer;
