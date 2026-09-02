'use client';
import 'reflect-metadata';
import {
  parseServerContentContextEnvelope,
  useLaunchStore,
} from '@contentfactory/frontend/components/new-launch/store';
import { parseResearchSources } from '@contentfactory/frontend/components/new-launch/research.sources';
import type { DraftGap } from '@contentfactory/frontend/components/brand-voice/draft-gap-note';
import dayjs from 'dayjs';
import { FC, useEffect } from 'react';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { ManageModal } from '@contentfactory/frontend/components/new-launch/manage.modal';
import { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import { useShallow } from 'zustand/react/shallow';
import { useExistingData } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import type {
  ContentIntelligenceProvenance,
  ResearchSource,
} from '@contentfactory/frontend/components/new-launch/store';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';

export interface AddEditModalProps {
  dummy?: boolean;
  date: dayjs.Dayjs;
  integrations: Integrations[];
  allIntegrations?: Integrations[];
  selectedChannels?: string[];
  set?: any;
  focusedChannel?: string;
  addEditSets?: (data: any) => void;
  reopenModal: () => void;
  mutate: () => void;
  padding?: string;
  customClose?: () => void;
  onlyValues?: Array<{
    content: string;
    id?: string;
    image?: Array<{
      id: string;
      path: string;
    }>;
    usedCitationIds?: string[];
  }>;
  researchSources?: ResearchSource[];
  contentIntelligenceProvenance?: ContentIntelligenceProvenance;
  /**
   * Чего черновику не хватает — предложение, приехавшее вместе с ним.
   *
   * Считается на сервере в момент генерации и только тогда: это единственная
   * минута, когда продукт точно знает, что текст написал он. Тот же расчёт над
   * текстом, который человек напечатал сам, был бы анкетой, а её задача
   * запрещает прямо.
   */
  draftGap?: DraftGap | null;
}

export const AddEditModal: FC<AddEditModalProps> = (props) => {
  const { setAllIntegrations, setDate, setIsCreateSet, setDummy } =
    useLaunchStore(
      useShallow((state) => ({
        setAllIntegrations: state.setAllIntegrations,
        setDate: state.setDate,
        setIsCreateSet: state.setIsCreateSet,
        setDummy: state.setDummy,
      }))
    );

  const integrations = useLaunchStore((state) => state.integrations);
  useEffect(() => {
    setDummy(!!props.dummy);
    setDate(props.date || newDayjs());
    setAllIntegrations(props.allIntegrations || []);
    setIsCreateSet(!!props.addEditSets);
  }, []);

  if (!integrations.length) {
    return null;
  }

  return <AddEditModalInner {...props} />;
};

export const AddEditModalInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const { addOrRemoveSelectedIntegration, selectedIntegrations, integrations } =
    useLaunchStore(
      useShallow((state) => ({
        integrations: state.integrations,
        selectedIntegrations: state.selectedIntegrations,
        addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      }))
    );

  useEffect(() => {
    if (props?.set?.posts?.length) {
      for (const post of props?.set?.posts) {
        if (post.integration) {
          const integration = integrations.find(
            (i) => i.id === post.integration.id
          );
          addOrRemoveSelectedIntegration(integration, post.settings);
        }
      }
    }

    if (existingData.integration) {
      const integration = integrations.find(
        (i) => i.id === existingData.integration
      );
      addOrRemoveSelectedIntegration(integration, existingData.settings);
    }

    if (props?.selectedChannels?.length) {
      for (const channel of props.selectedChannels) {
        const integration = integrations.find((i) => i.id === channel);
        if (integration) {
          addOrRemoveSelectedIntegration(integration, {});
        }
      }
    }
  }, []);

  if (existingData.integration && selectedIntegrations.length === 0) {
    return null;
  }

  return <AddEditModalInnerInner {...props} />;
};

