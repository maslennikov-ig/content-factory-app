'use strict';

const { PassThrough } = require('node:stream');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const SOURCE = 'libraries/nestjs-libraries/src/integrations/social/linkedin.provider.ts';
const SDK = 'libraries/nestjs-libraries/src/integrations/social/linkedin.pdf.sdk.ts';
const SDK_REQUEST = '@contentfactory/nestjs-libraries/integrations/social/linkedin.pdf.sdk';
const PROVIDER_REQUEST = '@contentfactory/nestjs-libraries/integrations/social/linkedin.provider';
const PAGE_REQUEST = '@contentfactory/nestjs-libraries/integrations/social/linkedin.page.provider';

function harness(options = {}) {
  const calls = { loads: 0, reads: [], conversions: [], streams: [], formats: [] };
  const loadError = new Error('synthetic PDF module load failure');
  const converter = (images, size) => {
    calls.conversions.push({ images, size });
    if (options.converterError) throw options.converterError;
    const stream = new PassThrough(); calls.streams.push(stream);
    setImmediate(() => {
      if (options.streamError) stream.destroy(options.streamError);
      else stream.end(Buffer.from(images.map((b) => b.toString()).join('|') + ':' + size.join('x')));
    });
    return stream;
  };
  const image = (buffer) => ({
    toFormat(format) { calls.formats.push(format); return this; },
    async metadata() { if (options.sharpError) throw options.sharpError; return options.dimensions?.(buffer) || { width: 80, height: 40 }; },
    async toBuffer() { return Buffer.from('jpeg:' + buffer.toString()); },
  });
  const mocks = {
    '@contentfactory/nestjs-libraries/integrations/social.abstract': { SocialAbstract: class { assetBoolean(v) { return v === true; } } },
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'synthetic' },
    '@contentfactory/helpers/decorators/post.plug': { PostPlug: () => () => {} },
    '@contentfactory/helpers/decorators/plug.decorator': { Plug: () => () => {} },
    '@contentfactory/nestjs-libraries/chat/rules.description.decorator': { Rules: () => (target) => target },
    '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/linkedin.dto': { LinkedinDto: class {} },
    '@contentfactory/helpers/utils/read.or.fetch': { readOrFetch: async (p) => {
      calls.reads.push(p); if (options.readError) throw options.readError;
      return options.images ? Buffer.from(options.images[p]) : Buffer.from(p);
    } },
    sharp: options.realSharp || image,
  };
  const sources = { [SDK_REQUEST]: SDK, [PROVIDER_REQUEST]: SOURCE,
    [PAGE_REQUEST]: 'libraries/nestjs-libraries/src/integrations/social/linkedin.page.provider.ts' };
  const resolve = (request) => {
    if (request !== 'image-to-pdf') return undefined;
    calls.loads++;
    if (options.failFirst && calls.loads === 1) throw loadError;
    if (options.realConverter) return { __esModule: true, default: (images, size) => {
      calls.conversions.push({ images, size }); const stream = options.realConverter(images, size); calls.streams.push(stream); return stream;
    } };
    return { __esModule: true, default: converter };
  };
  const load = (file, extra = {}) => loadTypeScriptModule(file, { ...mocks, ...extra }, { sources, resolve });
  return { calls, loadError, load };
}

const post = (paths = []) => ({ id: 'synthetic-post', content: 'Synthetic local conversion', settings: { post_as_images_carousel: true }, media: paths.map((p) => ({ path: p, type: 'image' })) });
const convert = (provider, details) => provider.convertImagesToPdfCarousel(details, details[0]);

test('integration registry construction keeps the LinkedIn PDF module cold', () => {
  const run = harness();
  const fs = require('node:fs'); const path = require('node:path');
  const registry = 'libraries/nestjs-libraries/src/integrations/integration.manager.ts';
  const source = fs.readFileSync(path.join(__dirname, '..', registry), 'utf8');
  const mocks = { '@nestjs/common': { Injectable: () => (target) => target } };
  for (const match of source.matchAll(/import \{ (\w+) \} from '([^']+\/social\/[^']+)';/g)) {
    if ([PROVIDER_REQUEST, PAGE_REQUEST].includes(match[2])) continue;
    mocks[match[2]] = { [match[1]]: class {} };
  }
  const { socialIntegrationList } = run.load(registry, mocks);
  expect(socialIntegrationList).toHaveLength(34);
  expect(socialIntegrationList.filter((p) => ['linkedin', 'linkedin-page'].includes(p.identifier))).toHaveLength(2);
  expect(run.calls.loads).toBe(0);
  expect(run.calls.conversions).toHaveLength(0);
});

