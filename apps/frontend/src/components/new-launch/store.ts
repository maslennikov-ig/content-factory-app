'use client';

import { create } from 'zustand';
import dayjs from 'dayjs';
import { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import { createRef, RefObject } from 'react';
import { PostComment } from '@contentfactory/frontend/components/new-launch/providers/post-comment.enum';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import type { ResearchSource } from '@contentfactory/frontend/components/new-launch/research.sources';

export interface Values {
  id: string;
  content: string;
  delay: number;
  media: { id: string; path: string; thumbnail?: string }[];
  usedCitationIds?: string[];
}

export type ContentIntelligenceCitation = Readonly<{
  citationId: string;
  kind: 'FACT' | 'EVIDENCE';
  label: string;
  retrievedAt?: string;
  freshUntil?: string;
}>;

export type ContentIntelligenceProvenance = Readonly<{
  contentContextSnapshotId: string;
  brandProfileVersionId: string | null;
  brandProfileSelection:
    | Readonly<{
        mode: 'resolved';
        versionId: string;
        versionNumber: number;
        contentDigest: string;
      }>
    | Readonly<{
        mode: 'neutral_fallback';
        reason: 'NO_PROFILE' | 'EXPLICIT_NONE' | 'LEGACY_REQUEST';
      }>;
  contentContextStatus:
    | 'READY'
    | 'PARTIAL'
    | 'UNAVAILABLE'
    | 'BLOCKED_STALE'
    | 'BLOCKED_CONFLICT';
  generationPolicy: 'ALLOW_GROUNDED' | 'ALLOW_USER_ONLY' | 'EVIDENCE_REQUIRED';
  selectionHash: string;
  errorCode: 'CONTENT_EVIDENCE_REQUIRED' | null;
  builtAt?: string;
  expiresAt?: string;
  profileLabel?: string;
  validationStatus?: 'VALID';
  availableCitations: readonly ContentIntelligenceCitation[];
}>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoDate = (value: unknown): value is string =>
  isNonEmptyString(value) && !Number.isNaN(Date.parse(value));

const contextStatuses = [
  'READY',
  'PARTIAL',
  'UNAVAILABLE',
  'BLOCKED_STALE',
  'BLOCKED_CONFLICT',
] as const;
const generationPolicies = [
  'ALLOW_GROUNDED',
  'ALLOW_USER_ONLY',
  'EVIDENCE_REQUIRED',
] as const;
const fallbackReasons = [
  'NO_PROFILE',
  'EXPLICIT_NONE',
  'LEGACY_REQUEST',
] as const;

function policyMatchesStatus(
  status: ContentIntelligenceProvenance['contentContextStatus'],
  policy: ContentIntelligenceProvenance['generationPolicy']
) {
  if (status === 'READY' || status === 'PARTIAL') {
    return policy === 'ALLOW_GROUNDED';
  }
  if (status === 'BLOCKED_STALE' || status === 'BLOCKED_CONFLICT') {
    return policy === 'EVIDENCE_REQUIRED';
  }
  return policy === 'ALLOW_USER_ONLY' || policy === 'EVIDENCE_REQUIRED';
}

export function parseServerContentProvenance(
  value: unknown
): ContentIntelligenceProvenance | null {
  const record = asRecord(value);
  const profile = asRecord(record?.brandProfileSelection);
  if (
    !record ||
    !profile ||
    !isNonEmptyString(record.contentContextSnapshotId) ||
    !contextStatuses.includes(record.contentContextStatus as any) ||
    !generationPolicies.includes(record.generationPolicy as any) ||
    !isNonEmptyString(record.selectionHash)
  ) {
    return null;
  }

  const status =
    record.contentContextStatus as ContentIntelligenceProvenance['contentContextStatus'];
  const generationPolicy =
    record.generationPolicy as ContentIntelligenceProvenance['generationPolicy'];
  if (!policyMatchesStatus(status, generationPolicy)) return null;

  let brandProfileSelection: ContentIntelligenceProvenance['brandProfileSelection'];
  let brandProfileVersionId: string | null;
  if (profile.mode === 'resolved') {
    if (
      !isNonEmptyString(profile.versionId) ||
      !Number.isInteger(profile.versionNumber) ||
      Number(profile.versionNumber) <= 0 ||
      !isNonEmptyString(profile.contentDigest) ||
      record.brandProfileVersionId !== profile.versionId
    ) {
      return null;
    }
    brandProfileVersionId = profile.versionId;
    brandProfileSelection = {
      mode: 'resolved',
      versionId: profile.versionId,
      versionNumber: Number(profile.versionNumber),
      contentDigest: profile.contentDigest,
    };
  } else if (profile.mode === 'neutral_fallback') {
    if (
      !fallbackReasons.includes(profile.reason as any) ||
      record.brandProfileVersionId !== null
    ) {
      return null;
    }
    brandProfileVersionId = null;
    brandProfileSelection = {
      mode: 'neutral_fallback',
      reason: profile.reason as
        | 'NO_PROFILE'
        | 'EXPLICIT_NONE'
        | 'LEGACY_REQUEST',
    };
  } else {
    return null;
  }

  return {
    contentContextSnapshotId: record.contentContextSnapshotId,
    brandProfileVersionId,
    brandProfileSelection,
    contentContextStatus: status,
    generationPolicy,
    selectionHash: record.selectionHash,
    errorCode:
      generationPolicy === 'EVIDENCE_REQUIRED'
        ? 'CONTENT_EVIDENCE_REQUIRED'
        : null,
    availableCitations: [],
  };
}

export type GeneratorStreamContractErrorCode =
  | 'GENERATION_STREAM_INVALID'
  | 'GENERATION_CONTEXT_INVALID'
  | 'GENERATION_CONTEXT_MISSING'
  | 'GENERATION_CONTEXT_CHANGED'
  | 'CONTENT_EVIDENCE_REQUIRED'
  | 'BRAND_PROFILE_VERSION_UNAVAILABLE'
  | 'CONTENT_CONTEXT_CITATIONS_INVALID'
  | 'GENERATION_FAILED';

export class GeneratorStreamContractError extends Error {
  constructor(
    public readonly code: GeneratorStreamContractErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'GeneratorStreamContractError';
  }
}

function generatorBindingsEqual(
  left: ContentIntelligenceProvenance,
  right: ContentIntelligenceProvenance
) {
  if (
    left.contentContextSnapshotId !== right.contentContextSnapshotId ||
    left.brandProfileVersionId !== right.brandProfileVersionId ||
    left.contentContextStatus !== right.contentContextStatus ||
    left.generationPolicy !== right.generationPolicy ||
    left.selectionHash !== right.selectionHash ||
    left.brandProfileSelection.mode !== right.brandProfileSelection.mode
  ) {
    return false;
  }
  if (
    left.brandProfileSelection.mode === 'resolved' &&
    right.brandProfileSelection.mode === 'resolved'
  ) {
    return (
      left.brandProfileSelection.versionId ===
        right.brandProfileSelection.versionId &&
      left.brandProfileSelection.versionNumber ===
        right.brandProfileSelection.versionNumber &&
      left.brandProfileSelection.contentDigest ===
        right.brandProfileSelection.contentDigest
    );
  }
  return (
    left.brandProfileSelection.mode === 'neutral_fallback' &&
    right.brandProfileSelection.mode === 'neutral_fallback' &&
    left.brandProfileSelection.reason === right.brandProfileSelection.reason
  );
}

export function createGeneratorNdjsonConsumer(
  onEvent: (event: Record<string, unknown>) => void = () => undefined
) {
  let buffer = '';
  let output: any;
  let earlyProvenance: ContentIntelligenceProvenance | null = null;
  let finalProvenance: ContentIntelligenceProvenance | null = null;

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      throw new GeneratorStreamContractError(
        'GENERATION_STREAM_INVALID',
        'The generation response was incomplete. Please try again.'
      );
    }
    const data = asRecord(event.data);
    const eventOutput = asRecord(data?.output);

    if (event.error) {
      const serverCode = isNonEmptyString(event.code)
        ? event.code
        : isNonEmptyString(event.errorCode)
        ? event.errorCode
        : 'GENERATION_FAILED';
      const code: GeneratorStreamContractErrorCode = [
        'CONTENT_EVIDENCE_REQUIRED',
        'BRAND_PROFILE_VERSION_UNAVAILABLE',
        'CONTENT_CONTEXT_CITATIONS_INVALID',
      ].includes(serverCode)
        ? (serverCode as GeneratorStreamContractErrorCode)
        : 'GENERATION_FAILED';
      throw new GeneratorStreamContractError(
        code,
        isNonEmptyString(event.message)
          ? event.message
          : 'Failed to generate posts, please try again.'
      );
    }

    if (event.name === 'content-context') {
      const nextProvenance = parseServerContentProvenance(eventOutput);
      if (!nextProvenance) {
        throw new GeneratorStreamContractError(
          'GENERATION_CONTEXT_INVALID',
          'The server did not return a valid content context.'
        );
      }
      if (
        earlyProvenance &&
        !generatorBindingsEqual(earlyProvenance, nextProvenance)
      ) {
        throw new GeneratorStreamContractError(
          'GENERATION_CONTEXT_CHANGED',
          'The content context changed during generation. Please try again.'
        );
      }
      earlyProvenance = nextProvenance;
    }

    if (eventOutput && Array.isArray(eventOutput.content)) {
      const nextProvenance = parseServerContentProvenance(eventOutput);
      if (!nextProvenance) {
        throw new GeneratorStreamContractError(
          'GENERATION_CONTEXT_INVALID',
          'The final content context is missing or invalid.'
        );
      }
      if (!earlyProvenance) {
        throw new GeneratorStreamContractError(
          'GENERATION_CONTEXT_MISSING',
          'The final content context cannot be verified without the early binding.'
        );
      }
      if (!generatorBindingsEqual(earlyProvenance, nextProvenance)) {
        throw new GeneratorStreamContractError(
          'GENERATION_CONTEXT_CHANGED',
          'The content context changed during generation. Please try again.'
        );
      }
      output = eventOutput;
      finalProvenance = nextProvenance;
    }

    onEvent(event);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) consumeLine(line);
    },
    finish() {
      if (buffer.trim()) consumeLine(buffer);
      buffer = '';
      return { output, provenance: finalProvenance };
    },
  };
}