export const AddEditModalInnerInner: FC<AddEditModalProps> = (props) => {
  const existingData = useExistingData();
  const fetch = useFetch();
  const {
    reset,
    addGlobalValue,
    addInternalValue,
    global,
    setCurrent,
    internal,
    setTags,
    setEditorialStage,
    setEditor,
    setRepeater,
    setResearchSources,
    setContentIntelligenceProvenance,
    setContentIntelligenceLoadState,
    setContentIntelligenceFailure,
  } = useLaunchStore(
    useShallow((state) => ({
      reset: state.reset,
      addGlobalValue: state.addGlobalValue,
      addInternalValue: state.addInternalValue,
      setCurrent: state.setCurrent,
      global: state.global,
      internal: state.internal,
      setTags: state.setTags,
      setEditorialStage: state.setEditorialStage,
      setEditor: state.setEditor,
      setRepeater: state.setRepeater,
      setResearchSources: state.setResearchSources,
      setContentIntelligenceProvenance: state.setContentIntelligenceProvenance,
      setContentIntelligenceLoadState: state.setContentIntelligenceLoadState,
      setContentIntelligenceFailure: state.setContentIntelligenceFailure,
    }))
  );

  useEffect(() => {
    let active = true;
    const suppliedProvenance = props.contentIntelligenceProvenance || null;
    setContentIntelligenceProvenance(suppliedProvenance);
    setContentIntelligenceLoadState(suppliedProvenance ? 'ready' : 'idle');
    setContentIntelligenceFailure(null);

    const outputContexts = (existingData?.posts || [])
      .map((post: any) => post.contentOutputContext)
      .filter(Boolean);
    const hasStoredContext = (existingData?.posts || []).some(
      (post: any) => post.contentContextSnapshotId
    );
    if (
      !suppliedProvenance &&
      hasStoredContext &&
      outputContexts.length === 0
    ) {
      setContentIntelligenceLoadState('error');
      setContentIntelligenceFailure('CONTEXT_UNAVAILABLE');
    }
    if (!suppliedProvenance && outputContexts.length > 0) {
      setContentIntelligenceLoadState('loading');
      const expected = outputContexts[0];
      const consistent =
        outputContexts.length === existingData.posts.length &&
        outputContexts.every(
          (output: any) =>
            output.contentContextSnapshotId ===
              expected.contentContextSnapshotId &&
            output.brandProfileVersionId === expected.brandProfileVersionId &&
            Array.isArray(output.usedCitationIds) &&
            output.validationStatus === 'VALID' &&
            output.context?.id === output.contentContextSnapshotId
        );
      if (!consistent) {
        setContentIntelligenceLoadState('error');
        setContentIntelligenceFailure('CONTEXT_UNAVAILABLE');
      } else {
        void fetch(
          `/content-intelligence/contexts/${encodeURIComponent(
            expected.contentContextSnapshotId
          )}`
        )
          .then(async (response) => {
            if (!response.ok) throw new Error('context unavailable');
            const provenance = parseServerContentContextEnvelope(
              await response.json()
            );
            const knownCitations = new Set(
              provenance?.availableCitations.map((item) => item.citationId) ||
                []
            );
            const matchesOutput =
              provenance &&
              provenance.contentContextSnapshotId ===
                expected.contentContextSnapshotId &&
              provenance.brandProfileVersionId ===
                expected.brandProfileVersionId &&
              expected.context?.status === provenance.contentContextStatus &&
              new Date(expected.context?.builtAt).toISOString() ===
                provenance.builtAt &&
              new Date(expected.context?.expiresAt).toISOString() ===
                provenance.expiresAt &&
              (provenance.brandProfileSelection.mode === 'resolved'
                ? expected.profile?.id === provenance.brandProfileVersionId &&
                  expected.profile?.versionNumber ===
                    provenance.brandProfileSelection.versionNumber &&
                  ['PUBLISHED', 'ARCHIVED'].includes(
                    expected.profile?.lifecycle
                  )
                : expected.profile === null) &&
              outputContexts.every((output: any) =>
                output.usedCitationIds.every(
                  (citationId: unknown) =>
                    typeof citationId === 'string' &&
                    knownCitations.has(citationId)
                )
              );
            if (!matchesOutput) throw new Error('context mismatch');
            if (active) {
              const safeProfileLabel =
                typeof expected.profile?.label === 'string' &&
                expected.profile.label.trim()
                  ? expected.profile.label.trim()
                  : undefined;
              setContentIntelligenceProvenance({
                ...provenance,
                ...(safeProfileLabel ? { profileLabel: safeProfileLabel } : {}),
                validationStatus: 'VALID',
              });
              setContentIntelligenceLoadState('ready');
              setContentIntelligenceFailure(null);
            }
          })
          .catch(() => {
            if (active) {
              setContentIntelligenceProvenance(null);
              setContentIntelligenceLoadState('error');
              setContentIntelligenceFailure('CONTEXT_UNAVAILABLE');
            }
          });
      }
    }
    setResearchSources(
      props.researchSources ||
        parseResearchSources(existingData?.posts?.[0]?.researchSources)
    );
    if (existingData.integration) {
      if (existingData?.posts?.[0]?.intervalInDays) {
        setRepeater(existingData.posts[0].intervalInDays);
      }
      setTags(
        // @ts-ignore
        existingData?.posts?.[0]?.tags?.map((p: any) => ({
          label: p.tag.name,
          value: p.tag.name,
        })) || []
      );
      setEditorialStage(existingData?.posts?.[0]?.editorialStage ?? null);
      addInternalValue(
        0,
        existingData.integration,
        existingData.posts.map((post) => ({
          delay: post.delay,
          content:
            post.content.indexOf('<p>') > -1
              ? post.content
              : post.content
                  .split('\n')
                  .map((line: string) => `<p>${line}</p>`)
                  .join(''),
          id: post.id,
          usedCitationIds:
            (post as any).contentOutputContext?.usedCitationIds || [],
          // @ts-ignore
          media: post.image as any[],
        }))
      );
      setCurrent(existingData.integration);
    } else {
      setEditor('normal');
    }

    if (props.focusedChannel) {
      setCurrent(props.focusedChannel);
    }

    addGlobalValue(
      0,
      props.onlyValues?.length
        ? props.onlyValues.map((p) => ({
            content:
              p.content.indexOf('<p>') > -1
                ? p.content
                : p.content
                    .split('\n')
                    .map((line: string) => `<p>${line}</p>`)
                    .join(''),
            id: makeId(10),
            media: p.image || [],
            usedCitationIds: p.usedCitationIds || [],
          }))
        : props.set?.posts?.length
        ? props.set.posts[0].value.map((p: any) => ({
            id: makeId(10),
            content:
              p.content.indexOf('<p>') > -1
                ? p.content
                : p.content
                    .split('\n')
                    .map((line: string) => `<p>${line}</p>`)
                    .join(''),
            // @ts-ignore
            media: p.media,
            usedCitationIds: p.usedCitationIds || [],
          }))
        : [
            {
              content: '',
              id: makeId(10),
              media: [],
              usedCitationIds: [],
            },
          ]
    );

    return () => {
      active = false;
      reset();
    };
  }, []);

  if (!global.length && !internal.length) {
    return null;
  }

  return (
    <>
      <style>{`#support-discord {display: none !important;}`}</style>
      <ManageModal {...props} />
    </>
  );
};
