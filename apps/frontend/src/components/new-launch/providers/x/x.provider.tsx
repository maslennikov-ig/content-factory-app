'use client';

import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@contentfactory/frontend/components/new-launch/finisher/thread.finisher';
import { Select } from '@contentfactory/react/form/select';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { XDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { Input } from '@contentfactory/react/form/input';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';

const whoCanReply = [
  {
    label: 'Everyone',
    value: 'everyone',
  },
  {
    label: 'Accounts you follow',
    value: 'following',
  },
  {
    label: 'Mentioned accounts',
    value: 'mentionedUsers',
  },
  {
    label: 'Subscribers',
    value: 'subscribers',
  },
  {
    label: 'Verified accounts',
    value: 'verified',
  },
];

const SettingsComponent = () => {
  const t = useT();
  const { register, watch, setValue } = useSettings();

  return (
    <>
      <Select
        label={t(
          'label_who_can_reply_to_this_post',
          'Who can reply to this post?'
        )}
        className="mb-5"
        hideErrors={true}
        {...register('who_can_reply_post', {
          value: 'everyone',
        })}
      >
        {whoCanReply.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      <Input
        label={
          'Post to a community, URL (Ex: https://x.com/i/communities/1493446837214187523)'
        }
        {...register('community')}
      />

      <div className="mt-5 flex flex-col gap-[10px]">
        <CheckboxField
          label={t('label_made_with_ai', 'Made with AI')}
          {...register('made_with_ai')}
        />
        <CheckboxField
          label={t('label_paid_partnership', 'Paid partnership')}
          {...register('paid_partnership')}
        />
      </div>

      <ThreadFinisher />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: XDto,
  maximumCharacters: (settings) => {
    if (settings?.[0]?.value) {
      return 4000;
    }
    return 280;
  },
});
