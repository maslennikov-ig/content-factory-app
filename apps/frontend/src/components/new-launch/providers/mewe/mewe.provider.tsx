'use client';

import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { FC } from 'react';
import { MeweDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/mewe.dto';
import { MeweGroupSelect } from '@contentfactory/frontend/components/new-launch/providers/mewe/mewe.group.select';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Select } from '@contentfactory/react/form/select';
import { useWatch } from 'react-hook-form';

const MeweComponent: FC = () => {
  const form = useSettings();
  const postType = useWatch({ control: form.control, name: 'postType' });

  return (
    <div>
      <Select
        label="Post To"
        {...form.register('postType')}
      >
        <option value="timeline">My Timeline</option>
        <option value="group">Group</option>
      </Select>
      {postType === 'group' && (
        <MeweGroupSelect {...form.register('group')} />
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: MeweComponent,
  CustomPreviewComponent: undefined,
  dto: MeweDto,
  maximumCharacters: 63206,
});
