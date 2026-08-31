import { splitParagraphs, splitSentences } from './segment';
import { RU_LOCALE_PACK } from './locale-pack.ru';

/**
 * What changes when a piece is cut for another platform.
 *
 * The value of the preview is that it is arithmetic, not a promise. A person
 * about to publish the same text in four places wants to know what will be
 * different before it is, and "length 312 → 1 400, lists row → bullets, photos
 * 1 → 3" is checkable in a way that "adapted for the platform" is not.
 *
 * Nothing here talks to a platform. It describes a shape; producing the post
 * and delivering it stay with `PostsService` and the providers, which
 * `docs/product/migration-map.md` makes a rule rather than a preference — a
 * new entity reaching a platform directly is exactly what it forbids.
 */

export type RecutPlatform = 'site' | 'telegram' | 'vk' | 'newsletter';

export type PlatformShape = Readonly<{
  /** Hard ceiling the platform imposes; `null` where there is none. */
  maxChars: number | null;
  /** How a list is written there. */
  lists: 'bullets' | 'inline';
  /** How many images the format carries well. */
  images: number;
  /** Whether a link survives as a link. */
  links: boolean;
}>;

export const PLATFORM_SHAPES: Readonly<Record<RecutPlatform, PlatformShape>> = {
  site: { maxChars: null, lists: 'bullets', images: 3, links: true },
  telegram: { maxChars: 4096, lists: 'bullets', images: 1, links: true },
  vk: { maxChars: 16_000, lists: 'inline', images: 3, links: true },
  newsletter: { maxChars: null, lists: 'bullets', images: 3, links: true },
};

export type RecutChange = {
  aspect: 'length' | 'lists' | 'images' | 'links';
  from: string;
  to: string;
  /** True when the change loses something rather than reshaping it. */
  lossy: boolean;
};

export type RecutPreview = {
  platform: RecutPlatform;
  changes: RecutChange[];
  /** Empty when the piece already fits the platform as written. */
  unchanged: boolean;
};

const listShape = (body: string): 'bullets' | 'inline' =>
  splitParagraphs(body).some((paragraph) => paragraph.isList)
    ? 'bullets'
    : 'inline';

export function previewRecut({
  body,
  images = 0,
  links = 0,
  platform,
}: {
  body: string;
  images?: number;
  links?: number;
  platform: RecutPlatform;
}): RecutPreview {
  const shape = PLATFORM_SHAPES[platform];
  const changes: RecutChange[] = [];
  const length = body.length;

  if (shape.maxChars !== null && length > shape.maxChars) {
    changes.push({
      aspect: 'length',
      from: String(length),
      to: String(shape.maxChars),
      // Cutting text away is a loss, and the preview says so rather than
      // calling it "optimised".
      lossy: true,
    });
  } else if (shape.maxChars === null && length < 600) {
    // A long-form surface reads a short post as a fragment; the recut expands
    // it, which is a reshaping rather than a loss.
    changes.push({
      aspect: 'length',
      from: String(length),
      to: `${Math.round(length * 2.5)}`,
      lossy: false,
    });
  }

  const currentLists = listShape(body);
  if (currentLists !== shape.lists) {
    changes.push({
      aspect: 'lists',
      from: currentLists,
      to: shape.lists,
      lossy: false,
    });
  }

  if (images !== shape.images) {
    changes.push({
      aspect: 'images',
      from: String(images),
      to: String(shape.images),
      lossy: images > shape.images,
    });
  }

  if (links > 0 && !shape.links) {
    changes.push({
      aspect: 'links',
      from: String(links),
      to: '0',
      lossy: true,
    });
  }

  return { platform, changes, unchanged: changes.length === 0 };
}

/**
 * A quick read of a piece for the library table, without loading a post.
 */
export function describePiece(body: string): {
  chars: number;
  sentences: number;
  paragraphs: number;
} {
  return {
    chars: body.length,
    sentences: splitSentences(body, RU_LOCALE_PACK).length,
    paragraphs: splitParagraphs(body).length,
  };
}
