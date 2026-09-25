'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { WordpressPostType } from '@contentfactory/frontend/components/new-launch/providers/wordpress/wordpress.post.type';
import { WordpressTerms } from '@contentfactory/frontend/components/new-launch/providers/wordpress/wordpress.terms';
import { MediaComponent } from '@contentfactory/frontend/components/media/media.component';
import { WordpressDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/wordpress.dto';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const WordpressSettings: FC = () => {
  const form = useSettings();
  const t = useT();
  return (
    <>
      <Input label={t('label_title', 'Title')} {...form.register('title')} />
      <WordpressPostType {...form.register('type')} />
      <Select
        label={t('wordpress_status', 'Status')}
        {...form.register('status', { value: 'publish' })}
      >
        <option value="publish">{t('wordpress_status_publish', 'Publish')}</option>
        <option value="draft">{t('draft', 'Draft')}</option>
        <option value="pending">{t('wordpress_status_pending', 'Pending')}</option>
        <option value="private">{t('wordpress_status_private', 'Private')}</option>
      </Select>
      <WordpressTerms
        label={t('wordpress_categories', 'Categories')}
        func="categoriesList"
        {...form.register('categories')}
      />
      <WordpressTerms
        label={t('wordpress_tags', 'WordPress Tags')}
        func="tagsList"
        {...form.register('tags')}
      />
      <MediaComponent
        label={t('label_cover_picture', 'Cover picture')}
        description={t('add_a_cover_picture', 'Add a cover picture')}
        {...form.register('main_image')}
      />
    </>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: WordpressSettings,
  CustomPreviewComponent: undefined, // WordpressPreview,
  dto: WordpressDto,
  maximumCharacters: 100000,
});
