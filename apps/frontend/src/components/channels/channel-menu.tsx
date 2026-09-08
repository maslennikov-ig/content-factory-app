'use client';
import type { ReactNode } from 'react';
import { Menu, type ChannelMenuActions } from '../launches/menu/menu';
import { useUser } from '../layout/user.context';
import { useCalendar } from '../launches/calendar.context';
import type { ChannelRow } from './channel-model';

export function ChannelMenu({
  row,
  reload,
  renderActions,
}: {
  row: ChannelRow;
  reload: () => void;
  renderActions?: (menu: ReactNode, actions: ChannelMenuActions) => ReactNode;
}) {
  const user = useUser();
  const { integrations } = useCalendar();
  const activeCount = integrations.filter((item) => !item.disabled).length;
  return (
    <Menu
      id={row.id}
      canChangeProfilePicture={row.changeProfilePicture}
      canChangeNickName={row.changeNickName}
      canEnable={!!row.disabled && user?.totalChannels > activeCount}
      canDisable={!row.disabled}
      mutate={reload}
      onChange={reload}
      renderActions={renderActions}
    />
  );
}
