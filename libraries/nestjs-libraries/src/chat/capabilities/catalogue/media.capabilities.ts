import { z } from 'zod';
import { MediaController } from '@contentfactory/backend/api/routes/media.controller';
import { MediaService } from '@contentfactory/nestjs-libraries/database/prisma/media/media.service';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import {
  DEFAULT_IMAGE_STYLE,
  IMAGE_STYLES,
  imagePromptBody,
} from '@contentfactory/nestjs-libraries/database/prisma/media/image-prompt';
import { defineCapability, door, type CapabilityRunContext } from '../capability.types';
import type { ChatPictureType, LibraryUploadReceiptV1 } from '../agent-parts.contract';
import { codedFailure, markUnspent, unspentFailure } from './selection';

/**
 * Media from the chat (spec §5.2 «Media», §5.9, `content-factory-next-kcxz.25`).
 *
 * The media library («Медиатека») holds the workspace's pictures. Three
 * things reach it from the chat, each through the door its screen calls:
 *
 * - reading it (`media.library`, `MediaController.getMedia`, any member);
 * - a picture attached in the composer: the browser uploads it itself through
 *   the library's own request (`POST /media/upload-simple`) and the message
 *   carries only a receipt (`AGENT_MEDIA_PART_TYPE`: ids, names, types) — the
 *   file never passes through the chat door or the model. Not a capability:
 *   the chat door checks the receipt (`agent-chat.request.ts`);
 * - generating one (`media.generate`, `MediaController.generateImageFromText`,
 *   an editor's; paid).
 *
 * A library picture goes on a post with `adaptation.image` (kcxz.14), by id;
 * the server takes the file from the library itself.
 */

/** A stored file's picture type, read off the name the server gave it. */
const PICTURE_TYPES: ReadonlyArray<[RegExp, ChatPictureType]> = [
  [/\.png$/i, 'image/png'],
  [/\.jpe?g$/i, 'image/jpeg'],
  [/\.webp$/i, 'image/webp'],
  [/\.gif$/i, 'image/gif'],
];
const pictureTypeOf = (...names: Array<string | null | undefined>): ChatPictureType | null => {
  for (const name of names) {
    const found = PICTURE_TYPES.find(([pattern]) => pattern.test(String(name ?? '')));
    if (found) return found[1];
  }
  return null;
};

/**
 * The chat door's check of a pictures receipt (`kcxz.25`), as
 * `avatarInWorkspace` is for a samples receipt: every id must be a live
 * library item of the caller's workspace, and a picture. The answer is the
 * receipt as the library's rows say it (review W4-25 F3) — the name as
 * uploaded and the type of the file the server stored (the upload detects it
 * by its bytes) — in the order the browser sent; `null` refuses the message.
 */
export const mediaReceiptInWorkspace = async (
  service: CapabilityRunContext['service'],
  identity: Pick<CapabilityRunContext, 'organizationId'>,
  ids: readonly string[]
): Promise<LibraryUploadReceiptV1['media'] | null> => {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return null;
  const found = (await service(MediaService).mediaInWorkspace(identity.organizationId, wanted)) as Array<{
    id: string;
    name: string;
    originalName: string | null;
    path: string;
  }>;
  const media: LibraryUploadReceiptV1['media'] = [];
  for (const id of wanted) {
    const row = found.find((one) => one.id === id);
    const type = row ? pictureTypeOf(row.name, row.path) : null;
    if (!row || !type) return null;
    media.push({ id, name: cut(row.originalName || row.name, NAME_MAX), type });
  }
  return media;
};

/** The media card opens «Медиатека» beside the chat; there is one. */
export const MEDIA_CARD_ID = 'library';
const mediaCard = () => ({ kind: 'media' as const, id: MEDIA_CARD_ID });

/** One page of the library door, the most the model is shown. */
const LIBRARY_MAX = 18;
const NAME_MAX = 120;
/** What a video looks like in the library: the uploader saves no kind. */
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;

