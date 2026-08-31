'use client';

import clsx from 'clsx';
import Link from 'next/link';
import loadDynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { CfMark } from '@contentfactory/frontend/components/ui/brand/cf-mark';
import { SourceLink } from '@contentfactory/frontend/components/layout/source.link';
import { LEGAL_DOCUMENTS, LEGAL_ROUTES } from './legal-content';
import { usePublicCopy } from './public-copy';
import { PublicLanguage } from './public-language';
import { HEADER_ACTION, PRIMARY_FILL } from './home-parts';

/**
 * The theme switch reads a cookie the server has already used to paint `<body>`,
 * so rendering it on the server would hydrate against a value it cannot see and
 * flash the wrong theme for a frame. Loading it in the browser only, into a
 * reserved 40px box, keeps the first paint correct and the header from jumping.
 */
const ModeComponent = loadDynamic(
  () => import('@contentfactory/frontend/components/layout/mode.component'),
  { ssr: false, loading: () => <span className="block h-[40px] w-[40px]" /> }
);

const navItems = [
  ['/product', 'navProduct'],
  ['/#platforms', 'navPlatforms'],
  ['/security', 'navSecurity'],
  ['/docs', 'navDocs'],
  ['/demo', 'navDemo'],
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  const copy = usePublicCopy();
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-cf-canvas text-cf-ink">
      {/* Sticky only where there is height to spare. On a phone the same bar
          wraps to two rows, and a two-row bar pinned to the top of a 390px
          screen eats the page it is supposed to introduce. */}
      <header className="border-b border-cf-border bg-cf-navigation md:sticky md:top-0 md:z-20">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-[24px] gap-y-[12px] px-[16px] py-[12px] md:px-[24px]">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-[8px] rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            aria-label="Content Factory"
          >
            <CfMark size={32} decorative />
            <span className="cf-heading-md text-cf-navigation-text">
              Content Factory
            </span>
          </Link>

          <nav
            aria-label={copy('navSections')}
            className="order-3 flex w-full min-w-0 flex-wrap items-center gap-x-[16px] gap-y-[8px] md:order-none md:w-auto"
          >
            {navItems.map(([href, key]) => (
              <Link
                key={href}
                href={href}
                className="rounded-[4px] cf-body-md text-cf-navigation-muted hover:text-cf-navigation-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
              >
                {copy(key)}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-[12px]">
            {/* Before the account exists, the language and the theme are the
                only two things a visitor can change, so they sit together and
                ahead of the two things that ask something of them. */}
            <PublicLanguage />
            <ModeComponent />
            {/* Signing in is a returning visitor's errand, not the page's
                offer: quiet text next to the one filled action. */}
            <Link
              href="/auth/login"
              className="rounded-[4px] cf-body-md text-cf-navigation-muted hover:text-cf-navigation-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            >
              {copy('signIn')}
            </Link>
            <Link href="/auth" className={clsx(HEADER_ACTION, PRIMARY_FILL)}>
              {copy('signUp')}
            </Link>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-cf-border bg-cf-navigation">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-[24px] gap-y-[12px] px-[16px] py-[20px] md:px-[24px]">
          <span className="cf-caption text-cf-ink-muted">
            Content Factory · AGPL-3.0
          </span>
          {/* Where a person looks for them: the footer, next to the licence
              and the Source link, on every public page rather than only on
              the one screen that asks them to agree. */}
          <nav
            aria-label={copy('legalNav')}
            className="order-last flex w-full flex-wrap items-center gap-x-[16px] gap-y-[8px] md:order-none md:w-auto"
          >
            {LEGAL_DOCUMENTS.map((id) => {
              // The page you are already on is named as such rather than only
              // shaded, so the state survives with colour turned off.
              const current = pathname === LEGAL_ROUTES[id].href;
              return (
                <Link
                  key={id}
                  href={LEGAL_ROUTES[id].href}
                  aria-current={current ? 'page' : undefined}
                  className={clsx(
                    'rounded-[4px] cf-body-sm hover:text-cf-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus',
                    current ? 'text-cf-ink underline' : 'text-cf-ink-muted'
                  )}
                >
                  {copy(LEGAL_ROUTES[id].copyKey)}
                </Link>
              );
            })}
          </nav>
          {/* The AGPL section 13 offer, in the place a licence link belongs:
              beside the licence, reachable without an account, and given no
              more weight than the documents next to it. */}
          <SourceLink className="ms-auto cf-body-sm text-cf-ink-muted hover:text-cf-accent" />
        </div>
      </footer>
    </div>
  );
}
