import type { TFunction } from 'i18next';

type Translate =
  | TFunction
  | ((key: string, fallback: string, values?: Record<string, unknown>) => string);

/**
 * A post-validation message, read in the interface language.
 *
 * Saving a post asks `POST /posts/valid`, and two of its answers are English
 * sentences written on the server: `settingsError`, the first class-validator
 * message from the channel's settings DTO
 * (`libraries/nestjs-libraries/src/dtos/posts/providers-settings/`), and
 * `errors`, the string a provider's `checkValidity` returns
 * (`libraries/nestjs-libraries/src/integrations/social/*.provider.ts`). The
 * settings panel runs the same DTOs in the browser, so its field messages are
 * the same sentences. They are recognised here, where the reader's language is
 * known, the same way `notifications/notification.text.ts` reads the bell.
 *
 * `tests/validation-message.translated.test.cjs` reads every such sentence out
 * of the provider and DTO sources, so a new English message fails there until
 * it is added below.
 *
 * A sentence nothing here recognises is shown unchanged.
 */

/** Toasts and field messages are text, not HTML: keep `/` and quotes as they are. */
const plain = (values: Record<string, unknown> = {}) => ({
  ...values,
  interpolation: { escapeValue: false },
});

/** Whole sentences, matched exactly. */
const EXACT: Record<string, { key: string; fallback: string }> = {
  // --- checkValidity: media rules per provider -----------------------------
  'You can only upload one video per post.': {
    key: 'validation_one_video_per_post',
    fallback: 'You can only upload one video per post.',
  },
  'There can be maximum 4 pictures in a post.': {
    key: 'validation_max_4_pictures',
    fallback: 'There can be maximum 4 pictures in a post.',
  },
  'Requires one item': {
    key: 'validation_requires_one_item',
    fallback: 'Requires one item',
  },
  'Does not support mp4 files': {
    key: 'validation_no_mp4',
    fallback: 'Does not support mp4 files',
  },
  'Invalid image size. Requires 400x300 or 800x600 px images.': {
    key: 'validation_dribbble_image_size',
    fallback: 'Invalid image size. Requires 400x300 or 800x600 px images.',
  },
  'Story should have at least one media': {
    key: 'validation_story_needs_media',
    fallback: 'Story should have at least one media',
  },
  'Can only accept images': {
    key: 'validation_images_only',
    fallback: 'Can only accept images',
  },
  'Google My Business posts can only have one image': {
    key: 'validation_gmb_one_image',
    fallback: 'Google My Business posts can only have one image',
  },
  'Google My Business posts do not support video attachments': {
    key: 'validation_gmb_no_video',
    fallback: 'Google My Business posts do not support video attachments',
  },
  'Event posts require an event title': {
    key: 'validation_event_title_required',
    fallback: 'Event posts require an event title',
  },
  'Should have at least one media': {
    key: 'validation_needs_media',
    fallback: 'Should have at least one media',
  },
  'Requires at least one media': {
    key: 'validation_needs_media',
    fallback: 'Should have at least one media',
  },
  'Instagram carousel only supports up to 10 media attachments': {
    key: 'validation_instagram_carousel_max_10',
    fallback: 'Instagram carousel only supports up to 10 media attachments',
  },
  'Trial Reels can only have one video': {
    key: 'validation_trial_reel_one_video',
    fallback: 'Trial Reels can only have one video',
  },
  'Trial Reels must be a video': {
    key: 'validation_trial_reel_video',
    fallback: 'Trial Reels must be a video',
  },
  'Audio can only be added to Reels, not to Stories': {
    key: 'validation_audio_reels_not_stories',
    fallback: 'Audio can only be added to Reels, not to Stories',
  },
  'Audio can only be added to a single video Reel': {
    key: 'validation_audio_single_video_reel',
    fallback: 'Audio can only be added to a single video Reel',
  },
  'Audio can only be added to a video Reel': {
    key: 'validation_audio_video_reel',
    fallback: 'Audio can only be added to a video Reel',
  },
  'You can set only one picture for a cover': {
    key: 'validation_one_cover_picture',
    fallback: 'You can set only one picture for a cover',
  },
  'Carousel can only be created with 2 or more images and no videos.': {
    key: 'validation_carousel_images_only',
    fallback: 'Carousel can only be created with 2 or more images and no videos.',
  },
  'Can have maximum 1 media when selecting a video.': {
    key: 'validation_one_media_with_video',
    fallback: 'Can have maximum 1 media when selecting a video.',
  },
  'Comments can only contain text.': {
    key: 'validation_comments_text_only',
    fallback: 'Comments can only contain text.',
  },
  'You can only have up to 5 media items': {
    key: 'validation_max_5_media',
    fallback: 'You can only have up to 5 media items',
  },
  'If posting a video you have to also include a cover image as second media': {
    key: 'validation_video_needs_cover',
    fallback:
      'If posting a video you have to also include a cover image as second media',
  },
  'If posting a video you can only have two media items': {
    key: 'validation_video_two_media_max',
    fallback: 'If posting a video you can only have two media items',
  },
  'Requires all images to have the same width and height': {
    key: 'validation_images_same_size',
    fallback: 'Requires all images to have the same width and height',
  },
  'When posting a media post, you must attached exactly one media file.': {
    key: 'validation_media_post_one_file',
    fallback:
      'When posting a media post, you must attached exactly one media file.',
  },
  'You must attach a thumbnail to your video post.': {
    key: 'validation_video_needs_thumbnail',
    fallback: 'You must attach a thumbnail to your video post.',
  },
  'No video / images selected': {
    key: 'validation_no_media_selected',
    fallback: 'No video / images selected',
  },
  'Only pictures are supported when selecting multiple items': {
    key: 'validation_multiple_items_pictures_only',
    fallback: 'Only pictures are supported when selecting multiple items',
  },
  'You need one media': {
    key: 'validation_one_media',
    fallback: 'You need one media',
  },
  'Tumblr supports up to 30 images in one post.': {
    key: 'validation_tumblr_max_30_images',
    fallback: 'Tumblr supports up to 30 images in one post.',
  },
  'Tumblr supports one uploaded video in one post.': {
    key: 'validation_tumblr_one_video',
    fallback: 'Tumblr supports one uploaded video in one post.',
  },
  'Item must be a video': {
    key: 'validation_item_must_be_video',
    fallback: 'Item must be a video',
  },
  // `posts.service.ts` when a provider's check throws without a message.
  'Invalid media': {
    key: 'validation_invalid_media',
    fallback: 'Invalid media',
  },

  // --- settings DTOs: custom `message:` options ------------------------------
  'Invalid URL': {
    key: 'validation_invalid_url',
    fallback: 'Invalid URL',
  },
  'Title is required': {
    key: 'validation_title_required',
    fallback: 'Title is required',
  },
  'Board is required': {
    key: 'validation_board_required',
    fallback: 'Board is required',
  },
  'Invalid X community URL. It should be in the format: https://x.com/i/communities/1493446837214187523':
    {
      key: 'validation_x_community_url',
      fallback:
        'Invalid X community URL. It should be in the format: https://x.com/i/communities/1493446837214187523',
    },

  // --- class-validator itself, when the settings object is not a DTO --------
  'an unknown value was passed to the validate function': {
    key: 'validation_unknown_value',
    fallback: 'an unknown value was passed to the validate function',
  },
};

