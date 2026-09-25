/**
 * What the model may say in the author's name when the person presses
 * «Решите за меня» (`content-factory-next-97dq.99`, owner decision of
 * 25.09.2026).
 *
 * The owner: «если человек пишет „реши сам“, это не значит, что ничего писать
 * не нужно» — the model answers a handed question from its own knowledge. On
 * the boundary: «Это ещё одна настройка… по умолчанию точно первый вариант.»
 *
 * - `knowledge` (the default, and what an absent field means): explanations,
 *   advice, techniques, widely known facts and examples in a general form.
 *   Never an invented first-person episode, exact numbers, quotes or named
 *   sources that are not in the input.
 * - `examples` (opt-in): the same, plus a plausible illustrative example in
 *   the author's voice, first person included. Still never numbers presented
 *   as measured results, quotes or named sources.
 *
 * It lives on the avatar (`voice.delegatedPolicy`), not on a channel: it is a
 * policy of what may be said in the author's name, and it is the same
 * wherever the author speaks. This file imports nothing, so the profile
 * types, the validation, the voice door and the core prompt share one list.
 */

export const DELEGATED_POLICIES = ['knowledge', 'examples'] as const;

export type DelegatedPolicyV1 = (typeof DELEGATED_POLICIES)[number];

export const DEFAULT_DELEGATED_POLICY: DelegatedPolicyV1 = 'knowledge';

/**
 * The policy a stored voice carries. Anything but an explicit `examples` is
 * the default: a voice saved before 25.09.2026 has no field, and a malformed
 * one must never widen what the model may invent.
 */
export const delegatedPolicyOf = (voice: unknown): DelegatedPolicyV1 =>
  voice &&
  typeof voice === 'object' &&
  (voice as { delegatedPolicy?: unknown }).delegatedPolicy === 'examples'
    ? 'examples'
    : DEFAULT_DELEGATED_POLICY;
