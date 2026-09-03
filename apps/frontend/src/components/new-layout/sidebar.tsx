'use client';

import { FC, ReactNode, useCallback, useEffect, useRef } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import useCookie from 'react-use-cookie';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';
import {
  filterMenu,
  useMenuItem,
} from '@contentfactory/frontend/components/layout/top.menu';
import { MenuItem } from '@contentfactory/frontend/components/new-layout/menu-item';
import { Wordmark } from '@contentfactory/frontend/components/ui/brand/wordmark';
import { LogoutComponent } from '@contentfactory/frontend/components/layout/logout.component';

const COLLAPSE_COOKIE = 'sidebar';

/**
 * The shape of a row under the navigation. One declaration rather than the same
 * geometry retyped per link — that is how a rail drifts a pixel at a time.
 *
 * Geometry only. The paint of a footer row is the rail's `navigation` variant,
 * reached through the shared button.
 */
const FOOTER_ROW =
  'cf-nav-row h-[32px] px-[10px] rounded-[8px] cf-body-md transition-colors duration-state';

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    className={clsx(
      'transition-transform duration-state',
      !open && 'rotate-180'
    )}
  >
    <path
      d="M10 3 5 8l5 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Group: FC<{
  label: string;
  collapsed: boolean;
  children: ReactNode;
}> = ({ label, collapsed, children }) => (
  <div className="flex flex-col gap-[2px]">
    <p
      className={clsx(
        // `label-md`, not a monospaced token: a group heading is a label, and
        // the monospaced face is reserved for working information. Normal case
        // too — DESIGN.md allows uppercase only for `label-sm` in a marker.
        'cf-group-label cf-label-md text-cf-navigation-muted px-[10px] mb-[4px]',
        collapsed && 'sr-only'
      )}
    >
      {label}
    </p>
    {children}
  </div>
);

/**
 * Signed application navigation.
 *
 * Desktop keeps the full 248px rail with visible labels; collapsing to 72px is
 * a space setting, not the default. Between 768px and 1024px the rail is always
 * compact. Below 768px the same navigation becomes a drawer with a focus trap
 * and Escape to close, so nothing required is hidden on a phone.
 */