const cut = (text: string | null | undefined, max: number) => {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

type LibraryRow = { id: string; name: string; originalName: string | null; path: string };

export const mediaLibrary = defineCapability({
  id: 'media.library',
  group: 'media',
  label: { ru: 'Медиатека', en: 'Media library' },
  description:
    'Read the workspace media library («Медиатека»), newest first: each item’s media id, its name as uploaded, and whether it is an image or a video. `search` narrows by name. The id is what adaptation.image takes to put a picture on a post. A picture the person attached to a message in this chat is already there (its id is in the message). A picture attached in an outside assistant (Claude, ChatGPT) does not reach Content Factory: ask the person to upload it in «Медиатека» (/media) — then find it here by name and put it on the post. Free. The library opens beside the chat; name at most the few that matter.',
  input: z.object({
    search: z.string().trim().min(1).max(100).optional().describe('Part of a file name, only when the person named one'),
    limit: z.number().int().min(1).max(LIBRARY_MAX).optional().describe('How many, 10 if unnamed'),
  }),
  risk: 'read',
  card: 'media',
  door: door(MediaController, 'getMedia'),
  // File names are whatever the uploader's computer called them.
  untrusted: ['uploaded-file'],
  run: async (ctx, input) => {
    const page = (await ctx
      .service(MediaService)
      .recentMedia(ctx.organizationId, input.search)) as unknown as {
      pages: number;
      results: LibraryRow[];
    };
    const rows = page.results ?? [];
    const items = rows.slice(0, input.limit ?? 10).map((row) => {
      const name = row.originalName || row.name;
      return {
        id: row.id,
        name: cut(name, NAME_MAX),
        kind: VIDEO.test(name) || VIDEO.test(row.path) ? ('video' as const) : ('image' as const),
      };
    });
    return { items, more: rows.length > items.length || page.pages > 1 };
  },
  summarize: (output) => ({ ...output }),
  cardOf: mediaCard,
});

/* ---- Keeping a picture the agent looked at --------------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The card: the person's browser, which still holds the picture, puts it into
 * the library through the library's own request and answers with its id.
 */
export const keepPictureQuestion = z.object({
  kind: z.literal('keep-picture'),
  question: z.string(),
  /** The key the browser keeps the picture under (`pictureKey` of its line). */
  pictureKey: z.string().regex(UUID),
  canDecideForPerson: z.literal(false),
});
export const keepPictureAnswer = z.object({
  kept: z.boolean(),
  /** The library id the upload answered, when kept. */
  mediaId: z.string().regex(UUID).optional(),
  /** The page no longer holds the picture (reloaded, another tab). */
  gone: z.boolean().optional(),
});

const KEEP_TEXT = {
  ru: 'Положить эту картинку в медиатеку пространства? Её увидят все участники — так её можно поставить к посту.',
  en: 'Put this picture into the workspace media library? Every member will see it — that is how it goes on a post.',
};

type Kept = {
  kept: boolean;
  mediaId: string | null;
  name: string | null;
  message: string;
};

/**
 * A picture the person showed the agent (owner decision 28.09.2026, «агент
 * видит картинки»), put into the library so it can go on a post. The server
 * never had the picture: the browser that sent it keeps it (`pictureKey`),
 * uploads it through the library's own request when the person agrees on the
 * card, and answers with the library id — which is checked like a receipt:
 * a live picture of this workspace, or nothing is kept.
 */
export const mediaKeep = defineCapability({
  id: 'media.keep',
  group: 'media',
  label: { ru: 'Положить картинку в медиатеку', en: 'Put a picture into the library' },
  description:
    'Put a picture the person attached for you to look at into the workspace media library, so it can go on a post — only when they want it on a post or kept («поставь её к посту», «сохрани в медиатеку»). Pass the picture’s `pictureKey` from its line. The person’s browser still holds the picture: a card asks them, the browser uploads it and answers with the media id. Then — without asking — adaptation.image with that id. When the page no longer holds it, ask them to attach it again.',
  input: z.object({
    pictureKey: z.string().regex(UUID).describe('The `pictureKey` of the picture’s line in the message'),
  }),
  risk: 'input',
  card: 'media',
  door: door(MediaController, 'uploadSimple'),
  untrusted: [],
  suspendSchema: keepPictureQuestion,
  resumeSchema: keepPictureAnswer,
  run: async (ctx, input): Promise<Kept | undefined> => {
    const answer = keepPictureAnswer.safeParse(ctx.resumeData);
    if (!answer.success) {
      if (!ctx.suspend) {
        throw codedFailure(
          'INPUT_NEEDS_PERSON',
          'Only the person’s browser holds the picture: it is kept from the web chat. Nothing was done.'
        );
      }
      await ctx.suspend({
        kind: 'keep-picture',
        question: KEEP_TEXT[ctx.language],
        pictureKey: input.pictureKey,
        canDecideForPerson: false,
      } satisfies z.infer<typeof keepPictureQuestion>);
      return undefined;
    }
    if (answer.data.gone) {
      return {
        kept: false,
        mediaId: null,
        name: null,
        message:
          'Not kept: the person’s page no longer holds this picture (reloaded or another tab). Ask them in one line to attach it again with «для поста».',
      };
    }
    // «Kept» without the id is not a «no» (review W4-25 vision F9): the
    // door refuses it, and a call that gets one anyway keeps nothing.
    if (answer.data.kept && !answer.data.mediaId) {
      throw codedFailure(
        'ADAPTATION_MEDIA_UNKNOWN',
        'The browser said the picture was kept but named no library id; nothing was kept.'
      );
    }
    if (!answer.data.kept || !answer.data.mediaId) {
      return {
        kept: false,
        mediaId: null,
        name: null,
        message: 'Not kept: the person chose not to put it into the library. Say in one line that it stays unsaved.',
      };
    }
    // The browser's answer is checked like a receipt: a live picture of this
    // workspace, by the library's own row.
    const [row] =
      (await mediaReceiptInWorkspace(ctx.service, ctx, [answer.data.mediaId])) ?? [];
    if (!row) {
      throw codedFailure(
        'ADAPTATION_MEDIA_UNKNOWN',
        'The id the browser answered is not a picture in this workspace’s library; nothing was kept.'
      );
    }
    return {
      kept: true,
      mediaId: row.id,
      name: row.name,
      message: 'Kept in the media library. If it is for a post, put it there now with adaptation.image and this mediaId, without asking.',
    };
  },
  summarize: (output) => ({
    kept: output.kept,
    ...(output.mediaId ? { mediaId: output.mediaId } : {}),
    message: output.message,
  }),
  cardOf: (output) => (output.kept ? mediaCard() : null),
});

/* ---- Generating ------------------------------------------------------------ */

/** The person's own words about the picture, at most. */
const DESCRIPTION_MAX = 1000;
/** How much of the post describes the picture when the person said nothing. */
const POST_TEXT_MAX = 1500;

/**
 * The refusals an AI admission answers before its operation runs: the
 * allowance, the credentials, a busy ledger. A picture is one operation —
 * the picture prompt and the drawing admitted once, before the prompt call
 * (owner 28.09.2026, `kcxz.44`) — so each of these means «nothing spent».
 */
const ADMISSION_REFUSALS = new Set([
  'AI_INCLUDED_QUOTA_EXHAUSTED',
  'AI_SELECTED_CREDENTIAL_UNAVAILABLE',
  'AI_ADMISSION_CONTENDED',
]);
/** A product check that refused before any provider request (`configurationRefusal`). */
const configurationRefusal = (error: unknown) =>
  !!error && typeof error === 'object' && (error as { configurationRefusal?: unknown }).configurationRefusal === true;

/** The code of a thrown error, own or a door's `HttpException({ code })`. */
const codeOf = (error: unknown): string | null => {
  const own = (error as { code?: unknown })?.code;
  if (typeof own === 'string') return own;
  const response = (error as { getResponse?: () => unknown })?.getResponse?.();
  const code = (response as { code?: unknown })?.code;
  return typeof code === 'string' ? code : null;
};
const statusOf = (error: unknown): number | null => {
  const status = (error as { getStatus?: () => unknown })?.getStatus?.();
  return typeof status === 'number' ? status : null;
};

/**
 * A failed generation in the chat's words (review W4-25 F1, F10). The paid
 * step is given back only for a refusal that came before anything was
 * admitted; a known code is passed on as it is, never folded into «failed».
 */
const pictureFailure = (error: unknown) => {
  const code = codeOf(error);
  const message = String((error as Error)?.message || code || '');
  if ((code && ADMISSION_REFUSALS.has(code)) || configurationRefusal(error)) {
    return markUnspent(codedFailure(code ?? 'AI_SELECTED_CREDENTIAL_UNAVAILABLE', message));
  }
  // The provider's safety system (`generationError`, 422): paid and refused.
  if (statusOf(error) === 422) {
    return codedFailure(
      'MEDIA_IMAGE_REJECTED',
      'The AI refused to draw this picture (its safety rules). Nothing was saved; describe it differently.'
    );
  }
  if (code) return codedFailure(code, message);
  return codedFailure('MEDIA_IMAGE_FAILED', 'The picture could not be made; nothing was saved.');
};

/** The adaptation's own text: what the picture is for, read by id. */
const postText = async (ctx: CapabilityRunContext, pieceId: string, adaptationId: string) => {
  let detail: { adaptations?: Array<{ id: string; body?: string | null }> };
  try {
    detail = (await ctx.service(PieceService).detail(ctx.organizationId, pieceId, ctx.language)) as typeof detail;
  } catch (error) {
    throw codeOf(error) === 'PIECE_NOT_FOUND' ? markUnspent(error) : error;
  }
  const row = (detail?.adaptations ?? []).find((one) => one.id === adaptationId);
  if (!row) {
    throw unspentFailure(
      'ADAPTATION_NOT_FOUND',
      'There is no such adaptation of this piece in this workspace; no picture was made and nothing was spent.'
    );
  }
  return String(row.body ?? '').trim().slice(0, POST_TEXT_MAX);
};

type Generated = {
  mediaId: string;
  name: string;
  style: string;
  /** Who described the picture: the person, the post, or both. */
  describedBy: 'person' | 'post' | 'person-and-post';
  forAdaptation: { pieceId: string; adaptationId: string } | null;
};

export const mediaGenerate = defineCapability({
  id: 'media.generate',
  group: 'media',
  label: { ru: 'Сгенерировать картинку', en: 'Generate a picture' },
  description:
    'Generate a picture with AI into the media library, as the post editor’s «Сгенерировать картинку» does. Paid — one AI operation a picture — and runs without asking. For a picture for a post pass `pieceId` and `adaptationId`: when the person only said «сделай картинку», the post’s own text describes it — do not ask what to draw. `description` only with the person’s own words about the picture. `style` only when they named one (else Realistic). Returns the new `mediaId`; when the picture is for a post, then — after this answered, without asking — put it on the post with adaptation.image and that `mediaId`. The picture opens in the library beside the chat.',
  input: z.object({
    description: z
      .string()
      .trim()
      .min(1)
      .max(DESCRIPTION_MAX)
      .optional()
      .describe('What the picture shows, in the person’s words; absent when they did not describe it'),
    pieceId: z.string().min(1).max(128).optional().describe('The piece of the post the picture is for'),
    adaptationId: z
      .string()
      .min(1)
      .max(128)
      .optional()
      .describe('The adaptation (post) the picture is for, from piece.open'),
    style: z.enum(IMAGE_STYLES).optional().describe('Only when the person named a style'),
  }),
  risk: 'paid',
  card: 'media',
  door: door(MediaController, 'generateImageFromText'),
  untrusted: [],
  run: async (ctx, input): Promise<Generated> => {
    // Everything that can be refused is refused before anything is admitted:
    // the message's paid step is given back (review W4-23 F2).
    if (input.adaptationId && !input.pieceId) {
      throw unspentFailure(
        'MEDIA_PROMPT_MISSING',
        'An adaptation is named with its piece: pass pieceId too. No picture was made and nothing was spent.'
      );
    }
    const forAdaptation =
      input.pieceId && input.adaptationId
        ? { pieceId: input.pieceId, adaptationId: input.adaptationId }
        : null;
    const post = forAdaptation
      ? await postText(ctx, forAdaptation.pieceId, forAdaptation.adaptationId)
      : '';
    const words = input.description?.trim() ?? '';
    if (!words && !post) {
      throw unspentFailure(
        'MEDIA_PROMPT_MISSING',
        'There is nothing to draw from: no words about the picture and no post text. No picture was made and nothing was spent.'
      );
    }
    const style = input.style ?? DEFAULT_IMAGE_STYLE;
    const description = [words, post].filter(Boolean).join('\n\n');

    // One picture is one AI operation (`kcxz.44`): its admission — before
    // the picture prompt is written — is the allowance check, and its
    // refusal gives the step back (`pictureFailure`). One operation left is
    // enough.
    let saved: false | { id: string; name: string };
    try {
      saved = (await ctx
        .service(MediaService)
        .generateImageIntoLibraryFor(ctx.organizationId, imagePromptBody(description, style))) as typeof saved;
    } catch (error) {
      throw pictureFailure(error);
    }
    if (!saved) {
      // The door's own `false`: the image credits of the plan are spent,
      // checked before any operation was admitted.
      throw unspentFailure(
        'MEDIA_IMAGE_CREDITS_EXHAUSTED',
        'The picture credits of this plan are spent this month; no picture was made and nothing was spent.'
      );
    }
    return {
      mediaId: saved.id,
      name: saved.name,
      style,
      describedBy: words && post ? 'person-and-post' : words ? 'person' : 'post',
      forAdaptation,
    };
  },
  summarize: (output) => ({ ...output }),
  cardOf: mediaCard,
});