test.each([undefined, []])('no media returns the same input with no PDF load (%p)', async (media) => {
  const run = harness(); const { LinkedinProvider } = run.load(SOURCE); const provider = new LinkedinProvider();
  const first = { ...post(), media }; const details = [first, { id: 'unchanged-comment' }];
  await expect(convert(provider, details)).resolves.toBe(details);
  expect(run.calls.loads).toBe(0); expect(run.calls.reads).toEqual([]); expect(run.calls.streams).toEqual([]);
});

test('concurrent first module callers share one memoized promise and load', async () => {
  const run = harness(); const { loadImageToPdf } = run.load(SDK);
  expect(run.calls.loads).toBe(0);
  const first = loadImageToPdf(); const second = loadImageToPdf();
  expect(second).toBe(first);
  const modules = await Promise.all([first, second, ...Array.from({ length: 12 }, () => loadImageToPdf())]);
  expect(modules.every((m) => m === modules[0] && typeof m.default === 'function')).toBe(true);
  expect(run.calls.loads).toBe(1);
});

test('failed import is shared and reset only for a later independent call', async () => {
  const run = harness({ failFirst: true }); const { loadImageToPdf } = run.load(SDK);
  const first = loadImageToPdf(); const second = loadImageToPdf();
  expect(second).toBe(first);
  const rejected = await Promise.allSettled([first, second]);
  expect(rejected.map((r) => r.reason)).toEqual([run.loadError, run.loadError]);
  expect(run.calls.loads).toBe(1); expect(run.calls.conversions).toHaveLength(0);
  await expect(loadImageToPdf()).resolves.toHaveProperty('default');
  await expect(loadImageToPdf()).resolves.toHaveProperty('default');
  expect(run.calls.loads).toBe(2);
});

test('concurrent carousels share only the module and preserve distinct inputs, streams and output', async () => {
  const run = harness({ dimensions: (b) => b.toString().startsWith('a') ? { width: 80, height: 40 } : { width: 20, height: 100 } });
  const { LinkedinProvider } = run.load(SOURCE); const provider = new LinkedinProvider();
  const commentA = { id: 'comment-a' }, commentB = { id: 'comment-b' };
  const a = [post(['a1', 'b1']), commentA], b = [post(['b2']), commentB];
  const beforeA = structuredClone(a), beforeB = structuredClone(b);
  const [first, second] = await Promise.all([convert(provider, a), convert(provider, b)]);
  expect(run.calls.loads).toBe(1); expect(run.calls.conversions).toHaveLength(2);
  expect(new Set(run.calls.streams).size).toBe(2);
  expect(run.calls.conversions[0].images).not.toBe(run.calls.conversions[1].images);
  expect(first[0].media[0].buffer).not.toBe(second[0].media[0].buffer);
  expect(first[0].media[0].buffer.toString()).toBe('jpeg:a1|jpeg:b1:80x40');
  expect(second[0].media[0].buffer.toString()).toBe('jpeg:b2:20x100');
  expect(first[0].media[0]).toMatchObject({ type: 'image', path: 'carousel.pdf' });
  expect(first[1]).toBe(commentA); expect(second[1]).toBe(commentB);
  expect(a).toEqual(beforeA); expect(b).toEqual(beforeB);
  expect(run.calls.formats).toEqual(['jpeg', 'jpeg', 'jpeg']);
});

