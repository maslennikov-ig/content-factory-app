/**
 * What `POST /media/generate-image-with-prompt` is sent: a description and a
 * style, in the markers the door's picture-prompt step reads. The post
 * editor's «Сгенерировать картинку» window (`launches/ai.image.tsx`) and the
 * chat's `media.generate` (`content-factory-next-kcxz.25`) build it here, so
 * a picture asked for in the chat is asked for as the screen asks.
 *
 * Pure: no Nest, no network — the frontend bundle imports it as freely as
 * the backend.
 */

/** The styles the window offers, first is its default. */
export const IMAGE_STYLES = [
  'Realistic',
  'Cartoon',
  'Anime',
  'Fantasy',
  'Abstract',
  'Pixel Art',
  'Sketch',
  'Watercolor',
  'Minimalist',
  'Cyberpunk',
  'Monochromatic',
  'Surreal',
  'Pop Art',
  'Fantasy Realism',
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

/** Nothing named: the window's own preselection. */
export const DEFAULT_IMAGE_STYLE: ImageStyle = IMAGE_STYLES[0];

/** The door's body `prompt`, byte for byte as the window has sent it. */
export const imagePromptBody = (description: string, style: string) => `
<!-- description -->
${description}
<!-- /description -->

<!-- style -->
${style}
<!-- /style -->

`;

/** How many of the description's words name a generated picture. */
const NAME_WORDS = 6;
const NAME_MAX = 60;

/**
 * The library name of a generated picture (review W4-25 F11): the first words
 * of what it was asked to show, so the library's search — which reads
 * `originalName` — finds «ту картинку про кофейню». The door's body carries
 * the description in its markers; a bare prompt is read as it is. `undefined`
 * when there are no words: the stored name stays the only one.
 */
export const generatedPictureName = (prompt: string): string | undefined => {
  const marked = /<!-- description -->([\s\S]*?)<!-- \/description -->/.exec(prompt);
  const words = (marked ? marked[1] : prompt)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .split(/\s+/)
    // Only words (W4 walk P3-I): an emoji, a dash or a lone mark is not a
    // word — «🗓️ Созвон без повестки — это» named the file with both. A
    // mark that belongs to a letter stays (walk review F2): Bengali and
    // Hindi vowel signs, a decomposed «й»; one after an emoji goes with it.
    .map((word) =>
      word.replace(/^[^\p{L}\p{N}]+|(?:[^\p{L}\p{M}\p{N}]\p{M}*)+$/gu, '')
    )
    .filter(Boolean)
    .slice(0, NAME_WORDS)
    .join(' ');
  const cut = words.length > NAME_MAX ? words.slice(0, NAME_MAX).trimEnd() : words;
  return cut ? `${cut}.png` : undefined;
};
