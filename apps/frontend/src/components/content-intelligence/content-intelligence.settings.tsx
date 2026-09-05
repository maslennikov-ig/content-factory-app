'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useUser } from '../layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  ContentIntelligenceView,
  type ContentIntelligenceActions,
  type ContentIntelligenceData,
  type ContentIntelligenceFeedback,
  type ContentIntelligenceSection,
  type ProvenanceView,
  type SourceDraftMaterialView,
} from './content-intelligence.view';
import {
  buildSourceCreatePayload,
  buildSourceRightsPayload,
  loadContentContext,
  mapSourceDraftMaterial,
  mapSourcesEnvelope,
  sourceEndpoint,
} from './content-intelligence.adapter';
import { resolveContentLocale } from './content-section.copy';

export const CONTENT_INTELLIGENCE_API = '/content-intelligence';
const SOURCES_API = sourceEndpoint();
export const CONTEXTS_API = `${CONTENT_INTELLIGENCE_API}/contexts`;

type Request = ReturnType<typeof useFetch>;
type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};

async function readJson(request: Request, path: string, init?: RequestInit) {
  const response = await request(path, init);
  if (!response.ok) {
    const error = new Error(
      `Content intelligence request failed: ${response.status}`
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

const emptyProvenance: ProvenanceView = Object.freeze({
  contextId: null,
  status: 'EMPTY',
  generationPolicy: 'EVIDENCE_REQUIRED',
  errorCode: 'CONTENT_EVIDENCE_REQUIRED',
  profile: { mode: 'neutral_fallback' as const, reason: 'NO_PROFILE' as const },
  facts: [],
  rejected: [],
});

const idleFeedback = (): Record<
  ContentIntelligenceSection,
  ContentIntelligenceFeedback
> => ({ sources: 'idle', provenance: 'idle' });

/**
 * The container. It owns the requests, the optimistic state and the error
 * handling; the view owns the pixels.
 *
 * Two sections, and there used to be three. The brand form went with the edit
 * that moved onto the avatar card: the same five voice fields had a second
 * editor here, under a separate heading, filling a draft that had to be
 * completed in full and consented to before any of it counted. One object with
 * two front doors is how the two come to disagree about what the object is, so
 * the far one is gone rather than kept in step.
 *
 * The Content route mounts it a section at a time behind its own tabs, which
 * is two props rather than two containers — a second copy of this wiring is
 * how two hosts would start disagreeing about what a failed save looks like.
 */
export function ContentIntelligenceSettings({
  visibleSections,
  showHeader,
}: {
  visibleSections?: readonly ContentIntelligenceSection[];
  showHeader?: boolean;
} = {}) {
  const request = useFetch();
  const user = useUser();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const [contextId, setContextId] = useState('');
  const [feedback, setFeedback] = useState(idleFeedback);
  const [draftMaterial, setDraftMaterial] =
    useState<SourceDraftMaterialView | null>(null);
  const [provenance, setProvenance] =
    useState<ProvenanceView>(emptyProvenance);
  const mutationSequence = useRef<Record<ContentIntelligenceSection, number>>({
    sources: 0,
    provenance: 0,
  });

  const loadSources = useCallback(() => readJson(request, SOURCES_API), [request]);
  const sourceQuery = useSWR(SOURCES_API, loadSources, {
    revalidateOnFocus: false,
  });

  const setSectionFeedback = useCallback(
    (section: ContentIntelligenceSection, value: ContentIntelligenceFeedback) =>
      setFeedback((current) => ({ ...current, [section]: value })),
    []
  );

  const runMutation = useCallback(
    async (
      section: ContentIntelligenceSection,
      operation: () => Promise<unknown>,
      refresh: () => Promise<unknown>,
      options?: {
        revisionConflict?: boolean;
        onResult?: (result: unknown) => void;
        onError?: (error: unknown) => void;
        successFeedback?: ContentIntelligenceFeedback;
        errorFeedback?: (
          error: unknown
        ) => Extract<ContentIntelligenceFeedback, 'error' | 'unavailable'>;
      }
    ) => {
      const sequence = ++mutationSequence.current[section];
      setSectionFeedback(section, 'pending');
      try {
        const result = await operation();
        options?.onResult?.(result);
        await refresh();
        if (sequence === mutationSequence.current[section]) {
          setSectionFeedback(
            section,
            options?.successFeedback ?? 'success'
          );
        }
      } catch (error) {
        if (sequence === mutationSequence.current[section]) {
          options?.onError?.(error);
          setSectionFeedback(
            section,
            options?.revisionConflict && asRecord(error).status === 409
              ? 'conflict'
              : options?.errorFeedback?.(error) ?? 'error'
          );
        }
      }
    },
    [setSectionFeedback]
  );

  const inspectContext = useCallback(
    (id: string) => {
      const normalizedId = id.trim();
      setContextId(id);
      if (!normalizedId) {
        setProvenance(emptyProvenance);
        setSectionFeedback('provenance', 'error');
        return;
      }
      void runMutation(
        'provenance',
        () =>
          loadContentContext(
            (path) => readJson(request, path),
            normalizedId
          ),
        () => Promise.resolve(),
        {
          onResult: (result) => setProvenance(result as ProvenanceView),
          onError: () => setProvenance(emptyProvenance),
          successFeedback: 'refreshed',
          errorFeedback: (error) =>
            asRecord(error).status === 404 ? 'unavailable' : 'error',
        }
      );
    },
    [request, runMutation, setSectionFeedback]
  );

  const actions = useMemo<ContentIntelligenceActions>(
    () => ({
      onRetry: (section) => {
        if (section === 'provenance') {
          inspectContext(contextId);
          return;
        }
        void runMutation(
          section,
          () => sourceQuery.mutate(),
          () => Promise.resolve(),
          { successFeedback: 'refreshed' }
        );
      },
      onAddSource: (form) =>
        void runMutation(
          'sources',
          () =>
            readJson(request, SOURCES_API, {
              method: 'POST',
              body: JSON.stringify(buildSourceCreatePayload(form)),
            }),
          () => sourceQuery.mutate()
        ),
      onConfirmSourceRights: (id) =>
        void runMutation(
          'sources',
          () =>
            readJson(
              request,
              sourceEndpoint(id, 'rights'),
              {
                method: 'POST',
                body: JSON.stringify(buildSourceRightsPayload(true)),
              }
            ),
          () => sourceQuery.mutate()
        ),
      onValidateSource: (id) =>
        void runMutation(
          'sources',
          () =>
            readJson(
              request,
              sourceEndpoint(id, 'validate'),
              { method: 'POST' }
            ),
          () => sourceQuery.mutate()
        ),
      onActivateSource: (id) =>
        void runMutation(
          'sources',
          () =>
            readJson(
              request,
              sourceEndpoint(id, 'activate'),
              { method: 'POST' }
            ),
          () => sourceQuery.mutate()
        ),
      onSyncSource: (id) =>
        void runMutation(
          'sources',
          () =>
            readJson(
              request,
              sourceEndpoint(id, 'sync'),
              { method: 'POST' }
            ),
          () => sourceQuery.mutate()
        ),
      onCreateDraftMaterial: (id) =>
        void runMutation(
          'sources',
          () =>
            readJson(
              request,
              sourceEndpoint(id, 'draft-material'),
              { method: 'POST' }
            ),
          () => Promise.resolve(),
          {
            onResult: (result) =>
              setDraftMaterial(mapSourceDraftMaterial(result)),
          }
        ),
      onRemoveSource: (id) =>
        void runMutation(
          'sources',
          () =>
            readJson(request, sourceEndpoint(id), {
              method: 'DELETE',
            }),
          () => sourceQuery.mutate()
        ),
      onInspectContext: (id) => {
        inspectContext(id);
      },
    }),
    [
      contextId,
      inspectContext,
      request,
      runMutation,
      setSectionFeedback,
      sourceQuery,
    ]
  );

  const sourceEnvelope = useMemo(
    () => mapSourcesEnvelope(sourceQuery.data),
    [sourceQuery.data]
  );
  const data = useMemo<ContentIntelligenceData>(
    () => ({
      // Источники и факты — работа редактора с 05.09.2026
      // (`content-factory-next-fn33.90`). Та же функция, что читает сервер в
      // `Sections.EDITOR`: экран и дверь не могут разойтись во мнении.
      canManage: isOrganizationEditor(user?.role),
      sources: sourceEnvelope.sources,
      sourceCapabilities: sourceEnvelope.capabilities,
      sourceDraftMaterial: draftMaterial,
      provenance,
      provenanceAvailable: true,
    }),
    [draftMaterial, provenance, sourceEnvelope, user?.role]
  );

  const sectionStates = {
    sources: sourceQuery.isLoading
      ? 'loading'
      : sourceQuery.error
      ? 'error'
      : data.sources.length === 0
      ? 'empty'
      : 'default',
    provenance: 'default',
  } as const;

  return (
    <ContentIntelligenceView
      locale={locale}
      data={data}
      actions={actions}
      sectionStates={sectionStates}
      sectionFeedback={feedback}
      visibleSections={visibleSections}
      showHeader={showHeader}
      contextIdValue={contextId}
      onContextIdChange={setContextId}
    />
  );
}

export default ContentIntelligenceSettings;
