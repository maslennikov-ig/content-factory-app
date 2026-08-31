'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useRouter } from 'next/navigation';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { FormProvider, SubmitHandler, useForm } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { GeneratorDto } from '@contentfactory/nestjs-libraries/dtos/generator/generator.dto';
import { Button } from '@contentfactory/react/form/button';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Textarea } from '@contentfactory/react/form/textarea';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import clsx from 'clsx';
import {
  CalendarWeekProvider,
  useCalendar,
} from '@contentfactory/frontend/components/launches/calendar.context';
import dayjs from 'dayjs';
import { Select } from '@contentfactory/react/form/select';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { AddEditModal } from '@contentfactory/frontend/components/new-launch/add.edit.modal';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import useSWR from 'swr';
import {
  createGeneratorNdjsonConsumer,
  GeneratorStreamContractError,
  mergeServerContentContextEnvelope,
} from '@contentfactory/frontend/components/new-launch/store';
import {
  AppliedVoiceLine,
  type AppliedVoice,
} from '@contentfactory/frontend/components/new-launch/applied-voice.line';

const BRAND_PROFILE_API = '/content-intelligence/brand-profile';

/**
 * The active published version, or nothing. Anything the endpoint returns that
 * does not look like a published version is treated as no profile: the line
 * below is a statement of fact, so a half-read answer must not become one.
 */
const activeVoiceFromOverview = (overview: unknown): AppliedVoice | null => {
  const body = overview as
    | {
        profile?: { activeVersionId?: string | null } | null;
        versions?: {
          id?: string;
          versionNumber?: number;
          label?: string | null;
          lifecycle?: string;
        }[];
      }
    | null
    | undefined;
  const activeVersionId = body?.profile?.activeVersionId;
  if (!activeVersionId) return null;
  const active = body?.versions?.find(
    (version) =>
      version?.id === activeVersionId && version?.lifecycle === 'PUBLISHED'
  );
  if (typeof active?.versionNumber !== 'number') return null;
  return { label: active.label ?? null, versionNumber: active.versionNumber };
};

