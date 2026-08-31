'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  ClipboardEvent,
  forwardRef,
  useImperativeHandle,
} from 'react';
import clsx from 'clsx';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import EmojiPicker from 'emoji-picker-react';
import { EmojiStyle, Theme } from 'emoji-picker-react';
import { BoldText } from '@contentfactory/frontend/components/new-launch/bold.text';
import { UText } from '@contentfactory/frontend/components/new-launch/u.text';
import { SignatureBox } from '@contentfactory/frontend/components/signature';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  type ContentIntelligenceCitation,
  type ContentIntelligenceProvenance,
  parseServerContentContextEnvelope,
  type ResearchSource,
  SelectedIntegrations,
  useLaunchStore,
} from '@contentfactory/frontend/components/new-launch/store';
import { useShallow } from 'zustand/react/shallow';
import { AddPostButton } from '@contentfactory/frontend/components/new-launch/add.post.button';
import { MultiMediaComponent } from '@contentfactory/frontend/components/media/media.component';
import { UpDownArrow } from '@contentfactory/frontend/components/launches/up.down.arrow';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useExistingData } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';
import { useDropzone } from 'react-dropzone';
import { useUppyUploader } from '@contentfactory/frontend/components/media/new.uploader';
import { Dashboard } from '@uppy/react';
import Link from '@tiptap/extension-link';
import {
  useEditor,
  EditorContent,
  Extension,
  mergeAttributes,
} from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Bold from '@tiptap/extension-bold';
import Text from '@tiptap/extension-text';
import Paragraph from '@tiptap/extension-paragraph';
import Underline from '@tiptap/extension-underline';
import { stripHtmlValidation } from '@contentfactory/helpers/utils/strip.html.validation';
import { History } from '@tiptap/extension-history';
import { BulletList, ListItem } from '@tiptap/extension-list';
import { Bullets } from '@contentfactory/frontend/components/new-launch/bullets.component';
import Heading from '@tiptap/extension-heading';
import { HeadingComponent } from '@contentfactory/frontend/components/new-launch/heading.component';
import Mention from '@tiptap/extension-mention';
import { suggestion } from '@contentfactory/frontend/components/new-launch/mention.component';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { AComponent } from '@contentfactory/frontend/components/new-launch/a.component';
import { Placeholder } from '@tiptap/extensions';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { InformationComponent } from '@contentfactory/frontend/components/launches/information.component';
import {
  LockIcon,
  ConnectionLineIcon,
  ResetIcon,
  TrashIcon,
  EmojiIcon,
  DelayIcon,
} from '@contentfactory/frontend/components/ui/icons';
import { DelayComponent } from '@contentfactory/frontend/components/new-launch/delay.component';
import { Button } from '@contentfactory/react/form/button';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024; // 1 GB

