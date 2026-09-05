/**
 * Which model a call gets, decided by what the call is for.
 *
 * Until `content-factory-next-x63z` every text call in the product resolved to
 * one configured model. Classifying a research subject — one sentence in,
 * five fields out — was billed at the price of writing a whole draft, and the
 * ceiling on what an included workspace could cost us was set by the most
 * expensive operation in the product. There was no lever at all: the model id
 * was read at the call site, so no setting could move it.
 *
 * The lever is a role. A call says what it is doing; this file, and only this
 * file, turns that into a model id. The names of the models stay where they
 * belong — in the organization's own setting beside `textModel` — because
 * model ids change every few months and a tenant's provider may not be ours.
 * Nothing in this repository is allowed to hold a table of them.
 *
 * Deliberately importless. `ai.provider.config.ts` needs the parser and the
 * types, `ai.clients.ts` needs the chooser, and `ai.usage.service.ts` needs
 * both; a single import in the other direction would close a cycle through
 * three modules that every AI operation loads.
 */

/**
 * The roles, by what the call is doing rather than by which screen asked.
 *
 * Six, not more: a role only earns its place when some call really wants a
 * different model from its neighbour, and a role nobody can point at is a row
 * on the settings screen that teaches a person nothing. Assembling a brief is
 * absent for that reason — `content-brief.compose.ts` calls no model at all.
 *
 *  - `classify` — a label or a small structured verdict from a short input:
 *    the research subject, content classification. The cheapest work here.
 *  - `extract` — pulling what is already in a given text back out of it:
 *    page text, splitting a body into posts, reading a voice off samples.
 *  - `research` — the web-research fallback that both searches and answers.
 *  - `draft` — writing something a person will read: posts, slides, prompts.
 *  - `judge` — weighing or repairing a draft against the workspace's voice.
 *  - `image` — generating a picture.
 */
export const AI_ROLES = [
  'classify',
  'extract',
  'research',
  'draft',
  'judge',
  'image',
] as const;

export type AiRole = (typeof AI_ROLES)[number];

/**
 * What a call gets when nothing says otherwise. The most capable text role, on
 * purpose: an unrouted call that silently landed on the cheapest model would
 * degrade an answer nobody chose to make cheaper, and the failure would show
 * up as bad writing rather than as a missing route.
 */
export const DEFAULT_AI_ROLE: AiRole = 'draft';

/** The roles billed against the image model rather than the text one. */
const IMAGE_ROLES: ReadonlySet<string> = new Set<AiRole>(['image']);

export const isAiRole = (value: unknown): value is AiRole =>
  typeof value === 'string' && (AI_ROLES as readonly string[]).includes(value);

/** A model id per role. Every entry optional: absent means «the default». */
export type AiRoleModels = Partial<Record<AiRole, string>>;

/**
 * Long enough for the longest namespaced OpenRouter id with room to spare,
 * short enough that a paste of something else is refused rather than stored.
 * The settings DTO holds the same number so the door and the reader agree.
 */
export const MAX_ROLE_MODEL_LENGTH = 100;

/**
 * Read a stored role map defensively.
 *
 * It arrives as a JSON column, so nothing about its shape is guaranteed: an
 * older row, a hand-edited one, or a role this build no longer knows. An
 * unusable entry is dropped rather than repaired, because the fallback — the
 * workspace's own text model — is always a working answer, while a truncated
 * or coerced model id is a request the provider rejects at generation time,
 * far away from here.
 */
export const parseRoleModels = (raw: unknown): AiRoleModels => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed: AiRoleModels = {};
  for (const [role, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isAiRole(role) || typeof value !== 'string') continue;
    const model = value.trim();
    if (!model || model.length > MAX_ROLE_MODEL_LENGTH) continue;
    parsed[role] = model;
  }
  return parsed;
};

/** The part of a resolved configuration this file reads, and nothing else. */
export interface RoleModelSource {
  textModel: string;
  imageModel: string;
  roleModels?: AiRoleModels;
}

/**
 * The one place a role becomes a model id.
 *
 * `tests/ai-role-routing.guard.test.cjs` keeps it that way: no other file
 * under `openai/` or `content-intelligence/` may read `textModel` or
 * `imageModel` at all.
 */
export const modelFor = (role: AiRole, source: RoleModelSource): string =>
  source.roleModels?.[role] ||
  (IMAGE_ROLES.has(role) ? source.imageModel : source.textModel);

/**
 * The role an admitted operation runs under when its caller names none.
 *
 * Every existing call site keeps working and keeps its old model, because the
 * text operations map to `draft`, which falls back to `textModel` — the model
 * they were already getting. Routing one of them somewhere cheaper is then a
 * setting, made once, rather than an edit to the call.
 */
const ROLE_BY_OPERATION: Record<string, AiRole> = {
  text_generation: 'draft',
  image_generation: 'image',
  web_research: 'research',
  copilot_chat: 'draft',
  agent: 'draft',
  autopost: 'draft',
  content_classification: 'classify',
  brand_profile_assist: 'extract',
};

export const roleForOperation = (operation: string): AiRole =>
  ROLE_BY_OPERATION[operation] ?? DEFAULT_AI_ROLE;

/**
 * Everything about a configuration that decides which model a call reaches,
 * flattened for the client memo keys in `ai.clients.ts`.
 *
 * It lives here rather than there so `ai.clients.ts` needs no model name of
 * its own — otherwise the cache key would be the one line in that file still
 * reading `textModel`, and the guard could not tell it from a call site that
 * had quietly gone back to choosing for itself.
 */
export const roleModelFingerprint = (source: RoleModelSource): string =>
  [
    source.textModel,
    source.imageModel,
    AI_ROLES.map((role) => `${role}=${source.roleModels?.[role] ?? ''}`).join(
      ','
    ),
  ].join('|');
