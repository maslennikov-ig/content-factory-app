import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { buildHyperframesBundleV1 } from '../providers/composition/hyperframes-bundle.v1';
import { measureMp4VideoV1 } from '../production/video-production-result.v1';
import type { LocalReelConfigV1, LocalReelInputV1, LocalReelResultV1, LocalReelSceneResultV1, LocalReelSceneV1 } from './local-reel.v1';

const execute = promisify(execFile);
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const reject = (reason: string): never => { throw new Error('LOCAL_REEL_' + reason); };
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const inside = (root: string, path: string) => { const rel = relative(root, path); return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel); };
const VERSION = 'local-reel.v1.3';
// Reserved DNS name is intercepted with owned bytes. Chromium never resolves or fetches it.
const OWNED_ORIGIN = 'https://cf-owned.example/';
type Prepared = { scene: LocalReelSceneV1; html: string; key: string; image?: Buffer };

/** Silent text/image export only. Paid providers, arbitrary HTML and remote media cannot enter this port. */
export class LocalReelRendererV1 {
  private readonly running = new Map<string, Promise<LocalReelResultV1>>();
  constructor(private readonly config: LocalReelConfigV1) {
    for (const path of [config.cacheRoot, config.chromiumExecutable, config.ffmpegExecutable, ...config.allowedAssetRoots]) {
      if (!isAbsolute(path)) reject('SERVER_CONFIG_INVALID');
    }
  }

  async render(raw: LocalReelInputV1): Promise<LocalReelResultV1> {
    // Snapshot before async work, including optional fields. JSONB field order does not affect keys below.
    let input: LocalReelInputV1;
    try { input = JSON.parse(JSON.stringify(raw)); } catch { return reject('INPUT_INVALID'); }
    if (!input || typeof input.organizationId !== 'string' || !input.organizationId || input.organizationId.length > 160 ||
      !input.source || typeof input.source.pieceId !== 'string' || !input.source.pieceId || !sha(input.source.revision) || !sha(input.source.textSha256) ||
      typeof input.title !== 'string' || input.title.length > 500 || typeof input.locale !== 'string' ||
      !Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 20) reject('INPUT_INVALID');
    const ids = new Set<string>(); let duration = 0;
    const prepared: Prepared[] = [];
    const fingerprint = await Promise.all([this.config.chromiumExecutable, this.config.ffmpegExecutable].map(async p => {
      const resolved = await realpath(p); const s = await stat(resolved); return [resolved, s.size, s.mtimeMs];
    }));
    for (const scene of input.scenes) {
      if (!scene || !/^[A-Za-z0-9_-]{1,160}$/.test(scene.id) || ids.has(scene.id) ||
        !Number.isFinite(scene.durationSeconds) || scene.durationSeconds < 1 || scene.durationSeconds > 90 ||
        Math.abs(scene.durationSeconds * 30 - Math.round(scene.durationSeconds * 30)) > 0.00001) reject('SCENE_INVALID');
      ids.add(scene.id); duration += scene.durationSeconds;
      if (scene.captions !== undefined && (!Array.isArray(scene.captions) || scene.captions.length > 50 || scene.captions.some(c =>
        !c || !Number.isFinite(c.startSeconds) || !Number.isFinite(c.endSeconds) ||
        Math.abs(c.startSeconds * 30 - Math.round(c.startSeconds * 30)) > 0.00001 || Math.abs(c.endSeconds * 30 - Math.round(c.endSeconds * 30)) > 0.00001))) reject('CAPTION_LIMIT');
      if ((scene.title !== undefined && (typeof scene.title !== 'string' || scene.title.length > 500)) ||
        (scene.text !== undefined && (typeof scene.text !== 'string' || scene.text.length > 5000)) ||
        (!scene.title?.trim() && !scene.text?.trim() && !scene.image && !scene.captions?.length)) reject('SCENE_INVALID');
      // The bundle validates caption ordering, containment and literal text escaping.
      const image = scene.image ? await this.ownedImage(scene.image) : undefined;
      const bundle = buildHyperframesBundleV1({ title: 'Local Reel', locale: input.locale, width: 1080, height: 1920,
        scenes: [{ id: scene.id, durationSeconds: scene.durationSeconds, title: scene.title, text: scene.text,
          captions: scene.captions, ...(image ? { media: { type: 'image' as const, url: OWNED_ORIGIN + scene.image!.sha256 } } : {}) }] });
      const key = hash(JSON.stringify([VERSION, fingerprint, bundle.sha256, image ? hash(image) : null]));
      prepared.push({ scene, html: bundle.html, key, image });
    }
    if (duration > 90) reject('DURATION_LIMIT');
    const source = { pieceId: input.source.pieceId, revision: input.source.revision, textSha256: input.source.textSha256,
      ...(input.source.adaptationId ? { adaptationId: input.source.adaptationId } : {}) };
    const renderKey = hash(JSON.stringify([VERSION, source, prepared.map(p => p.key)]));
    const tenant = hash(input.organizationId);
    const runKey = tenant + renderKey;
    const existing = this.running.get(runKey); if (existing) return existing;
    const operation = this.run({ ...input, source }, prepared, tenant, renderKey, duration);
    this.running.set(runKey, operation);
    try { return await operation; } finally { this.running.delete(runKey); }
  }

