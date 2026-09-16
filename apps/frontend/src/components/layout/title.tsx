'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useMenuItem } from '@contentfactory/frontend/components/layout/top.menu';

/**
 * The name of the section above its contents, in the language on the screen
 * right now.
 *
 * `content-factory-next-fn33.114`: this used to remember the first name it
 * computed. The menu items carry translated names, and `useMenuItem` builds
 * them again whenever i18next changes language — but the memo listed only the
 * address as its reason to recompute, so a language change re-rendered this
 * component and handed back the sentence from before it. Opening `/launches`
 * in a browser that had never set the i18next cookie showed «Calendar» over a
 * page that was Russian everywhere else, and it stayed that way until the page
 * was reloaded; switching language by hand had the same one-render lag in the
 * other direction.
 *
 * There is no memo now. Finding one item in a list of a dozen costs less than
 * a correct dependency list, and a wrong dependency list is what this was.
 */
export const Title = () => {
  const path = usePathname();
  const search = useSearchParams();
  const { all: menuItems } = useMenuItem();
  // Use all routes, including completed onboarding hidden from navigation.
  // A query-specific destination (Avatar) wins over its generic section.
  const currentTitle = menuItems
    .map((item) => {
      const [pathname, query = ''] = item.path.split('?');
      return { ...item, pathname, query: new URLSearchParams(query) };
    })
    .filter(
      (item) =>
        (path === item.pathname || path.startsWith(`${item.pathname}/`)) &&
        (!item.query.size || path === item.pathname) &&
        Array.from(item.query).every(([key, value]) => search?.get(key) === value)
    )
    .sort(
      (a, b) => b.pathname.length - a.pathname.length || b.query.size - a.query.size
    )[0]?.name;

  return currentTitle ? <h1>{currentTitle}</h1> : null;
};
