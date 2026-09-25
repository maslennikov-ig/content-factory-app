'use client';

import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@contentfactory/react/form/input';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { TumblrDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/tumblr.dto';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const TumblrSettings = () => {
  const form = useSettings();
  const t = useT();

  return (
    <>
      <Input label={t('label_title', 'Title')} {...form.register('title')} />
      <Input label={t('tumblr_link_url', 'Link URL')} {...form.register('link')} />
      <Input label={t('tumblr_source_url', 'Source URL')} {...form.register('sourceUrl')} />
      <Input label={t('label_tags', 'Tags')} {...form.register('tags')} />
    </>
  );
};

export default withProvider({
  comments: false,
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: TumblrSettings,
  CustomPreviewComponent: undefined,
  dto: TumblrDto,
  maximumCharacters: 32768,
});
