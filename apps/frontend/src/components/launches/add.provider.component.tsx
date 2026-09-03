'use client';

import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import React, { FC, useCallback, useMemo } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Input } from '@contentfactory/react/form/input';
import { FieldValues, FormProvider, useForm } from 'react-hook-form';
import { Button } from '@contentfactory/react/form/button';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { ApiKeyDto } from '@contentfactory/nestjs-libraries/dtos/integrations/api.key.dto';
import { useRouter } from 'next/navigation';
import { TopTitle } from '@contentfactory/frontend/components/launches/helpers/top.title.component';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { web3List } from '@contentfactory/frontend/components/launches/web3/web3.list';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  PlatformCard,
  PlatformCardLogo,
} from '@contentfactory/react/platform/platform.card';
import {
  PLATFORM_FAMILIES,
  PLATFORM_TWINS,
  familyOfPlatform,
} from '@contentfactory/react/platform/platform.families';
import { useIntegrationList } from '@contentfactory/frontend/components/launches/helpers/use.integration.list';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import copy from 'copy-to-clipboard';
import { capitalize } from 'lodash';
const resolver = classValidatorResolver(ApiKeyDto);

export const useAddProvider = (update?: () => void, invite?: boolean) => {
  const modal = useModals();
  const fetch = useFetch();
  const t = useT();
  return useCallback(async () => {
    const data = await (await fetch('/integrations')).json();
    modal.openModal({
      title: t('add_channel', 'Add Channel'),
      withCloseButton: true,
      children: (
        <AddProviderComponent invite={!!invite} update={update} {...data} />
      ),
    });
  }, []);
};
export const AddProviderButton: FC<{
  update?: () => void;
}> = (props) => {
  const { update } = props;
  const add = useAddProvider(update);
  const invite = useAddProvider(update, true);
  const t = useT();
  const user = useUser();

  // Since `saas.2.1` the door behind both of these buttons — the one that
  // hands out the provider's OAuth address — asks for an administrator. The
  // refusal it returns is honest and readable, but a button that is always
  // refused is not a product, so a member does not see one.
  if (!isOrganizationAdmin(user?.role)) {
    return null;
  }

  return (
    <div className="flex group-[.sidebar]:block gap-[8px]">
      <Button
        variant="secondary"
        className="flex-1 group-[.sidebar]:w-[100%] group-[.sidebar]:flex-none px-[16px] justify-center items-center flex rounded-[8px] gap-[8px]"
        onClick={add}
      >
        <div>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path
              d="M1.66675 10.0417C3.35907 10.2299 4.93698 10.9884 6.14101 12.1924C7.34504 13.3964 8.10353 14.9743 8.29175 16.6667M1.66675 13.4167C2.46749 13.58 3.20253 13.9751 3.7804 14.553C4.35827 15.1309 4.75344 15.8659 4.91675 16.6667M1.66675 16.6667H1.67508M11.6667 17.5H14.3334C15.7335 17.5 16.4336 17.5 16.9684 17.2275C17.4388 16.9878 17.8212 16.6054 18.0609 16.135C18.3334 15.6002 18.3334 14.9001 18.3334 13.5V6.5C18.3334 5.09987 18.3334 4.3998 18.0609 3.86502C17.8212 3.39462 17.4388 3.01217 16.9684 2.77248C16.4336 2.5 15.7335 2.5 14.3334 2.5H5.66675C4.26662 2.5 3.56655 2.5 3.03177 2.77248C2.56137 3.01217 2.17892 3.39462 1.93923 3.86502C1.66675 4.3998 1.66675 5.09987 1.66675 6.5V6.66667"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="text-start text-[14px] group-[.sidebar]:hidden">
          {t('add_channel', 'Add Channel')}
        </div>
      </Button>
      <Button
        iconOnly
        size={32}
        aria-label={t(
          'invite_link',
          'Send Invite Link to a customer to add channel'
        )}
        variant="quiet"
        onClick={invite}
        data-tooltip-id="tooltip"
        data-tooltip-content={t(
          'invite_link',
          'Send Invite Link to a customer to add channel'
        )}
        className="group-[.sidebar]:hidden justify-center items-center flex rounded-[8px] cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 16 16"
          fill="none"
        >
          <g clipPath="url(#clip0_2452_193804)">
            <path
              d="M6.6668 8.66599C6.9531 9.04875 7.31837 9.36545 7.73783 9.59462C8.1573 9.82379 8.62114 9.96007 9.0979 9.99422C9.57466 10.0284 10.0532 9.95957 10.501 9.79251C10.9489 9.62546 11.3555 9.36404 11.6935 9.02599L13.6935 7.02599C14.3007 6.39732 14.6366 5.55531 14.629 4.68132C14.6215 3.80733 14.2709 2.97129 13.6529 2.35326C13.0348 1.73524 12.1988 1.38467 11.3248 1.37708C10.4508 1.36948 9.60881 1.70547 8.98013 2.31266L7.83347 3.45266M9.33347 7.33266C9.04716 6.94991 8.68189 6.6332 8.26243 6.40403C7.84297 6.17486 7.37913 6.03858 6.90237 6.00444C6.4256 5.97029 5.94708 6.03908 5.49924 6.20614C5.0514 6.3732 4.64472 6.63461 4.3068 6.97266L2.3068 8.97266C1.69961 9.60133 1.36363 10.4433 1.37122 11.3173C1.37881 12.1913 1.72938 13.0274 2.3474 13.6454C2.96543 14.2634 3.80147 14.614 4.67546 14.6216C5.54945 14.6292 6.39146 14.2932 7.02013 13.686L8.16013 12.546"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            ></path>
          </g>
          <defs>
            <clipPath id="clip0_2452_193804">
              <rect width="16" height="16" fill="textColor"></rect>
            </clipPath>
          </defs>
        </svg>
      </Button>
    </div>
  );
};