  private async ownedImage(image: NonNullable<LocalReelSceneV1['image']>): Promise<Buffer> {
    if (typeof image.assetId !== 'string' || !image.assetId || !sha(image.sha256) || !isAbsolute(image.absolutePath)) reject('IMAGE_INVALID');
    const path = await realpath(image.absolutePath);
    const roots = await Promise.all(this.config.allowedAssetRoots.map(p => realpath(p)));
    if (!roots.some(root => inside(root, path))) reject('IMAGE_OUTSIDE_OWNED_ROOT');
    const info = await stat(path); if (!info.isFile() || info.size > 20 * 1024 * 1024) reject('IMAGE_SIZE');
    const bytes = await readFile(path);
    if (hash(bytes) !== image.sha256) reject('IMAGE_DIGEST_MISMATCH');
    // Raster only: excludes SVG scripts/subresources, animated GIF/WebP and decoder network access.
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!(png ||
      (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255))) reject('IMAGE_FORMAT');
    if (png) {
      if (bytes.length < 24 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 40_000_000) reject('IMAGE_DIMENSIONS');
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') reject('IMAGE_ANIMATION_UNSUPPORTED');
        offset += length + 12;
      }
    }
    return bytes;
  }

  private async run(input: LocalReelInputV1, prepared: Prepared[], tenant: string, renderKey: string, duration: number): Promise<LocalReelResultV1> {
    await mkdir(this.config.cacheRoot, { recursive: true, mode: 0o700 });
    const root = join(await realpath(this.config.cacheRoot), tenant); await mkdir(root, { recursive: true, mode: 0o700 });
    if (await realpath(root) !== root) reject('CACHE_TENANT_PATH');
    const finalDir = join(root, renderKey);
    const cached = await this.cachedResult(finalDir, renderKey);
    if (cached) return cached;
    const sceneResults: LocalReelSceneResultV1[] = []; let start = 0;
    // A render owns only its temporary directory; it never removes old accepted cache assets.
    const work = await mkdtemp(join(root, '.render-'));
    let browser: any;
    try {
      for (const p of prepared) {
        const dir = join(root, 'scene-' + p.key);
        let frames = await this.cachedFrames(dir);
        const reused = !!frames;
        if (!frames) {
          if (!browser) {
            const playwright = createRequire(__filename)(this.config.playwrightModule ?? 'playwright');
            browser = await playwright.chromium.launch({ executablePath: this.config.chromiumExecutable, headless: true });
          }
          frames = await this.capture(browser, p, dir, root);
        }
        sceneResults.push({ id: p.scene.id, contentSha256: p.key, startSeconds: start, durationSeconds: p.scene.durationSeconds,
          renderedText: { title: p.scene.title ?? '', text: p.scene.text ?? '', captions: p.scene.captions ?? [] },
          ...(p.scene.image ? { imageAssetId: p.scene.image.assetId } : {}), frames, reused });
        start += p.scene.durationSeconds;
      }
      const ffmpeg = await realpath(this.config.ffmpegExecutable);
      const nativePath = async (p: string) => process.platform === 'linux' && /\.exe$/i.test(ffmpeg)
        ? (await execute('wslpath', ['-w', p], { timeout: 5000 })).stdout.trim().replace(/\\/g, '/') : p;
      const segments: string[] = [];
      let last = '';
      for (const scene of sceneResults) for (const frame of scene.frames) {
        last = (await nativePath(frame.absolutePath)).replace(/'/g, "'\\''");
        segments.push(`file '${last}'\noption framerate 30\nduration ${frame.endSeconds - frame.startSeconds}\n`);
      }
      // Duplicate last image is required by concat's duration semantics; -t bounds the final CFR output.
      const concat = join(work, 'frames.txt'); await writeFile(concat, segments.join('') + `file '${last}'\noption framerate 30\n`);
      const output = join(work, 'reel.mp4');
      try {
        await execute(this.config.ffmpegExecutable, ['-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe',
          '-i', await nativePath(concat), '-t', String(duration), '-vf', 'fps=30', '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '20',
          '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', '-y', await nativePath(output)], { timeout: 180_000, maxBuffer: 1024 * 1024 });
      } catch { reject('ENCODE_FAILED'); }
      const bytes = await readFile(output); const metadata = measureMp4VideoV1(bytes);
      if (metadata.width !== 1080 || metadata.height !== 1920 || metadata.audio || Math.abs(metadata.durationSeconds - duration) > 1 / 30 + 0.001) reject('MEASUREMENT_MISMATCH');
      const result: LocalReelResultV1 = { version: 1, renderKey, absolutePath: join(finalDir, 'reel.mp4'), sha256: metadata.sha256, metadata,
        source: input.source, captions: { source: 'authored_on_screen', speech: false }, sceneResults, reused: false };
      await writeFile(join(work, 'receipt.json'), JSON.stringify(result));
      try { await rename(work, finalDir); } catch (error) {
        const winner = await this.cachedResult(finalDir, renderKey); if (winner) return winner;
        try { await rename(finalDir, join(root, '.damaged-render-' + renderKey + '-' + Date.now())); } catch { throw error; }
        await rename(work, finalDir);
      }
      return result;
    } finally { await browser?.close(); await rm(work, { recursive: true, force: true }); }
  }

  private async cachedFrames(dir: string): Promise<LocalReelSceneResultV1['frames'] | null> {
    try {
      const frames = JSON.parse(await readFile(join(dir, 'frames.json'), 'utf8')) as LocalReelSceneResultV1['frames'];
      if (!Array.isArray(frames) || !frames.length || frames.length > 101) return null;
      if (await realpath(dir) !== dir) return null;
      for (const frame of frames) {
        if (!inside(dir, frame.absolutePath) || await realpath(frame.absolutePath) !== frame.absolutePath || hash(await readFile(frame.absolutePath)) !== frame.sha256) return null;
      }
      return frames;
    } catch { return null; }
  }

  private async cachedResult(dir: string, key: string): Promise<LocalReelResultV1 | null> {
    try {
      const receipt = JSON.parse(await readFile(join(dir, 'receipt.json'), 'utf8')) as LocalReelResultV1;
      if (receipt.version !== 1 || receipt.renderKey !== key || receipt.absolutePath !== join(dir, 'reel.mp4') ||
        hash(await readFile(receipt.absolutePath)) !== receipt.sha256) return null;
      const metadata = measureMp4VideoV1(await readFile(receipt.absolutePath));
      if (metadata.width !== 1080 || metadata.height !== 1920 || metadata.audio) return null;
      for (const scene of receipt.sceneResults) if (!(await this.cachedFrames(join(dir, '..', 'scene-' + scene.contentSha256)))) return null;
      return { ...receipt, metadata, reused: true, sceneResults: receipt.sceneResults.map(s => ({ ...s, reused: true })) };
    } catch { return null; }
  }

  private async capture(browser: any, p: Prepared, dir: string, root: string): Promise<LocalReelSceneResultV1['frames']> {
    const work = await mkdtemp(join(root, '.scene-'));
    const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    try {
      await context.route('**/*', async (route: any) => {
        if (p.image && route.request().url() === OWNED_ORIGIN + p.scene.image!.sha256) {
          await route.fulfill({ status: 200, contentType: p.image[0] === 137 ? 'image/png' : 'image/jpeg', body: p.image });
        } else await route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      await page.setContent(p.html, { waitUntil: 'load', timeout: 15000 });
      // Browser callbacks must not capture Node's tslib helpers when the app targets ES2015.
      await page.evaluate(() => document.fonts.ready.then(() => Promise.all(Array.from(document.images).map(img => img.decode()))));
      const imageSize = await page.evaluate(() => Array.from(document.images).map(img => img.naturalWidth * img.naturalHeight));
      if (imageSize.some((size: number) => size > 40_000_000 || !size)) reject('IMAGE_DIMENSIONS');
      const boundaries = [...new Set([0, p.scene.durationSeconds, ...(p.scene.captions ?? []).flatMap(c => [c.startSeconds, c.endSeconds])])].sort((a, b) => a - b);
      if (boundaries.length > 102) reject('CAPTION_LIMIT');
      const frames: LocalReelSceneResultV1['frames'] = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        const at = (boundaries[i] + boundaries[i + 1]) / 2;
        const fits = await page.evaluate((time: number) => {
          for (const element of Array.from(document.querySelectorAll<HTMLElement>('.caption'))) {
            const start = Number(element.dataset.start); element.style.display = time >= start && time < start + Number(element.dataset.duration) ? 'flex' : 'none';
          }
          const copy = document.querySelector<HTMLElement>('.copy')!;
          const text = Array.from(copy.children).map(el => el.getBoundingClientRect());
          const captions = Array.from(document.querySelectorAll<HTMLElement>('.caption')).filter(e => e.style.display !== 'none').map(e => e.querySelector('span')!.getBoundingClientRect());
          return copy.scrollWidth <= 1080 && text.every(r => r.bottom <= 1540 && r.left >= 0 && r.right <= 1080) &&
            captions.every(r => r.top >= Math.max(1500, ...text.map(t => t.bottom + 24)) && r.bottom <= 1920 && r.left >= 0 && r.right <= 1080);
        }, at);
        if (!fits) reject('TEXT_OVERFLOW');
        const filename = `frame-${i}.png`; const bytes = await page.screenshot({ path: join(work, filename), type: 'png' });
        frames.push({ absolutePath: join(dir, filename), sha256: hash(bytes), startSeconds: boundaries[i], endSeconds: boundaries[i + 1] });
      }
      await writeFile(join(work, 'frames.json'), JSON.stringify(frames));
      // A damaged existing entry is retained for diagnosis, and replaced atomically with a good entry.
      try { await rename(work, dir); } catch {
        const winner = await this.cachedFrames(dir); if (winner) return winner;
        await rename(dir, join(root, '.damaged-scene-' + p.key + '-' + Date.now())); await rename(work, dir);
      }
      return frames;
    } finally { await context.close(); await rm(work, { recursive: true, force: true }); }
  }
}