export function mergeServerContentContextEnvelope(
  binding: ContentIntelligenceProvenance | null,
  value: unknown
): ContentIntelligenceProvenance | null {
  const envelope = asRecord(value);
  const profile = asRecord(envelope?.profile);
  if (
    !binding ||
    !envelope ||
    !profile ||
    envelope.contractVersion !== 'content-context/v1' ||
    envelope.contentContextSnapshotId !== binding.contentContextSnapshotId ||
    envelope.status !== binding.contentContextStatus ||
    envelope.generationPolicy !== binding.generationPolicy ||
    envelope.selectionHash !== binding.selectionHash ||
    !isIsoDate(envelope.builtAt) ||
    !isIsoDate(envelope.expiresAt) ||
    !Array.isArray(envelope.facts) ||
    !Array.isArray(envelope.evidence) ||
    !Array.isArray(envelope.rejected)
  ) {
    return null;
  }
  if (
    (binding.errorCode === null && envelope.errorCode !== null) ||
    (binding.errorCode !== null && envelope.errorCode !== binding.errorCode)
  ) {
    return null;
  }

  if (binding.brandProfileSelection.mode === 'resolved') {
    if (
      profile.mode !== 'resolved' ||
      profile.versionId !== binding.brandProfileVersionId ||
      profile.versionNumber !== binding.brandProfileSelection.versionNumber ||
      (envelope.brandProfileVersionId !== undefined &&
        envelope.brandProfileVersionId !== binding.brandProfileVersionId)
    ) {
      return null;
    }
  } else if (
    profile.mode !== 'neutral_fallback' ||
    profile.reason !== binding.brandProfileSelection.reason ||
    (envelope.brandProfileVersionId !== undefined &&
      envelope.brandProfileVersionId !== null)
  ) {
    return null;
  }

  const evidenceByCitation = new Set<string>();
  const evidenceCitations: ContentIntelligenceCitation[] = [];
  for (const item of envelope.evidence) {
    const evidence = asRecord(item);
    if (
      !evidence ||
      !isNonEmptyString(evidence.citationId) ||
      evidenceByCitation.has(evidence.citationId) ||
      !isNonEmptyString(evidence.evidenceId) ||
      !isNonEmptyString(evidence.sourceSnapshotId) ||
      !isNonEmptyString(evidence.title) ||
      !isNonEmptyString(evidence.retrievedAt) ||
      !['PUBLIC', 'INTERNAL_ONLY'].includes(String(evidence.exposure))
    ) {
      return null;
    }
    evidenceByCitation.add(evidence.citationId);
    evidenceCitations.push({
      citationId: evidence.citationId,
      kind: 'EVIDENCE',
      label: evidence.title,
      retrievedAt: evidence.retrievedAt,
    });
  }

  const allCitationIds = new Set(evidenceByCitation);
  const factCitations: ContentIntelligenceCitation[] = [];
  for (const item of envelope.facts) {
    const fact = asRecord(item);
    if (
      !fact ||
      !isNonEmptyString(fact.citationId) ||
      allCitationIds.has(fact.citationId) ||
      !isNonEmptyString(fact.factId) ||
      !isNonEmptyString(fact.statement) ||
      !Array.isArray(fact.evidenceCitationIds) ||
      fact.evidenceCitationIds.length === 0 ||
      !fact.evidenceCitationIds.every(
        (citationId) =>
          isNonEmptyString(citationId) && evidenceByCitation.has(citationId)
      )
    ) {
      return null;
    }
    allCitationIds.add(fact.citationId);
    factCitations.push({
      citationId: fact.citationId,
      kind: 'FACT',
      label: fact.statement,
      ...(isIsoDate(fact.freshUntil) ? { freshUntil: fact.freshUntil } : {}),
    });
  }

  return {
    ...binding,
    builtAt: envelope.builtAt,
    expiresAt: envelope.expiresAt,
    availableCitations: [...factCitations, ...evidenceCitations],
  };
}

