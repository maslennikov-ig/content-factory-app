import {
  Controller,
  Get,
  Header,
  HttpException,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The Corresponding Source offer required by AGPL-3.0 section 13.
 *
 * Anyone who talks to this deployment over a network is owed the complete
 * source of the exact version answering them — not a branch that has moved on
 * since. So the product carries its own source: the release build runs
 * `scripts/release/make-source-archive.sh`, which writes `git archive` of the
 * deployed commit into var/source/, and the Dockerfile copies that into the
 * image beside the application it describes.
 *
 * This channel predates the public repository and is not replaced by it. A
 * public repository offers the tip of a branch; section 13 asks for the version
 * that answered the request, and only the archive in the image can be that.
 *
 * The archive is the tree, not the history. That is deliberate and load
 * bearing: the commit history carries a personal e-mail address, and nothing in
 * the licence asks for it.
 *
 * This controller is registered outside `authenticatedController` in
 * api.module.ts, so no session middleware runs here. The obligation is to any
 * network user, and a login wall would defeat it.
 */

export interface SourceManifest {
  commit: string;
  shortCommit: string;
  archive: string;
  downloadName: string;
  bytes: number;
  sha256: string;
  builtAt: string;
}

/**
 * Where the release build left the archive. The backend runs with its own
 * application directory as the working directory — `/app/apps/backend` in the
 * image, `apps/backend` in development — so the repository root is two levels
 * up in both.
 */
export const sourceDirectory = () =>
  process.env.SOURCE_ARCHIVE_DIRECTORY ||
  resolve(process.cwd(), '..', '..', 'var', 'source');

export const readSourceManifest = (): SourceManifest =>
  JSON.parse(readFileSync(join(sourceDirectory(), 'source.json'), 'utf8'));

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character] as string)
  );

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * The address of this controller as a browser sees it.
 *
 * nginx serves the backend under `/api`, and it does so by rewriting the path
 * away before the request arrives, so the process cannot read its own public
 * prefix off the request. `NEXT_PUBLIC_BACKEND_URL` is the one place the
 * deployment already states it, and it is in the container's environment. Left
 * unset — someone talking to the backend port directly — a root-relative path
 * is right.
 */
export const publicSourceUrl = (
  environment: NodeJS.ProcessEnv = process.env
) => `${(environment.NEXT_PUBLIC_BACKEND_URL || '').replace(/\/+$/, '')}/public/source`;

/**
 * A plain page, on purpose. It is served by the API rather than the interface
 * so that it answers a stranger with no session, no cookie and no JavaScript —
 * which is exactly who the licence has in mind.
 */
export const renderSourcePage = (
  manifest: SourceManifest,
  archiveUrl: string
) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Source · Content Factory</title>
<style>
  :root { color-scheme: dark light; }
  body {
    margin: 0 auto; padding: 48px 24px; max-width: 68ch;
    font-family: system-ui, sans-serif; line-height: 1.55;
    background: canvas; color: canvastext;
  }
  h1 { font-size: 24px; margin: 0 0 24px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 24px 0; }
  dt { opacity: .7; }
  dd { margin: 0; }
  code, dd { font-family: ui-monospace, monospace; word-break: break-all; }
  a.download { display: inline-block; margin: 8px 0 24px; font-weight: 650; }
  footer { margin-top: 32px; font-size: 14px; opacity: .7; }
</style>
</head>
<body>
<h1>Corresponding Source</h1>
<p>
  This service runs Content Factory, free software licensed under
  <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0, the GNU Affero
  General Public License</a>. Section 13 of that licence gives everyone who
  interacts with it over a network the right to its complete source. The archive
  below is the source of the exact version answering this request.
</p>
<a class="download" href="${escapeHtml(archiveUrl)}">Download ${escapeHtml(
  manifest.downloadName
)}</a>
<dl>
  <dt>Commit</dt><dd>${escapeHtml(manifest.commit)}</dd>
  <dt>Size</dt><dd>${megabytes(manifest.bytes)}</dd>
  <dt>SHA-256</dt><dd>${escapeHtml(manifest.sha256)}</dd>
  <dt>Built</dt><dd>${escapeHtml(manifest.builtAt)}</dd>
</dl>
<p>
  The archive holds every tracked file of that commit: application code,
  configuration, database schema, deployment files, the licence and the build
  instructions. It carries no revision history, and no credentials — the
  deployment's secrets live outside the repository and outside the image.
</p>
<footer>
  Content Factory is a fork of an upstream project; the attribution and the full
  licence text travel inside the archive, in <code>README.md</code> and
  <code>LICENSE</code>.
</footer>
</body>
</html>
`;

@ApiTags('Public')
@Controller('/public/source')
export class SourceController {
  /**
   * The manifest, and the archive it describes, or a plain refusal.
   *
   * An image built without the archive is a compliance failure rather than a
   * missing feature, so it says so instead of offering a download that would
   * fail somewhere inside the framework. Both files are checked here so that
   * the page never advertises an archive the next request cannot fetch.
   */
  private manifest(): SourceManifest {
    const unavailable = new HttpException(
      'This build does not carry its source archive. Report it to the operator of this instance.',
      503
    );
    let manifest: SourceManifest;
    try {
      manifest = readSourceManifest();
    } catch (error) {
      throw unavailable;
    }
    if (!existsSync(join(sourceDirectory(), manifest.archive))) {
      throw unavailable;
    }
    return manifest;
  }

  @Get('/')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  page(): string {
    return renderSourcePage(this.manifest(), `${publicSourceUrl()}/archive`);
  }

  @Get('/archive')
  archive(): StreamableFile {
    const manifest = this.manifest();
    return new StreamableFile(
      createReadStream(join(sourceDirectory(), manifest.archive)),
      {
        type: 'application/gzip',
        disposition: `attachment; filename="${manifest.downloadName}"`,
        length: manifest.bytes,
      }
    );
  }
}
