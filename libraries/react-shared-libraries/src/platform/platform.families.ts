/**
 * The thirty-five destinations, grouped the way the product groups them.
 *
 * This is the structure the platform picker never showed. A flat grid of
 * thirty-five logos is held together by somebody else's artwork; grouped, it
 * reads as families and the picker stops being a wall.
 *
 * The grouping is a product decision, recorded in
 * `docs/prompts/design-platform-element-card.md`, appendix B. It is data, not
 * taste: `tests/platform.card.test.cjs` fails when this map and
 * `apps/frontend/public/icons/platforms/` stop agreeing, so a new provider
 * cannot ship without being placed.
 *
 * A family of one is not a mistake. `listmonk` is the only destination that
 * goes to our own infrastructure rather than to somebody else's service, so it
 * sits alone. Do not pad it and do not fold it into a neighbour.
 *
 * Colour is deliberately absent. An earlier design carried a per-family colour;
 * measurement killed it — under deuteranopia two of the nine collapsed into the
 * same grey (ΔEok 0.4), and even in normal vision the closest pair sat at 5.3.
 * The family is carried by position and by the band heading, which every reader
 * gets. See `docs/design/desert-lab/platform-card.md`.
 */

export type PlatformFamily = {
  /** Stable id; used for React keys and for the test, never shown. */
  id: string;
  /** Translation key and its English source string. */
  labelKey: string;
  labelDefault: string;
  /** Provider identifiers, in the order they appear inside the band. */
  platforms: readonly string[];
};

export const PLATFORM_FAMILIES: readonly PlatformFamily[] = [
  {
    id: 'messengers',
    labelKey: 'platform_family_messengers',
    labelDefault: 'Messengers',
    platforms: ['telegram', 'discord', 'slack'],
  },
  {
    id: 'social',
    labelKey: 'platform_family_social',
    labelDefault: 'Social networks',
    platforms: [
      'facebook',
      'instagram',
      'instagram-standalone',
      'x',
      'threads',
      'vk',
      'mewe',
    ],
  },
  {
    id: 'open',
    labelKey: 'platform_family_open',
    labelDefault: 'Open networks',
    platforms: [
      'bluesky',
      'mastodon',
      'mastodon-custom',
      'nostr',
      'lemmy',
      'wrapcast',
    ],
  },
  {
    id: 'communities',
    labelKey: 'platform_family_communities',
    labelDefault: 'Communities',
    platforms: ['reddit', 'moltbook', 'skool', 'whop'],
  },
  {
    id: 'video',
    labelKey: 'platform_family_video',
    labelDefault: 'Video and streaming',
    platforms: ['youtube', 'tiktok', 'twitch', 'kick'],
  },
  {
    id: 'publishing',
    labelKey: 'platform_family_publishing',
    labelDefault: 'Publishing',
    platforms: ['medium', 'devto', 'hashnode', 'wordpress', 'tumblr'],
  },
  {
    id: 'professional',
    labelKey: 'platform_family_professional',
    labelDefault: 'Professional',
    platforms: ['linkedin', 'linkedin-page', 'gmb'],
  },
  {
    id: 'visual',
    labelKey: 'platform_family_visual',
    labelDefault: 'Visual',
    platforms: ['dribbble', 'pinterest'],
  },
  {
    id: 'own',
    labelKey: 'platform_family_own',
    labelDefault: 'Our own delivery',
    platforms: ['listmonk'],
  },
];

/**
 * Three pairs share a logo and differ only in destination: Instagram through a
 * linked Facebook page against the standalone account, the main Mastodon server
 * against a self-hosted one, a LinkedIn profile against a company page. The
 * logo cannot tell them apart, so the frame does.
 *
 * Each entry gives both halves, because the provider names do the splitting
 * badly on their own: the backend calls them `Instagram\n(Facebook Business)`,
 * `LinkedIn Page` and — worst of the six — `M. Instance`, which does not even
 * say Mastodon. The card shows the platform name in the name slot and the
 * distinction in a framed monospaced strip below it, so the two cards read as
 * one platform with two destinations rather than as two platforms.
 *
 * Only these six carry a qualifier. One on every card would be a stencil label
 * on every element, which `DESIGN.md` forbids by name.
 *
 * One short word each, because the strip does not wrap. Three columns on a
 * 390px screen leave the card 92px, which holds about nine monospaced
 * characters at 12px; anything longer is truncated, and a truncated qualifier
 * is worse than none, since separating the pair is the only thing it was there
 * to do. The pair always appears side by side, so the two words only have to
 * differ from each other — `business` against `direct` says which Instagram
 * this is without either word having to be self-explanatory.
 */
export const PLATFORM_TWINS: Readonly<
  Record<string, { name: string; key: string; default: string }>
