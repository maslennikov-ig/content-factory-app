import { Plugs } from '@contentfactory/frontend/components/plugs/plugs';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Plugs',
  description: '',
};
export default async function Index() {
  return <Plugs />;
}
