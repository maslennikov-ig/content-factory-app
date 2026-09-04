import type { Metadata } from 'next';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';

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
 */
export const pageTitle =
  (key: string, fallback: string) =>
  async (): Promise<Metadata> => {
    const t = await getT();
    return {
      title: String(t(key, fallback)),
      description: '',
    };
  };
