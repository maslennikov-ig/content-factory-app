'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import {
  cookieName,
  fallbackLng,
  languages,
} from '@contentfactory/react/translation/i18n.config';
import { setCookie } from '@contentfactory/frontend/components/layout/layout.context';
import {
  getLanguageLabel,
  localeParts,
} from '@contentfactory/frontend/components/layout/language.presentation';
import { usePublicCopy } from './public-copy';

/**
 * Changing the language without an account.
 *
 * The application has a picker already, but it opens a modal through the
 * signed-in modal stack and its trigger is a `div` with an `onClick` — neither
 * of which belongs on the front door, where the visitor may be arriving from a
 * search result in a language the browser guessed wrong and may be using a
 * keyboard.
 *
 * `Menu` is the primitive for exactly this: its own note says it exists for a
 * choice with an expensive or one-way effect, because arrows only move and
 * Enter commits. Switching language reloads the page, which is that kind of
 * choice. It also keeps the closed control and the open list free to say
 * different things — a two-letter code in the bar, the language's own name in
 * the list — which a native `<select>` cannot do, and which is the difference
 * between a compact control and a field wide enough for `Português`.
 *
 * The reload is deliberate. A public page is rendered in whatever language the
 * proxy read from this cookie, and the legal documents are files chosen by
 * language rather than strings swapped at runtime — so switching in the browser
 * alone would leave half the page in the old language and the document
 * direction pointing the wrong way. Writing the cookie and asking for the page
 * again is the honest version.
 */

/** `ru` → `RU`, `ka_ge` → `KA`. Two letters is what fits in a bar. */
const languageCode = (code: string) =>
  localeParts(code).primary.slice(0, 2).toUpperCase();

/**
 * Sixteen entries in the order the config happens to list them is a list
 * nobody can scan. Sorted by the two-letter code rather than by the visible
 * name on purpose: the codes are ASCII, so the order is identical wherever it
 * is computed, and a name-based sort would ask two ICU builds to agree on how
 * `עברית` compares with `日本語` — a disagreement that surfaces as a hydration
 * mismatch rather than as a wrong order. The code leads every row, so sorting
 * by it is also what a reader sees.
 */
const ORDERED_LANGUAGES = [...languages].sort((left, right) =>
  languageCode(left) < languageCode(right) ? -1 : 1
);

const CaretIcon = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m7 10 5 5 5-5" />
  </svg>
);

export function PublicLanguage() {
  const copy = usePublicCopy();
  const { language } = useVariables();
  const current = languages.includes(language) ? language : fallbackLng;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  // `Menu` is state only: dismissal belongs to whoever owns the placement.
  // Escape and Tab are already handled inside the list; this is the pointer.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <Menu open={open} onOpenChange={setOpen}>
        {/* Quiet, like the theme switch beside it: the bar's own text colour,
            no fill of its own. The hover plate is `navigation-active` rather
            than the shared quiet variant's `surface-subtle`, which in the light
            theme is the navigation colour itself and would not show. */}
        <MenuButton
          density="dense"
          mobileTouchTarget
          aria-label={`${copy('navLanguage')}: ${getLanguageLabel(current)}`}
          className="flex items-center gap-[4px] rounded-[8px] border border-transparent bg-transparent px-[8px] cf-label-sm text-cf-navigation-muted transition-colors duration-state hover:bg-cf-navigation-active hover:text-cf-navigation-text motion-reduce:transition-none"
        >
          {languageCode(current)}
          <CaretIcon />
        </MenuButton>

        {open && (
          <MenuList
            aria-label={copy('navLanguage')}
            className="absolute end-0 top-[40px] z-30 flex max-h-[320px] w-[208px] flex-col gap-[4px] overflow-y-auto rounded-[8px] border border-cf-border bg-cf-surface p-[8px] shadow-menu"
          >
            {ORDERED_LANGUAGES.map((option) => {
              const selected = option === current;
              return (
                <MenuOption
                  key={option}
                  selected={selected}
                  density="dense"
                  onClick={() => {
                    setCookie(cookieName, option, 365);
                    window.location.reload();
                  }}
                  className={clsx(
                    'flex w-full items-center justify-start gap-[8px] rounded-[4px] px-[8px] text-start transition-colors duration-state motion-reduce:transition-none',
                    selected
                      ? 'bg-cf-accent-soft text-cf-ink'
                      : 'text-cf-ink hover:bg-cf-surface-subtle'
                  )}
                >
                  <span className="cf-label-sm text-cf-ink-muted">
                    {languageCode(option)}
                  </span>
                  <span className="cf-body-sm">{getLanguageLabel(option)}</span>
                </MenuOption>
              );
            })}
          </MenuList>
        )}
      </Menu>
    </div>
  );
}