export function parseServerContentContextEnvelope(
  value: unknown
): ContentIntelligenceProvenance | null {
  const envelope = asRecord(value);
  const profile = asRecord(envelope?.profile);
  if (!envelope || !profile) return null;
  const brandProfileSelection =
    profile.mode === 'resolved'
      ? {
          mode: 'resolved',
          versionId: profile.versionId,
          versionNumber: profile.versionNumber,
          contentDigest: profile.contentDigest,
        }
      : profile.mode === 'neutral_fallback'
      ? { mode: 'neutral_fallback', reason: profile.reason }
      : null;
  if (!brandProfileSelection) return null;
  const binding = parseServerContentProvenance({
    contentContextSnapshotId: envelope.contentContextSnapshotId,
    brandProfileVersionId:
      profile.mode === 'resolved' ? profile.versionId : null,
    brandProfileSelection,
    contentContextStatus: envelope.status,
    generationPolicy: envelope.generationPolicy,
    selectionHash: envelope.selectionHash,
  });
  return mergeServerContentContextEnvelope(binding, envelope);
}

// The type used to live here; the parser it belongs with now sits next to it
// in `research.sources.ts`, and existing imports keep resolving through here.
export type { ResearchSource };

export interface Internal {
  integration: Integrations;
  integrationValue: Values[];
}

