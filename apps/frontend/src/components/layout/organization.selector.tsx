'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import clsx from 'clsx';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';

/**
 * Which organization the current work belongs to.
 *
 * A real button with an expandable list rather than a hover-only panel, so it
 * can be reached from the keyboard and announced by a screen reader. It stays
 * hidden when there is only one organization to choose from.
 */
export const OrganizationSelector: FC<{ asOpenSelect?: boolean }> = ({
  asOpenSelect,
}) => {
  const fetch = useFetch();
  const user = useUser();
  const t = useT();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    return await (await fetch('/user/organizations')).json();
  }, []);
  const { isLoading, data } = useSWR('organizations', load, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnReconnect: false,
  });

  const current = useMemo(() => {
    return data?.find((d: any) => d.id === user?.orgId);
  }, [data, user?.orgId]);

  const changeOrg = useCallback(
    (org: { name: string; id: string }) => async () => {
      await fetch('/user/change-org', {
        method: 'POST',
        body: JSON.stringify({
          id: org.id,
        }),
      });
      window.location.reload();
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (isLoading || !data || data.length <= 1) {
    return null;
  }

  const label = t('organization', 'Organization');

  if (asOpenSelect) {
    return (
      <div className="w-full max-w-[500px] mx-auto flex flex-col gap-[8px]">
        <p className="text-[13px] font-[600] text-cf-ink">
          {t('select_organization', 'Select organization')}
        </p>
        <MenuList
          aria-label={t('select_organization', 'Select organization')}
          className="flex flex-col gap-[8px]"
        >
          {data.map((org: { name: string; id: string }) => (
            <MenuOption
              key={org.id}
              selected={org.id === user?.orgId}
              density="standard"
              onClick={changeOrg(org)}
              className={clsx(
                'text-start px-[12px] rounded-[8px] border text-[14px] transition-colors duration-state',
                org.id === user?.orgId
                  ? 'border-cf-accent bg-cf-accent-soft text-cf-accent font-[600]'
                  : 'border-cf-border bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle'
              )}
            >
              {org.name}
            </MenuOption>
          ))}
        </MenuList>
      </div>
    );
  }

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <div className="relative" ref={containerRef}>
        <MenuButton
          aria-label={`${label}: ${current?.name ?? ''}`}
          density="dense"
          className="max-w-[180px] px-[10px] rounded-[8px] flex items-center gap-[6px] text-[13px] font-[600] text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink transition-colors duration-state"
        >
          <span className="truncate">{current?.name ?? label}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="m3 4.5 3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </MenuButton>

        {open && (
          <MenuList
            aria-label={label}
            className="absolute z-[100] top-[calc(100%+6px)] end-0 min-w-[220px] max-h-[280px] overflow-auto bg-cf-surface border border-cf-border rounded-[8px] shadow-menu p-[4px] flex flex-col"
          >
            {data.map((org: { name: string; id: string }) => (
              <MenuOption
                key={org.id}
              selected={org.id === user?.orgId}
              density="dense"
                onClick={changeOrg(org)}
                className={clsx(
                  'w-full text-start px-[10px] rounded-[8px] text-[14px] transition-colors duration-state',
                  org.id === user?.orgId
                    ? 'bg-cf-accent-soft text-cf-accent font-[600]'
                    : 'text-cf-ink hover:bg-cf-surface-subtle'
                )}
              >
                {org.name}
              </MenuOption>
            ))}
          </MenuList>
        )}
      </div>
    </Menu>
  );
};
