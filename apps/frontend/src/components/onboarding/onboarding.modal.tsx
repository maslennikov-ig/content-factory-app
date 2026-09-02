'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { orderBy } from 'lodash';
import clsx from 'clsx';
import SafeImage from '@contentfactory/react/helpers/safe.image';
import { AddProviderComponent } from '@contentfactory/frontend/components/launches/add.provider.component';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { Button } from '@contentfactory/react/form/button';

interface OnboardingModalProps {
  onClose: () => void;
}

export const OnboardingModal: FC<OnboardingModalProps> = ({ onClose }) => {
  const [step, setStep] = useState(1);
  const modals = useModals();
  const t = useT();

  return (
    <div className="w-full min-h-full flex-1 p-[40px] flex relative">
      <style>
        {`#support-discord {display: none}`}
      </style>
      <div className="flex flex-1 bg-newBgColorInner rounded-[20px] flex-col relative">
        <Button
          iconOnly
          size={28}
          aria-label={t('close', 'Close')}
          variant="quiet"
          className="outline-none absolute end-[20px] top-[20px] mantine-UnstyledButton-root mantine-ActionIcon-root cursor-pointer mantine-Modal-close mantine-1dcetaa"
          type="button"
          onClick={modals.closeAll}
        >
          <svg
            viewBox="0 0 15 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
          >
            <path
              d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            ></path>
          </svg>
        </Button>
        <div className="flex-1 flex p-[40px]">
          <div className="flex flex-col gap-[24px] flex-1">
            {/* Step indicators */}
            <div className="flex items-center justify-center gap-[16px]">
              <div className="flex items-center gap-[8px]">
                <div
                  className={clsx(
                    'w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-semibold transition-colors',
                    step === 1
                      ? 'bg-boxFocused text-textItemFocused'
                      : 'bg-newTableHeader'
                  )}
                >
                  1
                </div>
                <span
                  className={clsx(
                    'text-[14px]',
                    step === 1 ? 'font-medium' : 'text-textColor'
                  )}
                >
                  {t('connect_channels', 'Connect Channels')}
                </span>
              </div>
              <div className="w-[40px] h-[2px] bg-boxFocused" />
              <div className="flex items-center gap-[8px]">
                <div
                  className={clsx(
                    'w-[32px] h-[32px] rounded-full flex items-center justify-center text-[14px] font-semibold transition-colors',
                    step === 2
                      ? 'bg-boxFocused text-textItemFocused'
                      : 'bg-newTableHeader'
                  )}
                >
                  2
                </div>
                <span
                  className={clsx(
                    'text-[14px]',
                    step === 2 ? 'font-medium' : 'text-textColor'
                  )}
                >
                  {/*
                    `content-factory-next-rrs9`: the step promised a video that
                    was removed with the rename and never replaced. It names
                    what it actually offers now.
                  */}
                  {t('onboarding_step_next', 'Where to start')}
                </span>
              </div>
            </div>

            {/* Step content */}
            {step === 1 && (
              <OnboardingStep1
                onNext={() => setStep(2)}
                onSkip={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <OnboardingStep2 onBack={() => setStep(1)} onFinish={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const OnboardingStep1: FC<{ onNext: () => void; onSkip: () => void }> = ({
  onNext,
  onSkip,
}) => {
  const fetch = useFetch();
  const t = useT();

  const getIntegrations = useCallback(async () => {
    return (await fetch('/integrations')).json();
  }, []);

  const load = useCallback(async (path: string) => {
    const list = (await (await fetch(path)).json()).integrations;
    return list;
  }, []);

  const { data: integrations } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });

  const sortedIntegrations = useMemo(() => {
    return orderBy(
      integrations,
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [integrations]);

  const { data } = useSWR('get-all-integrations-onboarding', getIntegrations);

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex gap-[4px] flex-col text-center">
        <div className="text-[24px] font-semibold">
          {t('connect_your_channels', 'Connect Your Channels')}
        </div>
        <div className="text-[14px] text-customColor18">
          {t(
            'connect_social_media_to_start',
            'Connect your social media accounts to start scheduling posts'
          )}
        </div>
      </div>

      {/* Connected channels */}
      {sortedIntegrations.length > 0 && (
        <div className="bg-newTableHeader rounded-[8px] p-[16px]">
          <div className="text-[14px] font-medium mb-[12px]">
            {t('connected_channels', 'Connected Channels')} (
            {sortedIntegrations.length})
          </div>
          <div className="flex flex-wrap gap-[12px]">
            {sortedIntegrations.map((integration: any) => (
              <div
                key={integration.id}
                className="flex items-center gap-[8px] bg-customColor47/30 rounded-[8px] px-[12px] py-[8px]"
              >
                <div className="relative w-[28px] h-[28px]">
                  <SafeImage
                    src={integration.picture}
                    className="rounded-full"
                    alt={integration.identifier}
                    width={28}
                    height={28}
                  />
                  <PlatformBadge
                    identifier={integration.identifier}
                    size={16}
                    className="absolute z-10 -bottom-[4px] -end-[4px]"
                  />
                </div>
                <span className="text-[13px]">{integration.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available platforms - using AddProviderComponent */}
      <div className="flex flex-col gap-[12px]">
        <div className="text-[14px] font-medium">
          {t('click_channel_to_add', 'Click a channel to add it')}
        </div>
        {data && (
          <AddProviderComponent
            invite={false}
            social={data.social || []}
            article={data.article || []}
            onboarding={true}
          />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end pt-[24px] mt-[8px]">
        <Button
          onClick={onNext}
          className="group flex items-center gap-[8px] font-[600] px-[16px] rounded-[8px] text-[14px] transition-colors duration-state"
        >
          {sortedIntegrations.length > 0
            ? t('continue', 'Continue')
            : t('continue_without_channels', 'Continue without channels')}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="group-hover:translate-x-1 transition-transform"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  );
};

/**
 * `content-factory-next-rrs9`: the second step hands over, it does not teach.
 *
 * It used to be four paragraphs about the calendar, the draft, the preview and
 * the schedule — the loop any scheduler has, with nothing in it about the
 * voice, the facts or the evidence a draft has to stand on. The step was also
 * called «смотреть обучение», because the upstream product had a video there
 * and the rename took the video out and left the title. The owner read the
 * result exactly right on 01.09.2026: «как будто бы у нас его и нет».
 *
 * The teaching moved to `/onboarding`, where it can read how far the workspace
 * actually got and send a person to the place each step is done. What is left
 * here is the handover, because this modal is opened by someone who has just
 * connected a channel and the next thing they need is the way onward.
 */
const OnboardingStep2: FC<{ onBack: () => void; onFinish: () => void }> = ({
  onBack,
  onFinish,
}) => {
  const t = useT();

  return (
    <div className="flex flex-col gap-[24px] flex-1">
      <div className="flex gap-[4px] flex-col text-center">
        <div className="cf-heading-md text-cf-ink">
          {t('onboarding_next_title', 'Where to start')}
        </div>
        <div className="cf-body-md text-cf-ink-muted [text-wrap:pretty]">
          {t(
            'onboarding_next_description',
            'Six steps through one piece of content: channel, voice, something to stand on, brief, draft, schedule. What is already done is ticked off for you.'
          )}
        </div>
      </div>

      <div className="flex justify-between pt-[24px] mt-[8px]">
        <Button
          variant="secondary"
          onClick={onBack}
          className="font-[600] px-[16px] rounded-[8px] text-[14px]"
        >
          {t('back', 'Back')}
        </Button>
        <Link href="/onboarding" onClick={onFinish}>
          <Button className="font-[600] px-[16px] rounded-[8px] text-[14px]">
            {t('get_started', 'Get Started')}
          </Button>
        </Link>
      </div>
    </div>
  );
};
