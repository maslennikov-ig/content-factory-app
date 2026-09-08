export const dynamic = 'force-dynamic';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { ChannelScreen } from '@contentfactory/frontend/components/channels/channel-screen';
export const generateMetadata = pageTitle('channels', 'Channels');
export default function ChannelPage() {
  return <ChannelScreen />;
}
