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

const messageTypes = [
  {
    label: 'Chat Message',
    value: 'message',
  },
  {
    label: 'Announcement',
    value: 'announcement',
  },
];

const announcementColors = [
  {
    label: 'Primary (Default)',
    value: 'primary',
  },
  {
    label: 'Blue',
    value: 'blue',
  },
  {
    label: 'Green',
    value: 'green',
  },
  {
    label: 'Orange',
    value: 'orange',
  },
  {
    label: 'Purple',
    value: 'purple',
  },
];

const TwitchSettings: FC = () => {
  const { register, control } = useSettings();
  const messageType = useWatch({
    control,
    name: 'messageType',
  });

  return (
    <div className="flex flex-col">
      <Select
        label="Message Type"
        {...register('messageType', {
          value: 'message',
        })}
      >
        {messageTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      {messageType === 'announcement' && (
        <Select
          label="Announcement Color"
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
