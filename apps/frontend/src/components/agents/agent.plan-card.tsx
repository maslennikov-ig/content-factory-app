'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Status, type StatusTone } from '@contentfactory/frontend/components/ui/surface';
import {
  cellDate,
  stateTone,
} from '@contentfactory/frontend/components/content-intelligence/pieces/adaptation.cell';
import {
  DROP_RESERVE,
  PIECES_API,
  buildPostSettingsPayload,
  refusalMessage,
} from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import {
  PLAN_SLOT_STATES,
  artifactChannelId,
  artifactHref,
  type AgentArtifact,
  type PlanSlotState,
} from './agent.contract';
import { AgentCard, Facts, Note, OpenOnScreen } from './agent.cards';
import type { AgentWords } from './agent.copy';
import { AgentGlyph } from './agent.icons';
import { livePlanSlot, useFetchedPiece } from './agent.piece-data';

/**
 * «В плане» (spec §6.2 Plan slot, canvas C `_c_slot`, `kcxz.16`): the channel
 * with its platform mark, the time in the browser's zone, the state in words,
 * and the one way back the page offers for it — «Отменить бронь» for a
 * reservation, «Снять с расписания» for a queued post. Both go through the
 * piece page's own doors (`PIECES_API.postSettings` with the page's payload,
 * `PIECES_API.unschedule`), and the piece beside the chat is refreshed by its
 * own SWR key, so the panel and the card never disagree. «Отменить бронь» is
 * the page's «Снять из плана» (`DROP_RESERVE`, `kcxz.32`, N4): the post goes
 * back to «как в канале» when the channel keeps it a draft, else it keeps
 * its own «Без плана».
 *
 * The time and the state tone are the piece page's (`cellDate`, `stateTone`):
 * a reserved post reads «02.10 19:30» here and on the page.
 *
 * The card says where the post stands now, not where it stood when the tool
 * answered (`kcxz.34`, F1): it reads the piece through the page's own key and
 * shows the slot from there — state, time and the way back that state has.
 * The stored part is only what it shows until the piece is read, or when the
 * piece cannot be read. A post taken off the queue elsewhere is never called
 * «выйдет сама» after a reload.
 *
 * A piece that was read and has no such post any more (`kcxz.38`, P3-3)
 * says «Этого поста больше нет», with no time and no way back: the stored
 * «В очереди» would name a place in a queue that is gone. A draft keeps the
 * date its post has, named as the draft's date («Дата 01.10 15:00»), never
 * as a time it goes out.
 */

type PlanCardData = {
  pieceId: string | null;
  channelId: string | null;
  channelName: string | null;
  provider: string | null;
  at: string | null;
  state: PlanSlotState;
};

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

export const readPlanCard = (artifact: AgentArtifact): PlanCardData => {
  const channel =
    artifact.data.channel && typeof artifact.data.channel === 'object'
      ? (artifact.data.channel as Record<string, unknown>)
      : {};
  const state = (PLAN_SLOT_STATES as readonly unknown[]).includes(artifact.data.state)
    ? (artifact.data.state as PlanSlotState)
    : 'draft';
  return {
    pieceId: textOf(artifact.data.pieceId),
    channelId: artifactChannelId(artifact),
    channelName: textOf(channel.name),
    provider: textOf(channel.provider),
    at: textOf(artifact.data.at),
    state,
  };
};

/** The page's moment for a slot: day and time while planned, the day once out. */
const MOMENT: Record<PlanSlotState, (at: string | null) => string | null> = {
  reserve: (at) => cellDate('draft', at, true),
  draft: (at) => cellDate('draft', at, true),
  scheduled: (at) => cellDate('queued', at),
  published: (at) => cellDate('published', at),
  // When it was to go out, as a queued post says it.
  error: (at) => cellDate('queued', at),
};

export const planMoment = (state: PlanSlotState, at: string | null) =>
  MOMENT[state](at);

const TONE: Record<PlanSlotState, StatusTone> = {
  reserve: 'info',
  scheduled: stateTone('queued'),
  draft: stateTone('draft'),
  published: stateTone('published'),
  error: stateTone('error'),
};