/**
 * Sentences with a number or a name in them. The property name class-validator
 * puts first is the code's own field name; it is carried over as it arrived.
 */
const PATTERNS: Array<{
  re: RegExp;
  render: (t: Translate, m: RegExpMatchArray) => string;
}> = [
  // `IsYoutubeTagsLength` in youtube.settings.dto.ts
  {
    re: /^The maximum allowed is (\d+) characters in total for all tags\.$/,
    render: (t, m) =>
      t(
        'validation_youtube_tags_total',
        'The maximum allowed is {{max}} characters in total for all tags.',
        plain({ max: m[1] })
      ),
  },
  // `EmptySettings` in all.providers.settings.ts
  {
    re: /^"__type" must be ([\s\S]+)$/,
    render: (t, m) =>
      t(
        'validation_type_must_be',
        '"__type" must be {{values}}',
        plain({ values: m[1] })
      ),
  },
  // class-validator 0.14 default messages for the decorators the DTOs use.
  {
    re: /^each value in nested property (\S+) must be either object or array$/,
    render: (t, m) =>
      t(
        'validation_field_nested_each',
        'each value in nested property {{property}} must be either object or array',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^nested property (\S+) must be either object or array$/,
    render: (t, m) =>
      t(
        'validation_field_nested',
        'nested property {{property}} must be either object or array',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^each value in (\S+) must be a number conforming to the specified constraints$/,
    render: (t, m) =>
      t(
        'validation_field_number_each',
        'each value in {{property}} must be a number conforming to the specified constraints',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) must be a number conforming to the specified constraints$/,
    render: (t, m) =>
      t(
        'validation_field_number',
        '{{property}} must be a number conforming to the specified constraints',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) should not be null or undefined$/,
    render: (t, m) =>
      t(
        'validation_field_defined',
        '{{property}} should not be null or undefined',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) should not be empty$/,
    render: (t, m) =>
      t(
        'validation_field_not_empty',
        '{{property}} should not be empty',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) must be a string$/,
    render: (t, m) =>
      t(
        'validation_field_string',
        '{{property}} must be a string',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) must be a boolean value$/,
    render: (t, m) =>
      t(
        'validation_field_boolean',
        '{{property}} must be a boolean value',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) must be an array$/,
    render: (t, m) =>
      t(
        'validation_field_array',
        '{{property}} must be an array',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) must be a URL address$/,
    render: (t, m) =>
      t(
        'validation_field_url',
        '{{property}} must be a URL address',
        plain({ property: m[1] })
      ),
  },
  {
    re: /^(\S+) must be longer than or equal to (\d+) characters$/,
    render: (t, m) =>
      t(
        'validation_field_min_length',
        '{{property}} must be longer than or equal to {{min}} characters',
        plain({ property: m[1], min: m[2] })
      ),
  },
  {
    re: /^(\S+) must be shorter than or equal to (\d+) characters$/,
    render: (t, m) =>
      t(
        'validation_field_max_length',
        '{{property}} must be shorter than or equal to {{max}} characters',
        plain({ property: m[1], max: m[2] })
      ),
  },
  {
    re: /^(\S+) must not be less than (-?[\d.]+)$/,
    render: (t, m) =>
      t(
        'validation_field_min',
        '{{property}} must not be less than {{min}}',
        plain({ property: m[1], min: m[2] })
      ),
  },
  {
    re: /^(\S+) must not be greater than (-?[\d.]+)$/,
    render: (t, m) =>
      t(
        'validation_field_max',
        '{{property}} must not be greater than {{max}}',
        plain({ property: m[1], max: m[2] })
      ),
  },
  {
    re: /^(\S+) must contain at least (\d+) elements$/,
    render: (t, m) =>
      t(
        'validation_field_array_min',
        '{{property}} must contain at least {{min}} elements',
        plain({ property: m[1], min: m[2] })
      ),
  },
  {
    re: /^(\S+) must contain no more than (\d+) elements$/,
    render: (t, m) =>
      t(
        'validation_field_array_max',
        '{{property}} must contain no more than {{max}} elements',
        plain({ property: m[1], max: m[2] })
      ),
  },
  {
    re: /^(\S+) must be one of the following values: ([\s\S]*)$/,
    render: (t, m) =>
      t(
        'validation_field_one_of',
        '{{property}} must be one of the following values: {{values}}',
        plain({ property: m[1], values: m[2] })
      ),
  },
];

export const translateValidationMessage = (
  message: string,
  t: Translate
): string => {
  if (typeof message !== 'string') {
    return message;
  }
  const exact = EXACT[message];
  if (exact) {
    return t(exact.key, exact.fallback, plain()) as string;
  }
  for (const { re, render } of PATTERNS) {
    const match = message.match(re);
    if (match) {
      return render(t, match);
    }
  }
  return message;
};

/**
 * The same translation for a react-hook-form error tree: every `message` and
 * every entry of `types` (with `criteriaMode: 'all'`). `ref` is a DOM node and
 * is passed through untouched.
 */
const translateErrorTree = (node: unknown, t: Translate): unknown => {
  if (Array.isArray(node)) {
    return node.map((child) => translateErrorTree(child, t));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'ref') {
      out[key] = value;
    } else if (key === 'message' && typeof value === 'string') {
      out[key] = translateValidationMessage(value, t);
    } else if (key === 'types' && value && typeof value === 'object') {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          typeof v === 'string' ? translateValidationMessage(v, t) : v,
        ])
      );
    } else {
      out[key] = translateErrorTree(value, t);
    }
  }
  return out;
};

/**
 * Wraps a form resolver (the settings panels use `classValidatorResolver` over
 * the same DTOs the server checks) so the field messages it produces are read
 * in the interface language too.
 */
export const translateResolver = <
  R extends (...args: any[]) => Promise<{ values: any; errors: any }>
>(
  resolver: R,
  t: Translate
): R =>
  (async (...args: Parameters<R>) => {
    const result = await resolver(...args);
    if (!result?.errors || !Object.keys(result.errors).length) {
      return result;
    }
    return { ...result, errors: translateErrorTree(result.errors, t) };
  }) as R;
