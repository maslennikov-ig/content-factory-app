'use client';

import { useEffect } from 'react';
import i18next from '@contentfactory/react/translation/i18next';
import {
  PAGE_TITLE_FALLBACK_META,
  PAGE_TITLE_KEY_META,
  composePageTitle,
} from '@contentfactory/frontend/app/page-title.contract';

const metaContent = (name: string) =>
  document
    .querySelector(`meta[name="${name}"]`)
    ?.getAttribute('content')
    ?.trim() || '';

/**
 * The browser half of the page title.
 *
 * `content-factory-next-fn33.122`. The server names the tab from the `i18next`
 * cookie. A browser that has just signed in for the first time has no such
 * cookie: the page arrives in whatever the browser asked for, and only then
 * does the profile language get applied here. The page follows — every string
 * on it is re-rendered — but the tab does not, because the title was written
 * into the response and the response is over.
 *
 * So the same event that changes the page changes the tab. The key is not
 * restated here: it is read back out of the head, where `pageTitle` put it, so
 * a route added tomorrow is covered without touching this file, and a route
 * that does not use the helper is left alone rather than given a wrong name.
 *
 * The listener re-resolves through `i18next.t` rather than a `t` captured at
 * render: `languageChanged` fires before React re-renders, and a captured `t`
 * is still bound to the language being left.
 */
export const PageTitleLanguage = (): null => {
  useEffect(() => {
    const rewrite = () => {
      const key = metaContent(PAGE_TITLE_KEY_META);
      if (!key) {
        return;
      }
      const fallback = metaContent(PAGE_TITLE_FALLBACK_META) || key;
      document.title = composePageTitle(String(i18next.t(key, fallback)));
    };

    // Once on arrival: the language may already have been changed by the time
    // this mounts, and there is no second event coming.
    rewrite();
    i18next.on('languageChanged', rewrite);
    return () => {
      i18next.off('languageChanged', rewrite);
    };
  }, []);

  return null;
};