export function PlanCard({
  artifact,
  open,
  onOpen,
  words,
}: {
  artifact: AgentArtifact;
  /** Shown beside the chat right now. */
  open: boolean;
  onOpen: (artifact: AgentArtifact) => void;
  words: AgentWords;
}) {
  const w = words.plan;
  const request = useFetch();
  const { mutate } = useSWRConfig();
  const slot = readPlanCard(artifact);
  const piece = useFetchedPiece(slot.pieceId);
  const live = piece ? livePlanSlot(piece, artifact.id) : null;
  // The state after this card's own action, until the piece is read again
  // (`basis` is the piece the action was taken on).
  const [acted, setActed] = useState<{
    state: PlanSlotState;
    basis: typeof piece;
  } | null>(null);
  const state: PlanSlotState =
    acted && acted.basis === piece ? acted.state : (live?.state ?? slot.state);
  const at = live ? live.at : slot.at;
  // Read, and this post is not in it any more (P3-3).
  const gone = Boolean(piece && !live);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moment = gone ? null : planMoment(state, at);
  const draft = state === 'draft';
  const shownMoment = moment && draft ? w.draftMoment(moment) : moment;
  const stateWords = gone ? w.gone : w.states[state];
  const channel = slot.channelName ?? words.card.kinds.channel;
  const kind = words.card.kinds.plan;

  const act = async (
    call: () => Promise<Response>,
    outcome: string
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await call();
      const body = await response.json().catch(() => null);
      // Either way the post may stand elsewhere than the card said: read it.
      if (slot.pieceId) void mutate(PIECES_API.detail(slot.pieceId));
      if (!response.ok) {
        setError(refusalMessage(body) || w.failed);
        return;
      }
      setActed({ state: 'draft', basis: piece });
      setDone(outcome);
    } catch {
      setError(w.failed);
    } finally {
      setBusy(false);
    }
  };

  const cancelReserve = () =>
    slot.pieceId &&
    slot.channelId &&
    act(
      () =>
        request(PIECES_API.postSettings(slot.pieceId as string, slot.channelId as string), {
          method: 'PUT',
          body: JSON.stringify(buildPostSettingsPayload(DROP_RESERVE)),
        }),
      w.cancelled
    );

  const unschedule = () =>
    slot.pieceId &&
    act(
      () =>
        request(PIECES_API.unschedule(slot.pieceId as string, artifact.id), {
          method: 'POST',
        }),
      w.unscheduled
    );

  // A piece that was read and has no such post any more offers no way back.
  const canAct =
    Boolean(slot.pieceId) &&
    !gone &&
    (state !== 'reserve' || Boolean(slot.channelId));

  return (
    <AgentCard
      cardKind="plan"
      glyph="calendar"
      kind={kind}
      title={shownMoment ?? undefined}
      label={`${kind}: ${channel}${shownMoment ? `, ${shownMoment}` : ''} — ${stateWords}`}
      aside={
        <span data-agent-plan-state={gone ? 'gone' : state}>
          <Status tone={gone ? 'neutral' : TONE[state]}>{stateWords}</Status>
        </span>
      }
      // Nothing to do with a post that is not there.
      footer={
        gone ? undefined : (
          <>
            {state === 'reserve' && canAct ? (
              <Button
                type="button"
                density="dense"
                variant="secondary"
                disabled={busy}
                loading={busy}
                loadingLabel={w.cancelling}
                onClick={() => void cancelReserve()}
              >
                {w.cancelReserve}
              </Button>
            ) : null}
            {state === 'scheduled' && canAct ? (
              <Button
                type="button"
                density="dense"
                variant="secondary"
                disabled={busy}
                loading={busy}
                loadingLabel={w.unscheduling}
                onClick={() => void unschedule()}
              >
                {w.unschedule}
              </Button>
            ) : null}
            {open ? (
              <span className="cf-caption text-cf-accent">{words.card.openedBeside}</span>
            ) : (
              <Button
                type="button"
                variant="quiet"
                density="dense"
                onClick={() => onOpen(artifact)}
                aria-label={`${words.card.openBeside}: ${kind} «${channel}»`}
              >
                {words.card.openBeside}
                <AgentGlyph name="right" size={14} />
              </Button>
            )}
            <span className="ms-auto">
              <OpenOnScreen href={artifactHref(artifact)} words={words} />
            </span>
          </>
        )
      }
    >
      <Facts
        rows={[
          [
            w.channel,
            <span key="channel" className="inline-flex min-w-0 items-center gap-[8px]">
              {slot.provider ? <PlatformBadge identifier={slot.provider} size={16} /> : null}
              <span className="min-w-0 [overflow-wrap:anywhere]">{channel}</span>
            </span>,
          ],
          ...(moment
            ? ([[draft ? w.draftWhen : w.when, moment]] as Array<[string, string]>)
            : []),
        ]}
      />
      {state === 'reserve' && !gone ? <Note tone="neutral">{w.reserveNote}</Note> : null}
      <div aria-live="polite" className="empty:hidden">
        {done ? <p className="cf-body-sm text-cf-ink">{done}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="cf-body-sm text-cf-danger">
          {error}
        </p>
      ) : null}
    </AgentCard>
  );
}
