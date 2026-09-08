export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { ChannelsScreen } from '@contentfactory/frontend/components/channels/channels-screen';
export const generateMetadata = pageTitle('channels', 'Channels');
export default function ChannelsPage() {
  return <ChannelsScreen />;
}
