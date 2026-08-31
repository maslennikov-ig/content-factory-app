'use client';

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddEditModalProps } from '@contentfactory/frontend/components/new-launch/add.edit.modal';
import clsx from 'clsx';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { PicksSocialsComponent } from '@contentfactory/frontend/components/new-launch/picks.socials.component';
import { EditorWrapper } from '@contentfactory/frontend/components/new-launch/editor';
import { SelectCurrent } from '@contentfactory/frontend/components/new-launch/select.current';
import { ShowAllProviders } from '@contentfactory/frontend/components/new-launch/providers/show.all.providers';
import { AppliedVoiceLine } from '@contentfactory/frontend/components/new-launch/applied-voice.line';
import { VoiceRibbonContainer } from '@contentfactory/frontend/components/brand-voice/voice-ribbon.container';
import { DraftGapNote } from '@contentfactory/frontend/components/brand-voice/draft-gap-note';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useExistingData } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { DatePicker } from '@contentfactory/frontend/components/launches/helpers/date.picker';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@contentfactory/frontend/components/launches/repeat.component';
import { TagsComponent } from '@contentfactory/frontend/components/launches/tags.component';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { capitalize } from 'lodash';
import { SelectCustomer } from '@contentfactory/frontend/components/launches/select.customer';
import { CopilotPopup } from '@copilotkit/react-ui';
import { DummyCodeComponent } from '@contentfactory/frontend/components/new-launch/dummy.code.component';
import { CreationMethodBadge } from '@contentfactory/frontend/components/launches/creation.method.badge';
import {
  SettingsIcon,
  ChevronDownIcon,
  CloseIcon,
  TrashIcon,
  DropdownArrowSmallIcon,
} from '@contentfactory/frontend/components/ui/icons';
import { useHasScroll } from '@contentfactory/frontend/components/ui/is.scroll.hook';
import { useShortlinkPreference } from '@contentfactory/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button } from '@contentfactory/react/form/button';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';

