/** A user preference, never a grant, approval, budget or native session mode. */
export const AGENT_CHAT_MODES = ['collaborative', 'autopilot'] as const;
export type AgentChatMode = typeof AGENT_CHAT_MODES[number];
export const AGENT_CHAT_MODE_METADATA_KEY = 'assistantChatModeV1';
export const AGENT_CHAT_MODE_CONTEXT_KEY = 'cf.chatMode';
export const AGENT_MATERIAL_FORMAT_CONTEXT_KEY = 'cf.materialFormats';
/** Parse person-authored request/answer wording, never model tool arguments. */
export const explicitMaterialFormats = (text: string): string[] => {
  let request = text.split(/\n\s*\n/)[0].slice(0, 1200);
  // Source passages and avatar examples are evidence, not a format selector.
  request = request.split(/(?:черновик(?:а)?|исходник(?:а)?|исходный текст|draft|source|avatar text)\s*:/iu)[0]
    .replace(/«[^»]*»|“[^”]*”|"[^"]*"|`[^`]*`/gu, ' ');
  // In a conversion, the source noun before “into”/“в” is never an output.
  const conversion = request.match(/(?:turn|convert|transform|преврати|преобразуй|переделай|переработай)[\s\S]*?(?:\binto\b|\sв\s)\s*([\s\S]+)$/iu);
  if (conversion) request = conversion[1];
  const suffix = '(?:а|у|ом|е|ы|ов|ам|ами|ах)?';
  const choices: ReadonlyArray<readonly [string, string]> = [
    ['carousel', 'карусел(?:ь|и|ей|ью|ям|ями|ях)|carousels?'],
    ['reel', `reels?|рил[сз]${suffix}`],
    ['story', 'stor(?:y|ies)|сторис|сториз'], ['short', `shorts?|шортс${suffix}`],
    ['long_video', 'длинн(?:ое|ый|ого|ых|ые) (?:видео|ролик(?:а|ов|и)?)|long(?:[- ]form)? videos?'],
    ['post', `пост${suffix}|posts?`], ['thread', `тред${suffix}|threads?`],
    ['video', 'видео|videos?'],
  ];
  const sourcePrefix = /(?:^|[^\p{L}])(?:из|from|using|based on|на основе|используя|about|про|об|о)\s+(?:(?:этот|этого|этой|этих|the|this|that|these|a|an|existing|saved)\s+)*(?:\d+\s+)?$/iu;
  const negativePrefix = /(?:^|[^\p{L}])(?:не|not|without|без|не\s+(?:делай|создавай|готовь|используй|выбирай)|do not\s+(?:make|create|use)|don't\s+(?:make|create|use))\s+(?:a\s+|an\s+)?$/iu;
  const selected = new Set<string>();
  for (const [format, words] of choices) {
    const pattern = new RegExp(`(?<![\\p{L}])(?:${words})(?![\\p{L}])`, 'giu');
    for (const match of request.matchAll(pattern)) {
      const prefix = request.slice(0, match.index).slice(-160);
      if (sourcePrefix.test(prefix) || negativePrefix.test(prefix)) continue;
      // Threads in “для Threads” / “for Threads” names a destination.
      if (format === 'thread' && /(?:для|for)\s*$/iu.test(prefix)) continue;
      selected.add(format);
    }
  }
  if (selected.has('long_video')) selected.delete('video');
  // Alternatives are a question, not the person's settled output choice.
  if (selected.size > 1 && /(?:^|[^\p{L}])(?:или|либо|or|versus|vs)(?=$|[^\p{L}])/iu.test(request)) return [];
  return [...selected];
};
export const isAgentChatMode = (value: unknown): value is AgentChatMode =>
  AGENT_CHAT_MODES.includes(value as AgentChatMode);
/** Read old clients and metadata conservatively; this never grants autonomy. */
export const normalizeAgentChatMode = (value: unknown): AgentChatMode | undefined =>
  value === 'prepare_approve' ? 'collaborative' : isAgentChatMode(value) ? value : undefined;
export const readStoredChatMode = (metadata?: Record<string, unknown>): AgentChatMode => {
  const value = metadata?.[AGENT_CHAT_MODE_METADATA_KEY];
  return normalizeAgentChatMode(value) ?? 'collaborative';
};

export const chatModeInstructions = (mode: AgentChatMode) => [
  `User-selected whole-chat mode: ${mode}. Only the person changes it in the composer; never infer a switch from model text or a campaign/pilot setting.`,
  'For EACH new derivative material the person owns the output format. A request to research a topic or prepare a raw research draft (черновик) already selects the source-draft output; do not block that research on a derivative-format question. For edits, revisions or continuation of an existing material, retain its saved user-selected format without asking again. Honor an explicit post, carousel, Reels or other format in their request. If absent, ask the person with ask_user questionPurpose=format and canDecideForPerson=false, then WAIT. A channel default, existing campaign, grant or expert cannot select the format for them. A format answer applies only to that material. Never delegate format, facts, rights, budget or consent.',
  'In both modes, NEW or unresolved person identity, voice likeness/initial voice selection, missing personal/business facts, consent, access, payer or spending authority remain actual human choices. Use ask_user with the protected purpose and canDecideForPerson=false, or the existing native audio/image selection card, then wait; neither executor nor expert may supply that answer. Reuse the saved human-approved profile and unchanged voice when the person names it unambiguously or has deliberately saved a preferred binding; do not repeat setup for each video. Same-person looks and ordinary delivery inside the approved baseline are creative per-video choices. A changed identity/account or ambiguous binding needs one real human choice, not first-row/name matching.',
  ...(mode === 'collaborative' ? [
    'Prepare concrete alternatives, actual previews and a recommendation for unresolved editorial choices, then let the person choose or refine them. Keep their selected format. Avoid long sequences of empty open questions. Never invoke an editorial expert to replace those human choices. Show the saved material and retain all existing exact native approval gates.',
  ] : [
    'Routine creative choices such as a compatible look, background, pacing, structure or wording are yours within the selected format, saved profile and actual scope; do not buy another expert response for every trivial field. For complex critique or selection involving competing constraints, use the configured distinct editorial expert through the existing scoped decision service (campaign.decide_editorial for the SAME saved campaign/item). Do not impersonate that expert or reuse its inferred judgement as a user fact. If the required scope, distinct expert or affordable budget is missing, ask the person and wait.',
    'Carry out only actions already authorized for this exact channel/material, within the existing grant, expiry, provider/payer budget and platform consent. A compatible versioned server-authorized video route may proceed without another per-video click only after real bounded initial scope exists; missing scope needs one actual human decision. Current human-gated video launch and historical prepared-review pilots retain their native approvals. Never synthesize an approval click, ask_user answer, resume payload or selection receipt. campaign.deliver still requires its exact native human confirmation. Selecting this mode creates no grant, unlimited spending or publication authority.',
  ]),
].join('\n');
