const { createServer } = require('node:http');
const { Readable } = require('node:stream');
const { mkdtemp, writeFile, rm, access } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'cf-multipart-test-'));
  const path = join(directory, 'spooled-video');
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 7, 9);
  await writeFile(path, bytes);
  const dispose = jest.fn(async () => rm(path, { force: true }));
  const helper = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/integrations/social/media-upload-sources.ts',
    {
      '@contentfactory/helpers/utils/media.source': {
        spoolMediaSource: async () => ({ path, size: bytes.length, dispose }),
      },
      // This test owns its synthetic loopback server; provider production retains its dispatcher.
      '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': {
        getSsrfSafeDispatcher: () => undefined,
      },
    }
  );
  try {
    await run({ path, bytes, dispose, helper });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function endpoint(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/upload`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('real Node HTTP sends disk-backed multipart content and signed fields before releasing the spool', async () =>
  fixture(async ({ path, bytes, dispose, helper }) => {
    let received;
    await endpoint(
      async (req, res) => {
        try {
          const body = await new Response(Readable.toWeb(req), {
            headers: { 'content-type': req.headers['content-type'] },
          }).formData();
          received = {
            key: body.get('key'),
            filename: body.get('video_file').name,
            type: body.get('video_file').type,
            bytes: Buffer.from(await body.get('video_file').arrayBuffer()),
          };
          res.writeHead(201).end('accepted');
        } catch {
          res.writeHead(400).end();
        }
      },
      async (url) => {
        const opened = await helper.openMediaUploadBlobs([
          { path: 'https://synthetic.invalid/video.mp4', type: 'video/mp4' },
        ]);
        try {
          const form = new FormData();
          form.append('key', 'signed-synthetic-key');
          form.append('video_file', opened.files[0].blob, 'video.mp4');
          const response = await helper.mediaUploadFetch(url, {
            method: 'POST',
            body: form,
          });
          expect(response.status).toBe(201);
          await response.body.cancel();
          await expect(access(path)).resolves.toBeUndefined();
          expect(dispose).not.toHaveBeenCalled();
          expect(received).toMatchObject({
            key: 'signed-synthetic-key',
            filename: 'video.mp4',
            type: 'video/mp4',
          });
          expect(received.bytes.equals(bytes)).toBe(true);
        } finally {
          await opened.close();
        }
      }
    );
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(access(path)).rejects.toThrow();
  }));

test.each(['abort', 'reject'])(
  'real Node multipart %s releases its spool and does not retry the request',
  async (mode) =>
    fixture(async ({ path, dispose, helper }) => {
      let calls = 0;
      const abort = new AbortController();
      await endpoint(
        (req, res) => {
          calls++;
          req.once('data', () => {
            if (mode === 'abort') abort.abort();
            else res.writeHead(503).end('private provider body');
          });
          req.resume();
        },
        async (url) => {
          const opened = await helper.openMediaUploadBlobs([
            { path: 'https://synthetic.invalid/video.mp4' },
          ]);
          try {
            const form = new FormData();
            form.append('file', opened.files[0].blob, 'video.mp4');
            await expect(
              helper.mediaUploadFetch(url, {
                method: 'POST',
                body: form,
                signal: abort.signal,
              })
            ).rejects.toThrow();
          } finally {
            await opened.close();
          }
        }
      );
      expect(calls).toBe(1);
      expect(dispose).toHaveBeenCalledTimes(1);
      await expect(access(path)).rejects.toThrow();
    })
);
