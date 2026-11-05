/** Editorial production policy only. Account capability, consent, grants and
 * provider receipts remain the publishing service's responsibility. */
import type {
  DraftDestinationRefV1,
  MaterialFormatV1,
  SocialPlatformV1,
} from '../../contracts/social-factory.v1';

export type EditorialRule = {
  id: string;
  kind: 'requirement' | 'recommendation' | 'experiment';
  authority: 'product' | 'platform' | 'repository';
  instruction: string;
  source: string;
  sourceDate: string;
};
export type EditorialPlaybook = {
  version: 'social-editorial/v1';
  platform: SocialPlatformV1;
  format: MaterialFormatV1;
  purpose: string;
  deliverables: readonly string[];
  rules: readonly EditorialRule[];
  review: readonly string[];
};

const DATE = '2026-11-03';
const PLAN = 'docs/superpowers/plans/2026-11-03-social-content-factory.md';
const rule = (
  id: string,
  kind: EditorialRule['kind'],
  instruction: string,
  source = PLAN,
  authority: EditorialRule['authority'] = 'product'
): EditorialRule => ({
  id,
  kind,
  authority,
  instruction,
  source,
  sourceDate: DATE,
});
const COMMON = [
  rule(
    'claim-grounding',
    'requirement',
    'Use supplied verified facts and source IDs. Label illustrative scenarios and hypotheses. Never invent customer outcomes, certifications, tests, offers or reach guarantees.'
  ),
  rule(
    'channel-identity',
    'requirement',
    "Write for this channel's audience, language, promise and exclusions. Company identity, channel editorial identity and presenter identity are separate inputs."
  ),
  rule(
    'assets-not-prompts',
    'requirement',
    'Deliver actual rendered assets for visual formats. A visual instruction, storyboard, pending render or image prompt is not a finished asset. Use reliable text layout for factual typography.'
  ),
  rule(
    'adapt-owned-content',
    'recommendation',
    'Adapt permitted own material when useful; choose structure and examples for this destination. Do not impose a universal ban on cross-posting.'
  ),
  rule(
    'bounded-experiment',
    'experiment',
    'Test one packaging or editorial variable at a time against a declared outcome and observation window. Treat observed differences as association unless a causal design supports more.'
  ),
] as const;
const REVIEW = [
  'Check each factual claim against its cited source and channel exclusions.',
  'Inspect the actual preview for readable typography, accessibility and meaningful visuals.',
  'Check CTA truthfulness, source/media rights and any required synthetic/commercial disclosure.',
  'Structural completeness does not establish editorial quality, rights clearance or publication success.',
] as const;

