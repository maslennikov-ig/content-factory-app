'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import copy from 'copy-to-clipboard';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { useTelegramConnect } from '@contentfactory/frontend/components/launches/web3/providers/use-telegram-connect';
import { ONBOARDING_STEP_HREF } from './onboarding.adapter';
import type { onboardingCopy } from './onboarding.copy';

type Words = (typeof onboardingCopy)['ru']['telegram'];

/**
 * The channel step's Telegram sub-guide, live (2q28.6, variant B).
 *
 * Three moves — the bot as an admin, `/connect <word>` in the channel, the
 * channel appearing by itself — drawn in place and wired to the same
 * mechanics as the connect dialog on «Каналы»: the nonce from
 * `GET /integrations/social/telegram`, the word and the polling from
 * `useTelegramConnect`, and the finishing hop through
 * `/integrations/social/telegram?code=…&state=…`. `redirectUrl=/onboarding`
 * brings the person back here once the channel is saved, where the step
 * reads as done from the workspace itself.
 *
 * Where the live flow cannot start — no bot configured on this server, or the
 * server refusing the request — the step says so and points at the channels
 * screen instead of pretending.
 */

const CopyIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
    <path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5" />
  </svg>
);

function Move({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-[12px]">
      <span aria-hidden className="w-[20px] shrink-0 cf-caption text-cf-accent">
        {index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <span className="cf-label-md text-cf-ink [text-wrap:pretty]">{title}</span>
        {children}
      </div>
    </li>
  );
}

function Chip({
  value,
  copyLabel,
  onCopy,
}: {
  value: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex max-w-full items-center gap-[4px] self-start rounded-[8px] border border-cf-border-strong bg-cf-canvas ps-[12px]">
      <span className="min-w-0 break-all py-[8px] cf-label-sm text-cf-ink">
        {value}
      </span>
      <Button
        iconOnly
        variant="quiet"
        aria-label={copyLabel}
        onClick={onCopy}
        className="shrink-0"
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

export function OnboardingTelegramGuide({
  words,
  actionLabel,
}: {
  words: Words;
  actionLabel: string;
}) {
  const { telegramBotName } = useVariables();
  const request = useFetch();
  const toaster = useToaster();
  const nonce = useRef('');
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  const onChat = useCallback((chatId: string) => {
    window.location.href = `/integrations/social/telegram?code=${encodeURIComponent(
      chatId
    )}&state=${encodeURIComponent(nonce.current)}`;
  }, []);
  const connect = useTelegramConnect(onChat);

  const begin = useCallback(async () => {
    setFailed(false);
    setOpening(true);
    try {
      const response = await request(
        `/integrations/social/telegram?redirectUrl=${encodeURIComponent(
          '/onboarding'
        )}`
      );
      const body = response.ok ? await response.json() : null;
      if (!body?.url) throw new Error(String(response.status));
      nonce.current = String(body.url);
    } catch {
      setFailed(true);
      return;
    } finally {
      setOpening(false);
    }
    void connect.start();
  }, [request, connect]);

  const copyValue = useCallback(
    (value: string) => {
      copy(value);
      toaster.show(words.copied, 'success');
    },
    [toaster, words.copied]
  );

  if (!telegramBotName) {
    return (
      <div className="flex flex-col gap-[12px]">
        <p className="cf-body-md text-cf-ink [text-wrap:pretty]">
          {words.unavailable}
        </p>
        <Link
          href={ONBOARDING_STEP_HREF.channel}
          className={buttonClassName({ variant: 'primary', className: 'self-start' })}
        >
          {words.otherPlatform}
        </Link>
      </div>
    );
  }

  const bot = `@${telegramBotName}`;

  return (
    <div className="flex flex-col gap-[20px]" data-onboarding-telegram="true">
      <ol className="flex flex-col gap-[20px]">
        <Move index="01" title={words.addBotTitle}>
          <Chip
            value={bot}
            copyLabel={words.copyBot}
            onCopy={() => copyValue(bot)}
          />
          <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {words.addBotBody}
          </span>
        </Move>
        <Move index="02" title={words.commandTitle}>
          {connect.started && connect.command ? (
            <>
              <Chip
                value={connect.command}
                copyLabel={words.copyCommand}
                onCopy={() => copyValue(connect.command)}
              />
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {words.commandBody}
              </span>
            </>
          ) : (
            <>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
                {words.commandIdle}
              </span>
              <Button
                variant="primary"
                onClick={begin}
                loading={opening}
                loadingLabel={actionLabel}
                className="self-start"
              >
                {actionLabel}
              </Button>
            </>
          )}
          {failed && (
            <p role="alert" className="cf-body-sm text-cf-ink [text-wrap:pretty]">
              {words.failed}
            </p>
          )}
        </Move>
        <Move index="03" title={words.appearsTitle}>
          {connect.started &&
            (connect.expired ? (
              <div className="flex flex-col gap-[8px]">
                <p role="status" className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {words.expired}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void connect.startAgain()}
                  className="self-start"
                >
                  {words.startAgain}
                </Button>
              </div>
            ) : (
              <p role="status" className="flex items-center gap-[8px] cf-body-sm text-cf-ink-muted">
                <span aria-hidden className="h-[8px] w-[8px] shrink-0 rounded-full bg-cf-signature" />
                {words.waiting}
              </p>
            ))}
        </Move>
      </ol>
      <Link
        href={ONBOARDING_STEP_HREF.channel}
        className="self-start cf-body-sm text-cf-ink underline underline-offset-4 hover:text-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
      >
        {words.otherPlatform}
      </Link>
    </div>
  );
}
