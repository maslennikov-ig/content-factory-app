'use client';

import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import { Input } from '@contentfactory/react/form/input';
import { Panel } from '@contentfactory/react/layout';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import copy from 'copy-to-clipboard';

type Locale = 'en' | 'ru';

/**
 * Per `docs/design/component-authoring-rules.md` this is a new component, so
 * copy is inline (en/ru) rather than routed through the i18next-style
 * `useT()` key catalog the rest of `admin-users.component.tsx` still uses —
 * same convention as `content-intelligence.view.tsx`.
 */
const copyText = {
  en: {
    title: 'Telegram notifications',
    body: 'Bind your own Telegram chat to this account to be paged there when a new registration is waiting for approval.',
    connected: 'Connected',
    connectedBody:
      'This account already has a bound chat. Connecting again replaces it with whatever chat sends the next command.',
    connect: 'Connect Telegram',
    reconnect: 'Connect a different chat',
    openLink: 'Open in Telegram',
    codeLabel: 'Or send this command to the bot yourself',
    expiresIn: (minutes: number) => `Expires in about ${minutes} min`,
    expired: 'This link expired. Request a new one.',
    copyLink: 'Copy link',
    copied: 'Copied to clipboard',
    error: 'Could not request a connection link. Try again.',
    retry: 'Try again',
  },
  ru: {
    title: 'Уведомления в Telegram',
    body: 'Привяжите свой личный чат с ботом к этому аккаунту, чтобы получать сообщение, когда появляется новая заявка на одобрение.',
    connected: 'Подключено',
    connectedBody:
      'К этому аккаунту уже привязан чат. Повторное подключение заменит его тем чатом, откуда придёт следующая команда.',
    connect: 'Подключить Telegram',
    reconnect: 'Подключить другой чат',
    openLink: 'Открыть в Telegram',
    codeLabel: 'Или отправьте боту эту команду сами',
    expiresIn: (minutes: number) => `Истекает примерно через ${minutes} мин`,
    expired: 'Ссылка истекла. Запросите новую.',
    copyLink: 'Скопировать ссылку',
    copied: 'Скопировано',
    error: 'Не удалось запросить ссылку подключения. Попробуйте ещё раз.',
    retry: 'Повторить',
  },
} as const;

interface TelegramStatus {
  connected: boolean;
}

interface TelegramConnectIssue {
  code: string;
  expiresAt: string;
}

export function AdminTelegramConnectComponent() {
  const { language, telegramBotName } = useVariables();
  const locale: Locale = language.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
  const t = copyText[locale];
  const fetch = useFetch();
  const toaster = useToaster();
  const [issue, setIssue] = useState<TelegramConnectIssue | undefined>();
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState(false);

  const { data: status, mutate: refreshStatus } = useSWR<TelegramStatus>(
    '/admin/telegram/status',
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load Telegram status');
      return response.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const requestCode = useCallback(async () => {
    setRequesting(true);
    setRequestError(false);
    try {
      const response = await fetch('/admin/telegram/connect', {
        method: 'POST',
      });
      if (!response.ok) {
        setRequestError(true);
        return;
      }
      const body = (await response.json()) as TelegramConnectIssue;
      setIssue(body);
      void refreshStatus();
    } catch {
      setRequestError(true);
    } finally {
      setRequesting(false);
    }
  }, [fetch, refreshStatus]);

  const expiresAt = issue ? new Date(issue.expiresAt) : undefined;
  const expired = expiresAt ? expiresAt.getTime() <= Date.now() : false;
  const minutesLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 60_000))
    : 0;
  const inviteLink =
    issue && telegramBotName
      ? `https://t.me/${telegramBotName}?start=${issue.code}`
      : undefined;
  const command = issue ? `/start ${issue.code}` : undefined;

  return (
    <Panel as="section" contentPadding="compact">
      <div className="flex flex-col gap-[12px]">
        <div>
          <h2 className="cf-heading-md text-cf-ink">{t.title}</h2>
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {status?.connected ? t.connectedBody : t.body}
          </p>
        </div>

        {status?.connected && (
          <span className="inline-flex w-fit items-center gap-[8px] rounded-full border border-cf-accent bg-cf-accent-soft px-[8px] py-[4px] cf-label-sm text-cf-accent">
            <span aria-hidden="true">●</span>
            {t.connected}
          </span>
        )}

        {requestError && (
          <div
            role="alert"
            className="rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-danger"
          >
            <p>{t.error}</p>
            <Button
              variant="quiet"
              type="button"
              onClick={() => void requestCode()}
              className="mt-[8px] underline"
            >
              {t.retry}
            </Button>
          </div>
        )}

        {!issue || expired ? (
          <div>
            {expired && (
              <p className="cf-body-sm text-cf-warning">{t.expired}</p>
            )}
            <Button
              loading={requesting}
              onClick={() => void requestCode()}
              className="w-fit"
            >
              {status?.connected ? t.reconnect : t.connect}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-[12px]">
            <div className="flex flex-wrap items-center gap-[8px]">
              {inviteLink && (
                <ButtonLink
                  href={inviteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t.openLink}
                </ButtonLink>
              )}
              <span className="cf-caption text-cf-ink-muted">
                {t.expiresIn(minutesLeft)}
              </span>
            </div>
            <div className="flex flex-col gap-[8px]">
              <label
                htmlFor="admin-telegram-code"
                className="cf-label-sm text-cf-ink-muted"
              >
                {t.codeLabel}
              </label>
              <div className="flex min-w-0 flex-col gap-[8px] sm:flex-row">
                <Input
                  standalone
                  name="admin-telegram-code"
                  id="admin-telegram-code"
                  value={command ?? ''}
                  onChange={() => undefined}
                  readOnly
                  className="min-w-0 flex-1"
                  inputClassName="cf-label-sm"
                />
                <Button
                  secondary
                  type="button"
                  onClick={() => {
                    if (command) copy(command);
                    toaster.show(t.copied, 'success');
                  }}
                >
                  {t.copyLink}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default AdminTelegramConnectComponent;