const FirstStep: FC = (props) => {
  const { integrations, reloadCalendarView } = useCalendar();
  const modal = useModals();
  const fetch = useFetch();
  const toaster = useToaster();
  const [loading, setLoading] = useState(false);
  const [showStep, setShowStep] = useState('');
  const t = useT();
  const { language: interfaceLanguage } = useVariables();
  const resolver = useMemo(() => {
    return classValidatorResolver(GeneratorDto);
  }, []);
  const form = useForm({
    mode: 'all',
    resolver,
    defaultValues: {
      research: '',
      isPicture: false,
      format: 'one_short',
      language:
        integrations[0]?.contentLanguage ||
        (interfaceLanguage === 'ru' ? 'ru' : 'en'),
      freshnessMode: 'PREFER_FRESH',
      brandProfileSelection: { mode: 'active' },
    },
  });
  const [research] = form.watch(['research']);
  const voiceQuery = useSWR(
    BRAND_PROFILE_API,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) return null;
      return activeVoiceFromOverview(await response.json());
    },
    { revalidateOnFocus: false }
  );
  const activeVoice = voiceQuery.data ?? null;
  const generateStep = useCallback(
    async (reader: ReadableStreamDefaultReader) => {
      const decoder = new TextDecoder('utf-8');
      const consumer = createGeneratorNdjsonConsumer((event) => {
        switch (event.name) {
          case 'agent':
            setShowStep(t('agent_starting', 'Agent starting'));
            break;
          case 'content-context':
            setShowStep(t('applying_context', 'Applying trusted context...'));
            break;
          case 'research':
            setShowStep(
              t('researching_your_content', 'Researching your content...')
            );
            break;
          case 'find-category':
            setShowStep(
              t('understanding_the_category', 'Understanding the category...')
            );
            break;
          case 'find-topic':
            setShowStep(t('finding_the_topic', 'Finding the topic...'));
            break;
          case 'find-popular-posts':
            setShowStep(
              t(
                'finding_popular_posts_to_match_with',
                'Finding popular posts to match with...'
              )
            );
            break;
          case 'generate-hook':
            setShowStep(t('generating_hook', 'Generating hook...'));
            break;
          case 'generate-content':
            setShowStep(t('generating_content', 'Generating content...'));
            break;
          case 'generate-picture':
            setShowStep(t('generating_pictures', 'Generating pictures...'));
            break;
          case 'upload-pictures':
            setShowStep(t('uploading_pictures', 'Uploading pictures...'));
            break;
          case 'post-time':
            setShowStep(t('finding_time_to_post', 'Finding time to post...'));
            break;
        }
      });

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          consumer.push(decoder.decode(value, { stream: !done }));
          if (done) return consumer.finish();
        }
      } catch (error) {
        if (!(error instanceof GeneratorStreamContractError)) throw error;
        if (error.code === 'CONTENT_EVIDENCE_REQUIRED') {
          throw new Error(
            t(
              'content_evidence_required',
              'CONTENT_EVIDENCE_REQUIRED: Current evidence is required before generation.'
            )
          );
        }
        if (error.code === 'GENERATION_STREAM_INVALID') {
          throw new Error(
            t(
              'generation_stream_invalid',
              'The generation response was incomplete. Please try again.'
            )
          );
        }
        if (error.code === 'GENERATION_CONTEXT_INVALID') {
          throw new Error(
            t(
              'generation_context_invalid',
              'The server did not return a valid final content context.'
            )
          );
        }
        if (error.code === 'GENERATION_CONTEXT_MISSING') {
          throw new Error(
            t(
              'generation_context_missing',
              'The server did not return matching early and final content context bindings. Nothing was saved.'
            )
          );
        }
        if (error.code === 'GENERATION_CONTEXT_CHANGED') {
          throw new Error(
            t(
              'generation_context_changed',
              'The content context changed during generation. Please try again.'
            )
          );
        }
        throw error;
      }
    },
    [t]
  );
  const onSubmit: SubmitHandler<{
    research: string;
  }> = useCallback(
    async (value) => {
      setLoading(true);
      try {
        const response = await fetch('/posts/generator', {
          method: 'POST',
          body: JSON.stringify(value),
        });
        if (!response.body) {
          throw new Error(
            t(
              'generation_failed',
              'Failed to generate posts, please try again.'
            )
          );
        }
        const reader = response.body.getReader();
        const generated = await generateStep(reader);
        const load = generated.output;
        if (!load?.content) {
          throw new Error(
            t(
              'generation_failed',
              'Failed to generate posts, please try again.'
            )
          );
        }
        if (!generated.provenance) {
          throw new Error(
            t(
              'generation_context_missing',
              'The server did not return a content context. Nothing was saved.'
            )
          );
        }
        const contextResponse = await fetch(
          `/content-intelligence/contexts/${encodeURIComponent(
            generated.provenance.contentContextSnapshotId
          )}`
        );
        if (!contextResponse.ok) {
          throw new Error(
            t(
              'generation_context_unavailable',
              'Content provenance could not be verified. Nothing was saved.'
            )
          );
        }
        const contentIntelligenceProvenance = mergeServerContentContextEnvelope(
          generated.provenance,
          await contextResponse.json()
        );
        if (!contentIntelligenceProvenance) {
          throw new Error(
            t(
              'generation_context_invalid',
              'The server did not return a valid content context.'
            )
          );
        }
        const messages = load.content.map((p: any, index: number) => {
          if (
            !Array.isArray(p.usedCitationIds) ||
            !p.usedCitationIds.every(
              (citationId: unknown) =>
                typeof citationId === 'string' && citationId.length > 0
            )
          ) {
            throw new Error(
              t(
                'generation_citations_invalid',
                'The server did not return valid citations for every generated item.'
              )
            );
          }
          const usedCitationIds = [...new Set<string>(p.usedCitationIds)];
          const availableCitationIds = new Set(
            contentIntelligenceProvenance.availableCitations.map(
              (citation) => citation.citationId
            )
          );
          if (
            usedCitationIds.some(
              (citationId) => !availableCitationIds.has(citationId)
            )
          ) {
            throw new Error(
              t(
                'generation_citations_unknown',
                'The generated content referenced citations outside its content context.'
              )
            );
          }
          if (index === 0) {
            return {
              content: load.hook + '\n' + p.content,
              usedCitationIds,
              ...(p?.image?.path
                ? {
                    image: [p.image],
                  }
                : {}),
            };
          }
          return {
            content: p.content,
            usedCitationIds,
            ...(p?.image?.path
              ? {
                  image: [p.image],
                }
              : {}),
          };
        });
        setShowStep('');
        modal.openModal({
          id: 'add-edit-modal',
          closeOnClickOutside: false,
          removeLayout: true,
          closeOnEscape: false,
          withCloseButton: false,
          askClose: true,
          fullScreen: true,
          classNames: {
            modal: 'w-[100%] max-w-[1400px] text-textColor',
          },
          children: (
            <AddEditModal
              allIntegrations={integrations.map((p) => ({
                ...p,
              }))}
              integrations={integrations.slice(0).map((p) => ({
                ...p,
              }))}
              mutate={reloadCalendarView}
              date={dayjs.utc(load.date).local()}
              reopenModal={() => ({})}
              onlyValues={messages}
              researchSources={load.fresearch?.sources || []}
              contentIntelligenceProvenance={contentIntelligenceProvenance}
              /**
               * Предложение приезжает вместе с черновиком, а не считается здесь.
               *
               * Сервер знает три вещи, которых у клиента нет: привычку автора с
               * её знаменателем, приложил ли человек факты, и то, что этот текст
               * написал продукт, а не человек. Последнее и есть условие: тот же
               * расчёт над напечатанным вручную текстом был бы анкетой.
               *
               * Одно на генерацию — сервер уже свёл; здесь берётся первое.
               */
              draftGap={
                Array.isArray(load.draftGaps) ? load.draftGaps[0] ?? null : null
              }
            />
          ),
          size: '80%',
        });
      } catch (e: any) {
        toaster.show(
          e?.message ||
            t(
              'generation_failed',
              'Failed to generate posts, please try again.'
            ),
          'warning'
        );
      } finally {
        setShowStep('');
        setLoading(false);
      }
    },
    [integrations, reloadCalendarView, fetch, generateStep, modal, toaster, t]
  );
  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={loading ? 'pointer-events-none select-none opacity-75' : ''}
    >
      <FormProvider {...form}>
        <div className="flex flex-col">
          <div className="pb-[10px] rounded-[4px]">
            <div className="flex">
              <div className="flex-1">
                {!showStep ? (
                  <div className="loading-shimmer pb-[10px]">&nbsp;</div>
                ) : (
                  <div
                    className="loading-shimmer pb-[10px]"
                    data-text={showStep}
                  >
                    {showStep}
                  </div>
                )}
                <Textarea
                  label={t('write_anything', 'Write anything')}
                  disabled={loading}
                  placeholder={t(
                    'you_can_write_anything_you_want_and_also_add_links_we_will_do_the_research_for_you',
                    'You can write anything you want, and also add links, we will do the research for you...'
                  )}
                  {...form.register('research')}
                />
                <Select
                  label={t('content_language', 'Content language')}
                  {...form.register('language')}
                >
                  <option value="en">
                    {t('content_language_en', 'English')}
                  </option>
                  <option value="ru">
                    {t('content_language_ru', 'Russian')}
                  </option>
                </Select>
                <Select
                  label={t('output_format', 'Output format')}
                  {...form.register('format')}
                >
                  <option value="one_short">
                    {t('short_post', 'Short post')}
                  </option>
                  <option value="one_long">
                    {t('long_post', 'Long post')}
                  </option>
                  <option value="thread_short">
                    {t(
                      'a_thread_with_short_posts',
                      'A thread with short posts'
                    )}
                  </option>
                  <option value="thread_long">
                    {t('a_thread_with_long_posts', 'A thread with long posts')}
                  </option>
                </Select>
                <AppliedVoiceLine
                  voice={activeVoice}
                  loading={voiceQuery.isLoading}
                />
                <div
                  className={clsx('flex items-center', loading && 'opacity-50')}
                >
                  <CheckboxField
                    disabled={loading}
                    {...form.register('isPicture')}
                    label={t('add_pictures', 'Add pictures?')}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-[20px] flex justify-end">
          <Button
            type="submit"
            disabled={research.length < 10}
            loading={loading}
          >
            {t('generate', 'Generate')}
          </Button>
        </div>
      </FormProvider>
    </form>
  );
};
export const GeneratorPopup = () => {
  const t = useT();

  const modals = useModals();
  const closeAll = useCallback(() => {
    modals.closeAll();
  }, []);
  return (
    <div className="w-full flex flex-col rounded-[4px] relative">
      <FirstStep />
    </div>
  );
};
export const GeneratorComponent = () => {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const modal = useModals();
  const all = useCalendar();
  const generate = useCallback(async () => {
    if (!user?.tier?.ai) {
      if (
        await deleteDialog(
          t('upgrade_required', 'You need to upgrade to use this feature'),
          t('move_to_billing', 'Move to billing'),
          t('payment_required', 'Payment Required')
        )
      ) {
        router.push('/billing');
      }
      return;
    }
    modal.openModal({
      title: t('generate_posts', 'Generate Posts'),
      withCloseButton: false,
      classNames: {
        modal: 'bg-transparent text-textColor',
      },
      size: 'xl',
      children: (
        <CalendarWeekProvider {...all}>
          <GeneratorPopup />
        </CalendarWeekProvider>
      ),
    });
  }, [user, all]);
  return (
    <div
      className="h-[44px] w-[44px] group-[.sidebar]:w-full bg-ai justify-center items-center flex rounded-[8px] cursor-pointer"
      onClick={generate}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
      >
        <g clipPath="url(#clip0_1930_7370)">
          <path
            d="M5.41675 10.8337L6.07046 12.1411C6.2917 12.5836 6.40232 12.8048 6.55011 12.9965C6.68124 13.1667 6.83375 13.3192 7.00388 13.4503C7.19559 13.5981 7.41684 13.7087 7.85932 13.9299L9.16675 14.5837L7.85932 15.2374C7.41684 15.4586 7.19559 15.5692 7.00388 15.717C6.83375 15.8482 6.68124 16.0007 6.55011 16.1708C6.40232 16.3625 6.2917 16.5837 6.07046 17.0262L5.41675 18.3337L4.76303 17.0262C4.54179 16.5837 4.43117 16.3625 4.28339 16.1708C4.15225 16.0007 3.99974 15.8482 3.82962 15.717C3.6379 15.5692 3.41666 15.4586 2.97418 15.2374L1.66675 14.5837L2.97418 13.9299C3.41666 13.7087 3.6379 13.5981 3.82962 13.4503C3.99974 13.3192 4.15225 13.1667 4.28339 12.9965C4.43117 12.8048 4.54179 12.5836 4.76303 12.1411L5.41675 10.8337Z"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12.5001 1.66699L13.4823 4.22067C13.7173 4.8317 13.8348 5.13721 14.0175 5.39419C14.1795 5.62195 14.3785 5.82095 14.6062 5.9829C14.8632 6.16563 15.1687 6.28313 15.7797 6.51814L18.3334 7.50033L15.7797 8.48251C15.1687 8.71752 14.8632 8.83502 14.6062 9.01775C14.3785 9.1797 14.1795 9.3787 14.0175 9.60646C13.8348 9.86344 13.7173 10.169 13.4823 10.78L12.5001 13.3337L11.5179 10.78C11.2829 10.169 11.1654 9.86344 10.9827 9.60646C10.8207 9.3787 10.6217 9.1797 10.3939 9.01775C10.137 8.83503 9.83145 8.71752 9.22043 8.48251L6.66675 7.50033L9.22043 6.51814C9.83145 6.28313 10.137 6.16563 10.3939 5.9829C10.6217 5.82095 10.8207 5.62195 10.9827 5.39419C11.1654 5.13721 11.2829 4.8317 11.5179 4.22067L12.5001 1.66699Z"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <defs>
          <clipPath id="clip0_1930_7370">
            <rect width="20" height="20" fill="white" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
};
