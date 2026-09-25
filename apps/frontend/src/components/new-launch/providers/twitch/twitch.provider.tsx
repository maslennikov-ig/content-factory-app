'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { TwitchDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/twitch.dto';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Select } from '@contentfactory/react/form/select';
import { useWatch } from 'react-hook-form';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const TwitchSettings: FC = () => {
  const t = useT();
  const { register, control } = useSettings();
  const messageTypes = [
    { label: t('twitch_chat_message', 'Chat Message'), value: 'message' },
    { label: t('twitch_announcement', 'Announcement'), value: 'announcement' },
  ];
  const announcementColors = [
    { label: t('twitch_color_primary', 'Primary (Default)'), value: 'primary' },
    { label: t('twitch_color_blue', 'Blue'), value: 'blue' },
    { label: t('twitch_color_green', 'Green'), value: 'green' },
    { label: t('twitch_color_orange', 'Orange'), value: 'orange' },
    { label: t('twitch_color_purple', 'Purple'), value: 'purple' },
  ];
  const messageType = useWatch({
    control,
    name: 'messageType',
  });

  return (
    <div className="flex flex-col">
      <Select
        label={t('twitch_message_type', 'Message Type')}
        {...register('messageType', {
          value: 'message',
        })}
      >
        {messageTypes.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      {messageType === 'announcement' && (
        <Select
          label={t('twitch_announcement_color', 'Announcement Color')}
          {...register('announcementColor', {
            value: 'primary',
          })}
        >
          {announcementColors.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: 'no-media',
  minimumCharacters: [],
  SettingsComponent: TwitchSettings,
  CustomPreviewComponent: undefined,
  dto: TwitchDto,
  maximumCharacters: 500,
});