> = {
  instagram: {
    name: 'Instagram',
    key: 'platform_qualifier_instagram',
    default: 'business',
  },
  'instagram-standalone': {
    name: 'Instagram',
    key: 'platform_qualifier_instagram_standalone',
    default: 'direct',
  },
  mastodon: {
    name: 'Mastodon',
    key: 'platform_qualifier_mastodon',
    default: 'main',
  },
  'mastodon-custom': {
    name: 'Mastodon',
    key: 'platform_qualifier_mastodon_custom',
    default: 'custom',
  },
  linkedin: {
    name: 'LinkedIn',
    key: 'platform_qualifier_linkedin',
    default: 'profile',
  },
  'linkedin-page': {
    name: 'LinkedIn',
    key: 'platform_qualifier_linkedin_page',
    default: 'page',
  },
};

/**
 * A two-letter symbol per platform, assigned rather than derived.
 *
 * The table this design borrows from assigns its symbols too — iron is `Fe`,
 * sodium is `Na`, and neither follows from the English word. Deriving them here
 * would repeat a regression this product already shipped: taking the first two
 * letters of the identifier rendered `linkedin`, `linkedin-page` and `listmonk`
 * all as `LI`, and `medium` collided with `mewe`. `content-factory-next-a4p`
 * recorded it. Assigning them makes every one distinct, which the test below
 * holds.
 *
 * Used where the logo cannot be: as the fallback when a mark fails to load, so
 * the frame reads as an element rather than as an empty box. It does not
 * replace the logo, and it is not the channel avatar — a channel avatar takes
 * the *channel's* initials, because one platform commonly holds several
 * channels and four Telegram channels must not be four identical marks.
 */
export const PLATFORM_SYMBOLS: Readonly<Record<string, string>> = {
  telegram: 'Tg',
  discord: 'Dc',
  slack: 'Sl',
  facebook: 'Fb',
  instagram: 'Ig',
  'instagram-standalone': 'Is',
  x: 'X',
  threads: 'Th',
  vk: 'Vk',
  mewe: 'Mw',
  bluesky: 'Bs',
  mastodon: 'Ms',
  'mastodon-custom': 'Mc',
  nostr: 'Ns',
  lemmy: 'Lm',
  wrapcast: 'Wc',
  reddit: 'Rd',
  moltbook: 'Mb',
  skool: 'Sk',
  whop: 'Wh',
  youtube: 'Yt',
  tiktok: 'Tt',
  twitch: 'Tw',
  kick: 'Kk',
  medium: 'Md',
  devto: 'Dv',
  hashnode: 'Hn',
  wordpress: 'Wp',
  tumblr: 'Tu',
  linkedin: 'Li',
  'linkedin-page': 'Lp',
  gmb: 'Gb',
  dribbble: 'Db',
  pinterest: 'Pn',
  listmonk: 'Lk',
};

/**
 * The name each platform calls itself.
 *
 * Inside the product a channel arrives from the backend with a name attached,
 * so nothing needed this. The public pages have no session and therefore no
 * integration list, and the alternative was a second roster typed into the
 * marketing surface — which is how the registry and the front door start
 * disagreeing about what the product connects to.
 *
 * These are trademarks, so they are spelled the way their owners spell them:
 * `Dev.to`, `TikTok`, `WordPress`, `X`. Never translated, never transliterated
 * — a Russian page still says LinkedIn.
 *
 * The six twins share a name on purpose. `PLATFORM_TWINS` carries the word that
 * separates them, and a surface showing both must show that word too, or a
 * reader sees the same platform listed twice.
 */
export const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  facebook: 'Facebook',
  instagram: 'Instagram',
  'instagram-standalone': 'Instagram',
  x: 'X',
  threads: 'Threads',
  vk: 'VK',
  mewe: 'MeWe',
  bluesky: 'Bluesky',
  mastodon: 'Mastodon',
  'mastodon-custom': 'Mastodon',
  nostr: 'Nostr',
  lemmy: 'Lemmy',
  wrapcast: 'Warpcast',
  reddit: 'Reddit',
  moltbook: 'Moltbook',
  skool: 'Skool',
  whop: 'Whop',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitch: 'Twitch',
  kick: 'Kick',
  medium: 'Medium',
  devto: 'Dev.to',
  hashnode: 'Hashnode',
  wordpress: 'WordPress',
  tumblr: 'Tumblr',
  linkedin: 'LinkedIn',
  'linkedin-page': 'LinkedIn',
  gmb: 'Google Business Profile',
  dribbble: 'Dribbble',
  pinterest: 'Pinterest',
  listmonk: 'Listmonk',
};

const FAMILY_BY_PLATFORM: Readonly<Record<string, PlatformFamily>> =
  Object.fromEntries(
    PLATFORM_FAMILIES.flatMap((family) =>
      family.platforms.map((platform) => [platform, family])
    )
  );

/** The family a provider belongs to, or `undefined` for one we do not know. */
export const familyOfPlatform = (
  identifier: string
): PlatformFamily | undefined => FAMILY_BY_PLATFORM[identifier];

/** Every identifier the map places, in band order. */
export const KNOWN_PLATFORMS: readonly string[] = PLATFORM_FAMILIES.flatMap(
  (family) => family.platforms
);