export const UrlModal: FC<{
  gotoUrl(url: string): void;
}> = (props) => {
  const { gotoUrl } = props;
  const methods = useForm({
    mode: 'onChange',
  });

  const t = useT();

  const submit = useCallback(async (data: FieldValues) => {
    gotoUrl(data.url);
  }, []);
  return (
    <div className="rounded-[4px] border border-customColor6 bg-sixth px-[16px] pb-[16px] relative">
      <TopTitle title={`Instance URL`} />
      <Button
        iconOnly
        size={28}
        aria-label={t('close', 'Close')}
        variant="quiet"
        onClick={close}
        className="outline-none absolute end-[20px] top-[20px] mantine-UnstyledButton-root mantine-ActionIcon-root cursor-pointer mantine-Modal-close mantine-1dcetaa"
        type="button"
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
      <FormProvider {...methods}>
        <form
          className="gap-[8px] flex flex-col"
          onSubmit={methods.handleSubmit(submit)}
        >
          <div className="pt-[10px]">
            <Input label="URL" name="url" />
          </div>
          <div>
            <Button type="submit">{t('connect', 'Connect')}</Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};
export const CustomVariables: FC<{
  variables: Array<{
    key: string;
    label: string;
    defaultValue?: string;
    validation: string;
    type: 'text' | 'password';
    hint?: string;
  }>;
  close?: () => void;
  identifier: string;
  gotoUrl(url: string): void;
  onboarding?: boolean;
}> = (props) => {
  const { close, gotoUrl, identifier, variables, onboarding } = props;
  const fetch = useFetch();
  const modals = useModals();
  const schema = useMemo(() => {
    return object({
      ...variables.reduce((aIcc, item) => {
        const splitter = item.validation.split('/');
        const regex = new RegExp(
          splitter.slice(1, -1).join('/'),
          splitter.pop()
        );
        return {
          ...aIcc,
          [item.key]: string()
            .matches(regex, `${item.label} is invalid`)
            .required(),
        };
      }, {}),
    });
  }, [variables]);
  const methods = useForm({
    mode: 'onChange',
    resolver: yupResolver(schema),
    values: variables.reduce(
      (acc, item) => ({
        ...acc,
        ...(item.defaultValue
          ? {
              [item.key]: item.defaultValue,
            }
          : {}),
      }),
      {}
    ),
  });
  const submit = useCallback(
    async (data: FieldValues) => {
      const { url } = await (
        await fetch(
          `/integrations/social/${identifier}${
            onboarding ? '?onboarding=true' : ''
          }`
        )
      ).json();
      modals.closeAll();
      gotoUrl(
        `/integrations/social/${identifier}?state=${url}&code=${Buffer.from(
          JSON.stringify(data)
        ).toString('base64')}${onboarding ? '&onboarding=true' : ''}`
      );
    },
    [variables, onboarding]
  );

  const t = useT();

  return (
    <div className="rounded-[4px] relative">
      <FormProvider {...methods}>
        <form
          className="gap-[8px] flex flex-col pt-[10px]"
          onSubmit={methods.handleSubmit(submit)}
        >
          {variables.map((variable) => (
            <div key={variable.key}>
              {variable.hint ? (
                <div className="flex flex-col gap-[6px]">
                  <div className="text-[14px] flex items-center gap-[6px]">
                    <span>{variable.label}</span>
                    <span
                      data-tooltip-id="tooltip"
                      data-tooltip-content={variable.hint}
                      className="w-[16px] h-[16px] rounded-full border border-textColor/60 text-textColor/60 flex items-center justify-center text-[11px] leading-none cursor-help select-none"
                    >
                      i
                    </span>
                  </div>
                  <Input
                    label=""
                    name={variable.key}
                    type={variable.type == 'text' ? 'text' : 'password'}
                  />
                </div>
              ) : (
                <Input
                  label={variable.label}
                  name={variable.key}
                  type={variable.type == 'text' ? 'text' : 'password'}
                />
              )}
            </div>
          ))}
          <div>
            <Button type="submit">{t('connect', 'Connect')}</Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};
const ExtensionNotFound: FC = () => {
  const modals = useModals();
  const t = useT();
  const { extensionId } = useVariables();
  return (
    <div className="flex flex-col gap-[16px] pt-[8px]">
      <p className="text-[14px] text-textColor/80">
        {t(
          'extension_not_available',
          'The Content Factory browser extension is not installed. You need to install it before connecting this channel.'
        )}
      </p>
      <div className="flex gap-[10px]">
        <Button
          type="button"
          className="flex-1"
          onClick={() => {
            window.open(
              `https://chromewebstore.google.com/detail/${extensionId}`,
              '_blank'
            );
            modals.closeCurrent();
          }}
        >
          {t('install_extension', 'Install Extension')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => modals.closeCurrent()}
        >
          {t('cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
};

const ChromeExtensionWarning: FC<{
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
  const modals = useModals();
  const t = useT();
  return (
    <div className="flex flex-col gap-[16px] pt-[8px]">
      <p className="text-[14px] text-textColor/80">
        {t(
          'chrome_extension_warning_intro',
          'This channel connects via the browser extension. Please be aware of the following:'
        )}
      </p>
      <ul className="flex flex-col gap-[8px] list-disc ps-[20px] text-[14px] text-textColor/80">
        <li>
          {t(
            'chrome_extension_warning_tos',
            'Using a browser extension to interact with a platform may violate its terms of service and could result in your account being suspended or banned.'
          )}
        </li>
        <li>
          {t(
            'chrome_extension_warning_unstable',
            'This method is not as reliable as native integrations and may experience random disconnections.'
          )}
        </li>
        <li>
          {t(
            'chrome_extension_warning_reconnect',
            'You may need to reconnect periodically if the session expires.'
          )}
        </li>
        <li>
          We will store your cookies securely to facilitate the connection.
        </li>
        <li>
          Content Factory does not take responsibility for any issues arising or
          account termination due to the use of this method.
        </li>
      </ul>
      <div className="flex gap-[10px] mt-[8px]">
        <Button
          type="button"
          className="flex-1"
          onClick={() => {
            modals.closeCurrent();
            onConfirm();
          }}
        >
          {t('i_understand_continue', 'I understand, continue')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => {
            modals.closeCurrent();
            onCancel();
          }}
        >
          {t('cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
};

export const AddProviderComponent: FC<{
  social: Array<{
    identifier: string;
    name: string;
    toolTip?: string;
    isExternal: boolean;
    isWeb3: boolean;
    isChromeExtension?: boolean;
    extensionCookies?: Array<{
      name: string;
      domain: string;
    }>;
    customFields?: Array<{
      key: string;
      label: string;
      validation: string;
      type: 'text' | 'password';
      hint?: string;
    }>;
  }>;
  article: Array<{
    identifier: string;
    name: string;
  }>;
  invite: boolean;
  update?: () => void;
  onboarding?: boolean;
  isMobile?: boolean;
}> = (props) => {
  const { update, social, onboarding, isMobile } = props;
  const { isGeneral, extensionId } = useVariables();
  const toaster = useToaster();
  const router = useRouter();
  const fetch = useFetch();
  const modal = useModals();
  const t = useT();

  // The channels already connected, so the atomic-number slot has a number to
  // hold. `useIntegrationList` is the hook four other screens already use; SWR
  // deduplicates the request, and `fallbackData` means the cards render with a
  // zero rather than waiting.
  const { data: connectedIntegrations } = useIntegrationList();

  const connectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const integration of connectedIntegrations ?? []) {
      const identifier = integration?.identifier;
      if (identifier) counts[identifier] = (counts[identifier] ?? 0) + 1;
    }
    return counts;
  }, [connectedIntegrations]);

  /**
   * The picker, grouped the way the product groups its destinations.
   *
   * A platform the map does not place still appears — in a trailing band rather
   * than nowhere. Silence would be the worse failure: an unplaced provider that
   * simply is not drawn is a channel the customer cannot connect.
   */
  /**
   * The picker, grouped the way the product groups its destinations.
   *
   * Two branches went with the old grid and are not coming back. `onboarding`
   * used to widen it to nine columns; the band layout answers to the width it
   * is given, so a screen with more room simply gets more columns. `isMobile`
   * used to swap in a 72px row; one layout now serves 390 to 1440, which is the
   * point, and the React Native shell in `new-layout/mobile.integration.tsx`
   * gets the same two columns a phone browser does.
   */
  const bands = useMemo(() => {
    const available = social.filter((item) =>
      !props.invite
        ? true
        : !item.isExternal &&
          !item.isWeb3 &&
          !item.isChromeExtension &&
          !item.customFields
    );

    const describe = (item: (typeof available)[number]) => {
      const twin = PLATFORM_TWINS[item.identifier];
      return {
        ...item,
        // The twin's own name, not the backend's: `M. Instance` does not say
        // Mastodon, and `Instagram\n(Facebook Business)` says the distinction
        // twice once the qualifier is showing it.
        name: twin?.name ?? item.name,
        connectedChannels: connectedCounts[item.identifier] ?? 0,
        qualifier: twin ? t(twin.key, twin.default) : undefined,
      };
    };

    // Order inside a band comes from the map, which is where it is declared —
    // filtering the incoming array instead would have handed the order to
    // whatever sequence the backend happened to return, and put the two halves
    // of a twin pair anywhere but next to each other.
    const placed = PLATFORM_FAMILIES.map((family) => ({
      id: family.id,
      label: t(family.labelKey, family.labelDefault),
      items: family.platforms
        .map((identifier) =>
          available.find((item) => item.identifier === identifier)
        )
        .filter(Boolean)
        .map(describe),
    })).filter((band) => band.items.length > 0);

    const unplaced = available
      .filter((item) => !familyOfPlatform(item.identifier))
      .map(describe);

    return unplaced.length
      ? [
          ...placed,
          { id: 'unplaced', label: t('platform_family_other', 'Other'), items: unplaced },
        ]
      : placed;
  }, [social, props.invite, connectedCounts, t]);

  const getSocialLink = useCallback(
    (
        invite: boolean,
        identifier: string,
        isExternal: boolean,
        isWeb3: boolean,
        isChromeExtension?: boolean,
        customFields?: Array<{
          key: string;
          label: string;
          validation: string;
          defaultValue?: string;
          type: 'text' | 'password';
          hint?: string;
        }>
      ) =>
      async () => {
        const onboardingParam = onboarding ? 'onboarding=true' : '';
        const openWeb3 = async () => {
          const { component: Web3Providers } = web3List.find(
            (item) => item.identifier === identifier
          )!;
          const { url } = await (
            await fetch(
              `/integrations/social/${identifier}${
                onboarding ? '?onboarding=true' : ''
              }`
            )
          ).json();
          modal.openModal({
            title: t('add_named_provider', 'Add {{name}}', {
              name: capitalize(identifier),
            }),
            withCloseButton: true,
            ...(isMobile ? { removeLayout: true, fullScreen: true } : {}),
            classNames: {
              modal: 'bg-transparent text-textColor',
            },
            children: (
              <div
                {...(isMobile ? { className: 'h-full bg-black p-[20px]' } : {})}
              >
                <Web3Providers
                  onComplete={(code, newState) => {
                    window.location.href = `/integrations/social/${identifier}?code=${code}&state=${newState}${
                      onboarding ? '&onboarding=true' : ''
                    }`;
                  }}
                  nonce={url}
                />
              </div>
            ),
          });
          return;
        };
        const gotoIntegration = async (externalUrl?: string) => {
          // Mobile WebView: reuse the existing `externalUrl` param to
          // carry the `contentfactory://` deep link so the backend redirects
          // back to the iOS/Android app after OAuth completes, instead
          // of the default web redirect.
          const params = [
            `externalUrl=${encodeURIComponent(externalUrl)}`,
            onboardingParam,
            isMobile
              ? `redirectUrl=${encodeURIComponent(
                  'contentfactory://integrations'
                )}`
              : '',
          ]
            .filter(Boolean)
            .join('&');
          const { url, err } = await (
            await fetch(
              `/integrations/social/${identifier}${params ? `?${params}` : ''}`
            )
          ).json();
          if (err) {
            toaster.show(
              t(
                'could_not_connect_to_platform',
                'Could not connect to the platform'
              ),
              'warning'
            );
            return;
          }

          if (invite) {
            toaster.show(
              t(
                'invite_link_copied_one_hour',
                'Invite link copied to clipboard, link will be available for 1 hour'
              ),
              'success'
            );
            modal.closeAll();
            copy(url);
            return;
          }

          if (isMobile) {
            // In the mobile WebView the OAuth provider (Google, Facebook,
            // etc.) typically refuses in-WebView sign-in. Post the URL
            // out to React Native so it can open the system browser;
            // `window.open`/`location.href` aren't reliable here because
            // RN WebView doesn't always route them through the native
            // navigation intercept. The backend redirects back to the
            // app via `contentfactory://` once OAuth completes.
            const rn = (window as any).ReactNativeWebView;
            if (rn && typeof rn.postMessage === 'function') {
              rn.postMessage(JSON.stringify({ type: 'open-external', url }));
              return;
            }
            window.open(url, '_blank');
            return;
          }

          window.location.href = url;
        };
        if (isWeb3) {
          openWeb3();
          return;
        }
        if (isChromeExtension) {
          const confirmed = await new Promise<boolean>((resolve) => {
            modal.openModal({
              title: t('chrome_extension_notice', 'Browser Extension Notice'),
              withCloseButton: true,
              onClose: () => resolve(false),
              children: (
                <ChromeExtensionWarning
                  onConfirm={() => {
                    resolve(true);
                  }}
                  onCancel={() => {
                    resolve(false);
                  }}
                />
              ),
            });
          });
          if (!confirmed) {
            return;
          }
          if (!extensionId || !chrome?.runtime?.sendMessage) {
            modal.openModal({
              title: t('extension_not_available_title', 'Extension Not Found'),
              withCloseButton: true,
              children: <ExtensionNotFound />,
            });
            return;
          }
          try {
            await new Promise<void>((resolve, reject) => {
              chrome.runtime.sendMessage(
                extensionId,
                { type: 'PING' },
                (response: any) => {
                  if (chrome.runtime.lastError || !response?.status) {
                    reject(new Error('Extension not reachable'));
                  } else {
                    resolve();
                  }
                }
              );
            });
          } catch {
            toaster.show(
              t(
                'extension_not_installed',
                'Content Factory browser extension is not installed or not reachable.'
              ),
              'warning'
            );
            return;
          }
          try {
            const cookieResponse = await new Promise<any>((resolve, reject) => {
              chrome.runtime.sendMessage(
                extensionId,
                { type: 'GET_COOKIES', provider: identifier },
                (response: any) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else {
                    resolve(response);
                  }
                }
              );
            });
            if (!cookieResponse.success) {
              toaster.show(
                cookieResponse.error ||
                  t(
                    'extension_cookies_missing',
                    'Could not get cookies. Please log in to the platform first.'
                  ),
                'warning'
              );
              return;
            }
            const { url } = await (
              await fetch(
                `/integrations/social/${identifier}${
                  onboarding ? '?onboarding=true' : ''
                }`
              )
            ).json();
            modal.closeAll();
            window.location.href = `/integrations/social/${identifier}?state=${url}&code=${Buffer.from(
              JSON.stringify(cookieResponse.cookies)
            ).toString('base64')}${onboarding ? '&onboarding=true' : ''}`;
          } catch {
            toaster.show(
              t(
                'extension_communication_error',
                'Failed to communicate with the browser extension.'
              ),
              'warning'
            );
          }
          return;
        }
        if (isExternal) {
          modal.openModal({
            title: t('url', 'URL'),
            withCloseButton: true,
            ...(isMobile ? { removeLayout: true, fullScreen: true } : {}),
            classNames: {
              modal: 'bg-transparent text-textColor',
            },
            children: <UrlModal gotoUrl={gotoIntegration} />,
          });
          return;
        }
        if (customFields) {
          modal.openModal({
            title: t('add_provider_title', 'Add Provider'),
            withCloseButton: true,
            ...(isMobile ? { removeLayout: true, fullScreen: true } : {}),
            classNames: {
              modal: 'bg-transparent text-textColor',
            },
            children: (
              <div
                {...(isMobile ? { className: 'h-full bg-black p-[20px]' } : {})}
              >
                <CustomVariables
                  identifier={identifier}
                  gotoUrl={(url: string) => router.push(url)}
                  variables={customFields}
                  onboarding={onboarding}
                />
              </div>
            ),
          });
          return;
        }
        await gotoIntegration();
      },
    [onboarding]
  );

  return (
    <div className="relative flex w-full flex-col gap-[24px]">
      {bands.map((band) => (
        <section key={band.id} className="flex flex-col gap-[12px]">
          {/*
            The family is carried by the band and its heading. It used to be
            carried by nothing at all — thirty-five logos in one grid, held
            together by somebody else's artwork.
          */}
          <div className="flex items-center gap-[8px]">
            <h3 className="cf-label-md text-cf-ink">{band.label}</h3>
            {/*
              The count sits next to the name, not at the far end of the rule.
              On a wide screen that end is a thousand pixels away, and a number
              nobody can associate with its heading is decoration.
            */}
            <span className="cf-caption text-cf-ink-muted">
              {band.items.length}
            </span>
            <span
              className="h-0 flex-1 border-t border-cf-border"
              aria-hidden={true}
            />
          </div>

          {/*
            One layout from 390 to 1440, with the column count stated rather
            than inferred.

            Dense on purpose: the table this borrows from is readable because
            the whole of it fits on one screen, and thirty-five destinations in
            two columns is six screens of scrolling. Nine columns on a wide
            display puts every family in view at once, which is the entire
            reason for grouping them.

            `auto-fill` with a minimum width was the first attempt and it fails
            quietly: the column count then depends on whatever padding the modal
            around the picker happens to have, and at 390px that measured out to
            one column.
          */}
          <div className="grid gap-[8px] grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9">
            {band.items.map((item) => (
              <div
                key={item.identifier}
                className="relative"
                {...(item.toolTip
                  ? {
                      'data-tooltip-id': 'tooltip',
                      'data-tooltip-content': item.toolTip,
                    }
                  : {})}
              >
                {/*
                  Five providers carry a warning that decides whether connecting
                  will work at all — Instagram wants a business account linked to
                  a Facebook page, Bluesky wants 2FA off, Nostr wants a HEX key.
                  The old tile drew a `?` in its corner; without it the warning
                  exists only for someone who happens to hover, and on a touch
                  screen for nobody.
                */}
                {!!item.toolTip && (
                  <span
                    className="cf-caption absolute end-[4px] top-[4px] z-10 flex h-[12px] w-[12px] items-center justify-center rounded-full border border-cf-border-control text-cf-ink-muted"
                    aria-hidden={true}
                  >
                    ?
                  </span>
                )}
                <PlatformCard
                  name={item.name}
                  qualifier={item.qualifier}
                  connectedChannels={item.connectedChannels}
                  connectedLabel={
                    item.connectedChannels > 0
                      ? `${item.connectedChannels} ${t(
                          'platform_connected_channels',
                          'connected channels'
                        )}`
                      : t('platform_not_connected', 'not connected')
                  }
                  logo={<PlatformCardLogo identifier={item.identifier} />}
                  onSelect={getSocialLink(
                    props.invite,
                    item.identifier,
                    item.isExternal,
                    item.isWeb3,
                    item.isChromeExtension,
                    item.customFields
                  )}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