export interface SelectedIntegrations {
  settings: any;
  integration: Integrations;
  ref?: RefObject<any>;
}

interface StoreState {
  editor: undefined | 'none' | 'normal' | 'markdown' | 'html';
  loaded: boolean;
  date: dayjs.Dayjs;
  postComment: PostComment;
  dummy: boolean;
  repeater?: number;
  isCreateSet: boolean;
  totalChars: number;
  activateExitButton: boolean;
  tags: { label: string; value: string }[];
  tab: 0 | 1;
  current: string;
  comments: boolean | 'no-media';
  locked: boolean;
  hide: boolean;
  setLocked: (locked: boolean) => void;
  integrations: Integrations[];
  selectedIntegrations: SelectedIntegrations[];
  global: Values[];
  internal: Internal[];
  addGlobalValue: (index: number, value: Values[]) => void;
  setGlobalDelay: (index: number, minutes: number) => void;
  setInternalDelay: (
    integrationId: string,
    index: number,
    minutes: number
  ) => void;
  addInternalValue: (
    index: number,
    integrationId: string,
    value: Values[]
  ) => void;
  setGlobalValue: (value: Values[]) => void;
  setInternalValue: (integrationId: string, value: Values[]) => void;
  deleteGlobalValue: (index: number) => void;
  deleteInternalValue: (integrationId: string, index: number) => void;
  addRemoveInternal: (integrationId: string) => void;
  changeOrderGlobal: (index: number, direction: 'up' | 'down') => void;
  changeOrderInternal: (
    integrationId: string,
    index: number,
    direction: 'up' | 'down'
  ) => void;
  setGlobalValueText: (index: number, content: string) => void;
  setGlobalValueMedia: (
    index: number,
    media: { id: string; path: string }[]
  ) => void;
  setInternalValueMedia: (
    integrationId: string,
    index: number,
    media: { id: string; path: string }[]
  ) => void;
  addGlobalValueMedia: (
    index: number,
    media: { id: string; path: string }[]
  ) => void;
  removeGlobalValueMedia: (index: number, mediaIndex: number) => void;
  setInternalValueText: (
    integrationId: string,
    index: number,
    content: string
  ) => void;
  addInternalValueMedia: (
    integrationId: string,
    index: number,
    media: { id: string; path: string }[]
  ) => void;
  removeInternalValueMedia: (
    integrationId: string,
    index: number,
    mediaIndex: number
  ) => void;
  setAllIntegrations: (integrations: Integrations[]) => void;
  setCurrent: (current: string) => void;
  addOrRemoveSelectedIntegration: (
    integration: Integrations,
    settings: any
  ) => void;
  reset: () => void;
  setSelectedIntegrations: (
    params: { selectedIntegrations: Integrations; settings: any }[]
  ) => void;
  setTab: (tab: 0 | 1) => void;
  setHide: (hide: boolean) => void;
  setDate: (date: dayjs.Dayjs) => void;
  setRepeater: (repeater: number) => void;
  setTags: (tags: { label: string; value: string }[]) => void;
  setIsCreateSet: (isCreateSet: boolean) => void;
  setTotalChars?: (totalChars: number) => void;
  appendInternalValueMedia: (
    integrationId: string,
    index: number,
    media: { id: string; path: string }[]
  ) => void;
  appendGlobalValueMedia: (
    index: number,
    media: { id: string; path: string }[]
  ) => void;
  setPostComment: (postComment: PostComment) => void;
  setActivateExitButton?: (activateExitButton: boolean) => void;
  setDummy: (dummy: boolean) => void;
  setEditor: (editor: 'none' | 'normal' | 'markdown' | 'html') => void;
  setLoaded?: (loaded: boolean) => void;
  setChars: (id: string, chars: number) => void;
  chars: Record<string, number>;
  researchSources: ResearchSource[];
  setResearchSources: (sources: ResearchSource[]) => void;
  contentIntelligenceProvenance: ContentIntelligenceProvenance | null;
  setContentIntelligenceProvenance: (
    provenance: ContentIntelligenceProvenance | null
  ) => void;
  contentIntelligenceLoadState: 'idle' | 'loading' | 'ready' | 'error';
  setContentIntelligenceLoadState: (
    state: 'idle' | 'loading' | 'ready' | 'error'
  ) => void;
  contentIntelligenceFailure:
    | 'CONTENT_EVIDENCE_REQUIRED'
    | 'CONTEXT_UNAVAILABLE'
    | null;
  setContentIntelligenceFailure: (
    failure: 'CONTENT_EVIDENCE_REQUIRED' | 'CONTEXT_UNAVAILABLE' | null
  ) => void;
  setGlobalValueCitationIds: (index: number, citationIds: string[]) => void;
  setInternalValueCitationIds: (
    integrationId: string,
    index: number,
    citationIds: string[]
  ) => void;
  clearAllValueCitationIds: () => void;
  setComments: (comments: boolean | 'no-media') => void;
}

