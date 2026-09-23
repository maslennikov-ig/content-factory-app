import { redirect } from 'next/navigation';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { SettingsPopup } from '@contentfactory/frontend/components/layout/settings.component';
export const dynamic = 'force-dynamic';
export const generateMetadata = pageTitle('settings', 'Settings');

/**
 * «Знания о контенте» left the settings menu on 23.09.2026
 * (`content-factory-next-97dq.51`); the surface lives in «Контент». A saved
 * `?tab=content_intelligence` goes there instead of falling back to the
 * first tab, which would read as a broken link.
 */
export default async function Index(props: {
  searchParams: Promise<{
    code: string;
    tab?: string | string[];
  }>;
}) {
  const searchParams = await props.searchParams;
  if (searchParams?.tab === 'content_intelligence') {
    redirect('/content');
  }
  return <SettingsPopup />;
}
