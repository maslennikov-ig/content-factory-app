import type { Metadata } from 'next';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';
import {
  PAGE_TITLE_FALLBACK_META,
  PAGE_TITLE_KEY_META,
} from '@contentfactory/frontend/app/page-title.contract';

/**
 * The name of a page, in the language the person is reading.
 *
 * Every route exported a static `metadata` with an English `title`, so the
 * browser tab said «Calendar · Content Factory» beside a fully Russian page
 * (`content-factory-next-fn33.77`). A static export is evaluated once, with no
 * request in scope, and cannot know the language; `generateMetadata` runs per
 * request, and `getT` reads the same cookie and header the rendered page
 * reads.
 *
 * The «· Content Factory» half comes from the `template` in the root layout
 * and is a product name, so it stays as it is in every language.
 *
 * Written once because there are two dozen routes: a `generateMetadata` body
 * copied into each of them is the same decision retyped two dozen times.
 *
 * The key travels into the page's head as well as into the title, and that is
 * `content-factory-next-fn33.122`. The language of this render comes from the
 * `i18next` cookie; a browser signing in for the first time has no such cookie,
 * so the page went out in the browser's own language and only then switched to
 * the language of the profile. Everything on the page followed — the heading,
 * the menu — but the tab could not, because by then the request was over and
 * the title was a string with no key attached. Now it has one, and
 * `PageTitleLanguage` reads it back and re-resolves it in the browser.
 */
export const pageTitle =
  (key: string, fallback: string) =>
  async (): Promise<Metadata> => {
    const t = await getT();
    return {
      title: String(t(key, fallback)),
      description: '',
      other: {
        [PAGE_TITLE_KEY_META]: key,
        [PAGE_TITLE_FALLBACK_META]: fallback,
      },
    };
  };
