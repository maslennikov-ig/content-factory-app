import { MediaLayoutComponent } from '@contentfactory/frontend/components/new-layout/layout.media.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Media',
  description: '',
};

export default async function Page() {
  return <MediaLayoutComponent />
}