export const ManageModal: FC<AddEditModalProps> = (props) => {
  const t = useT();
  const { language } = useVariables();
  /**
   * Два языка, а не шестнадцать, — как у всех голосовых экранов.
   *
   * `voiceCopy` держит `ru` и `en`, потому что шестнадцать локалей вокруг
   * двухъязычной поверхности обещали бы перевод, которого экран не выполняет.
   */
  const voiceLocale = language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const fetch = useFetch();
  const ref = useRef(null);
  const existingData = useExistingData();
  const [loading, setLoading] = useState(false);
  const toaster = useToaster();
  const modal = useModals();
  const [showSettings, setShowSettings] = useState(false);
  const { data: shortlinkPreferenceData } = useShortlinkPreference();

  const { addEditSets, mutate, customClose, dummy } = props;

  const {
    selectedIntegrations,
    hide,
    date,
    setDate,
    repeater,
    setRepeater,
    tags,
    setTags,
    integrations,
    setSelectedIntegrations,
    locked,
    current,
    activateExitButton,
    setHide,
    researchSources,
    contentIntelligenceProvenance,
    contentIntelligenceLoadState,
    contentIntelligenceFailure,
  } = useLaunchStore(
    useShallow((state) => ({
      hide: state.hide,
      setHide: state.setHide,
      researchSources: state.researchSources,
      contentIntelligenceProvenance: state.contentIntelligenceProvenance,
      contentIntelligenceLoadState: state.contentIntelligenceLoadState,
      contentIntelligenceFailure: state.contentIntelligenceFailure,
      date: state.date,
      setDate: state.setDate,
      current: state.current,
      repeater: state.repeater,
      setRepeater: state.setRepeater,
      tags: state.tags,
      setTags: state.setTags,
      selectedIntegrations: state.selectedIntegrations,
      integrations: state.integrations,
      setSelectedIntegrations: state.setSelectedIntegrations,
      locked: state.locked,
      activateExitButton: state.activateExitButton,
    }))
  );

  /**
   * The boxes of the post being written, in order.
   *
   * The same choice the editor makes: a channel opened for its own version
   * edits `integrationValue`, everything else edits the shared thread. The
   * applied-voice strip needs it because a thread is where a long generation
   * loses the voice, and the boundaries it is restated at are these boxes and
   * not a guess about them.
   */
  const voiceChunks = useLaunchStore(
    useShallow((state) =>
      (
        state.internal.find((one) => one.integration.id === state.current)
          ?.integrationValue ?? state.global
      ).map((value) => value.content)
    )
  );

  /**
   * Writing one box back, after the person accepts a repair.
   *
   * The same fork the reader above takes, in the same order: a channel opened
   * for its own version owns its boxes, everything else edits the shared
   * thread. Reading from one and writing to the other would put the repair in
   * a box nobody is looking at.
   */
  const replaceVoiceChunk = useCallback(
    (index: number, next: string) => {
      const state = useLaunchStore.getState();
      const own = state.internal.find(
        (one) => one.integration.id === state.current
      );
      if (own) state.setInternalValueText(own.integration.id, index, next);
      else state.setGlobalValueText(index, next);
    },
    []
  );

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  const currentIntegrationText = useMemo(() => {
    if (current === 'global') {
      return (
        <div className="flex items-center gap-[10px]">
          <div className="relative">
            <SettingsIcon size={15} className="text-cf-accent-ink" />
          </div>
          <div>Settings</div>
        </div>
      );
    }

    const currentIntegration = integrations.find((p) => p.id === current)!;

    return (
      <div className="flex items-center gap-[10px]">
        <div className="relative">
          <PlatformBadge identifier={currentIntegration.identifier} size={24} />
          <SettingsIcon
            size={15}
            className="text-cf-accent-ink absolute -end-[5px] -bottom-[5px]"
          />
        </div>
        <div>
          {currentIntegration.name} {t('channel_settings', 'Settings')}
        </div>
      </div>
    );
  }, [current]);

  const changeCustomer = useCallback(
    (customer: string) => {
      const neededIntegrations = integrations.filter(
        (p) => p?.customer?.id === customer
      );
      setSelectedIntegrations(
        neededIntegrations.map((p) => ({
          settings: {},
          selectedIntegrations: p,
        }))
      );
    },
    [integrations]
  );

  const askClose = useCallback(async () => {
    if (!activateExitButton || dummy) {
      return;
    }

    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!')
      )
    ) {
      if (customClose) {
        customClose();
        return;
      }
      modal.closeAll();
    }
  }, [activateExitButton, dummy]);

  const deletePost = useCallback(async () => {
    setLoading(true);
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_post',
          'Are you sure you want to delete this post?'
        ),
        t('yes_delete_it', 'Yes, delete it!')
      ))
    ) {
      setLoading(false);
      return;
    }
    await fetch(`/posts/${existingData.group}`, {
      method: 'DELETE',
    });
    mutate();
    modal.closeAll();
    return;
  }, [existingData, mutate, modal]);

  const schedule = useCallback(
    (type: 'draft' | 'now' | 'schedule' | 'update') => async () => {
      if (
        contentIntelligenceProvenance?.errorCode ===
          'CONTENT_EVIDENCE_REQUIRED' ||
        contentIntelligenceLoadState === 'loading' ||
        contentIntelligenceLoadState === 'error'
      ) {
        toaster.show(
          contentIntelligenceLoadState === 'loading'
            ? t(
                'content_context_loading',
                'Content provenance is still loading. Please wait before saving.'
              )
            : contentIntelligenceFailure === 'CONTENT_EVIDENCE_REQUIRED'
            ? t(
                'content_evidence_required',
                'CONTENT_EVIDENCE_REQUIRED: Current evidence must be verified before this draft can be saved.'
              )
            : t(
                'content_context_unavailable',
                'Content provenance could not be verified. Reload or research the draft before saving.'
              ),
          'warning'
        );
        return;
      }
      if (
        contentIntelligenceProvenance &&
        type !== 'draft' &&
        type !== 'update'
      ) {
        toaster.show(
          t(
            'content_context_draft_only',
            'Content-intelligence output can only be saved as a draft.'
          ),
          'warning'
        );
        return;
      }
      if (
        (type === 'now' || type === 'schedule') &&
        (existingData?.posts?.[0]?.state === 'PUBLISHED' ||
          (existingData?.posts?.[0]?.state === 'QUEUE' &&
            dayjs().isAfter(date.utc())))
      ) {
        const whatToDo = await new Promise((resolve) => {
          modal.openModal({
            title: t('what_do_you_want_to_do', 'What do you want to do?'),
            children: (
              <div className="flex flex-col">
                <div className="text-[20px] mb-[20px]">
                  {t(
                    'post_already_published_what_to_do',
                    'This post was already published, what do you want to do?'
                  )}
                </div>
                <div className="flex w-full gap-[10px]">
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('update')}
                    >
                      {t(
                        'just_update_post_details',
                        'Just update the post details'
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('republish')}
                    >
                      {t('republish_the_post', 'Republish the post')}
                    </Button>
                  </div>
                </div>
              </div>
            ),
          });
        });

        if (whatToDo === 'update') {
          type = 'update';
        }
      }

      setLoading(true);

      // Pull the local values to build the payload, but rely on the server
      // (`/posts/valid`) for the actual validation — checkValidity now lives
      // server-side so it can't be bypassed.
      const allValues = await ref.current.getAllValues();

      const integrationById = (id: string) =>
        selectedIntegrations.find((p) => p.integration.id === id);

      const group = existingData.group || makeId(10);

      const posts = allValues.map((post: any) => ({
        integration: {
          id: post.id,
        },
        group,
        settings: { ...(post.settings || {}) },
        researchSources,
        ...(contentIntelligenceProvenance
          ? {
              contentContextSnapshotId:
                contentIntelligenceProvenance.contentContextSnapshotId,
              brandProfileVersionId:
                contentIntelligenceProvenance.brandProfileVersionId,
            }
          : {}),
        value: post.values.map((value: any) => ({
          ...(value.id ? { id: value.id } : {}),
          content: value.content,
          delay: value.delay || 0,
          ...(contentIntelligenceProvenance
            ? { usedCitationIds: value.usedCitationIds || [] }
            : {}),
          image:
            (value?.media || []).map(
              ({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
                id,
                path,
                alt,
                thumbnail,
                thumbnailTimestamp,
              })
            ) || [],
        })),
      }));

      if (!dummy) {
        const checkAllValid = await (
          await fetch('/posts/valid', {
            method: 'POST',
            body: JSON.stringify({ type, posts }),
          })
        ).json();

        const focus = (id: string, where: 'fix' | 'preview') => {
          integrationById(id)?.ref?.current?.[where]?.();
        };

        const notEnoughChars = checkAllValid.filter((p: any) => p.emptyContent);

        for (const item of notEnoughChars) {
          toaster.show(
            t(
              'channel_validation_message',
              '{{platform}} ({{name}}): {{message}}',
              {
                platform: capitalize(item.identifier.split('-')[0]),
                name: item.name,
                message: t(
                  'post_needs_content_or_image',
                  'Your post should have at least one character or one image.'
                ),
              }
            ),
            'warning'
          );
          setLoading(false);
          focus(item.id, 'preview');
          return;
        }

        if (type !== 'draft') {
          for (const item of checkAllValid) {
            if (item.valid === false) {
              toaster.show(
                t(
                  'channel_validation_message',
                  '{{platform}} ({{name}}): {{message}}',
                  {
                    platform: capitalize(item.identifier.split('-')[0]),
                    name: item.name,
                    message:
                      item.settingsError ||
                      t('please_fix_your_settings', 'Please fix your settings'),
                  }
                ),
                'warning'
              );
              focus(item.id, 'fix');
              setLoading(false);
              setShowSettings(true);
              return;
            }

            if (item.errors !== true) {
              toaster.show(
                t(
                  'channel_validation_message',
                  '{{platform}} ({{name}}): {{message}}',
                  {
                    platform: capitalize(item.identifier.split('-')[0]),
                    name: item.name,
                    message: item.errors,
                  }
                ),
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              setShowSettings(false);
              return;
            }

            if (item.tooLong) {
              toaster.show(
                t(
                  'channel_validation_message',
                  '{{platform}} ({{name}}): {{message}}',
                  {
                    platform: item.identifier,
                    name: item.name,
                    message: t(
                      'post_is_too_long',
                      'post is too long, please fix it'
                    ),
                  }
                ),
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              return;
            }
          }
        }
      }

      const shortlinkPreference = shortlinkPreferenceData?.shortlink || 'ASK';

      let shortLink = false;

      if (!dummy && shortlinkPreference !== 'NO') {
        const shortLinkUrl = await (
          await fetch('/posts/should-shortlink', {
            method: 'POST',
            body: JSON.stringify({
              messages: allValues
                // platforms that remove links won't keep shortlinks either
                .filter(
                  (p: any) => !integrationById(p.id)?.integration?.stripLinks
                )
                .flatMap((p: any) => p.values.flatMap((a: any) => a.content)),
            }),
          })
        ).json();

        if (shortLinkUrl.ask) {
          if (shortlinkPreference === 'YES') {
            // Automatically shortlink without asking
            shortLink = true;
          } else {
            // ASK: Show the dialog
            shortLink = await deleteDialog(
              t(
                'shortlink_urls_question',
                'Do you want to shortlink the URLs? it will let you get statistics over clicks'
              ),
              t('yes_shortlink_it', 'Yes, shortlink it!'),
              undefined,
              t('no_original_urls', 'No, original URLs')
            );
          }
        }
      }

      const data = {
        type,
        ...(repeater ? { inter: repeater } : {}),
        tags,
        shortLink,
        date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
        posts,
      };

      if (dummy) {
        modal.openModal({
          title: '',
          children: <DummyCodeComponent code={data} />,
          classNames: {
            modal: 'w-[100%] bg-transparent text-textColor',
          },
          size: '100%',
          withCloseButton: false,
          closeOnEscape: true,
          closeOnClickOutside: true,
        });

        setLoading(false);
      }

      if (!dummy) {
        addEditSets
          ? addEditSets(data)
          : await fetch('/posts', {
              method: 'POST',
              body: JSON.stringify(data),
            });

        if (!addEditSets) {
          mutate();
          toaster.show(
            !existingData.integration
              ? t('added_successfully', 'Added successfully')
              : t('updated_successfully', 'Updated successfully')
          );
        }
        if (customClose) {
          setTimeout(() => {
            customClose();
          }, 2000);
        }

        if (!addEditSets) {
          modal.closeAll();
        }
      }
    },
    [
      ref,
      repeater,
      tags,
      date,
      addEditSets,
      dummy,
      shortlinkPreferenceData,
      researchSources,
      contentIntelligenceProvenance,
      contentIntelligenceLoadState,
      contentIntelligenceFailure,
    ]
  );

  return (
    <div className="w-full h-full flex-1 p-[40px] flex relative">
      <div className="flex flex-1 bg-newBgColorInner rounded-[20px] flex-col">
        <div className="flex-1 flex">
          <div className="flex flex-col flex-1 border-e border-newBorder">
            <div className="bg-newBgColor h-[65px] rounded-s-[20px] !rounded-b-[0] flex items-center gap-[12px] px-[20px] text-[20px] font-[600]">
              {t('create_post_title', 'Create Post')}
              <CreationMethodBadge
                creationMethod={existingData?.posts?.[0]?.creationMethod}
                size="sm"
              />
            </div>
            <div className="flex-1 flex flex-col gap-[16px]">
              <div
                className={clsx('flex-1 relative', showSettings && 'hidden')}
              >
                <div
                  id="social-content"
                  className="gap-[32px] flex flex-col pe-[8px] pt-[20px] ps-[20px] absolute top-0 left-0 w-full h-full overflow-x-hidden overflow-y-scroll scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner"
                >
                  <div className="flex w-full">
                    <div className="flex flex-1">
                      <PicksSocialsComponent toolTip={true} />
                    </div>
                    <div>
                      {!dummy && (
                        <SelectCustomer
                          onChange={changeCustomer}
                          integrations={integrations}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-[6px] flex-col">
                    <div>{!existingData.integration && <SelectCurrent />}</div>
                    <div className="flex-1 flex">
                      {!hide && <EditorWrapper totalPosts={1} value="" />}
                    </div>
                    <div
                      id="social-empty"
                      className={clsx(
                        'pb-[16px]'
                        // current !== 'global' && 'hidden'
                      )}
                    />
                  </div>
                </div>
              </div>
              <div
                id="wrapper-settings"
                className={clsx(
                  'pb-[20px] px-[20px] select-none',
                  showSettings && 'flex-1 flex pt-[20px]',
                  current === 'global' && 'hidden'
                )}
              >
                <div className="flex-1 flex flex-col rounded-[12px] gap-[12px] overflow-hidden bg-newSettings">
                  <div
                    onClick={() => setShowSettings(!showSettings)}
                    className={clsx(
                      'bg-cf-accent rounded-[12px] flex items-center gap-[8px] cursor-pointer p-[12px]',
                      showSettings ? '!rounded-b-none' : ''
                    )}
                  >
                    <div className="flex-1 text-[14px] font-[600] text-cf-accent-ink">
                      {currentIntegrationText}
                    </div>
                    <div>
                      <ChevronDownIcon
                        rotated={showSettings}
                        className="text-cf-accent-ink"
                      />
                    </div>
                  </div>
                  <div
                    className={clsx(
                      !showSettings ? 'hidden' : 'flex-1',
                      'text-[14px] text-textColor font-[500] relative'
                    )}
                  >
                    <div className="absolute left-0 top-0 w-full h-full flex flex-col overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-newBgColorInner scrollbar-track-newColColor">
                      <div
                        id="social-settings"
                        className="flex flex-col gap-[20px] bg-newBgColor"
                      />
                    </div>
                  </div>
                  <style>
                    {`#social-settings [data-id="${current}"] {display: block !important;}`}
                  </style>
                </div>
              </div>
            </div>
          </div>
          <div className="w-[580px] flex flex-col">
            <div className="bg-newBgColor h-[65px] rounded-e-[20px] !rounded-b-[0] flex items-center px-[20px] text-[20px] font-[600]">
              <div className="flex-1">{t('post_preview', 'Post Preview')}</div>
              <div className="cursor-pointer">
                <CloseIcon onClick={askClose} className="text-[#A3A3A3]" />
              </div>
            </div>
            <div className="flex-1 relative">
              <Scrollable
                scrollClasses="!pe-[20px]"
                className="absolute top-0 p-[20px] pe-[8px] left-0 w-full h-full overflow-x-hidden overflow-y-scroll scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner"
              >
                <ShowAllProviders ref={ref} />
                {/**
                  * Предложение стоит ПОД лентой голоса, а не над ней.
                  *
                  * Лента отвечает «кто пишет этот текст» и обязана быть первой:
                  * она про сам инструмент. Предложение — про один конкретный
                  * черновик, и человек доходит до него, уже зная, чьим голосом
                  * текст написан. Отсутствие предложения — обычный исход, и
                  * тогда здесь нет вообще ничего: пустой блок «всё в порядке»
                  * читался бы как отчёт о проверке, которой не было.
                  */}
                <div className="mt-[16px]">
                  <VoiceRibbonContainer
                    chunks={voiceChunks}
                    onReplaceChunk={replaceVoiceChunk}
                    fallback={
                      contentIntelligenceProvenance ? (
                        <AppliedVoiceLine
                          voice={
                            contentIntelligenceProvenance.brandProfileSelection
                              .mode === 'resolved'
                              ? {
                                  label:
                                    contentIntelligenceProvenance.profileLabel ??
                                    null,
                                  versionNumber:
                                    contentIntelligenceProvenance
                                      .brandProfileSelection.versionNumber,
                                }
                              : null
                          }
                          loading={contentIntelligenceLoadState === 'loading'}
                        />
                      ) : null
                    }
                  />
                </div>
                <DraftGapNote gap={props.draftGap} locale={voiceLocale} />
                {researchSources.length > 0 && (
                  <div className="mt-[16px] rounded-[10px] border border-cf-border bg-cf-surface p-[12px]">
                    <div className="mb-[8px] text-[13px] font-[600] text-cf-ink">
                      {t('compatibility_sources', 'Compatibility sources')}
                    </div>
                    <p className="cf-caption mb-[8px] text-cf-ink-muted text-pretty">
                      {t(
                        'compatibility_sources_help',
                        'Legacy links are shown for reference only. They do not establish draft provenance.'
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
              </Scrollable>
            </div>
          </div>
        </div>
        <div className="select-none h-[84px] py-[20px] border-t border-newBorder flex items-center">
          <div className="flex-1 flex ps-[20px] gap-[8px]">
            {!dummy && (
              <TagsComponent
                name="tags"
                label={t('tags', 'Tags')}
                initial={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                }}
              />
            )}

            {!dummy && (
              <RepeatComponent repeat={repeater} onChange={setRepeater} />
            )}
          </div>
          <div className="pe-[20px] flex items-center justify-end gap-[8px]">
            {existingData?.integration && (
              <Button
                variant="destructive"
                onClick={deletePost}
                className="cursor-pointer flex gap-[8px] items-center text-[15px] font-[600]"
              >
                <div>
                  <TrashIcon />
                </div>
                <div>{t('delete_post', 'Delete Post')}</div>
              </Button>
            )}
            <DatePicker onChange={setDate} date={date} />
            {!addEditSets && (
              <Button
                variant="secondary"
                disabled={
                  selectedIntegrations.length === 0 ||
                  loading ||
                  locked ||
                  contentIntelligenceLoadState === 'loading' ||
                  contentIntelligenceLoadState === 'error' ||
                  contentIntelligenceProvenance?.errorCode ===
                    'CONTENT_EVIDENCE_REQUIRED'
                }
                onClick={schedule('draft')}
                className="relative cursor-pointer disabled:cursor-not-allowed px-[20px] justify-center items-center flex rounded-[8px] text-[15px] font-[600]"
              >
                {loading && (
                  <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                    <div className="animate-spin h-[20px] w-[20px] border-4 border-textColor border-t-transparent rounded-full" />
                  </div>
                )}
                <div className={clsx(loading && 'invisible')}>
                  {t('save_as_draft', 'Save as Draft')}
                </div>
              </Button>
            )}
            {addEditSets && (
              <Button
                className="text-[15px] font-[600] min-w-[180px] btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center rounded-[8px] ps-[20px] pe-[16px]"
                disabled={
                  selectedIntegrations.length === 0 || loading || locked
                }
                onClick={schedule('draft')}
              >
                Save Set
              </Button>
            )}
            {!addEditSets && (
              <div className="group cursor-pointer relative">
                <Button
                  disabled={
                    selectedIntegrations.length === 0 ||
                    loading ||
                    locked ||
                    !!contentIntelligenceProvenance ||
                    contentIntelligenceLoadState === 'loading' ||
                    contentIntelligenceLoadState === 'error'
                  }
                  onClick={schedule('schedule')}
                  className="relative min-w-[180px] btnSub disabled:cursor-not-allowed disabled:opacity-80 outline-none gap-[8px] flex justify-center items-center rounded-[8px] ps-[20px] pe-[16px]"
                >
                  {loading && (
                    <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
                      <div className="animate-spin h-[20px] w-[20px] border-4 border-white border-t-transparent rounded-full" />
                    </div>
                  )}
                  <div
                    className={clsx(
                      'text-[15px] font-[600]',
                      loading && 'invisible'
                    )}
                  >
                    {selectedIntegrations.length === 0
                      ? t('check_circles_above', 'Check the circles above')
                      : dummy
                      ? t('create_output', 'Create output')
                      : !existingData?.integration
                      ? t('add_to_calendar', 'Add to calendar')
                      : existingData?.posts?.[0]?.state === 'DRAFT'
                      ? t('schedule', 'Schedule')
                      : t('update', 'Update')}
                  </div>
                  {!dummy && (
                    <div className="flex justify-center items-center h-[20px] w-[20px] pt-[4px] arrow-change">
                      <DropdownArrowSmallIcon className="group-hover:rotate-180" />
                    </div>
                  )}
                </Button>

                {!dummy && (
                  <Button
                    onClick={schedule('now')}
                    disabled={
                      selectedIntegrations.length === 0 ||
                      loading ||
                      locked ||
                      !!contentIntelligenceProvenance ||
                      contentIntelligenceLoadState === 'loading' ||
                      contentIntelligenceLoadState === 'error'
                    }
                    layout="content"
                    className="rounded-[8px] z-[300] disabled:cursor-not-allowed disabled:opacity-80 hidden group-hover:flex absolute bottom-[100%] -left-[12px] p-[12px] w-[206px]"
                  >
                    <div className="rounded-[8px] h-[44px] w-full flex justify-center items-center post-now">
                      {t('post_now', 'Post Now')}
                    </div>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <CopilotPopup
        hitEscapeToClose={false}
        clickOutsideToClose={true}
        instructions={`
You are an assistant that help the user to schedule their social media posts,
Here are the things you can do:
- Add a new comment / post to the list of posts
- Delete a comment / post from the list of posts
- Add content to the comment / post
- Activate or deactivate the comment / post

Post content can be added using the addPostContentFor{num} function.
After using the addPostFor{num} it will create a new addPostContentFor{num+ 1} function.
`}
        labels={{
          title: t('your_assistant', 'Your Assistant'),
          initial: t(
            'assistant_initial_message',
            'Hi! I can help you to refine your social media posts.'
          ),
        }}
      />
    </div>
  );
};

const Scrollable: FC<{
  className: string;
  scrollClasses: string;
  children: ReactNode;
}> = ({ className, scrollClasses, children }) => {
  const ref = useRef(undefined);
  const hasScroll = useHasScroll(ref);
  return (
    <div className={clsx(className, hasScroll && scrollClasses)} ref={ref}>
      {children}
    </div>
  );
};
