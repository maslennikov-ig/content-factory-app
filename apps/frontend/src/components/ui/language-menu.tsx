'use client';

import { clsx } from 'clsx';
import { FC, useEffect, useRef, useState } from 'react';
import ReactCountryFlag from 'react-country-flag';
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
  getCountryCodeForFlag,
  getLanguageLabel,
  localeParts,
} from '@contentfactory/frontend/components/layout/language.presentation';

/**
 * Changing the language before there is an account to remember it in.
 *
 * `content-factory-next-fn33.97`. This was written twice — once for the
 * marketing shell and once for `/auth` — and the two copies differed only in
 * which band they sat on. Everything else was the same decision typed out
 * again: the same cookie, the same reload, the same sixteen rows, the same
 * pointer dismissal. A second copy of one decision is a duplicate to extract.
 *
 * The band is the one real difference, so it is the one parameter. A hover
 * plate has to be visible against the thing it is drawn on, and the two bands
 * resolve to different colours: on the navigation bar the plate is
 * `navigation-active`, which in the light theme is the surface colour and would
 * disappear if this control were placed on a page surface; on a page surface it
 * is `surface-subtle`, which in the light theme is the navigation colour and
 * would disappear on the bar. Naming the tone is what keeps either from being
 * chosen by accident.
 *
 * The application's own picker (`LanguageComponent`) is not usable here: it
 * opens through the signed-in modal stack, which does not exist on these pages,
 * and its trigger is a `div` with an `onClick`, which a keyboard cannot reach.
 * `Menu` is the primitive for a choice that has to be arrived at before it
 * commits — arrows move, Enter commits — which is what a reload is.
 *
 * The reload is deliberate. The language of the surrounding server-rendered
 * layout, the document direction, the `lang` attribute and the legal documents
 * (files chosen by language, not strings swapped at runtime) all come from this
 * cookie, so switching in the browser alone would leave half the page in the
 * previous language and the direction pointing the wrong way.
 */

export type LanguageMenuTone = 'surface' | 'navigation';

const TONE: Record<LanguageMenuTone, string> = {
  surface:
    'text-cf-ink-muted hover:bg-cf-surface-subtle hover:text-cf-ink',
  navigation:
    'text-cf-navigation-muted hover:bg-cf-navigation-active hover:text-cf-navigation-text',
};

/** `ru` → `RU`, `ka_ge` → `KA`. Two letters is what fits in a bar. */
const languageCode = (code: string) =>
  localeParts(code).primary.slice(0, 2).toUpperCase();

/**
 * Sixteen entries in the order the config happens to list them is a list
 * nobody can scan. Sorted by the two-letter code rather than by the visible
 * name on purpose: the codes are ASCII, so the order is identical wherever it
 * is computed, and a name-based sort would ask two ICU builds to agree on how
 * `עברית` compares with `日本語` — a disagreement that surfaces as a hydration
 * mismatch rather than as a wrong order.
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

const Flag: FC<{ language: string }> = ({ language }) => (
  <ReactCountryFlag
    countryCode={getCountryCodeForFlag(language)}
    svg
    aria-hidden
    style={{ width: '18px', height: '18px', borderRadius: '4px' }}
  />
);

export const LanguageMenu: FC<{
  /** The band this sits on. Decides which hover plate can be seen. */
  tone: LanguageMenuTone;
  /** Already translated: this component has no opinion about where copy lives. */
  label: string;
}> = ({ tone, label }) => {
  const { language } = useVariables();
  const current = languages.includes(language) ? language : fallbackLng;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  // `Menu` owns keyboard dismissal; the pointer belongs to whoever placed it.
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
        <MenuButton
          density="dense"
          mobileTouchTarget
          aria-label={`${label}: ${getLanguageLabel(current)}`}
          className={clsx(
            'flex items-center gap-[8px] rounded-[8px] border border-transparent bg-transparent px-[8px] cf-label-sm transition-colors duration-state motion-reduce:transition-none',
            TONE[tone]
          )}
        >
          <Flag language={current} />
          {languageCode(current)}
          <CaretIcon />
        </MenuButton>

        {open && (
          <MenuList
            aria-label={label}
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
                  <Flag language={option} />
                  <span className="cf-body-sm">{getLanguageLabel(option)}</span>
                </MenuOption>
              );
            })}
          </MenuList>
        )}
      </Menu>
    </div>
  );
};
