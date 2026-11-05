import { createHash } from 'node:crypto';
import { failV1, localeV1 } from '../provider-http.v1';
import { compositionUrlV1 } from './composition-http.v1';
import { CompositionCaptionCueV1 } from './composition-provider.v1';

export interface HyperframesBundleSceneV1 {
  id: string; durationSeconds: number; title?: string; text?: string;
  media?: { type: 'image' | 'video'; url: string; retainAudio?: boolean };
  audioUrl?: string;
  captions?: readonly CompositionCaptionCueV1[];
}
export interface HyperframesBundleInputV1 { title: string; locale: string; width: number; height: number; scenes: readonly HyperframesBundleSceneV1[] }
export interface HyperframesBundleV1 { zipBase64: string; sha256: string; html: string; durationSeconds: number }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** ZIP STORE, fixed timestamp, one fixed entry: deterministic and no executable dependency. */
function zipIndex(html: string): Buffer {
  const bytes = Buffer.from(html, 'utf8'); const name = Buffer.from('index.html');
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

/** Declarative HTML schema: provider clock controls visibility, video seeking and audio mixing. */
export function buildHyperframesBundleV1(input: HyperframesBundleInputV1): HyperframesBundleV1 {
  if (![1080, 1920].includes(input.width) || ![1080, 1920].includes(input.height) || typeof input.title !== 'string' || input.title.length > 500 ||
    !Array.isArray(input.scenes) || input.scenes.length < 1 || input.scenes.length > 50) failV1('video_composition_invalid_bundle');
  const locale = localeV1(input.locale); const origins = new Set<string>(); const ids = new Set<string>();
  const url = (s: string) => { const checked = compositionUrlV1(s); origins.add(new URL(checked).origin); return escape(checked); };
  let time = 0; const fragments: string[] = [];
  for (const s of input.scenes) {
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(s.id) || ids.has(s.id) || !Number.isFinite(s.durationSeconds) || s.durationSeconds <= 0 || s.durationSeconds > 600 ||
      (s.title !== undefined && (typeof s.title !== 'string' || s.title.length > 500)) || (s.text !== undefined && (typeof s.text !== 'string' || s.text.length > 5000))) failV1('video_composition_invalid_bundle_scene');
    ids.add(s.id);
    const id = 'scene-' + s.id.length + '-' + s.id; const start = Number(time.toFixed(6)); const duration = s.durationSeconds;
    const timed = `data-start="${start}" data-duration="${duration}"`;
    fragments.push(`<section id="${id}" class="clip scene" ${timed} data-track-index="0"></section><section id="${id}-copy" class="clip copy" ${timed} data-track-index="2">${s.title ? `<h1>${escape(s.title)}</h1>` : ''}${s.text ? `<p>${escape(s.text)}</p>` : ''}</section>`);
    if (s.media) {
      if (!['image', 'video'].includes(s.media.type) || (s.media.retainAudio && s.media.type !== 'video') || (s.media.retainAudio && s.audioUrl)) failV1('video_composition_invalid_bundle_media');
      const src = url(s.media.url);
      fragments.push(s.media.type === 'image'
        ? `<img id="${id}-media" class="clip visual" src="${src}" alt="" ${timed} data-track-index="1">`
        : `<video id="${id}-media" class="visual" src="${src}" ${timed} data-media-start="0" data-track-index="1" ${s.media.retainAudio ? 'data-has-audio="true" data-volume="1"' : 'muted'} playsinline></video>`);
    }
    if (s.audioUrl) fragments.push(`<audio id="${id}-audio" src="${url(s.audioUrl)}" ${timed} data-media-start="0" data-volume="1" data-track-index="2"></audio>`);
    let previousEnd = 0;
    if (s.captions !== undefined && (!Array.isArray(s.captions) || s.captions.length > 500)) failV1('video_composition_invalid_caption_cues');
    for (const [i, cue] of (s.captions || []).entries()) {
      if (!Number.isFinite(cue.startSeconds) || !Number.isFinite(cue.endSeconds) || cue.startSeconds < previousEnd || cue.endSeconds <= cue.startSeconds || cue.endSeconds > duration ||
        typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 1000) failV1('video_composition_invalid_caption_cues');
      fragments.push(`<div id="${id}-caption-${i}" class="clip caption" data-start="${Number((start + cue.startSeconds).toFixed(6))}" data-duration="${Number((cue.endSeconds - cue.startSeconds).toFixed(6))}" data-track-index="3"><span>${escape(cue.text)}</span></div>`);
      previousEnd = cue.endSeconds;
    }
    time += duration;
  }
  if (time > 600) failV1('video_composition_invalid_duration');
  const trustedOrigins = [...origins].sort().join(' ');
  // No authored scripts, arbitrary markup, iframe, network requests, or remote styles/fonts.
  // Engine frame transport uses same-origin images; metadata hints decode data: SVG posters.
  // The compiler also localizes source audio/video to its same-origin file server.
  // Official compilation inserts inline runtime/bridge scripts without nonce/hash support.
  // Only our escaped, authored HTML is accepted; source facts never become script markup.
  // Compiled fonts use same-origin/data URLs. External/data/eval scripts and frames stay denied.
  const csp = `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: ${trustedOrigins}; media-src 'self' ${trustedOrigins}; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const html = `<!doctype html><html lang="${escape(locale)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escape(csp)}"><meta name="viewport" content="width=${input.width}, height=${input.height}"><title>${escape(input.title)}</title><style>html,body{margin:0;background:#101827;color:#fff;font-family:Arial,sans-serif}#root{position:relative;width:${input.width}px;height:${input.height}px;overflow:hidden;isolation:isolate}.clip,.visual{position:absolute;inset:0;width:100%;height:100%;box-sizing:border-box}.scene{background:#101827;z-index:0}.copy{display:flex;flex-direction:column;justify-content:flex-start;gap:32px;padding:8%;z-index:2;pointer-events:none}h1,p{text-shadow:0 2px 6px #101827}h1{font-size:72px;line-height:1.1;margin:0}p{font-size:48px;line-height:1.35;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.visual{object-fit:contain;z-index:1}.caption{z-index:3;display:flex;justify-content:center;align-items:flex-end;padding:6% 8%;font-size:42px;line-height:1.3;text-align:center}.caption span{background:#101827;color:#fff;padding:16px 24px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="${Number(time.toFixed(6))}" data-width="${input.width}" data-height="${input.height}">${fragments.join('')}</main></body></html>`;
  const bytes = zipIndex(html);
  if (bytes.length > 1024 * 1024) failV1('video_composition_bundle_too_large');
  return { zipBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), html, durationSeconds: Number(time.toFixed(6)) };
}
