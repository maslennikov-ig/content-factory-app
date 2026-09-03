'use client';

import { AddProviderButton } from '@contentfactory/frontend/components/launches/add.provider.component';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { capitalize, groupBy, orderBy } from 'lodash';
import { CalendarWeekProvider } from '@contentfactory/frontend/components/launches/calendar.context';
import { Filters } from '@contentfactory/frontend/components/launches/filters';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { LoadingComponent } from '@contentfactory/frontend/components/layout/loading';
import {
  EmptyState,
  SkeletonRows,
} from '@contentfactory/frontend/components/ui/surface';
import clsx from 'clsx';
import { useUser } from '../layout/user.context';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { Menu } from '@contentfactory/frontend/components/launches/menu/menu';
import { useRouter, useSearchParams } from 'next/navigation';
import { Integration } from '@prisma/client';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Calendar } from './calendar';
import { useDrag, useDrop } from 'react-dnd';
import { DNDProvider } from '@contentfactory/frontend/components/launches/helpers/dnd.provider';
import { GeneratorComponent } from './generator/generator';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { NewPost } from '@contentfactory/frontend/components/launches/new.post';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useIntegrationList } from '@contentfactory/frontend/components/launches/helpers/use.integration.list';
import useCookie from 'react-use-cookie';
import { Onboarding } from '@contentfactory/frontend/components/onboarding/onboarding';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { PlatformSymbol } from '@contentfactory/react/platform/platform.symbol';
import { Button } from '@contentfactory/react/form/button';

/** Flat selection marker; the inherited gradient bar is gone. */
export const SVGLine = () => (
  <span
    aria-hidden
    className="block w-[4px] h-full min-h-[24px] rounded-s-[3px] bg-cf-accent"
  />
);
interface MenuComponentInterface {
  refreshChannel: (
    integration: Integration & {
      identifier: string;
    }
  ) => () => void;
  collapsed: boolean;
  continueIntegration: (integration: Integration) => () => void;
  totalNonDisabledChannels: number;
  mutate: (shouldReload?: boolean) => void;
  update: (shouldReload: boolean) => void;
}
export const OpenClose: FC<{
  isOpen: boolean;
}> = (props) => {
  const { isOpen } = props;
  return (
    <svg
      width="11"
      height="6"
      viewBox="0 0 22 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={clsx(
        'rotate-180 transition-all',
        isOpen ? 'rotate-180' : 'rotate-90'
      )}
    >
      <path
        d="M21.9245 11.3823C21.8489 11.5651 21.7207 11.7213 21.5563 11.8312C21.3919 11.9411 21.1986 11.9998 21.0008 11.9998H1.00079C0.802892 12 0.609399 11.9414 0.444805 11.8315C0.280212 11.7217 0.151917 11.5654 0.076165 11.3826C0.000412494 11.1998 -0.0193921 10.9986 0.0192583 10.8045C0.0579087 10.6104 0.153276 10.4322 0.293288 10.2923L10.2933 0.29231C10.3862 0.199333 10.4964 0.125575 10.6178 0.0752506C10.7392 0.0249263 10.8694 -0.000976562 11.0008 -0.000976562C11.1322 -0.000976562 11.2623 0.0249263 11.3837 0.0752506C11.5051 0.125575 11.6154 0.199333 11.7083 0.29231L21.7083 10.2923C21.8481 10.4322 21.9433 10.6105 21.9818 10.8045C22.0202 10.9985 22.0003 11.1996 21.9245 11.3823Z"
        fill="currentColor"
      />
    </svg>
  );
};
export const MenuGroupComponent: FC<
  MenuComponentInterface & {
    changeItemGroup: (id: string, group: string) => void;
    group: {
      id: string;
      name: string;
      values: Array<
        Integration & {
          identifier: string;
          changeProfilePicture: boolean;
          changeNickName: boolean;
        }
      >;
    };
  }
