export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { ContentSectionScreen } from '@contentfactory/frontend/components/content-intelligence/content-section.screen';
import { resolveContentTab } from '@contentfactory/frontend/components/content-intelligence/content-section.tabs';

export const generateMetadata = pageTitle('content_section', 'Content');

/**
 * `content-factory-next-rrs9`: the section can be opened at a named tab.
 *
 * `ContentSectionScreen` has taken an `initialTab` since the archive became a
 * view inside «Материалы», and nothing ever passed one — `?tab=archive` was
 * described in the map and landed on «Аватары» like every other address. The
 * walkthrough is the first caller that actually needs it: a step whose button
 * says «открыть бриф» has to arrive at the brief, or the step is a suggestion.
 *
 * An unknown or missing value falls back to the default rather than failing:
 * a mistyped address should open the section, not an error.
 */

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const initialTab = resolveContentTab(params.tab);
  return initialTab ? (
    <ContentSectionScreen initialTab={initialTab} />
  ) : (
    <ContentSectionScreen />
  );
}
