'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';
import ReactCountryFlag from 'react-country-flag';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuOption,
} from '@contentfactory/react/choice/choice.menu';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
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
 * Changing the language on the way in — `content-factory-next-fn33.39`.
 *
 * The proxy already negotiates `Accept-Language` for a visitor with no cookie,
 * so a Russian browser is served Russian without being asked. What was missing
 * is the correction: a browser that asks for English, or a shared machine, or a
 * person reading a language their browser does not name, had no way to change
 * anything before signing in. Sign-in, registration and the invited
 * registration were English and stayed English.
 *
 * The application's own picker (`LanguageComponent`) cannot be used here: it
 * opens through the signed-in modal stack, which does not exist on these
 * pages, and its trigger is a `div` with an `onClick`, which a keyboard cannot
 * reach. `Menu` is the primitive for a choice that has to be arrived at before
 * it commits — arrows move, Enter commits — which is what a reload is.
 *
 * The reload is deliberate, and the same one `PublicLanguage` performs on the
 * marketing pages: the language of the surrounding server-rendered layout, the
 * document direction and the `lang` attribute all come from this cookie, so
 * switching in the browser alone would leave half the screen in the previous
 * language. That component and this one differ only in their colours — it sits
 * on the navigation bar, this sits on a page surface, and the navigation hover
 * plate is invisible against `surface` in the light theme. They are worth
 * folding into one component with a tone, which needs the two write zones to
 * meet.
 */

const ORDERED_LANGUAGES = [...languages].sort((left, right) =>
  localeParts(left).primary < localeParts(right).primary ? -1 : 1
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

const Flag = ({ language }: { language: string }) => (
  <ReactCountryFlag
    countryCode={getCountryCodeForFlag(language)}
    svg
    aria-hidden
    style={{ width: '18px', height: '18px', borderRadius: '4px' }}
  />
);

export const AuthLanguageSwitch = () => {
  const t = useT();
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
          aria-label={`${t('change_language', 'Change Language')}: ${getLanguageLabel(
            current
          )}`}
          className="flex items-center gap-[8px] rounded-[8px] border border-transparent bg-transparent px-[8px] cf-label-sm text-cf-ink-muted transition-colors duration-state hover:bg-cf-surface-subtle hover:text-cf-ink motion-reduce:transition-none"
        >
          <Flag language={current} />
          {localeParts(current).primary.slice(0, 2).toUpperCase()}
          <CaretIcon />
        </MenuButton>

        {open && (
          <MenuList
            aria-label={t('change_language', 'Change Language')}
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
