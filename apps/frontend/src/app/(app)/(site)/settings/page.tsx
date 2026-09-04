import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { SettingsPopup } from '@contentfactory/frontend/components/layout/settings.component';
export const dynamic = 'force-dynamic';
export const generateMetadata = pageTitle('settings', 'Settings');
export default async function Index(props: {
  searchParams: Promise<{
    code: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  return <SettingsPopup />;
}
