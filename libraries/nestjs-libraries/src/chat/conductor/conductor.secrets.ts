import {
  RegexFilterProcessor,
  UnicodeNormalizer,
} from '@mastra/core/processors';

import {
  SECRET_REPLACEMENT,
  SECRET_SHAPES,
} from './secret-shapes';

export {
  SECRET_REPLACEMENT,
  SECRET_SHAPES,
  containsSecretShape,
  redactSecretShapes,
} from './secret-shapes';

/**
 * Keys never pass through the model: the processors below replace a key shape
 * before the model reads it and before memory stores it, and in anything the
 * model writes back. The shapes live in `secret-shapes.ts`.
 */

const secretRules = () =>
  SECRET_SHAPES.map(({ name, pattern }) => ({
    name,
    pattern: new RegExp(pattern.source, pattern.flags),
    replacement: SECRET_REPLACEMENT,
  }));

/**
 * Cheap, model-free processors (ADR-0012 amendment §6). `SystemPromptScrubber`
 * is left out on purpose: in `@mastra/core` 1.71 it runs a detection model on
 * the output — an extra, unbilled call per turn — so it is not the cheap
 * processor the amendment took it for.
 */
export const conductorInputProcessors = () => [
  new UnicodeNormalizer({
    stripControlChars: true,
    preserveEmojis: true,
    // The person's line breaks and spacing are part of what they wrote.
    collapseWhitespace: false,
    trim: false,
  }),
  new RegexFilterProcessor({
    presets: ['secrets'],
    rules: secretRules(),
    strategy: 'redact',
    phase: 'input',
    streamCarryoverSize: 256,
  }),
];

export const conductorOutputProcessors = () => [
  new RegexFilterProcessor({
    presets: ['secrets'],
    rules: secretRules(),
    strategy: 'redact',
    phase: 'output',
    streamCarryoverSize: 256,
  }),
];
