'use client';

import { FC, useCallback, useEffect } from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { GmbSettingsDto } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/gmb.settings.dto';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { useWatch } from 'react-hook-form';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const GmbSettings: FC = () => {
  const t = useT();
  const { register, control } = useSettings();
  const topicType = useWatch({ control, name: 'topicType' });
  const callToActionType = useWatch({ control, name: 'callToActionType' });

  const topicTypes = [
    { label: t('gmb_standard_update', 'Standard Update'), value: 'STANDARD' },
    { label: t('gmb_event', 'Event'), value: 'EVENT' },
    { label: t('gmb_offer', 'Offer'), value: 'OFFER' },
  ];

  const callToActionTypes = [
    { label: t('gmb_cta_none', 'None'), value: 'NONE' },
    { label: t('gmb_cta_book', 'Book'), value: 'BOOK' },
    { label: t('gmb_cta_order_online', 'Order Online'), value: 'ORDER' },
    { label: t('gmb_cta_shop', 'Shop'), value: 'SHOP' },
    { label: t('gmb_cta_learn_more', 'Learn More'), value: 'LEARN_MORE' },
    { label: t('gmb_cta_sign_up', 'Sign Up'), value: 'SIGN_UP' },
    { label: t('gmb_cta_get_offer', 'Get Offer'), value: 'GET_OFFER' },
    { label: t('gmb_cta_call', 'Call'), value: 'CALL' },
  ];

  return (
    <div className="flex flex-col gap-[10px]">
      <Select
        label={t('label_post_type', 'Post Type')}
        {...register('topicType', {
          value: 'STANDARD',
        })}
      >
        {topicTypes.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      <Select
        label={t('gmb_call_to_action', 'Call to Action')}
        {...register('callToActionType', {
          value: 'NONE',
        })}
      >
        {callToActionTypes.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>

      {callToActionType &&
        callToActionType !== 'NONE' &&
        callToActionType !== 'CALL' && (
          <Input
            label={t('gmb_call_to_action_url', 'Call to Action URL')}
            placeholder="https://example.com"
            {...register('callToActionUrl')}
          />
        )}

      {topicType === 'EVENT' && (
        <div className="flex flex-col gap-[10px] mt-[10px] p-[15px] border border-input rounded-[8px]">
          <div className="text-[14px] font-medium mb-[5px]">
            {t('gmb_event_details', 'Event Details')}
          </div>
          <Input
            label={t('gmb_event_title', 'Event Title')}
            placeholder={t('gmb_event_name', 'Event name')}
            {...register('eventTitle')}
          />
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label={t('gmb_start_date', 'Start Date')}
              type="date"
              {...register('eventStartDate')}
            />
            <Input label={t('gmb_end_date', 'End Date')} type="date" {...register('eventEndDate')} />
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <Input
              label={t('gmb_start_time_optional', 'Start Time (optional)')}
              type="time"
              {...register('eventStartTime')}
            />
            <Input
              label={t('gmb_end_time_optional', 'End Time (optional)')}
              type="time"
              {...register('eventEndTime')}
            />
          </div>
        </div>
      )}

      {topicType === 'OFFER' && (
        <div className="flex flex-col gap-[10px] mt-[10px] p-[15px] border border-input rounded-[8px]">
          <div className="text-[14px] font-medium mb-[5px]">
            {t('gmb_offer_details', 'Offer Details')}
          </div>
          <Input
            label={t('gmb_coupon_code_optional', 'Coupon Code (optional)')}
            placeholder="SAVE20"
            {...register('offerCouponCode')}
          />
          <Input
            label={t('gmb_redeem_url_optional', 'Redeem Online URL (optional)')}
            placeholder="https://example.com/redeem"
            {...register('offerRedeemUrl')}
          />
          <Input
            label={t('gmb_terms_optional', 'Terms & Conditions (optional)')}
            placeholder={t('gmb_terms_placeholder', 'Valid until...')}
            {...register('offerTerms')}
          />
        </div>
      )}
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: GmbSettings,
  CustomPreviewComponent: undefined,
  dto: GmbSettingsDto,
  maximumCharacters: 1500,
});
