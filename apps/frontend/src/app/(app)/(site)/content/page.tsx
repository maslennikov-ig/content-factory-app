export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { ContentSectionScreen } from '@contentfactory/frontend/components/content-intelligence/content-section.screen';

export const metadata: Metadata = {
  title: 'Content',
  description: '',
};

export default async function Page() {
  return <ContentSectionScreen />;
}
