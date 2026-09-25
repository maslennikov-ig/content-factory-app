'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { PinterestBoard } from '@contentfactory/frontend/components/new-launch/providers/pinterest/pinterest.board';
import { PinterestSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import { Input } from '@contentfactory/react/form/input';
import { ColorPicker } from '@contentfactory/react/form/color.picker';
import { PinterestPreview } from '@contentfactory/frontend/components/new-launch/providers/pinterest/pinterest.preview';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
const PinterestSettings: FC = () => {
  const { register, control } = useSettings();
  const t = useT();
  return (
    <div className="flex flex-col">
      <Input label={t('label_title', 'Title')} {...register('title')} />
      <Input label={t('link', 'Link')} {...register('link')} />
      <PinterestBoard {...register('board')} />
      <ColorPicker
        label={t('pinterest_select_pin_color', 'Select Pin Color')}
        name="dominant_color"
        enabled={false}
        canBeCancelled={true}
      />
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  comments: false,
  SettingsComponent: PinterestSettings,
  CustomPreviewComponent: PinterestPreview,
  dto: PinterestSettingsDto,
  maximumCharacters: 500,
});