test('import failure propagates through the operation without image reads or an automatic retry', async () => {
  const run = harness({ failFirst: true }); const { LinkedinProvider } = run.load(SOURCE); const provider = new LinkedinProvider();
  const input = [post(['a'])]; const before = structuredClone(input);
  await expect(convert(provider, input)).rejects.toBe(run.loadError);
  expect(run.calls.loads).toBe(1); expect(run.calls.reads).toEqual([]); expect(run.calls.streams).toEqual([]); expect(input).toEqual(before);
  await expect(convert(provider, input)).resolves.toHaveLength(1);
  expect(run.calls.loads).toBe(2); expect(run.calls.conversions).toHaveLength(1);
});

test.each(['readError', 'sharpError', 'converterError', 'streamError'])('%s retains the original error and never retries the conversion', async (kind) => {
  const error = new Error('synthetic original operation failure'); const options = { [kind]: error };
  const run = harness(options); const { LinkedinProvider } = run.load(SOURCE); const provider = new LinkedinProvider();
  const input = [post(['a'])]; const before = structuredClone(input);
  await expect(convert(provider, input)).rejects.toBe(error);
  expect(run.calls.loads).toBe(1); expect(run.calls.reads).toEqual(['a']); expect(input).toEqual(before);
  expect(run.calls.conversions).toHaveLength(['converterError', 'streamError'].includes(kind) ? 1 : 0);
  delete options[kind];
  await expect(convert(provider, input)).resolves.toHaveLength(1);
  // Operation failure must not invalidate an already loaded module.
  expect(run.calls.loads).toBe(1); expect(run.calls.reads).toEqual(['a', 'a']);
});

test('the public post route propagates a first-use PDF error before any provider upload', async () => {
  const run = harness({ failFirst: true }); const { LinkedinProvider } = run.load(SOURCE); const provider = new LinkedinProvider();
  const uploads = jest.fn(() => { throw new Error('Provider HTTP must not run'); }); provider.processMediaForPosts = uploads;
  await expect(provider.post('synthetic', 'inert-token', [post(['a'])], {})).rejects.toBe(run.loadError);
  expect(uploads).not.toHaveBeenCalled(); expect(run.calls.loads).toBe(1); expect(run.calls.reads).toEqual([]);
});

const collect = (stream) => new Promise((resolve, reject) => {
  const chunks = []; stream.on('data', (chunk) => chunks.push(chunk)); stream.on('end', () => resolve(Buffer.concat(chunks))); stream.on('error', reject);
});
// PDFKit stores CreationDate in an indirect object referenced by the trailer's
// Info dictionary. Normalize that value and only the trailer file IDs, keeping
// their lengths so every other object/stream/image/dimension/xref byte remains.
const canonicalPdf = (buffer) => {
  const pdf = buffer.toString('latin1');
  const trailerStart = pdf.lastIndexOf('\ntrailer\n');
  if (trailerStart < 0) throw new Error('Expected PDFKit trailer');
  const body = pdf.slice(0, trailerStart), trailer = pdf.slice(trailerStart);
  const infoRef = /\/Info\s+(\d+)\s+(\d+)\s+R\b/.exec(trailer);
  if (!infoRef) throw new Error('Expected PDFKit Info reference');
  const infoObject = new RegExp(`(?:^|\\n)${infoRef[1]} ${infoRef[2]} obj\\n(<<[\\s\\S]*?>>)\\nendobj(?:\\n|$)`).exec(body);
  const dateRef = infoObject && /\/CreationDate\s+(\d+)\s+(\d+)\s+R\b/.exec(infoObject[1]);
  if (!dateRef) throw new Error('Expected PDFKit CreationDate reference');
  const dateObject = new RegExp(`((?:^|\\n)${dateRef[1]} ${dateRef[2]} obj\\n)\\(D:\\d{14}Z\\)(?=\\nendobj(?:\\n|$))`);
  if (!dateObject.test(body)) throw new Error('Expected PDFKit UTC creation date object');
  const ids = /(\/ID\s+\[<)([0-9a-f]{32})(>\s*<)([0-9a-f]{32})(>\])/;
  if (!ids.test(trailer)) throw new Error('Expected PDFKit trailer file IDs');
  return body.replace(dateObject, '$1(D:20000101000000Z)') +
    trailer.replace(ids, (_match, start, _first, middle, _second, end) =>
      start + '0'.repeat(32) + middle + '0'.repeat(32) + end);
};