const initialState = {
  editor: undefined as undefined,
  loaded: true,
  dummy: false,
  comments: true,
  activateExitButton: true,
  date: newDayjs(),
  postComment: PostComment.ALL,
  tags: [] as { label: string; value: string }[],
  totalChars: 0,
  tab: 0 as 0,
  isCreateSet: false,
  current: 'global',
  locked: false,
  hide: false,
  integrations: [] as Integrations[],
  selectedIntegrations: [] as SelectedIntegrations[],
  global: [] as Values[],
  internal: [] as Internal[],
  chars: {},
  researchSources: [] as ResearchSource[],
  contentIntelligenceProvenance: null as ContentIntelligenceProvenance | null,
  contentIntelligenceLoadState: 'idle' as const,
  contentIntelligenceFailure: null as
    | 'CONTENT_EVIDENCE_REQUIRED'
    | 'CONTEXT_UNAVAILABLE'
    | null,
};

export const useLaunchStore = create<StoreState>()((set) => ({
  ...initialState,
  setResearchSources: (researchSources) => set({ researchSources }),
  setContentIntelligenceProvenance: (contentIntelligenceProvenance) =>
    set({ contentIntelligenceProvenance }),
  setContentIntelligenceLoadState: (contentIntelligenceLoadState) =>
    set({ contentIntelligenceLoadState }),
  setContentIntelligenceFailure: (contentIntelligenceFailure) =>
    set({ contentIntelligenceFailure }),
  setGlobalValueCitationIds: (index, usedCitationIds) =>
    set((state) => ({
      global: state.global.map((item, itemIndex) =>
        itemIndex === index ? { ...item, usedCitationIds } : item
      ),
    })),
  setInternalValueCitationIds: (integrationId, index, usedCitationIds) =>
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((value, valueIndex) =>
                valueIndex === index ? { ...value, usedCitationIds } : value
              ),
            }
          : item
      ),
    })),
  clearAllValueCitationIds: () =>
    set((state) => ({
      global: state.global.map((item) => ({
        ...item,
        usedCitationIds: [],
      })),
      internal: state.internal.map((item) => ({
        ...item,
        integrationValue: item.integrationValue.map((value) => ({
          ...value,
          usedCitationIds: [],
        })),
      })),
    })),
  setCurrent: (current: string) =>
    set((state) => ({
      current: current,
    })),
  addOrRemoveSelectedIntegration: (
    integration: Integrations,
    settings: any
  ) => {
    set((state) => {
      const existing = state.selectedIntegrations.find(
        (i) => i.integration.id === integration.id
      );

      if (existing) {
        const selectedList = state.selectedIntegrations.filter(
          (s, index) => s.integration.id !== existing.integration.id
        );

        return {
          ...(existing.integration.id === state.current
            ? { current: 'global' }
            : {}),
          loaded: false,
          selectedIntegrations: selectedList,
          ...(selectedList.length === 0
            ? {
                current: 'global',
                editor: 'normal',
              }
            : {}),
        };
      }

      return {
        selectedIntegrations: [
          ...state.selectedIntegrations,
          { integration, settings, ref: createRef() },
        ],
      };
    });
  },
  addGlobalValue: (index: number, value: Values[]) =>
    set((state) => {
      if (!state.global.length) {
        return { global: value };
      }

      return {
        global: state.global.reduce((acc, item, i) => {
          acc.push(item);
          if (i === index) {
            acc.push(...value);
          }
          return acc;
        }, []),
      };
    }),
  // Add value after index, similar to addGlobalValue, but for a speciic integration (index starts from 0)
  addInternalValue: (index: number, integrationId: string, value: Values[]) =>
    set((state) => {
      const integrationIndex = state.internal.findIndex(
        (i) => i.integration.id === integrationId
      );

      if (integrationIndex === -1) {
        return {
          internal: [
            ...state.internal,
            {
              integration: state.selectedIntegrations.find(
                (i) => i.integration.id === integrationId
              )!.integration,
              integrationValue: value,
            },
          ],
        };
      }

      const updatedIntegration = state.internal[integrationIndex];
      const newValues = updatedIntegration.integrationValue.reduce(
        (acc, item, i) => {
          acc.push(item);
          if (i === index) {
            acc.push(...value);
          }
          return acc;
        },
        [] as Values[]
      );

      return {
        internal: state.internal.map((i, idx) =>
          idx === integrationIndex ? { ...i, integrationValue: newValues } : i
        ),
      };
    }),
  deleteGlobalValue: (index: number) =>
    set((state) => {
      // Preserve the IDs at their current positions
      const ids = state.global.map((item) => item.id);

      // Get remaining data (content, delay, media) after filtering out deleted index
      const remainingData = state.global
        .filter((_, i) => i !== index)
        .map(({ id, ...rest }) => rest);

      // Reconstruct with preserved IDs
      return {
        global: remainingData.map((data, i) => ({
          id: ids[i],
          ...data,
        })),
      };
    }),
  deleteInternalValue: (integrationId: string, index: number) =>
    set((state) => {
      return {
        internal: state.internal.map((item) => {
          if (item.integration.id === integrationId) {
            // Preserve the IDs at their current positions
            const ids = item.integrationValue.map((v) => v.id);

            // Get remaining data after filtering out deleted index
            const remainingData = item.integrationValue
              .filter((_, idx) => idx !== index)
              .map(({ id, ...rest }) => rest);

            return {
              ...item,
              integrationValue: remainingData.map((data, i) => ({
                id: ids[i],
                ...data,
              })),
            };
          }
          return item;
        }),
      };
    }),
  addRemoveInternal: (integrationId: string) =>
    set((state) => {
      const integration = state.selectedIntegrations.find(
        (i) => i.integration.id === integrationId
      );
      const findIntegrationIndex = state.internal.findIndex(
        (i) => i.integration.id === integrationId
      );

      if (findIntegrationIndex > -1) {
        return {
          internal: state.internal.filter(
            (i) => i.integration.id !== integrationId
          ),
        };
      }

      return {
        internal: [
          ...state.internal,
          {
            integration: integration.integration,
            integrationValue: state.global.slice(0).map((p) => p),
          },
        ],
      };
    }),
  changeOrderGlobal: (index: number, direction: 'up' | 'down') =>
    set((state) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;

      if (targetIndex < 0 || targetIndex >= state.global.length) {
        return { global: state.global };
      }

      const currentItem = state.global[index];
      const targetItem = state.global[targetIndex];

      return {
        global: state.global.map((item, i) => {
          if (i === index) {
            return {
              id: item.id,
              content: targetItem.content,
              delay: targetItem.delay,
              media: targetItem.media,
              usedCitationIds: targetItem.usedCitationIds,
            };
          }
          if (i === targetIndex) {
            return {
              id: item.id,
              content: currentItem.content,
              delay: currentItem.delay,
              media: currentItem.media,
              usedCitationIds: currentItem.usedCitationIds,
            };
          }
          return item;
        }),
      };
    }),
  changeOrderInternal: (
    integrationId: string,
    index: number,
    direction: 'up' | 'down'
  ) =>
    set((state) => {
      return {
        internal: state.internal.map((item) => {
          if (item.integration.id === integrationId) {
            const targetIndex = direction === 'up' ? index - 1 : index + 1;

            if (
              targetIndex < 0 ||
              targetIndex >= item.integrationValue.length
            ) {
              return item;
            }

            const currentValue = item.integrationValue[index];
            const targetValue = item.integrationValue[targetIndex];

            return {
              ...item,
              integrationValue: item.integrationValue.map((v, i) => {
                if (i === index) {
                  return {
                    id: v.id,
                    content: targetValue.content,
                    delay: targetValue.delay,
                    media: targetValue.media,
                    usedCitationIds: targetValue.usedCitationIds,
                  };
                }
                if (i === targetIndex) {
                  return {
                    id: v.id,
                    content: currentValue.content,
                    delay: currentValue.delay,
                    media: currentValue.media,
                    usedCitationIds: currentValue.usedCitationIds,
                  };
                }
                return v;
              }),
            };
          }

          return item;
        }),
      };
    }),
  setGlobalValueText: (index: number, content: string) =>
    set((state) => ({
      global: state.global.map((item, i) =>
        i === index ? { ...item, content } : item
      ),
    })),
  setInternalValueMedia: (
    integrationId: string,
    index: number,
    media: { id: string; path: string }[]
  ) => {
    return set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((v, i) =>
                i === index ? { ...v, media } : v
              ),
            }
          : item
      ),
    }));
  },
  setGlobalValueMedia: (index: number, media: { id: string; path: string }[]) =>
    set((state) => ({
      global: state.global.map((item, i) =>
        i === index ? { ...item, media } : item
      ),
    })),
  addGlobalValueMedia: (index: number, media: { id: string; path: string }[]) =>
    set((state) => ({
      global: state.global.map((item, i) =>
        i === index ? { ...item, media: [...item.media, ...media] } : item
      ),
    })),
  removeGlobalValueMedia: (index: number, mediaIndex: number) =>
    set((state) => ({
      global: state.global.map((item, i) =>
        i === index
          ? {
              ...item,
              media: item.media.filter((_, idx) => idx !== mediaIndex),
            }
          : item
      ),
    })),
  setInternalValueText: (
    integrationId: string,
    index: number,
    content: string
  ) => {
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((v, i) =>
                i === index ? { ...v, content } : v
              ),
            }
          : item
      ),
    }));
  },
  addInternalValueMedia: (
    integrationId: string,
    index: number,
    media: { id: string; path: string }[]
  ) =>
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((v, i) =>
                i === index ? { ...v, media: [...v.media, ...media] } : v
              ),
            }
          : item
      ),
    })),
  removeInternalValueMedia: (
    integrationId: string,
    index: number,
    mediaIndex: number
  ) =>
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((v, i) =>
                i === index
                  ? {
                      ...v,
                      media: v.media.filter((_, idx) => idx !== mediaIndex),
                    }
                  : v
              ),
            }
          : item
      ),
    })),
  reset: () =>
    set((state) => ({
      ...state,
      ...initialState,
    })),
  setAllIntegrations: (integrations: Integrations[]) =>
    set((state) => ({
      integrations: integrations,
    })),
  setTab: (tab: 0 | 1) =>
    set((state) => ({
      tab: tab,
    })),
  setLocked: (locked: boolean) =>
    set((state) => ({
      locked: locked,
    })),
  setHide: (hide: boolean) =>
    set((state) => ({
      hide: hide,
    })),
  setDate: (date: dayjs.Dayjs) =>
    set((state) => ({
      date,
    })),
  setRepeater: (repeater: number) =>
    set((state) => ({
      repeater,
    })),
  setTags: (tags: { label: string; value: string }[]) =>
    set((state) => ({
      tags,
    })),
  setIsCreateSet: (isCreateSet: boolean) =>
    set((state) => ({
      isCreateSet,
    })),
  setSelectedIntegrations: (
    params: { selectedIntegrations: Integrations; settings: any }[]
  ) =>
    set((state) => ({
      selectedIntegrations: params.map((p) => ({
        integration: p.selectedIntegrations,
        settings: p.settings,
        ref: createRef(),
      })),
    })),
  setGlobalValue: (value: Values[]) =>
    set((state) => ({
      global: value,
    })),
  setInternalValue: (integrationId: string, value: Values[]) =>
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? { ...item, integrationValue: value }
          : item
      ),
    })),
  setTotalChars: (totalChars: number) =>
    set((state) => ({
      totalChars,
    })),
  appendInternalValueMedia: (
    integrationId: string,
    index: number,
    media: { id: string; path: string }[]
  ) =>
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((v, i) =>
                i === index
                  ? { ...v, media: [...(v?.media || []), ...media] }
                  : v
              ),
            }
          : item
      ),
    })),
  appendGlobalValueMedia: (
    index: number,
    media: { id: string; path: string }[]
  ) =>
    set((state) => ({
      global: state.global.map((item, i) =>
        i === index
          ? { ...item, media: [...(item?.media || []), ...media] }
          : item
      ),
    })),
  setPostComment: (postComment: PostComment) =>
    set((state) => ({
      postComment,
    })),
  setActivateExitButton: (activateExitButton: boolean) =>
    set((state) => ({
      activateExitButton,
    })),
  setDummy: (dummy: boolean) =>
    set((state) => ({
      dummy,
    })),
  setEditor: (editor: 'none' | 'normal' | 'markdown' | 'html') =>
    set((state) => ({
      editor,
    })),
  setLoaded: (loaded: boolean) =>
    set((state) => ({
      loaded,
    })),
  setChars: (id: string, chars: number) =>
    set((state) => ({
      chars: {
        ...state.chars,
        [id]: chars,
      },
    })),
  setComments: (comments: boolean | 'no-media') =>
    set((state) => ({
      comments,
    })),
  setGlobalDelay: (index: number, minutes: number) =>
    set((state) => ({
      global: state.global.map((item, i) =>
        i === index ? { ...item, delay: minutes } : item
      ),
    })),
  setInternalDelay: (integrationId: string, index: number, minutes: number) =>
    set((state) => ({
      internal: state.internal.map((item) =>
        item.integration.id === integrationId
          ? {
              ...item,
              integrationValue: item.integrationValue.map((v, i) =>
                i === index ? { ...v, delay: minutes } : v
              ),
            }
          : item
      ),
    })),
}));
