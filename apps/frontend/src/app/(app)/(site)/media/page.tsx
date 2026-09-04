import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { MediaLayoutComponent } from '@contentfactory/frontend/components/new-layout/layout.media.component';

export const generateMetadata = pageTitle('media', 'Media');

export default async function Page() {
  return <MediaLayoutComponent />
}