> = (props) => {
  const {
    group,
    mutate,
    update,
    continueIntegration,
    totalNonDisabledChannels,
    refreshChannel,
    changeItemGroup,
    collapsed,
  } = props;
  const [isOpen, setIsOpen] = useState(
    !!+(localStorage.getItem(group.name + '_isOpen') || '1')
  );
  const changeOpenClose = useCallback(
    (e: any) => {
      setIsOpen(!isOpen);
      localStorage.setItem(group.name + '_isOpen', isOpen ? '0' : '1');
      e.stopPropagation();
    },
    [isOpen]
  );
  const [collectedProps, drop] = useDrop(() => ({
    accept: 'menu',
    drop: (
      item: {
        id: string;
      },
      monitor
    ) => {
      changeItemGroup(item.id, group.id);
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
    }),
  }));
  return (
    <div
      className="gap-[16px] flex flex-col relative"
      // @ts-ignore
      ref={drop}
    >
      {collectedProps.isOver && (
        <div className="absolute start-0 top-0 w-full h-full pointer-events-none">
          <div className="w-full h-full start-0 top-0 relative">
            <div className="bg-white/30 w-full h-full p-[8px] box-content rounded-md" />
          </div>
        </div>
      )}
      {!!group.name && (
        <div
          className="flex items-center gap-[5px] cursor-pointer"
          onClick={changeOpenClose}
        >
          <div>
            <OpenClose isOpen={isOpen} />
          </div>
          <div
            className="line-clamp-1"
            {...(collapsed
              ? {
                  'data-tooltip-id': 'tooltip',
                  'data-tooltip-content': group.name,
                }
              : {})}
          >
            {group.name}
          </div>
        </div>
      )}
      <div
        className={clsx(
          'gap-[12px] flex flex-col relative',
          !isOpen && 'hidden'
        )}
      >
        {group.values.map((integration) => (
          <MenuComponent
            collapsed={collapsed}
            key={integration.id}
            integration={integration}
            mutate={mutate}
            continueIntegration={continueIntegration}
            update={update}
            refreshChannel={refreshChannel}
            totalNonDisabledChannels={totalNonDisabledChannels}
          />
        ))}
      </div>
    </div>
  );
};
export const MenuComponent: FC<
  MenuComponentInterface & {
    integration: Integration & {
      identifier: string;
      changeProfilePicture: boolean;
      changeNickName: boolean;
      refreshNeeded?: boolean;
    };
  }
