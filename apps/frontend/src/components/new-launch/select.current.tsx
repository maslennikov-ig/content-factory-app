'use client';

import { FC, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  SelectedIntegrations,
  useLaunchStore,
} from '@contentfactory/frontend/components/new-launch/store';
import clsx from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { GlobalIcon } from '@contentfactory/frontend/components/ui/icons';
import { ChannelMark } from '@contentfactory/frontend/components/ui/brand/channel-mark';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';
import {
  useDecisionModal,
  useModals,
} from '@contentfactory/frontend/components/layout/new-modal';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';

export function useHasScroll(ref: RefObject<HTMLElement | null>): boolean {
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const checkScroll = () => {
      const el = ref.current;
      if (el) {
        setHasHorizontalScroll(el.scrollWidth > el.clientWidth);
      }
    };

    checkScroll(); // initial check

    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(ref.current);

    const mutationObserver = new MutationObserver(checkScroll);
    mutationObserver.observe(ref.current, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref]);

  return hasHorizontalScroll;
}

export const SelectCurrent: FC = () => {
  const modals = useDecisionModal();
  const t = useT();
  const {
    selectedIntegrations,
    current,
    setCurrent,
    locked,
    setHide,
    addOrRemoveSelectedIntegration,
  } = useLaunchStore(
    useShallow((state) => ({
      selectedIntegrations: state.selectedIntegrations,
      addOrRemoveSelectedIntegration: state.addOrRemoveSelectedIntegration,
      current: state.current,
      setCurrent: state.setCurrent,
      locked: state.locked,
      setHide: state.setHide,
    }))
  );

  const contentRef = useRef<HTMLDivElement>(null);
  const hasScroll = useHasScroll(contentRef);

  const removeSocial = useCallback(
    (sIntegration: Integrations) => async (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      const open = await modals.open({
        title: t('remove_social_account', 'Remove Social Account'),
        description: t(
          'remove_social_account_confirmation',
          'Are you sure you want to remove this social from scheduling?'
        ),
      });

      if (!open) {
        return;
      }

      addOrRemoveSelectedIntegration(sIntegration, {});
    },
    []
  );

  return (
    <>
      <div className="select-none left-0 absolute w-full z-[100] px-[20px]">
        <div
          ref={contentRef}
          className={clsx(
            'flex gap-[6px] w-full overflow-x-auto scrollbar scrollbar-thumb-tableBorder scrollbar-track-secondary',
            locked && 'opacity-50 pointer-events-none'
          )}
        >
          <div
            onClick={() => {
              setHide(true);
              setCurrent('global');
            }}
            className={clsx(
              'cursor-pointer flex gap-[8px] rounded-[8px] w-[40px] h-[40px] justify-center items-center bg-newBgLineColor',
              current !== 'global'
                ? 'text-[#A3A3A3]'
                : 'border border-cf-signature text-cf-signature'
            )}
          >
            <div>
              <GlobalIcon />
            </div>
          </div>
          {selectedIntegrations.map(({ integration }) => (
            <div
              onClick={() => {
                setHide(true);
                setCurrent(integration.id);
              }}
              key={integration.id}
              className={clsx(
                'border cursor-pointer relative flex gap-[8px] w-[40px] h-[40px] rounded-[8px] items-center bg-newBgLineColor justify-center',
                current === integration.id
                  ? 'border-cf-signature text-cf-signature'
                  : 'border-transparent'
              )}
            >
              <div
                onClick={removeSocial(integration)}
                className="absolute justify-center items-center flex w-[8px] h-[8px] -top-[1px] -start-[3px] bg-red-500 rounded-full text-white text-[8px]"
              >
                X
              </div>
              <IsGlobal id={integration.id} />
              <div
                {...{
                  'data-tooltip-id': 'tooltip',
                  'data-tooltip-content': integration.name,
                }}
                className={clsx(
                  'relative w-full h-full rounded-full flex justify-center items-center filter transition-all duration-500'
                )}
              >
                {integration.picture ? (
                  <img
                    src={integration.picture}
                    className="h-[26px] w-[26px] min-w-[26px] rounded-full"
                    alt={integration.name}
                    onError={({ currentTarget }) => {
                      currentTarget.onerror = null;
                      currentTarget.src = '/no-picture.jpg';
                    }}
                  />
                ) : (
                  <ChannelMark
                    name={integration.name}
                    size={26}
                    decorative={false}
                  />
                )}
                <PlatformBadge
                  identifier={integration.identifier}
                  size={16}
                  className="absolute z-10 bottom-0 end-0"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={clsx(hasScroll ? 'h-[55px]' : 'h-[40px]')} />
    </>
  );
};

export const IsGlobal: FC<{ id: string }> = ({ id }) => {
  const t = useT();
  const { isInternal } = useLaunchStore(
    useShallow((state) => ({
      isInternal: !!state.internal.find((p) => p.integration.id === id),
    }))
  );

  if (!isInternal) {
    return null;
  }

  return (
    <div
      data-tooltip-id="tooltip"
      data-tooltip-content={t(
        'no_longer_global_mode',
        'No longer in global mode'
      )}
      className="w-[8px] h-[8px] bg-cf-signature -top-[1px] -end-[3px] absolute rounded-full"
    />
  );
};
