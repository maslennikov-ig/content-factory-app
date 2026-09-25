'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Input } from '@contentfactory/react/form/input';
import { HashnodePublications } from '@contentfactory/frontend/components/new-launch/providers/hashnode/hashnode.publications';
import { HashnodeTags } from '@contentfactory/frontend/components/new-launch/providers/hashnode/hashnode.tags';
import { HashnodeSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/hashnode.settings.dto';
import { useIntegration } from '@contentfactory/frontend/components/launches/helpers/use.integration';
import { useMediaDirectory } from '@contentfactory/react/helpers/use.media.directory';
import clsx from 'clsx';
import { MediaComponent } from '@contentfactory/frontend/components/media/media.component';
import { Canonical } from '@contentfactory/react/form/canonical';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const HashnodeSettings: FC = () => {
  const form = useSettings();
  const t = useT();
  const { date } = useIntegration();
  return (
    <>
      <Input label={t('label_title', 'Title')} {...form.register('title')} />
      <Input label={t('label_subtitle', 'Subtitle')} {...form.register('subtitle')} />
      <Canonical
        date={date}
        label={t('label_canonical_link', 'Canonical Link')}
        {...form.register('canonical')}
      />
      <MediaComponent
        label={t('label_cover_picture', 'Cover picture')}
        description={t('add_a_cover_picture', 'Add a cover picture')}
        {...form.register('main_image')}
      />
      <div className="mt-[20px]">
        <HashnodePublications {...form.register('publication')} />
      </div>
      <div>
        <HashnodeTags label={t('label_tags', 'Tags')} {...form.register('tags')} />
      </div>
    </>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: HashnodeSettings,
  CustomPreviewComponent: undefined, // HashnodePreview,
  dto: HashnodeSettingsDto,
  maximumCharacters: 10000,
});
