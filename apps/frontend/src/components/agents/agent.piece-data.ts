'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import {
  PIECES_API,
  adaptationPlace,
  fetchPieceDetail,
  workspaceChannels,
  type PieceWorkspaceV1,
} from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import type { AgentArtifact, PlanSlotState } from './agent.contract';

/**
 * What the chat knows of a piece from the piece's own data (`kcxz.31`).
 *
 * The chat's cards are written once, when a tool answers; the piece moves on
 * — its questions get answers, an adaptation gets a new text. The piece
 * screen beside the chat reads `PIECES_API.detail`, and this reads the same
 * SWR key with the same reader (`fetchPieceDetail`), so a line in the chat
 * says what the panel says.
 *
 * It never asks on its own: no request on mount, focus or reconnect. It
 * shows what is already loaded, and when the conversation revalidates the
 * key after a tool output (D6), whichever subscriber SWR asks reads the same
 * door the same way.
 */

const CACHE_ONLY = {
  revalidateOnMount: false,
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
} as const;

const textOf = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value : null;

/** The piece an artifact belongs to: itself, or the `pieceId` its card names. */
export const pieceIdOf = (artifact: AgentArtifact): string | null =>
  artifact.kind === 'piece'
    ? artifact.id
    : artifact.kind === 'adaptation' || artifact.kind === 'plan'
      ? textOf(artifact.data.pieceId)
      : null;

/** The loaded piece, if the screen has it; never fetched from here first. */
export function useLoadedPiece(pieceId: string | null): PieceWorkspaceV1 | null {
  const request = useFetch();
  const { data } = useSWR<PieceWorkspaceV1>(
    pieceId ? PIECES_API.detail(pieceId) : null,
    () => fetchPieceDetail(request, pieceId as string),
    CACHE_ONLY
  );
  return data ?? null;
}

/**
 * The piece, read once when a card that must say what is true now is drawn
 * (`kcxz.34`, F1): a plan card redrawn from the thread's history would
 * otherwise say «В очереди · выйдет сама» of a post taken off the queue. The
 * same key and reader as the piece screen, so one request serves both; no
 * reading again on focus or reconnect — the conversation and the card's own
 * actions revalidate the key when they change the piece.
 */
export function useFetchedPiece(pieceId: string | null): PieceWorkspaceV1 | null {
  const request = useFetch();
  const { data } = useSWR<PieceWorkspaceV1>(
    pieceId ? PIECES_API.detail(pieceId) : null,
    () => fetchPieceDetail(request, pieceId as string),
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );
  return data ?? null;
}

/**
 * Where an adaptation's post stands now, read from the loaded piece the way
 * the server words a plan card (`slotStateOf`, `slotTimeOf` in
 * `plan.capabilities.ts`): out, queued, failed, else a reserve or a draft.
 * `null` when the piece does not have this adaptation.
 */
export const livePlanSlot = (
  piece: PieceWorkspaceV1,
  adaptationId: string
): { state: PlanSlotState; at: string | null } | null => {
  const row = piece.adaptations.find((one) => one.id === adaptationId);
  if (!row) return null;
  const state: PlanSlotState =
    POST_SLOT[row.state as string] ??
    (row.plan?.status === 'reserved' ? 'reserve' : 'draft');
  return { state, at: row.plan?.date ?? row.date ?? null };
};

/** A post's state → the plan card's slot; not words (those live in `adaptation.cell`). */
const POST_SLOT: Record<string, PlanSlotState> = {
  published: 'published',
  queued: 'scheduled',
  error: 'error',
};

/**
 * The artifact with what the loaded piece adds (D8, D12): an adaptation card
 * that named only `{id, pieceId}` gets its channel and «вариант N»; a piece
 * line gets its live count of open questions.
 */
export const withPieceData = (
  artifact: AgentArtifact,
  piece: PieceWorkspaceV1 | null
): AgentArtifact => {
  if (!piece) return artifact;
  if (artifact.kind === 'piece') {
    const questions = piece.core?.questions?.items.length ?? 0;
    return artifact.data.questions === questions
      ? artifact
      : { ...artifact, data: { ...artifact.data, questions } };
  }
  if (artifact.kind !== 'adaptation') return artifact;
  const place = adaptationPlace(workspaceChannels(piece), artifact.id);
  if (!place) return artifact;
  const channel = artifact.data.channel;
  const hasChannel =
    !!channel && typeof channel === 'object' && !!textOf((channel as { id?: unknown }).id);
  const hasVariant = typeof artifact.data.variant === 'number' && artifact.data.variant > 0;
  if (hasChannel && hasVariant) return artifact;
  return {
    ...artifact,
    data: {
      ...artifact.data,
      ...(hasChannel
        ? {}
        : { channel: { id: place.channel.id, name: place.channel.name } }),
      ...(hasVariant ? {} : { variant: place.variant }),
    },
  };
};

/**
 * `withPieceData` for a component: the artifact as the loaded piece has it,
 * and whether the piece was loaded at all (then its counts are current).
 */
export function usePieceArtifact(artifact: AgentArtifact): {
  artifact: AgentArtifact;
  loaded: boolean;
} {
  const piece = useLoadedPiece(pieceIdOf(artifact));
  return useMemo(
    () => ({ artifact: withPieceData(artifact, piece), loaded: piece !== null }),
    [artifact, piece]
  );
}
