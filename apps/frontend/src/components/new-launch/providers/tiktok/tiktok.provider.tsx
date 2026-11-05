'use client';

import {
  FC,
  useEffect,
  useMemo,
} from 'react';
import {
  PostComment,
  withProvider,
} from '@contentfactory/frontend/components/new-launch/providers/high.order.provider';
import { TikTokDto, type TikTokCreatorInfo } from '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { useSettings } from '@contentfactory/frontend/components/launches/helpers/use.values';
import { Select } from '@contentfactory/react/form/select';
import { CheckboxField } from '@contentfactory/react/form/checkbox.field';
import clsx from 'clsx';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useIntegration } from '@contentfactory/frontend/components/launches/helpers/use.integration';
import { Input } from '@contentfactory/react/form/input';
import { TiktokPreview } from '@contentfactory/frontend/components/new-launch/providers/tiktok/tiktok.preview';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { TIKTOK_MUSIC_USAGE_DECLARATION, TIKTOK_BRANDED_CONTENT_DECLARATION } from '@contentfactory/nestjs-libraries/integrations/social/tiktok-publication-policy';

const TikTokSettings: FC<{
  values?: any;
}> = (props) => {
  const { watch, register, getValues, setValue } = useSettings();
  const { value, integration } = useIntegration();
  const t = useT();
  const fetch = useFetch();

  const isTitle = useMemo(() => {
    return value?.[0]?.image?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1);
  }, [value]);

  const hasMedia = (value?.[0]?.image?.length ?? 0) > 0;
  const isVideo = hasMedia && !isTitle;

  const disclose = watch('disclose');
  const brand_organic_toggle = watch('brand_organic_toggle');
  const brand_content_toggle = watch('brand_content_toggle');
  const content_posting_method = watch('content_posting_method');
  const isUploadMode = content_posting_method === 'UPLOAD';
  const { data, error, isLoading, isValidating, mutate } = useSWR<TikTokCreatorInfo>(
    !isUploadMode && integration?.id ? ['tiktok-creator-info', integration.id] : null,
    async () => {
      const response = await fetch('/integrations/function', {method: 'POST',
        body: JSON.stringify({id: integration!.id, name: 'creatorInfo', data: {}})});
      if (!response.ok) throw new Error('TikTok creator settings unavailable');
      const result = await response.json();
      if (!result || !Array.isArray(result.privacyLevelOptions)) throw new Error('TikTok creator settings unavailable');
      return result;
    }, {revalidateOnMount: true, shouldRetryOnError: false}
  );
  const creator = !error && !isValidating ? data : undefined;
  useEffect(() => {
    if (isUploadMode || !creator) return;
    const selected = getValues('privacy_level');
    if (selected && (!creator.privacyLevelOptions.includes(selected) || brand_content_toggle && selected === 'SELF_ONLY')) setValue('privacy_level', '', {shouldValidate: true});
    for (const [field, disabled] of [['comment', creator.commentDisabled], ['duet', creator.duetDisabled], ['stitch', creator.stitchDisabled]] as const) {
      if (disabled && getValues(field)) setValue(field, false, {shouldValidate: true});
    }
  }, [creator, isUploadMode, brand_content_toggle, getValues, setValue]);
  useEffect(() => {
    if (isUploadMode || disclose !== false) return;
    for (const field of ['brand_content_toggle', 'brand_organic_toggle']) {
      if (getValues(field)) setValue(field, false, {shouldValidate: true});
    }
  }, [disclose, isUploadMode, getValues, setValue]);

  // TikTok ignores every setting except the title / content when the posting
  // method is UPLOAD, so we hide them rather than pretend they apply. The fields
  // stay mounted and registered: their values must survive the switch, and
  // TikTokDto still requires most of them at save time.
  const directPostOnly = clsx(isUploadMode && 'invisible h-0 overflow-hidden');

  const tiktokRestrictionNotice = useMemo(() => {
    if (!hasMedia || !isVideo) return null;
    if (!isUploadMode) {
      return t(
        'tiktok_restriction_direct_video',
        'TikTok restriction: For direct post with video, your post content is used as the title. A separate title field is not available.'
      );
    }
    return t(
      'tiktok_restriction_upload_video',
      'TikTok restriction: for upload-only video TikTok does not accept a title or message. You can edit the post inside the TikTok app before publishing.'
    );
  }, [hasMedia, isUploadMode, isVideo, t]);

  const privacyLevel = [
    {
      value: 'PUBLIC_TO_EVERYONE',
      label: t('public_to_everyone', 'Public to everyone'),
    },
    {
      value: 'MUTUAL_FOLLOW_FRIENDS',
      label: t('mutual_follow_friends', 'Mutual follow friends'),
    },
    {
      value: 'FOLLOWER_OF_CREATOR',
      label: t('follower_of_creator', 'Follower of creator'),
    },
    {
      value: 'SELF_ONLY',
      label: t('self_only', 'Self only'),
    },
  ].filter(option => creator?.privacyLevelOptions.includes(option.value as TikTokDto['privacy_level']) && (!brand_content_toggle || option.value !== 'SELF_ONLY'));
  const contentPostingMethod = [
    {
      value: 'DIRECT_POST',
      label: t(
        'post_content_directly_to_tiktok',
        'Post content directly to TikTok'
      ),
    },
    {
      value: 'UPLOAD',
      label: t(
        'upload_content_to_tiktok_without_posting',
        'Upload content to TikTok without posting it'
      ),
    },
  ];
  const yesNo = [
    {
      value: 'yes',
      label: t('yes', 'Yes'),
    },
    {
      value: 'no',
      label: t('no', 'No'),
    },
  ];

  return (
    <div className="flex flex-col">
      {/*<CheckTikTokValidity picture={props?.values?.[0]?.image?.[0]?.path} />*/}
      {tiktokRestrictionNotice && (
        <div className="bg-tableBorder p-[10px] mb-[18px] rounded-[10px] flex gap-[10px] items-start text-[13px] text-balance">
          <div className="shrink-0 mt-[2px]">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <div>{tiktokRestrictionNotice}</div>
        </div>
      )}
      {isTitle && <Input label="Title" {...register('title')} maxLength={89} />}
      <div className={directPostOnly}>
        {!isUploadMode && (isLoading || isValidating) && <p role="status" className="cf-body-sm text-cf-ink-muted">{t('loading', 'Loading')}</p>}
        {!isUploadMode && !isLoading && !isValidating && !creator && <div role="status" className="cf-body-sm text-cf-ink-muted">
          <p>{t('validation_tiktok_account_unavailable', 'TikTok account settings are unavailable. Try again or reconnect the channel.')}</p>
          <Button type="button" variant="secondary" density="dense" onClick={() => mutate()}>{t('try_again', 'Try Again')}</Button>
        </div>}
        {!isUploadMode && creator && <p className="cf-body-sm text-cf-ink">{creator.creatorNickname}</p>}
        <Select
          label={t('label_who_can_see_this_video', 'Who can see this video?')}
          disabled={isUploadMode || !creator}
          {...register('privacy_level')}
        >
          <option value="">{t('select', 'Select')}</option>
          {privacyLevel.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        {!isUploadMode && creator && isVideo && <p className="cf-caption font-mono text-cf-ink-muted">
          {t('video_v1_duration', 'Duration, seconds')}: ≤ {creator.maxVideoDurationSeconds}
        </p>}
        {!isUploadMode && creator && brand_content_toggle && !privacyLevel.length && <p role="status" className="cf-body-sm text-cf-ink-muted">
          {t('validation_tiktok_disclosure_invalid', 'TikTok commercial disclosure must match the selected brands and privacy before publishing.')}
        </p>}
      </div>
      <div className="text-[14px] mt-[10px] mb-[18px] text-balance">
        {t(
          'choose_upload_without_posting_description',
          `Choose upload without posting if you want to review and edit your content within TikTok's app before publishing.
        This gives you access to TikTok's built-in editing tools and lets you make final adjustments before posting. The additional settings are only available when posting directly to TikTok.`
        )}
      </div>
      <Select
        label={t('label_content_posting_method', 'Content posting method')}
        {...register('content_posting_method', {
          value: 'DIRECT_POST',
        })}
      >
        <option value="">{t('select', 'Select')}</option>
        {contentPostingMethod.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      {isUploadMode && (
        <div className="-mt-[23px] mb-[23px] text-red-600">
          {t(
            'tiktok_upload_inbox_notice',
            'After posting you will find a notification inside your Inbox about your post (not content studio)'
          )}
        </div>
      )}
      <div className={clsx('flex flex-col', directPostOnly)}>
        <Select
          label={t('label_auto_add_music', 'Auto add music')}
          disabled={isUploadMode}
          {...register('autoAddMusic', {
            value: 'no',
          })}
        >
          <option value="">{t('select', 'Select')}</option>
          {yesNo.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        <div className="text-[14px] mt-[10px] mb-[24px] text-balance">
          {t(
            'this_feature_available_only_for_photos',
            'This feature available only for photos, it will add a default music that\n        you can change later.'
          )}
        </div>
        <hr className="mb-[15px] border-tableBorder" />
        <div className="text-[14px] mb-[10px]">
          {t('tiktok_video_features', 'Video features')}
        </div>
        <div className="flex gap-[40px]">
          <CheckboxField
            label={t('label_duet', 'Allow Duet')}
            disabled={isUploadMode || !creator || creator.duetDisabled || !isVideo}
            {...register('duet', {
              value: false,
            })}
          />
          <CheckboxField
            label={t('label_stitch', 'Allow Stitch')}
            disabled={isUploadMode || !creator || creator.stitchDisabled || !isVideo}
            {...register('stitch', {
              value: false,
            })}
          />
          <CheckboxField
            label={t('video_made_with_ai', 'Video made with AI')}
            disabled={isUploadMode}
            {...register('video_made_with_ai', {
              value: false,
            })}
          />
        </div>
        <hr className="my-[15px] mb-[25px] border-tableBorder" />
        <div className="flex flex-col gap-[20px]">
          <CheckboxField
            label={t('label_comments', 'Allow Comments')}
            disabled={isUploadMode || !creator || creator.commentDisabled}
            {...register('comment', {
              value: getValues('comment') ?? false,
            })}
          />
          <CheckboxField
            label={t('label_disclose_video_content', 'Disclose Video Content')}
            disabled={isUploadMode}
            {...register('disclose', {
              value: getValues('disclose') ?? !!(getValues('brand_content_toggle') || getValues('brand_organic_toggle')),
            })}
          />
          {disclose && (brand_organic_toggle || brand_content_toggle) && (
            <div className="bg-tableBorder p-[10px] mt-[10px] rounded-[10px] flex gap-[20px] items-center">
              <div>
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
                    fill="white"
                  />
                </svg>
              </div>
              <div>
                {brand_content_toggle ? t('this_video_will_be_classified_branded_content', 'This video will be classified as Branded Content.') : t(
                  'your_video_will_be_labeled_promotional',
                  'Your video will be labeled "Promotional Content".'
                )}
                <br />
                {t(
                  'this_cannot_be_changed_once_posted',
                  'This cannot be changed once your video is posted.'
                )}
              </div>
            </div>
          )}
          <div className="text-[14px] my-[10px] text-balance">
            {t(
              'turn_on_to_disclose_video_promotes',
              'Turn on to disclose that this video promotes goods or services in\n          exchange for something of value. You video could promote yourself, a\n          third party, or both.'
            )}
          </div>
        </div>
        <div className={clsx(!disclose && 'invisible h-0 overflow-hidden', 'mt-[20px]')}>
          <CheckboxField
            label={t('label_your_brand', 'Your brand')}
            disabled={isUploadMode}
            {...register('brand_organic_toggle', {
              value: getValues('brand_organic_toggle') ?? false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_yourself',
              'You are promoting yourself or your own brand.'
            )}
            <br />
            {t(
              'this_video_will_be_classified_brand_organic',
              'This video will be classified as Brand Organic.'
            )}
          </div>
          <CheckboxField
            label={t('label_branded_content', 'Branded content')}
            disabled={isUploadMode}
            {...register('brand_content_toggle', {
              value: getValues('brand_content_toggle') ?? false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_another_brand',
              'You are promoting another brand or a third party.'
            )}
            <br />
            {t(
              'this_video_will_be_classified_branded_content',
              'This video will be classified as Branded Content.'
            )}
          </div>
        </div>
        {!isUploadMode && <p className="cf-body-sm text-cf-ink-muted">
          {t('by_posting_you_agree_to_tiktoks', "By posting, you agree to TikTok's")}{' '}
          <a target="_blank" rel="noopener noreferrer" className="text-cf-accent underline" href={TIKTOK_MUSIC_USAGE_DECLARATION.url}>
            {t('music_usage_confirmation', 'Music Usage Confirmation')}
          </a>
          {brand_content_toggle && <>{' '}{t('and', 'and')}{' '}
            <a target="_blank" rel="noopener noreferrer" className="text-cf-accent underline" href={TIKTOK_BRANDED_CONTENT_DECLARATION.url}>
              {t('branded_content_policy', 'Branded Content Policy')}
            </a>
          </>}
        </p>}
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TikTokSettings,
  comments: false,
  CustomPreviewComponent: TiktokPreview,
  dto: TikTokDto,
  maximumCharacters: 2000,
});
