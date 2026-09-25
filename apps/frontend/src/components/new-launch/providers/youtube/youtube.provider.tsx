'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Input } from '@contentfactory/react/form/input';
import { MediumTags } from '@contentfactory/frontend/components/new-launch/providers/medium/medium.tags';
import { MediaComponent } from '@contentfactory/frontend/components/media/media.component';
import { Select } from '@contentfactory/react/form/select';
import { YoutubePreview } from '@contentfactory/frontend/components/new-launch/providers/youtube/youtube.preview';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const YoutubeSettings: FC = () => {
  const t = useT();
  const { register, control } = useSettings();
  const type = [
    { label: t('youtube_visibility_public', 'Public'), value: 'public' },
    { label: t('youtube_visibility_private', 'Private'), value: 'private' },
    { label: t('youtube_visibility_unlisted', 'Unlisted'), value: 'unlisted' },
  ];
  const madeForKids = [
    { label: t('no', 'No'), value: 'no' },
    { label: t('yes', 'Yes'), value: 'yes' },
  ];
  return (
    <div className="flex flex-col">
      <Input label={t('label_title', 'Title')} {...register('title')} maxLength={100} />
      <Select
        label={t('label_type', 'Type')}
        {...register('type', {
          value: 'public',
        })}
      >
        {type.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      <Select
        label={t('youtube_made_for_kids', 'Made for kids')}
        {...register('selfDeclaredMadeForKids', {
          value: 'no',
        })}
      >
        {madeForKids.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      <MediumTags label={t('label_tags', 'Tags')} {...register('tags')} />
      <div className="mt-[20px]">
        <MediaComponent
          type="image"
          width={1280}
          height={720}
          label={t('label_thumbnail', 'Thumbnail')}
          description={t(
            'youtube_thumbnail_optional',
            'Thumbnail picture (optional)'
          )}
          {...register('thumbnail')}
        />
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  maximumCharacters: 5000,
});