async function pdfWithExplicitDates(options = {}) {
  const PDFDocument = require('pdfkit');
  const sharp = require('sharp');
  const size = options.size || [80, 40];
  const image = await sharp({ create: { width: 80, height: 40, channels: 3,
    background: options.background || { r: 220, g: 30, b: 20 } } }).jpeg().toBuffer();
  const doc = new PDFDocument({ margin: 0, size, info: {
    CreationDate: new Date(options.creationDate || '2001-01-01T00:00:00Z'),
    ModDate: new Date(options.modDate || '2002-01-01T00:00:00Z'),
  } });
  doc.image(image, 0, 0, { fit: size, align: 'center', valign: 'center' });
  doc.end();
  return collect(doc);
}

test('PDF comparison handles an actual indirect creation date across two explicit seconds', async () => {
  const before = await pdfWithExplicitDates();
  const after = await pdfWithExplicitDates({ creationDate: '2001-01-01T00:00:01Z' });
  expect(before.toString('latin1')).toMatch(/\/CreationDate \d+ 0 R/);
  expect(before.toString('latin1')).toContain('(D:20010101000000Z)');
  expect(after.toString('latin1')).toContain('(D:20010101000001Z)');
  expect(before.equals(after)).toBe(false);
  expect(canonicalPdf(before)).toBe(canonicalPdf(after));
  for (const buffer of [before, after]) {
    const raw = buffer.toString('latin1'), normalized = canonicalPdf(buffer);
    expect(normalized).toHaveLength(raw.length);
    const xrefStart = raw.lastIndexOf('\nxref\n'), trailerStart = raw.lastIndexOf('\ntrailer\n');
    expect(xrefStart).toBeGreaterThan(0);
    expect(normalized.slice(xrefStart, trailerStart)).toBe(raw.slice(xrefStart, trailerStart));
  }
});

test.each([
  ['image content', { background: { r: 20, g: 40, b: 220 } }],
  ['page dimensions', { size: [81, 40] }],
  ['a different metadata date', { modDate: '2002-01-01T00:00:01Z' }],
])('PDF comparison still rejects a change to %s', async (_name, change) => {
  const before = await pdfWithExplicitDates();
  const after = await pdfWithExplicitDates({ ...change, creationDate: '2001-01-01T00:00:01Z' });
  expect(canonicalPdf(before)).not.toBe(canonicalPdf(after));
});

test('real sharp images produce the same valid PDF as the installed converter with separate streams', async () => {
  const sharp = require('sharp'); const direct = require('image-to-pdf').default;
  const imageA = await sharp({ create: { width: 80, height: 40, channels: 3, background: { r: 220, g: 30, b: 20 } } }).png().toBuffer();
  const imageB = await sharp({ create: { width: 20, height: 100, channels: 3, background: { r: 20, g: 40, b: 220 } } }).png().toBuffer();
  const run = harness({ realSharp: sharp, realConverter: direct, images: { a: imageA, b: imageB } });
  const { LinkedinProvider } = run.load(SOURCE); const provider = new LinkedinProvider();
  const comments = { id: 'unchanged-comment' }; const input = [post(['a', 'b']), comments];
  const before = structuredClone(input);
  const [one, two] = await Promise.all([convert(provider, input), convert(provider, input)]);
  const expectedJpegs = await Promise.all([imageA, imageB].map((raw) => sharp(raw, { animated: false }).toFormat('jpeg').toBuffer()));
  const expected = await collect(direct(expectedJpegs, [80, 40]));
  expect(run.calls.loads).toBe(1); expect(new Set(run.calls.streams).size).toBe(2);
  expect(one[0].media[0].buffer).not.toBe(two[0].media[0].buffer);
  for (const output of [one, two]) {
    const pdf = output[0].media[0].buffer;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toMatch(/\/Count 2/);
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 80 40]');
    expect(pdf.toString('latin1')).toMatch(/%%EOF\s*$/);
    expect(canonicalPdf(pdf)).toBe(canonicalPdf(expected));
    expect(output[1]).toBe(comments);
  }
  expect(input).toEqual(before);
});