export const Sidebar: FC<{
  mobileOpen: boolean;
  onCloseMobile: () => void;
}> = ({ mobileOpen, onCloseMobile }) => {
  const t = useT();
  const user = useUser();
  const { billingEnabled } = useVariables();
  const { workMenu, adminMenu, secondaryMenu } = useMenuItem();
  const [collapsedCookie, setCollapsedCookie] = useCookie(
    COLLAPSE_COOKIE,
    'open'
  );
  const collapsed = collapsedCookie === 'collapsed';
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsedCookie(collapsed ? 'open' : 'collapsed');
  }, [collapsed, setCollapsedCookie]);

  // Drawer behaviour: trap focus while open and hand it back on close.
  useEffect(() => {
    if (!mobileOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>('a, button')?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMobile();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [mobileOpen, onCloseMobile]);

  const groups = [
    {
      label: t('nav_group_work', 'Work'),
      items: filterMenu(workMenu, user as any, billingEnabled),
    },
    {
      label: t('nav_group_admin', 'Administration'),
      items: filterMenu(adminMenu, user as any, billingEnabled),
    },
    {
      label: t('nav_group_more', 'More'),
      items: filterMenu(secondaryMenu, user as any, billingEnabled),
    },
  ].filter((group) => group.items.length > 0);

  const content = (isDrawer: boolean) => {
    const isCollapsed = collapsed && !isDrawer;
    return (
      <div
        ref={isDrawer ? panelRef : undefined}
        className={clsx(
          'h-full flex flex-col bg-cf-navigation text-cf-navigation-text border-e border-cf-border-strong',
          isDrawer
            ? 'w-[288px] max-w-[85vw]'
            : clsx('cf-sidebar', isCollapsed ? 'w-[72px]' : 'w-[248px]')
        )}
      >
        <div
          className={clsx(
            'cf-brand h-[64px] flex items-center shrink-0',
            isCollapsed ? 'justify-center px-0' : 'px-[16px]'
          )}
        >
          <Link
            href="/launches"
            onClick={isDrawer ? onCloseMobile : undefined}
            className="flex items-center rounded-[8px]"
          >
            <Wordmark size="sm" markOnly={isCollapsed} />
          </Link>
        </div>

        <nav
          aria-label={t('primary_navigation', 'Primary navigation')}
          className="flex-1 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[20px]"
        >
          {groups.map((group) => (
            <Group
              key={group.label}
              label={group.label}
              collapsed={isCollapsed}
            >
              {group.items.map((item) => (
                <MenuItem
                  key={item.name}
                  path={item.path}
                  label={item.name}
                  icon={item.icon}
                  onClick={item.onClick}
                  collapsed={isCollapsed}
                  onNavigate={isDrawer ? onCloseMobile : undefined}
                />
              ))}
            </Group>
          ))}
        </nav>

        <div className="border-t border-cf-border-strong px-[12px] py-[12px] flex flex-col gap-[8px]">
          <div
            className={clsx(
              'cf-account-email cf-caption text-cf-navigation-muted truncate px-[10px]',
              isCollapsed && 'sr-only'
            )}
          >
            {(user as any)?.email}
          </div>
          <Link
            href="/settings?tab=profile"
            className={clsx(
              FOOTER_ROW,
              'flex items-center text-cf-navigation-text hover:bg-cf-navigation-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
              isCollapsed && 'justify-center'
            )}
            aria-label={t('profile', 'Profile')}
            onClick={isDrawer ? onCloseMobile : undefined}
          >
            {isCollapsed ? '●' : t('profile', 'Profile')}
          </Link>
          {/* The AGPL source offer used to sit here. It is a licence errand,
              not a place in the product, and a permanent row beside the
              product's own navigation gave it more weight on every screen than
              anything a person came here to do. It now lives in
              Settings → About with the version it is the source of, and in the
              public footer for anyone with no account at all.
              `tests/source.archive.test.cjs` holds both. */}
          {/*
            Side by side while there is room, stacked once there is not.

            A 72px rail leaves 48px between the paddings, and the two controls
            want 38 and 32 with a gap between them. Squeezed into 48 they read
            as one wide arrow with something jammed against it — and the arrow
            is the logout glyph, which is also, in every other product, the
            "expand this panel" glyph. That is how a person collapses the rail
            and then cannot find the way back: the affordance they reach for
            signs them out.

            Stacking is the whole fix. Each control gets its own row and its
            own hit area, an arrow above a chevron reads as two things rather
            than one, and the expander goes first — the destructive action
            should not be the one under the cursor by default.
          */}
          <div
            className={clsx(
              'cf-account flex gap-[8px]',
              isCollapsed
                ? 'flex-col-reverse items-stretch'
                : 'flex-row items-center justify-between'
            )}
          >
            <LogoutComponent
              isIcon={isCollapsed}
              variant="navigation"
              className={FOOTER_ROW}
            />
            {!isDrawer && (
              <Button
                iconOnly={!isCollapsed}
                // Height belongs to the shared button; `dense` is its 32px.
                // Writing `h-[32px]` here is what `design.guard` calls a
                // consumer owning visual height, and it is right to.
                density="dense"
                variant={isCollapsed ? 'secondary' : 'quiet'}
                type="button"
                onClick={toggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={
                  collapsed
                    ? t('expand_navigation', 'Expand navigation')
                    : t('collapse_navigation', 'Collapse navigation')
                }
                title={
                  collapsed
                    ? t('expand_navigation', 'Expand navigation')
                    : t('collapse_navigation', 'Collapse navigation')
                }
                className={clsx(
                  'cf-collapse-toggle shrink-0 rounded-[8px] flex items-center justify-center transition-colors duration-state',
                  // Collapsed, it is the only way back and is drawn as a
                  // control rather than as a quiet glyph: a border is what
                  // tells a person this is pressable when no label can.
                  isCollapsed && 'w-full px-0'
                )}
              >
                <ChevronIcon open={!collapsed} />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="hidden md:block shrink-0">{content(false)}</div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[900] flex">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('primary_navigation', 'Primary navigation')}
          >
            {content(true)}
          </div>
          <Button
            variant="quiet"
            aria-label={t('close_navigation', 'Close navigation')}
            onClick={onCloseMobile}
            layout="content"
            className="flex-1 px-0 rounded-none"
            style={{ background: 'var(--cf-backdrop)' }}
          />
        </div>
      )}
    </>
  );
};