const catalogue: readonly EditorialPlaybook[] = [
  {
    version: 'social-editorial/v1',
    platform: 'telegram',
    format: 'post',
    purpose:
      'A self-contained useful post for subscribers, retaining negotiated length and rich formatting.',
    deliverables: [
      'Explicit title',
      'Specific opening',
      'Structured complete body',
      'Relevant next step',
      'Chosen material-specific length and rendered text',
    ],
    rules: [
      ...COMMON,
      rule(
        'telegram-length-choice',
        'requirement',
        'Preserve the existing 2–3 material-specific length choices, user choice or edit, explicit title and limited editorial corrections. Do not silently replace that choice with a generic word count.'
      ),
      rule(
        'telegram-message-limit',
        'requirement',
        'For the existing sendMessage route validate the final entity-parsed message against its 4096 character limit, including title and CTA. Keep rich formatting; do not truncate raw HTML.',
        'https://core.telegram.org/bots/api#sendmessage',
        'platform'
      ),
      rule(
        'telegram-caption-limit',
        'requirement',
        'For the existing Bot API media route the entity-parsed caption is limited to 1024 characters. Deliver a finished image/video when selected. Use an explicit text continuation for a longer body; never silently lose text.',
        'https://core.telegram.org/bots/api#sendphoto',
        'platform'
      ),
      rule(
        'telegram-value',
        'recommendation',
        'Make the value usable without opening a link. Develop one concrete diagnosis, example or checklist before a proportional CTA.'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'threads',
    format: 'thread',
    purpose:
      'An intelligible conversation starter with ordered substantive follow-ups.',
    deliverables: [
      'Standalone starter',
      'Ordered reply texts',
      'Relevant conversation invitation',
    ],
    rules: [
      ...COMMON,
      rule(
        'threads-reply-order',
        'requirement',
        'Deliver each post separately in reply order. Publishing must preserve returned parent IDs and resume partial conversations instead of posting the starter again.'
      ),
      rule(
        'threads-specific-question',
        'recommendation',
        'Express a concrete point of view that makes sense to a first-time reader; ask a real answerable question. Each follow-up adds an example, boundary or useful disagreement.'
      ),
      rule(
        'threads-transport',
        'requirement',
        'Validate each final post with the current provider/account constraints. Do not infer API attachment support from a native-app feature.'
      ),
      rule(
        'threads-followup-test',
        'experiment',
        'Compare an evidence-led starter with a scenario-led starter using qualified reply content, not an assumed reach uplift.'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'instagram',
    format: 'carousel',
    purpose:
      'One publication containing a readable ordered argument across rendered slides.',
    deliverables: [
      'Title and hook',
      'Ordered slide copy',
      'One real asset per slide',
      'Caption',
      'Relevant CTA',
      'Explicit slide count',
    ],
    rules: [
      ...COMMON,
      rule(
        'carousel-one-publication',
        'requirement',
        'Count a carousel as one publication with an explicit slide count. Every slide needs its actual asset, not a photo placeholder.'
      ),
      rule(
        'carousel-progression',
        'recommendation',
        'Use a concrete promise on the opening slide, then distinct examples or steps, and a useful resolution. Keep the primary point readable on a phone.'
      ),
      rule(
        'carousel-honest-measurement',
        'requirement',
        'Do not promise per-slide progression or retention metrics that the selected account/API has not returned.'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'instagram',
    format: 'story',
    purpose:
      'One finished Story frame; a sequence groups frames and never changes the campaign count silently.',
    deliverables: [
      'Frame text',
      'One rendered frame asset',
      'CTA appropriate to the available surface',
      'Sequence/group metadata supplied by campaign',
    ],
    rules: [
      ...COMMON,
      rule(
        'story-count',
        'requirement',
        'One Story unit is exactly one frame. Expand a requested sequence into explicit campaign items before generating, rather than treating five frames as one item.'
      ),
      rule(
        'story-capability',
        'requirement',
        'Gate Story publishing and interactive/link features separately on actual auth route and account capability. Export or request manual completion when unavailable; never draw a fake interactive sticker.'
      ),
      rule(
        'story-sequence',
        'recommendation',
        'When grouped, progress from observable situation to explanation and next step; each frame must be understandable and legible alone.'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'instagram',
    format: 'reel',
    purpose: 'A finished short video demonstrating a specific useful idea.',
    deliverables: [
      'Title',
      'Hook',
      'Timed complete script',
      'Finished video',
      'Cover',
      'Captions',
      'Post caption and CTA',
    ],
    rules: [
      ...COMMON,
      rule(
        'reel-proof',
        'recommendation',
        'Open with a visible situation or demonstration and pay off the promise. Match every shot to its narration; avoid generic stock visuals used as proof.'
      ),
      rule(
        'reel-audio',
        'requirement',
        'Check audio rights for the actual business/publication route. Do not assume native-app music rights transfer to an uploaded video.'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'youtube',
    format: 'short',
    purpose:
      'One complete short video with an honest viewer promise and a usable next step.',
    deliverables: [
      'Title',
      'Hook',
      'Timed script',
      'Finished video',
      'Captions',
      'Description',
      'CTA',
    ],
    rules: [
      ...COMMON,
      rule(
        'short-links',
        'requirement',
        'Shorts description/comment URLs are non-clickable. Use a supported related video, channel/profile surface or an on-platform next step; never promise a direct description click.',
        'https://support.google.com/youtube/answer/13748639',
        'platform'
      ),
      rule(
        'short-payoff',
        'recommendation',
        'Build a complete explanation around a visible example; do not merely cut the beginning off a long video and omit its payoff.'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'youtube',
    format: 'long_video',
    purpose:
      'A finished long video with a complete narrative, evidence, captions and packaging.',
    deliverables: [
      'Title',
      'Opening promise',
      'Complete timed scene-by-scene script',
      'Finished composed video',
      'Thumbnail asset',
      'Captions',
      'Description',
      'Chapter markers',
      'CTA',
    ],
    rules: [
      ...COMMON,
      rule(
        'long-script',
        'requirement',
        'Deliver complete spoken text and visual intent for every scene, not only an opening paragraph and outline. Compose one playable final file and retain scene provenance for selective revision.'
      ),
      rule(
        'long-packaging',
        'recommendation',
        'Give the title and thumbnail one truthful promise. Develop separate chapters with demonstrations, trade-offs and a decision checklist; do not stretch a Short with repetition.'
      ),
      rule(
        'long-links',
        'requirement',
        'External clickable description links depend on channel advanced-feature access; publishing must check the actual capability.',
        'https://support.google.com/youtube/answer/13748639',
        'platform'
      ),
    ],
    review: REVIEW,
  },
  {
    version: 'social-editorial/v1',
    platform: 'tiktok',
    format: 'short',
    purpose:
      'TikTok-native packaging of permitted material with a complete video and explicit delivery continuation.',
    deliverables: [
      'Editable title/caption',
      'Demonstration-led hook',
      'Timed script',
      'Finished video',
      'Cover',
      'Captions',
      'CTA',
      'Disclosure/rights review',
    ],
    rules: [
      ...COMMON,
      rule(
        'tiktok-consent',
        'requirement',
        'Direct Post requires current creator info, creator-selected privacy and explicit upload consent with editable preview/metadata. Autopilot grants do not replace platform-required interaction.',
        'https://developers.tiktok.com/doc/content-sharing-guidelines/',
        'platform'
      ),
      rule(
        'tiktok-branding',
        'requirement',
        'Do not add app promotional watermarks/logos. Do not convert this rule into a blanket prohibition on a creator showing their own product or adapting their own content.',
        'https://developers.tiktok.com/doc/content-sharing-guidelines/',
        'platform'
      ),
      rule(
        'tiktok-native',
        'recommendation',
        'Start with a useful demonstration or point of view, then show its evidence. Export clean media with an explicit manual/inbox continuation when direct publishing is unavailable.'
      ),
    ],
    review: REVIEW,
  },
];

/** Return a defensive copy so one request cannot change another channel's policy. */
export function listEditorialPlaybooks(): EditorialPlaybook[] {
  return catalogue.map((book) => ({
    ...book,
    deliverables: [...book.deliverables],
    rules: book.rules.map((entry) => ({ ...entry })),
    review: [...book.review],
  }));
}

export function getEditorialPlaybook(
  platform: string,
  format: string,
  destination?: DraftDestinationRefV1
): EditorialPlaybook {
  if(platform==='instagram' && format==='post' && destination?.kind==='draft' && destination.publishable===false && destination.id){
    return {version:'social-editorial/v1',platform:'instagram',format:'post',
      purpose:'An editable text/caption draft for later visual adaptation, bound to an explicit nonpublishable preparation destination.',
      deliverables:['Title','Hook','Complete text','Caption','CTA or explicit none'],rules:[...COMMON.map(entry=>({...entry})),rule('local-text-draft','requirement','This is a local text draft, not a finished Instagram publication. Do not invent rendered media or imply account connection, scheduling or publishing readiness.')],review:[...REVIEW,'Add and inspect real media before any future connected Instagram publication.']};
  }
  const book = listEditorialPlaybooks().find(
    (entry) => entry.platform === platform && entry.format === format
  );
  if (!book)
    throw new Error(`Unsupported editorial format: ${platform}/${format}`);
  return book;
}

/** Append to the existing generation prompt, retaining its channel voice/length negotiation. */
export function buildEditorialProductionInstructions(
  platform: string,
  format: string,
  destination?: DraftDestinationRefV1
): string {
  const book = getEditorialPlaybook(platform, format, destination);
  return [
    `Editorial playbook ${book.version}: ${book.platform}/${book.format}`,
    book.purpose,
    `Deliver: ${book.deliverables.join('; ')}.`,
    ...book.rules.map(
      (entry) =>
        `[${entry.kind}; ${entry.authority}; ${entry.sourceDate}; ${entry.id}] ${entry.instruction} Source: ${entry.source}`
    ),
    'Recommendations and experiments are not platform requirements or guarantees of performance.',
    ...book.review,
  ].join('\n');
}