> = (props) => {
  const {
    totalNonDisabledChannels,
    continueIntegration,
    refreshChannel,
    mutate,
    update,
    integration,
    collapsed,
  } = props;
  const user = useUser();
  // `?refresh=` is the same door as connecting, an administrator's since
  // `saas.2.1`; a member sees that the channel is down and whom to ask.
  const canRefresh =
    Boolean(integration.refreshNeeded) && isOrganizationAdmin(user?.role);
  const t = useT();
  const [collected, drag, dragPreview] = useDrag(() => ({
    type: 'menu',
    item: {
      id: integration.id,
    },
  }));
  return (
    <div
      // @ts-ignore
      ref={dragPreview}
      {...(integration.refreshNeeded && {
        ...(canRefresh && { onClick: refreshChannel(integration) }),
        'data-tooltip-id': 'tooltip',
        'data-tooltip-content': canRefresh
          ? t(
              'channel_disconnected_click_to_reconnect',
              'Channel disconnected, click to reconnect.'
            )
          : t(
              'channel_disconnected_ask_admin',
              'Channel disconnected. Ask an administrator to reconnect it.'
            ),
      })}
      {...(collapsed
        ? {
            'data-tooltip-id': 'tooltip',
            'data-tooltip-content': integration.name,
          }
        : {})}
      className={clsx(
        'flex gap-[12px] items-center bg-newBgColorInner hover:bg-boxHover group/profile transition-all rounded-e-[8px]',
        canRefresh && 'cursor-pointer'
      )}
    >
      <div
        className={clsx(
          'relative gap-[6px] flex justify-center items-center',
          integration.disabled && 'opacity-50'
        )}
      >
        <div className="h-full w-[4px] -ms-[12px] rounded-s-[3px] opacity-0 group-hover/profile:opacity-100 transition-opacity">
          <SVGLine />
        </div>
        {(integration.inBetweenSteps || integration.refreshNeeded) && (
          <div
            className="absolute start-0 top-0 w-[48px] h-[48px] cursor-pointer"
            onClick={
              integration.refreshNeeded
                ? canRefresh
                  ? refreshChannel(integration)
                  : undefined
                : continueIntegration(integration)
            }
          >
            <div className="bg-red-500 w-[15px] h-[15px] rounded-full start-[5px] top-[5px] absolute z-[200] text-[10px] flex justify-center items-center">
              !
            </div>
            <div className="bg-primary/60 w-[48px] h-[48px] start-0 top-0 absolute rounded-full z-[199]" />
          </div>
        )}
        {integration.picture ? (
          <img
            src={integration.picture}
            className="rounded-[8px] min-w-[48px] min-h-[48px]"
            alt={integration.name}
            width={48}
            height={48}
            onError={({ currentTarget }) => {
              currentTarget.onerror = null;
              currentTarget.src = '/no-picture.jpg';
            }}
          />
        ) : (
          <PlatformSymbol identifier={integration.identifier} size={48} />
        )}
        <PlatformBadge
          identifier={integration.identifier}
          size={24}
          className="absolute z-10 -bottom-[4px] -end-[4px]"
        />
      </div>
      <div
        // @ts-ignore
        ref={drag}
        {...(integration.disabled &&
        totalNonDisabledChannels === user?.totalChannels
          ? {
              'data-tooltip-id': 'tooltip',
              'data-tooltip-content': t(
                'channel_disabled_upgrade_plan',
                'This channel is disabled, please upgrade your plan to enable it.'
              ),
            }
          : {})}
        role="Handle"
        className={clsx(
          'group-[.sidebar]:hidden flex-1 whitespace-nowrap text-ellipsis overflow-hidden cursor-move',
          integration.disabled && 'opacity-50'
        )}
      >
        {integration.name}
      </div>
      <Menu
        canChangeProfilePicture={integration.changeProfilePicture}
        canChangeNickName={integration.changeNickName}
        refreshChannel={refreshChannel}
        mutate={mutate}
        onChange={update}
        id={integration.id}
        canEnable={
          user?.totalChannels! > totalNonDisabledChannels &&
          integration.disabled
        }
        canDisable={!integration.disabled}
      />
    </div>
  );
};
export const LaunchesComponent = () => {
  const fetch = useFetch();
  const user = useUser();
  const { billingEnabled } = useVariables();
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToaster();
  const t = useT();
  const [reload, setReload] = useState(false);
  const [collapseMenu, setCollapseMenu] = useCookie('collapseMenu', '0');
  const [mode] = useCookie('mode', 'dark');
  const { isLoading, data: integrations, mutate } = useIntegrationList();

  const totalNonDisabledChannels = useMemo(() => {
    return (
      integrations?.filter((integration: any) => !integration.disabled)
        ?.length || 0
    );
  }, [integrations]);
  const changeItemGroup = useCallback(
    async (id: string, group: string) => {
      mutate(
        integrations.map((integration: any) => {
          if (integration.id === id) {
            return {
              ...integration,
              customer: {
                id: group,
              },
            };
          }
          return integration;
        }),
        false
      );
      await fetch(`/integrations/${id}/group`, {
        method: 'PUT',
        body: JSON.stringify({
          group,
        }),
      });
      mutate();
    },
    [integrations]
  );
  const sortedIntegrations = useMemo(() => {
    return orderBy(
      integrations,
      ['type', 'disabled', 'identifier'],
      ['desc', 'asc', 'asc']
    );
  }, [integrations]);
  const menuIntegrations = useMemo(() => {
    return orderBy(
      Object.values(
        groupBy(sortedIntegrations, (o) => o?.customer?.id || '')
      ).map((p) => ({
        name: (p[0].customer?.name || '') as string,
        id: (p[0].customer?.id || '') as string,
        isEmpty: p.length === 0,
        values: orderBy(
          p,
          ['type', 'disabled', 'identifier'],
          ['desc', 'asc', 'asc']
        ),
      })),
      ['isEmpty', 'name'],
      ['desc', 'asc']
    );
  }, [sortedIntegrations]);
  const update = useCallback(async (shouldReload: boolean) => {
    if (shouldReload) {
      setReload(true);
    }
    await mutate();
    if (shouldReload) {
      setReload(false);
    }
  }, []);
  const continueIntegration = useCallback(
    (integration: any) => async () => {
      router.push(
        `/launches?added=${integration.identifier}&continue=${integration.id}`
      );
    },
    []
  );
  const refreshChannel = useCallback(
    (
        integration: Integration & {
          identifier: string;
        }
      ) =>
      async () => {
        const { url } = await (
          await fetch(
            `/integrations/social/${integration.identifier}?refresh=${integration.internalId}`,
            {
              method: 'GET',
            }
          )
        ).json();
        window.location.href = url;
      },
    []
  );
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (search.get('msg')) {
      toast.show(search.get('msg')!, 'success');
      window?.opener?.postMessage(
        {
          msg: search.get('msg')!,
          success: false,
        },
        '*'
      );
    }
    if (search.get('added')) {
      window?.opener?.postMessage(
        {
          msg: t('channel_added', 'Channel added'),
          success: true,
        },
        '*'
      );
    }
    if (window.opener) {
      window.close();
    }
  }, []);
  if (isLoading || reload) {
    return (
      <div className="bg-cf-canvas p-[20px] flex flex-1 flex-col gap-[16px]">
        <SkeletonRows rows={6} label={t('loading', 'Loading')} />
      </div>
    );
  }

  // @ts-ignore
  return (
    <DNDProvider>
      <Onboarding />
      <CalendarWeekProvider integrations={sortedIntegrations}>
        <div
          className={clsx(
            'flex relative flex-col shrink-0 w-full',
            collapseMenu === '1' ? 'group sidebar md:w-[100px]' : 'md:w-[260px]'
          )}
        >
          <div
            className={clsx(
              'bg-cf-surface border-b md:border-b-0 md:border-e border-cf-border p-[16px] flex flex-col gap-[16px] transition-all',
              'static max-h-[45vh] md:absolute md:start-0 md:top-0 md:max-h-none md:h-full w-full overflow-x-hidden overflow-y-auto'
            )}
          >
            <div className="flex items-center gap-[8px]">
              <h2 className="group-[.sidebar]:hidden flex-1 text-[15px] font-[650] text-cf-ink">
                {t('channels')}
              </h2>
              <Button
                iconOnly
                size={28}
                variant="quiet"
                type="button"
                aria-expanded={collapseMenu !== '1'}
                aria-label={
                  collapseMenu === '1'
                    ? t('expand_channels', 'Expand channels')
                    : t('collapse_channels', 'Collapse channels')
                }
                title={
                  collapseMenu === '1'
                    ? t('expand_channels', 'Expand channels')
                    : t('collapse_channels', 'Collapse channels')
                }
                onClick={() =>
                  setCollapseMenu(collapseMenu === '1' ? '0' : '1')
                }
                className="group-[.sidebar]:rotate-[180deg] group-[.sidebar]:mx-auto rounded-[8px] flex items-center justify-center cursor-pointer select-none transition-colors duration-state"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="7"
                  height="13"
                  viewBox="0 0 7 13"
                  fill="none"
                >
                  <path
                    d="M6 11.5L1 6.5L6 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Button>
            </div>
            <div className="flex flex-col gap-[8px] group-[.sidebar]:mx-auto group-[.sidebar]:w-[44px]">
              <AddProviderButton update={() => update(true)} />
              <div className="flex gap-[8px] group-[.sidebar]:flex-col">
                {sortedIntegrations?.length > 0 && <NewPost />}
                {sortedIntegrations?.length > 0 &&
                  user?.tier?.ai &&
                  billingEnabled && <GeneratorComponent />}
              </div>
            </div>
            <div className="gap-[32px] flex flex-col select-none flex-1">
              {sortedIntegrations.length === 0 && collapseMenu === '0' && (
                <EmptyState
                  title={t('no_channels', 'No channels yet')}
                  description={t('connect_your_accounts')}
                />
              )}
              {menuIntegrations.map((menu) => (
                <MenuGroupComponent
                  collapsed={collapseMenu === '1'}
                  changeItemGroup={changeItemGroup}
                  key={menu.name}
                  group={menu}
                  mutate={mutate}
                  continueIntegration={continueIntegration}
                  update={update}
                  refreshChannel={refreshChannel}
                  totalNonDisabledChannels={totalNonDisabledChannels}
                />
              ))}
            </div>
            <div className="mt-[8px] text-center flex flex-col text-[12px] text-cf-ink-muted">
              {billingEnabled && user?.isLifetime && (
                <div>{capitalize(user?.tier?.current || '')} tier</div>
              )}
              <div>
                {process.env.NEXT_PUBLIC_VERSION
                  ? process.env.NEXT_PUBLIC_VERSION
                  : ''}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-cf-canvas flex-1 min-w-0 flex-col flex p-[20px] gap-[16px] overflow-auto">
          <Filters />
          <div className="flex-1 flex">
            <Calendar />
          </div>
        </div>
      </CalendarWeekProvider>
    </DNDProvider>
  );
};
