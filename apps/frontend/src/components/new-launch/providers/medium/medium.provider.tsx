'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Input } from '@contentfactory/react/form/input';
import { MediumPublications } from '@contentfactory/frontend/components/new-launch/providers/medium/medium.publications';
import { MediumTags } from '@contentfactory/frontend/components/new-launch/providers/medium/medium.tags';
import { MediumSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/medium.settings.dto';
import { useIntegration } from '@contentfactory/frontend/components/launches/helpers/use.integration';
import { Canonical } from '@contentfactory/react/form/canonical';

const MediumSettings: FC = () => {
  const form = useSettings();
  const { date } = useIntegration();
  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <Input label="Subtitle" {...form.register('subtitle')} />
      <Canonical
        date={date}
        label="Canonical Link"
        {...form.register('canonical')}
      />
      <div>
        <MediumPublications {...form.register('publication')} />
      </div>
      <div>
        <MediumTags label="Topics" {...form.register('tags')} />
      </div>
    </>
  );
};
export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: MediumSettings,
  CustomPreviewComponent: undefined, //MediumPreview,
  dto: MediumSettingsDto,
  maximumCharacters: 100000,
});
