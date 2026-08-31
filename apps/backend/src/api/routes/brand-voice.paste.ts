import { json } from 'express';
import { VOICE_SAMPLE_PASTE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The pasted-text route's own body ceiling, held to one number in one place.
 *
 * The first pass at this ticket (`content-factory-next-vme.10`) tried to hold
 * the ceiling in a Nest guard, downstream of a parser given twice the ceiling
 * for headroom. That left a gap rather than closing one: `json()` is
 * middleware and runs before Nest routing, so a body over the parser's own
 * limit — the case above 8 MB, not the 4–8 MB the guard covered — never
 * reached the guard at all and got express's own bare
 * `{"statusCode":413,"message":"request entity too large"}`, no code, which
 * is exactly the refusal this ticket exists to remove. A live pass against
 * the running backend caught it; the field is retired rather than widened
 * again, because a range is not a ceiling.
 *
 * The fix moves the ceiling into the parser itself instead of past it: the
 * limit given to `json()` below IS `VOICE_SAMPLE_PASTE_LIMITS.maxBodyBytes`,
 * not a multiple of it, so there is no size a request can be that the parser
 * and the product disagree about. Two checks close the two ways a body can be
 * over that ceiling: `Content-Length`, read before a byte is parsed, catches
 * a request that states its own size, the cheap and common case; `json()`'s
 * own `entity.too.large` error, caught here instead of left to Express's
 * default handler, catches a chunked request that never gave a length and
 * turned out too large anyway.
 *
 * A Nest guard cannot do either of these — it only runs after the parser has
 * already succeeded or failed, so it can only re-check a body that got
 * through. `VoiceUploadBatchGuard` on the file route beside this one is a
 * different case rather than a precedent to follow here: multer buffers per
 * file rather than parsing one JSON body, so there is no single parser call
 * for a guard to be downstream of. The paste route has exactly one, and this
 * is that call — `main.ts` mounts `createVoicePasteBodyLimiter()` on it and
 * nothing else.
 */

const REFUSAL = { code: 'VOICE_PAYLOAD_TOO_LARGE' } as const;

const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

export const PASTE_MESSAGES = {
  bodyBytes: `Партия текста больше ${megabytes(
    VOICE_SAMPLE_PASTE_LIMITS.maxBodyBytes
  )} МБ. Разделите вставку на несколько заходов.`,
} as const;

type MinimalResponse = {
  status: (code: number) => { json: (body: unknown) => void };
};

/**
 * The one place the refusal's body is built.
 *
 * Both ways a request can be over the ceiling — a stated `Content-Length` and
 * a parser that found out mid-stream — answer through this, so they cannot
 * drift into two different shapes for the same code.
 */
export function refuseVoicePasteTooLarge(res: MinimalResponse): void {
  res.status(413).json({ ...REFUSAL, message: PASTE_MESSAGES.bodyBytes });
}

/**
 * The middleware `main.ts` mounts on `/content-intelligence/voice/samples`.
 *
 * A factory rather than wired inline in `main.ts`, so a test can mount the
 * real thing on a real `express()` app and send it real requests. A regular
 * expression over `main.ts`'s source proved nothing about whether the batch
 * route beside this one (`/samples/files`, its own forty-megabyte ceiling)
 * was still reachable once this one was narrowed — that gap is exactly what
 * a behavioural test closes and a source-scan cannot.
 */
export function createVoicePasteBodyLimiter() {
  const limit = VOICE_SAMPLE_PASTE_LIMITS.maxBodyBytes;
  const parse = json({ limit });

  return function voicePasteBodyLimiter(req: any, res: any, next: any) {
    // Express strips the matched prefix from `req.url` for a path mounted
    // this way: '/' for the exact route, '/files' for the multipart one
    // beside it. That route holds its own batch ceiling and must never be
    // narrowed to this one's — checked directly against a running server in
    // `tests/brand-voice.paste-ceiling.test.cjs` rather than assumed.
    //
    // The query string survives that stripping, so this compares the path
    // alone. Comparing `req.url` whole made `/samples?retry=1` read as a
    // different route, fall through, and land on express's own 100 KB
    // default — the bare unnamed 413 this file exists to remove, reachable
    // by adding a single query parameter to the route it protects.
    const pathname = String(req.url ?? '').split('?')[0];
    if (pathname !== '/' && pathname !== '') {
      next();
      return;
    }

    const declared = Number(req.headers?.['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > limit) {
      // The client is still sending a body nobody here is going to read.
      // Draining it — Node's documented way to "quickly exhaust a stream's
      // data" — is what keeps a large, already-doomed upload from backing up
      // against a response it never makes room for.
      req.resume();
      refuseVoicePasteTooLarge(res);
      return;
    }

    parse(req, res, (error: any) => {
      if (error && error.type === 'entity.too.large') {
        refuseVoicePasteTooLarge(res);
        return;
      }
      next(error);
    });
  };
}
