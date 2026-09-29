import { json } from 'express';
import { AGENT_ATTACHMENTS_TOTAL_MAX_BYTES } from '@contentfactory/nestjs-libraries/chat/capabilities/agent-parts.contract';

/**
 * The chat door's own JSON body ceiling (review W4-25 vision F1).
 *
 * Without it `POST /agent/chat` got express's 100 KB default, so a message
 * with a screenshot — the main path of «агент видит картинки» — met a bare
 * 413 before `parseAgentChatBody` ever ran. The ceiling is sized from the
 * door's own bounds rather than picked: the pictures of one message together
 * (`AGENT_ATTACHMENTS_TOTAL_MAX_BYTES`, decoded) as base64, which is 4/3 of
 * that, plus room for the words, the filenames and the JSON around them.
 * The door itself still checks every bound on the parsed body; this only
 * lets a body the door would take reach it, and refuses one it never could
 * with the chat's own code instead of express's.
 *
 * Mounted like `createVoicePasteBodyLimiter` (`brand-voice.paste.ts`), ahead
 * of Nest's own parser, on the exact route only: the thread doors beside it
 * keep the default.
 */
/**
 * Everything but the files: 20,000 characters of words escaped as JSON, five
 * filenames, a card's answer (8 KB) and the envelope — well under this.
 */
const ENVELOPE_BYTES = 1024 * 1024;

/** About 14.3 MB: 10 MB of pictures as base64, and the envelope. */
export const AGENT_CHAT_MAX_BODY_BYTES =
  Math.ceil((AGENT_ATTACHMENTS_TOTAL_MAX_BYTES * 4) / 3) + ENVELOPE_BYTES;

type MinimalResponse = {
  status: (code: number) => { json: (body: unknown) => void };
};

const refuse = (res: MinimalResponse) =>
  res.status(413).json({
    code: 'AGENT_BAD_REQUEST',
    message: 'The message is bigger than the chat takes.',
  });

export function createAgentChatBodyLimiter() {
  const limit = AGENT_CHAT_MAX_BODY_BYTES;
  const parse = json({ limit });

  return function agentChatBodyLimiter(req: any, res: any, next: any) {
    // Express strips the mounted prefix: '/' is the chat door itself.
    const pathname = String(req.url ?? '').split('?')[0];
    if (pathname !== '/' && pathname !== '') {
      next();
      return;
    }
    const declared = Number(req.headers?.['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      refuse(res);
      return;
    }
    parse(req, res, (error: any) => {
      if (error && error.type === 'entity.too.large') {
        refuse(res);
        return;
      }
      next(error);
    });
  };
}