export const ContentIntelligenceContextSummary: FC<{
  provenance: ContentIntelligenceProvenance | null;
  loadState: 'idle' | 'loading' | 'ready' | 'error';
  failure: 'CONTENT_EVIDENCE_REQUIRED' | 'CONTEXT_UNAVAILABLE' | null;
  researchSources?: ResearchSource[];
}> = ({ provenance, loadState, failure, researchSources = [] }) => {
  const t = useT();
  const { language } = useVariables();
  const isRussian = language === 'ru';
  const isGrounded =
    provenance?.generationPolicy === 'ALLOW_GROUNDED' &&
    (provenance.contentContextStatus === 'READY' ||
      provenance.contentContextStatus === 'PARTIAL');
  const draftPolicyCopy = isGrounded
    ? t(
        'content_context_grounded_draft_only',
        isRussian
          ? 'Контент с подтверждёнными источниками можно сохранить только как черновик.'
          : 'Grounded output can be saved as a draft only.'
      )
    : provenance?.generationPolicy === 'ALLOW_USER_ONLY'
    ? t(
        'content_context_user_only_draft',
        isRussian
          ? 'В черновик можно сохранить только материалы пользователя.'
          : 'Only user-provided material can be saved as a draft.'
      )
    : t(
        'content_context_evidence_required',
        isRussian
          ? 'Сначала подтвердите контекст: без доказательств сохранить черновик нельзя.'
          : 'Verify the context first; evidence is required before this draft can be saved.'
      );
  if (loadState === 'idle' && researchSources.length === 0) return null;
  return (
    <div className="flex flex-col gap-[10px] border-t border-cf-border pt-[12px]">
      {loadState === 'loading' && (
        <p className="cf-body-sm text-cf-ink-muted" role="status">
          {t(
            'content_context_loading',
            'Loading trusted context and freshness…'
          )}
        </p>
      )}
      {loadState === 'error' && (
        <div
          className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] text-cf-danger"
          role="alert"
        >
          <div className="cf-label-md">
            {failure === 'CONTENT_EVIDENCE_REQUIRED'
              ? 'CONTENT_EVIDENCE_REQUIRED'
              : t(
                  'content_context_unavailable',
                  'Content provenance is unavailable'
                )}
          </div>
          <p className="cf-body-sm mt-[4px] text-pretty">
            {failure === 'CONTENT_EVIDENCE_REQUIRED'
              ? t(
                  'content_evidence_required_help',
                  'Verify current evidence before generating or saving this draft.'
                )
              : t(
                  'content_context_unavailable_help',
                  'The draft is not treated as grounded and cannot save provenance until the server context is verified.'
                )}
          </p>
        </div>
      )}
      {provenance && (
        <div
          className="flex flex-wrap gap-x-[16px] gap-y-[8px]"
          role="status"
          aria-label={t('applied_content_context', 'Applied content context')}
        >
          <span className="cf-label-sm text-cf-ink">
            {provenance.brandProfileSelection.mode === 'resolved'
              ? `${
                  provenance.profileLabel ||
                  t('applied_brand_profile', 'Applied brand profile')
                } · v${provenance.brandProfileSelection.versionNumber}`
              : t('neutral_voice', 'Neutral voice')}
          </span>
          <span className="cf-caption text-cf-ink-muted">
            {t('context_status', 'Context status')}:{' '}
            {provenance.contentContextStatus}
            {provenance.validationStatus
              ? ` · ${provenance.validationStatus}`
              : ''}
          </span>
          {provenance.expiresAt && (
            <span className="cf-caption text-cf-ink-muted">
              {t(
                'context_expires',
                isRussian ? 'Срок действия контекста' : 'Context expires'
              )}
              : {provenance.expiresAt}
            </span>
          )}
          <span className="cf-caption text-cf-ink-muted">
            {draftPolicyCopy}
          </span>
        </div>
      )}
      {researchSources.length > 0 && (
        <div>
          <div className="mb-[6px] text-[12px] font-[600] text-cf-ink">
            {t('compatibility_sources', 'Compatibility sources')}
          </div>
          <p className="mb-[8px] text-[13px] text-cf-ink-muted text-pretty">
            {t(
              'compatibility_sources_help',
              'Legacy links are display-only and do not establish provenance.'
            )}
          </p>
          <ul className="flex flex-col gap-[6px]">
            {researchSources.map((source) => (
              <li key={source.url} className="text-[12px]">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-cf-accent underline underline-offset-2"
                >
                  {source.title}
                </a>
                {source.publishedAt && (
                  <span className="ms-[6px] text-cf-ink-muted">
                    {source.publishedAt}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export const ContentIntelligenceCitationSelector: FC<{
  citations: readonly ContentIntelligenceCitation[];
  selectedCitationIds: readonly string[];
  onChange: (citationId: string, checked: boolean) => void;
}> = ({ citations, selectedCitationIds, onChange }) => {
  const t = useT();
  if (citations.length === 0) return null;
  return (
    <fieldset className="mx-[12px] mb-[12px] min-w-0 border-t border-cf-border pt-[12px]">
      <legend className="cf-label-sm px-[4px] text-cf-ink">
        {t('used_citations', 'Used citations')}
      </legend>
      <p className="cf-caption mb-[4px] text-cf-ink-muted text-pretty">
        {t(
          'used_citations_help',
          'Choose the server-issued facts and evidence used by this item.'
        )}
      </p>
      <div className="flex flex-col">
        {citations.map((citation) => (
          <CheckboxField
            key={citation.citationId}
            checked={selectedCitationIds.includes(citation.citationId)}
            onChange={(event) =>
              onChange(citation.citationId, event.currentTarget.checked)
            }
            label={`${citation.kind === 'FACT' ? 'Fact' : 'Source'} · ${
              citation.label
            }`}
          />
        ))}
      </div>
    </fieldset>
  );
};

const InterceptBoldShortcut = Extension.create({
  name: 'preventBoldWithUnderline',

  addKeyboardShortcuts() {
    return {
      'Mod-b': () => {
        // For example, toggle bold while removing underline
        this?.editor?.commands?.unsetUnderline();
        return this?.editor?.commands?.toggleBold();
      },
    };
  },
});

const InterceptUnderlineShortcut = Extension.create({
  name: 'preventUnderlineWithUnderline',

  addKeyboardShortcuts() {
    return {
      'Mod-u': () => {
        // For example, toggle bold while removing underline
        this?.editor?.commands?.unsetBold();
        return this?.editor?.commands?.toggleUnderline();
      },
    };
  },
});

export const EditorWrapper: FC<{
  totalPosts: number;
  value: string;
}> = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [researching, setResearching] = useState(false);
  const researchRequestRef = useRef(0);
  const { language: interfaceLanguage } = useVariables();
  const {
    setGlobalValueText,
    setInternalValueText,
    addRemoveInternal,
    internal,
    global,
    current,
    addInternalValue,
    addGlobalValue,
    setInternalValueMedia,
    appendInternalValueMedia,
    appendGlobalValueMedia,
    setGlobalValueMedia,
    changeOrderGlobal,
    changeOrderInternal,
    isCreateSet,
    deleteGlobalValue,
    deleteInternalValue,
    setGlobalValue,
    setInternalValue,
    setInternalDelay,
    setGlobalDelay,
    internalFromAll,
    totalChars,
    postComment,
    dummy,
    editor,
    loadedState,
    setLoadedState,
    selectedIntegration,
    chars,
    comments,
    researchSources,
    setResearchSources,
    contentIntelligenceProvenance,
    setContentIntelligenceProvenance,
    contentIntelligenceLoadState,
    setContentIntelligenceLoadState,
    contentIntelligenceFailure,
    setContentIntelligenceFailure,
    setGlobalValueCitationIds,
    setInternalValueCitationIds,
    clearAllValueCitationIds,
  } = useLaunchStore(
    useShallow((state) => ({
      internal: state.internal.find((p) => p.integration.id === state.current),
      internalFromAll: state.integrations.find((p) => p.id === state.current),
      global: state.global,
      comments: state.comments,
      researchSources: state.researchSources,
      setResearchSources: state.setResearchSources,
      contentIntelligenceProvenance: state.contentIntelligenceProvenance,
      setContentIntelligenceProvenance: state.setContentIntelligenceProvenance,
      contentIntelligenceLoadState: state.contentIntelligenceLoadState,
      setContentIntelligenceLoadState: state.setContentIntelligenceLoadState,
      contentIntelligenceFailure: state.contentIntelligenceFailure,
      setContentIntelligenceFailure: state.setContentIntelligenceFailure,
      setGlobalValueCitationIds: state.setGlobalValueCitationIds,
      setInternalValueCitationIds: state.setInternalValueCitationIds,
      clearAllValueCitationIds: state.clearAllValueCitationIds,
      current: state.current,
      addRemoveInternal: state.addRemoveInternal,
      dummy: state.dummy,
      setInternalValueText: state.setInternalValueText,
      setGlobalValueText: state.setGlobalValueText,
      addInternalValue: state.addInternalValue,
      addGlobalValue: state.addGlobalValue,
      setGlobalValueMedia: state.setGlobalValueMedia,
      setInternalValueMedia: state.setInternalValueMedia,
      changeOrderGlobal: state.changeOrderGlobal,
      changeOrderInternal: state.changeOrderInternal,
      isCreateSet: state.isCreateSet,
      deleteGlobalValue: state.deleteGlobalValue,
      deleteInternalValue: state.deleteInternalValue,
      setGlobalValue: state.setGlobalValue,
      setInternalValue: state.setInternalValue,
      setGlobalDelay: state.setGlobalDelay,
      setInternalDelay: state.setInternalDelay,
      totalChars: state.totalChars,
      appendInternalValueMedia: state.appendInternalValueMedia,
      appendGlobalValueMedia: state.appendGlobalValueMedia,
      postComment: state.postComment,
      editor: state.editor,
      loadedState: state.loaded,
      setLoadedState: state.setLoaded,
      selectedIntegration: state.selectedIntegrations,
      chars: state.chars,
    }))
  );

  const existingData = useExistingData();
  const [loaded, setLoaded] = useState(true);

  useEffect(() => {
    if (loaded && loadedState) {
      return;
    }

    setLoadedState(true);
    setLoaded(true);
  }, [loaded, loadedState]);

  const canEdit = useMemo(() => {
    return current === 'global' || !!internal;
  }, [current, internal]);

  const items = useMemo(() => {
    if (internal) {
      return internal.integrationValue;
    }

    return global;
  }, [internal, global]);

  const setValue = useCallback(
    (value: string[]) => {
      const newValue = value.map((p, index) => {
        return {
          id: makeId(10),
          delay: 0,
          ...(items?.[index]?.media
            ? { media: items[index].media }
            : { media: [] }),
          content: p,
          usedCitationIds: items?.[index]?.usedCitationIds || [],
        };
      });
      if (internal) {
        return setInternalValue(current, newValue);
      }

      return setGlobalValue(newValue);
    },
    [internal, items]
  );

  useCopilotReadable({
    description: 'Current content of posts',
    value: items.map((p) => p.content),
  });

  useCopilotAction({
    name: 'setPosts',
    description: 'a thread of posts',
    parameters: [
      {
        name: 'content',
        type: 'string[]',
        description: 'a thread of posts',
      },
    ],
    handler: async ({ content }) => {
      setValue(content);
    },
  });

  const researchSubject = useMemo(
    () =>
      items
        .map((item) => stripHtmlValidation('normal', item.content, true))
        .filter(Boolean)
        .join('\n'),
    [items]
  );

  const researchWeb = useCallback(
    async (subject: string) => {
      const requestId = ++researchRequestRef.current;
      setContentIntelligenceLoadState('loading');
      setContentIntelligenceFailure(null);
      const contentLanguage =
        internalFromAll?.contentLanguage ||
        (interfaceLanguage === 'ru' ? 'ru' : 'en');
      const response = await fetch(
        `/copilot/research?language=${encodeURIComponent(contentLanguage)}`,
        {
          method: 'POST',
          body: JSON.stringify({ subject }),
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (requestId !== researchRequestRef.current) return null;
        const failure =
          error?.code === 'CONTENT_EVIDENCE_REQUIRED'
            ? 'CONTENT_EVIDENCE_REQUIRED'
            : 'CONTEXT_UNAVAILABLE';
        setContentIntelligenceProvenance(null);
        setContentIntelligenceFailure(failure);
        setContentIntelligenceLoadState('error');
        throw new Error(
          failure === 'CONTENT_EVIDENCE_REQUIRED'
            ? t(
                'content_evidence_required',
                'CONTENT_EVIDENCE_REQUIRED: Current evidence is required before generation.'
              )
            : error?.message ||
              t('web_research_failed', 'Web research is unavailable')
        );
      }
      const result = await response.json();
      if (requestId !== researchRequestRef.current) return null;
      const provenance = parseServerContentContextEnvelope(result);
      if (!provenance) {
        setContentIntelligenceProvenance(null);
        setContentIntelligenceFailure('CONTEXT_UNAVAILABLE');
        setContentIntelligenceLoadState('error');
        throw new Error(
          t(
            'content_context_invalid',
            'The server did not return a valid content context.'
          )
        );
      }
      setContentIntelligenceProvenance(provenance);
      setContentIntelligenceFailure(null);
      setContentIntelligenceLoadState('ready');
      clearAllValueCitationIds();
      return provenance;
    },
    [
      current,
      clearAllValueCitationIds,
      fetch,
      interfaceLanguage,
      internal,
      internalFromAll?.contentLanguage,
      items,
      setContentIntelligenceFailure,
      setContentIntelligenceLoadState,
      setContentIntelligenceProvenance,
      setGlobalValueCitationIds,
      setInternalValueCitationIds,
      t,
    ]
  );

  useCopilotAction({
    name: 'researchWeb',
    description:
      'Research the requested subject on the web and show cited material beside the current draft',
    parameters: [
      {
        name: 'subject',
        type: 'string',
        description: 'The subject to research',
        required: true,
      },
    ],
    handler: async ({ subject }) => researchWeb(subject),
  });

  const researchCurrentDraft = useCallback(async () => {
    setResearching(true);
    try {
      await researchWeb(researchSubject);
    } catch (error) {
      toaster.show(
        error instanceof Error
          ? error.message
          : t('web_research_failed', 'Web research is unavailable'),
        'warning'
      );
    } finally {
      setResearching(false);
    }
  }, [researchSubject, researchWeb, t, toaster]);

  const changeCitations = useCallback(
    (index: number, citationId: string, checked: boolean) => {
      const selected = new Set(items[index]?.usedCitationIds || []);
      if (checked) selected.add(citationId);
      else selected.delete(citationId);
      const next = [...selected].sort();
      if (internal) {
        setInternalValueCitationIds(current, index, next);
      } else {
        setGlobalValueCitationIds(index, next);
      }
    },
    [
      current,
      internal,
      items,
      setGlobalValueCitationIds,
      setInternalValueCitationIds,
    ]
  );

  const changeValue = useCallback(
    (index: number) => (value: string) => {
      if (internal) {
        return setInternalValueText(current, index, value);
      }

      return setGlobalValueText(index, value);
    },
    [current, global, internal]
  );

  const changeImages = useCallback(
    (index: number) => (value: any[]) => {
      if (internal) {
        return setInternalValueMedia(current, index, value);
      }

      return setGlobalValueMedia(index, value);
    },
    [current, global, internal]
  );

  const appendImages = useCallback(
    (index: number) => (value: any[]) => {
      if (internal) {
        return appendInternalValueMedia(current, index, value);
      }

      return appendGlobalValueMedia(index, value);
    },
    [current, global, internal]
  );

  const changeOrder = useCallback(
    (index: number) => (direction: 'up' | 'down') => {
      if (internal) {
        changeOrderInternal(current, index, direction);
        return setLoaded(false);
      }

      changeOrderGlobal(index, direction);
      setLoaded(false);
    },
    [changeOrderInternal, changeOrderGlobal, current, global, internal]
  );

  const goBackToGlobal = useCallback(async () => {
    if (
      await deleteDialog(
        t(
          'are_you_sure_go_back_to_global_mode',
          'This action is irreversible. Are you sure you want to go back to global mode?'
        ),
        t('yes_go_back_to_global_mode', 'Yes, go back to global mode')
      )
    ) {
      setLoaded(false);
      addRemoveInternal(current);
    }
  }, [addRemoveInternal, current, t]);

  const addValue = useCallback(
    (index: number) => () => {
      setTimeout(() => {
        // scroll the the bottom
        document.querySelector('#social-content').scrollTo({
          top: document.querySelector('#social-content').scrollHeight,
        });
      }, 20);
      if (internal) {
        return addInternalValue(index, current, [
          {
            delay: 0,
            content: '',
            id: makeId(10),
            media: [],
            usedCitationIds: [],
          },
        ]);
      }

      return addGlobalValue(index, [
        {
          delay: 0,
          content: '',
          id: makeId(10),
          media: [],
          usedCitationIds: [],
        },
      ]);
    },
    [current, global, internal]
  );

  const deletePost = useCallback(
    (index: number) => async () => {
      if (
        !(await deleteDialog(
          t(
            'are_you_sure_delete_this_post',
            'Are you sure you want to delete this post?'
          ),
          t('yes_delete_it', 'Yes, delete it!')
        ))
      ) {
        return;
      }

      if (internal) {
        deleteInternalValue(current, index);
        return setLoaded(false);
      }

      deleteGlobalValue(index);
      setLoaded(false);
    },
    [current, global, internal, t]
  );

  if (!loaded || !loadedState) {
    return null;
  }

  return (
    <div
      className={clsx(
        'relative flex-col gap-[20px] flex-1',
        (items.length === 1 || !canEdit || !comments) && 'flex',
        ((!canEdit && !isCreateSet) || !comments) &&
          'bg-newSettings rounded-[12px]'
      )}
    >
      {isCreateSet && current !== 'global' && (
        <>
          <div className="text-center absolute w-full h-full left-0 top-0 items-center justify-center flex z-[101] flex-col gap-[16px]">
            <div>
              <div className="w-[54px] h-[54px] rounded-full absolute z-[101] flex justify-center items-center">
                <LockIcon />
              </div>
              <div className="w-[54px] h-[54px] rounded-full bg-newSettings opacity-80" />
            </div>
            <div className="text-[14px] font-[600] text-cf-ink">
              {t(
                'cant_edit_networks_when_creating_set',
                "You can't edit networks when creating a set"
              )}
            </div>
          </div>
          <div className="absolute w-full h-full left-0 top-0 bg-newBackdrop opacity-60 z-[100] rounded-[12px]" />
        </>
      )}
      {!canEdit && !isCreateSet && (
        <>
          <div
            onClick={() => {
              setLoaded(false);
              addRemoveInternal(current);
            }}
            className="text-center absolute w-full h-full p-[20px] left-0 top-0 items-center justify-center flex z-[101] flex-col gap-[16px]"
          >
            <div>
              <div className="w-[54px] h-[54px] rounded-full absolute z-[101] flex justify-center items-center">
                <LockIcon />
              </div>
              <div className="w-[54px] h-[54px] rounded-full bg-newSettings opacity-80" />
            </div>
            <div className="text-[14px] font-[600] text-cf-ink">
              {t(
                'click_to_exit_global_editing',
                'Click this button to exit global editing and customize the post for this channel'
              )}
            </div>
            <div>
              <div className="text-cf-accent-ink rounded-[8px] h-[44px] px-[20px] bg-cf-accent cursor-pointer flex justify-center items-center">
                {t('edit_content', 'Edit content')}
              </div>
            </div>
          </div>
          <div className="absolute w-full h-full left-0 top-0 bg-newBackdrop opacity-60 z-[100] rounded-[12px]" />
        </>
      )}
      {canEdit && (
        <div className="mx-[12px] mt-[12px] flex flex-col gap-[12px] rounded-[10px] border border-cf-border bg-cf-surface p-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-[12px]">
            <div>
              <div className="text-[14px] font-[600] text-cf-ink">
                {t('trusted_context', 'Trusted context')}
              </div>
              <div className="text-[12px] text-cf-ink-muted">
                {t(
                  'web_research_editor_hint',
                  'Build a server-issued context, then choose citations for each draft item.'
                )}
              </div>
            </div>
            <Button
              type="button"
              secondary={true}
              disabled={researching || !researchSubject.trim()}
              onClick={researchCurrentDraft}
            >
              {researching
                ? t('researching', 'Researching…')
                : t('research_current_draft', 'Research current draft')}
            </Button>
          </div>
          <ContentIntelligenceContextSummary
            provenance={contentIntelligenceProvenance}
            loadState={contentIntelligenceLoadState}
            failure={contentIntelligenceFailure}
            researchSources={researchSources}
          />
        </div>
      )}
      {items.map((g, index) => (
        <div
          key={g.id}
          className={clsx(
            'relative flex flex-col gap-[20px] flex-1 bg-newSettings',
            index === 0 && 'rounded-t-[12px]',
            (index === items.length - 1 || !comments) && 'rounded-b-[12px]',
            !canEdit && !isCreateSet && 'blur-s',
            ((!canEdit && index > 0) || (!comments && index > 0)) && 'hidden'
          )}
        >
          <div className="flex gap-[5px] flex-1 w-full">
            <div className="flex-1 flex w-full">
              {index > 0 && (
                <div className="flex justify-center pl-[12px] text-newSep">
                  <ConnectionLineIcon />
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <Editor
                  comments={comments}
                  editorType={editor}
                  allValues={items}
                  onChange={changeValue(index)}
                  key={index}
                  num={index}
                  totalPosts={global.length}
                  value={g.content}
                  pictures={g.media}
                  setImages={changeImages(index)}
                  autoComplete={canEdit}
                  validateChars={true}
                  identifier={internalFromAll?.identifier || 'global'}
                  totalChars={totalChars}
                  appendImages={appendImages(index)}
                  dummy={dummy}
                  selectedIntegration={selectedIntegration}
                  chars={chars}
                  childButton={
                    <>
                      {(canEdit && items.length - 1 === index) || !comments ? (
                        <div className="flex items-center">
                          <div className="flex-1">
                            {comments && (
                              <AddPostButton
                                num={index}
                                onClick={addValue(index)}
                                postComment={postComment}
                              />
                            )}
                          </div>
                          {!!internal && !existingData?.integration && (
                            <div
                              className="mt-[12px] flex gap-[20px] items-center cursor-pointer select-none"
                              onClick={goBackToGlobal}
                            >
                              <div className="flex gap-[6px] items-center">
                                <div className="w-[8px] h-[8px] rounded-full bg-cf-signature" />
                                <div className="text-[14px] font-[600]">
                                  {t(
                                    'editing_a_specific_network',
                                    'Editing a Specific Network'
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-[6px] items-center">
                                <div>
                                  <ResetIcon />
                                </div>
                                <div className="text-[13px] font-[600]">
                                  {t('back_to_global', 'Back to global')}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </>
                  }
                />
                <ContentIntelligenceCitationSelector
                  citations={
                    contentIntelligenceProvenance?.availableCitations || []
                  }
                  selectedCitationIds={g.usedCitationIds || []}
                  onChange={(citationId, checked) =>
                    changeCitations(index, citationId, checked)
                  }
                />
              </div>
            </div>
            {comments && (
              <div className="flex flex-col items-center gap-[10px] pe-[12px]">
                <UpDownArrow
                  isUp={index !== 0}
                  isDown={index !== items.length - 1}
                  onChange={changeOrder(index)}
                />
                {items.length > 1 && (
                  <TrashIcon
                    onClick={deletePost(index)}
                    data-tooltip-id="tooltip"
                    data-tooltip-content={t(
                      'delete_post_tooltip',
                      'Delete Post'
                    )}
                    className="cursor-pointer text-[#FF3F3F]"
                  />
                )}
                {index > 0 && (
                  <DelayComponent currentIndex={index} currentDelay={g.delay} />
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const Editor: FC<{
  editorType?: 'none' | 'normal' | 'markdown' | 'html';
  totalPosts: number;
  value: string;
  num?: number;
  pictures?: any[];
  allValues?: any[];
  onChange: (value: string) => void;
  setImages?: (value: any[]) => void;
  appendImages?: (value: any[]) => void;
  autoComplete?: boolean;
  validateChars?: boolean;
  comments: boolean | 'no-media';
  identifier?: string;
  totalChars?: number;
  selectedIntegration: SelectedIntegrations[];
  dummy: boolean;
  chars: Record<string, number>;
  childButton?: React.ReactNode;
}> = (props) => {
  const {
    editorType = 'normal',
    allValues,
    pictures,
    setImages,
    num,
    identifier,
    appendImages,
    dummy,
    chars,
    childButton,
    comments,
  } = props;
  const [id] = useState(makeId(10));
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const t = useT();
  const toaster = useToaster();
  const editorRef = useRef<undefined | { editor: any }>(undefined);
  const [loading, setLoading] = useState(false);

  const uppy = useUppyUploader({
    onUploadSuccess: (result: any) => {
      appendImages(result);
      uppy.clear();
    },
    allowedFileTypes: 'image/*,video/mp4',
    onStart: () => {},
    onEnd: () => setLoading(false),
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const totalSize = acceptedFiles.reduce((acc, file) => acc + file.size, 0);

      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      setLoading(true);

      for (const file of acceptedFiles) {
        uppy.addFile(file);
      }
    },
    [uppy, toaster, t]
  );

  const paste = useCallback(
    async (event: ClipboardEvent | File[]) => {
      if (num > 0 && comments === 'no-media') {
        return;
      }
      // @ts-ignore
      const clipboardItems = event.clipboardData?.items;
      if (!clipboardItems) {
        return;
      }

      const files: File[] = [];
      // @ts-ignore
      for (const item of clipboardItems) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      const totalSize = files.reduce((acc, file) => acc + file.size, 0);

      if (totalSize > MAX_UPLOAD_SIZE) {
        toaster.show(
          t(
            'upload_size_limit_exceeded',
            'Upload size limit exceeded. Maximum 1 GB per upload session.'
          ),
          'warning'
        );
        return;
      }

      if (files.length > 0) {
        setLoading(true);
      }

      for (const file of files) {
        uppy.addFile(file);
      }
    },
    [uppy, num, comments, toaster, t]
  );

  const { getRootProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (loading) {
        toaster.show(
          t(
            'upload_in_progress_wait',
            'Upload current in progress, please wait and then try again.'
          ),
          'warning'
        );
        return;
      }
      onDrop(files);
    },
    noDrag: num > 0 && comments === 'no-media',
  });

  const valueWithoutHtml = useMemo(() => {
    return stripHtmlValidation('normal', props.value || '', true);
  }, [props.value]);

  const addText = useCallback(
    (emoji: string) => {
      editorRef?.current?.editor?.commands?.insertContent(emoji);
      editorRef?.current?.editor?.commands?.focus();
    },
    [props.value, id]
  );

  const [loadedEditor, setLoadedEditor] = useState(editorType);
  const [showEditor, setShowEditor] = useState(true);
  useEffect(() => {
    if (editorType === loadedEditor) {
      return;
    }
    setLoadedEditor(editorType);
    setShowEditor(false);
  }, [editorType]);

  useEffect(() => {
    if (showEditor) {
      return;
    }
    setTimeout(() => {
      setShowEditor(true);
    }, 20);
  }, [showEditor]);

  if (!showEditor) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px] flex-1">
      <div
        className={clsx(
          'relative flex-1 px-[12px] pt-[12px] pb-[12px] flex flex-col',
          num > 0 && '!rounded-bs-[0]'
        )}
        id={id}
      >
        <div className="relative cursor-text flex flex-1 flex-col">
          <div {...getRootProps()} className="flex flex-1 flex-col">
            <div
              className={clsx(
                'absolute left-0 top-0 w-full h-full bg-black/70 z-[300] transition-all items-center justify-center flex text-white text-sm',
                !isDragActive ? 'pointer-events-none opacity-0' : 'opacity-100'
              )}
            >
              {t('drop_files_here_to_upload', 'Drop your files here to upload')}
            </div>
            <div className="px-[10px] pt-[10px] bg-newBgColorInner rounded-t-[6px] relative z-[99]">
              <OnlyEditor
                value={props.value}
                editorType={editorType}
                onChange={props.onChange}
                paste={paste}
                ref={editorRef}
              />
            </div>
            <div
              className="bg-newBgColorInner flex-1"
              onClick={() => {
                if (editorRef?.current?.editor?.isFocused) {
                  return;
                }
                editorRef?.current?.editor?.commands?.focus('end');
              }}
            />
            <div className="w-full pointer-events-none">
              <div className="w-full h-[46px] overflow-hidden absolute left-0 bg-newBgColorInner uppyChange">
                <Dashboard
                  height={46}
                  uppy={uppy}
                  id={`prog-${num}`}
                  showProgressDetails={true}
                  hideUploadButton={true}
                  hideRetryButton={true}
                  hidePauseResumeButton={true}
                  hideCancelButton={true}
                  hideProgressAfterFinish={true}
                />
              </div>
            </div>
            <div
              className="w-full h-[46px] bg-newBgColorInner cursor-text"
              onClick={() => {
                if (editorRef?.current?.editor?.isFocused) {
                  return;
                }
                editorRef?.current?.editor?.commands?.focus('end');
              }}
            />
            <div className="flex bg-newBgColorInner rounded-b-[6px] cursor-default">
              {setImages && (
                <MultiMediaComponent
                  mediaNotAvailable={num > 0 && comments === 'no-media'}
                  allData={allValues}
                  text={valueWithoutHtml}
                  label={t('attachments', 'Attachments')}
                  description=""
                  value={props.pictures}
                  dummy={dummy}
                  name="image"
                  information={
                    <InformationComponent
                      isPicture={pictures?.length > 0}
                      chars={chars}
                      totalChars={valueWithoutHtml.length}
                      totalAllowedChars={props.totalChars}
                      text={valueWithoutHtml}
                    />
                  }
                  toolBar={
                    <div className="flex gap-[5px]">
                      <SignatureBox editor={editorRef?.current?.editor} />
                      {editorType !== 'none' && (
                        <>
                          <UText
                            editor={editorRef?.current?.editor}
                            currentValue={props.value!}
                          />
                          <BoldText
                            editor={editorRef?.current?.editor}
                            currentValue={props.value!}
                          />
                        </>
                      )}
                      {(editorType === 'markdown' || editorType === 'html') &&
                        identifier !== 'telegram' && (
                          <>
                            <AComponent
                              editor={editorRef?.current?.editor}
                              currentValue={props.value!}
                            />
                            <Bullets
                              editor={editorRef?.current?.editor}
                              currentValue={props.value!}
                            />
                            <HeadingComponent
                              editor={editorRef?.current?.editor}
                              currentValue={props.value!}
                            />
                          </>
                        )}
                      <div
                        data-tooltip-id="tooltip"
                        data-tooltip-content={t('insert_emoji', 'Insert Emoji')}
                        className="select-none cursor-pointer rounded-[6px] w-[30px] h-[30px] bg-newColColor flex justify-center items-center"
                        onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
                      >
                        <EmojiIcon />
                      </div>
                      <div className="relative">
                        <div
                          className={clsx(
                            'absolute z-[500] -start-[50px]',
                            num === 0 && allValues?.length > 1
                              ? 'top-[35px]'
                              : 'bottom-[35px]'
                          )}
                        >
                          <EmojiPicker
                            height={400}
                            // The library's default style is Apple, whose
                            // images come from cdn.jsdelivr.net — opening the
                            // panel would tell a CDN who is writing a post.
                            // The system font draws them locally.
                            emojiStyle={EmojiStyle.NATIVE}
                            theme={
                              (localStorage.getItem('mode') as Theme) ||
                              Theme.DARK
                            }
                            onEmojiClick={(e) => {
                              addText(e.emoji);
                              setEmojiPickerOpen(false);
                            }}
                            open={emojiPickerOpen}
                          />
                        </div>
                      </div>
                    </div>
                  }
                  onChange={(value) => {
                    setImages(value.target.value);
                  }}
                  onOpen={() => {}}
                  onClose={() => {}}
                />
              )}
            </div>
            <div>{childButton}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const OnlyEditor = forwardRef<
  any,
  {
    editorType: 'none' | 'normal' | 'markdown' | 'html';
    value: string;
    onChange: (value: string) => void;
    paste?: (event: ClipboardEvent | File[]) => void;
  }
>(({ editorType, value, onChange, paste }, ref) => {
  const t = useT();
  const fetch = useFetch();

  const { internal } = useLaunchStore(
    useShallow((state) => ({
      internal: state.internal.find((p) => p.integration.id === state.current),
    }))
  );

  const loadList = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        return [];
      }

      if (!internal?.integration.id) {
        return [];
      }

      try {
        const load = await fetch('/integrations/mentions', {
          method: 'POST',
          body: JSON.stringify({
            name: 'mention',
            id: internal.integration.id,
            data: { query },
          }),
        });

        const result = await load.json();
        return result;
      } catch (error) {
        console.error('Error loading mentions:', error);
        return [];
      }
    },
    [internal, fetch]
  );

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Underline,
      Bold,
      InterceptBoldShortcut,
      InterceptUnderlineShortcut,
      BulletList,
      ListItem,
      Placeholder.configure({
        placeholder: t('write_something', 'Write something …'),
        emptyEditorClass: 'is-editor-empty',
      }),
      ...(editorType === 'html' || editorType === 'markdown'
        ? [
            Link.configure({
              openOnClick: false,
              autolink: true,
              defaultProtocol: 'https',
              protocols: ['http', 'https'],
              isAllowedUri: (url, ctx) => {
                try {
                  // prevent transforming plain emails like foo@bar.com into links
                  const trimmed = String(url).trim();
                  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (emailPattern.test(trimmed)) {
                    return false;
                  }

                  // construct URL
                  const parsedUrl = url.includes(':')
                    ? new URL(url)
                    : new URL(`${ctx.defaultProtocol}://${url}`);

                  // use default validation
                  if (!ctx.defaultValidate(parsedUrl.href)) {
                    return false;
                  }

                  // disallowed protocols
                  const disallowedProtocols = ['ftp', 'file', 'mailto'];
                  const protocol = parsedUrl.protocol.replace(':', '');

                  if (disallowedProtocols.includes(protocol)) {
                    return false;
                  }

                  // only allow protocols specified in ctx.protocols
                  const allowedProtocols = ctx.protocols.map((p) =>
                    typeof p === 'string' ? p : p.scheme
                  );

                  if (!allowedProtocols.includes(protocol)) {
                    return false;
                  }

                  // all checks have passed
                  return true;
                } catch {
                  return false;
                }
              },
              shouldAutoLink: (url) => {
                try {
                  // prevent auto-linking of plain emails like foo@bar.com
                  const trimmed = String(url).trim();
                  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (emailPattern.test(trimmed)) {
                    return false;
                  }

                  // construct URL
                  const parsedUrl = url.includes(':')
                    ? new URL(url)
                    : new URL(`https://${url}`);

                  // only auto-link if the domain is not in the disallowed list
                  const disallowedDomains = [
                    'example-no-autolink.com',
                    'another-no-autolink.com',
                  ];
                  const domain = parsedUrl.hostname;

                  return !disallowedDomains.includes(domain);
                } catch {
                  return false;
                }
              },
            }),
          ]
        : []),
      ...(internal?.integration?.id
        ? [
            Mention.configure({
              HTMLAttributes: {
                class: 'mention',
              },
              renderHTML({ options, node }) {
                return [
                  'span',
                  mergeAttributes(options.HTMLAttributes, {
                    'data-mention-id': node.attrs.id || '',
                    'data-mention-label': node.attrs.label || '',
                  }),
                  `@${node.attrs.label}`,
                ];
              },
              suggestion: suggestion(loadList),
            }),
          ]
        : []),
      ...(editorType === 'html' || editorType === 'markdown'
        ? [
            Heading.configure({
              levels: [1, 2, 3],
            }),
          ]
        : []),
      History.configure({
        depth: 100, // default is 100
        newGroupDelay: 100, // default is 500ms
      }),
    ],
    content: value || '',
    shouldRerenderOnTransaction: true,
    immediatelyRender: false,
    // @ts-ignore
    onPaste: paste,
    onUpdate: (innerProps) => {
      onChange?.(innerProps.editor.getHTML());
    },
  });

  useImperativeHandle(ref, () => ({
    editor,
  }));

  return <EditorContent editor={editor} />;
});
