'use strict';

/**
 * Builds the binary fixtures `brand-voice.docx-parser.test.cjs` and
 * `brand-voice.pdf-parser.test.cjs` read from disk.
 *
 * Every file here is built from bytes, not borrowed from a real document, for
 * the same reason `sample-intake.ts`'s parsers are written in this repository
 * rather than carried from the donor: distribution rights on a found `.docx`
 * or `.pdf` are unestablished, and a hostile fixture (the zip bomb, the
 * `/Encrypt` dictionary, the `/JS` action) needs to be made on purpose anyway,
 * not scraped from somewhere.
 *
 * Run with `node tests/fixtures/brand-voice-binary/generate.cjs` to
 * regenerate. The output is committed so the tests do not depend on this
 * script running first, but the script is what makes the bytes explainable —
 * a reviewer can read *why* a fixture is 40 bytes of zeros and a CFB header,
 * not just that it is.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = __dirname;

/* -------------------------------------------------------------------------
 * A minimal ZIP writer.
 *
 * Real ZIP bytes, not a stub: local file headers, a central directory and an
 * end-of-central-directory record, with real CRC32s. `mammoth` opens `.docx`
 * through `jszip`, and `jszip` validates structure a hand-wound fake would
 * fail; only a real archive exercises the parser's actual code path.
 * ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * @param {Array<{ name: string, data: Buffer, method?: 'store' | 'deflate', declaredUncompressedSize?: number }>} entries
 */
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const method = entry.method === 'deflate' ? 8 : 0;
    const rawCrc = crc32(entry.data);
    const compressed =
      method === 8
        ? zlib.deflateRawSync(entry.data, { level: 9 })
        : entry.data;
    // `declaredUncompressedSize` lets the zip-bomb fixture lie about the
    // uncompressed size the way a hostile archive would — the header says one
    // thing, decompression would produce another. Everywhere else it matches
    // the real data.
    const uncompressedSize = entry.declaredUncompressedSize ?? entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(rawCrc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(rawCrc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localSection = Buffer.concat(localParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localSection.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralDirectory, end]);
}

/* -------------------------------------------------------------------------
 * DOCX fixtures
 * ---------------------------------------------------------------------- */

const CONTENT_TYPES_XML = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  'utf8'
);

const RELS_XML = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  'utf8'
);

function documentXml(paragraphText) {
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${paragraphText}</w:t></w:r></w:p>
  </w:body>
</w:document>`,
    'utf8'
  );
}

const SAMPLE_PARAGRAPH =
  'Мы меняем поставщика подшипников не потому, что дешевле, а потому что срывы срока стоят дороже скидки. Новый везёт из Челябинска, и это решение приняли на смене, а не в кабинете.';

function minimalDocx(paragraphText = SAMPLE_PARAGRAPH) {
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
    { name: '_rels/.rels', data: RELS_XML },
    { name: 'word/document.xml', data: documentXml(paragraphText) },
  ]);
}

// A valid docx, one byte trimmed off the end so the end-of-central-directory
// record cannot be found — the same failure mode as a truncated upload or a
// half-written file.
function corruptedDocx() {
  const good = minimalDocx();
  return good.subarray(0, good.length - 1);
}

// A password-protected `.docx` is not a zip at all: Office wraps it in an
// OLE2 Compound File Binary container (MS-CFB), which always starts with the
// 8-byte signature below. A plain `.docx` always starts with `PK\x03\x04`
// instead, so this signature alone distinguishes "protected" from
// "corrupted" *before* jszip is ever asked to open the file — jszip's own
// error for the two cases is the same generic "not a zip", which is not a
// distinction a person reads as useful.
const OLE_CFB_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

function passwordProtectedDocx() {
  // The real container is a 512-byte-sector format; only the signature is
  // load-bearing for the guard being tested, so the rest is padding, not a
  // faithful CFB layout.
  return Buffer.concat([OLE_CFB_SIGNATURE, Buffer.alloc(504, 0)]);
}

// A docx that carries another docx as an untouched attachment, the way a
// person embeds one Word document inside another. The outer document's own
// text must come back; the inner one must never be unpacked or walked into —
// that is the whole defence against a "вложенный" payload, not a special case
// of it.
function nestedDocx() {
  const embedded = minimalDocx(
    'Текст внутри вложения. Если он попал в результат — парсер разворачивает вложения, а не должен.'
  );
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
    { name: '_rels/.rels', data: RELS_XML },
    { name: 'word/document.xml', data: documentXml(SAMPLE_PARAGRAPH) },
    { name: 'word/embeddings/oleObject1.docx', data: embedded },
  ]);
}

// A zip-bomb docx: `word/document.xml` deflates for real from highly
// repetitive content, at a ratio no legitimate document reaches. 4 MiB of a
// repeated 60-byte run — well inside what Word's own XML repetition
// produces the *shape* of, but pushed far past the volume any 20-page
// document needs — compresses under DEFLATE to well under 8 KiB, a ratio
// over 500:1. A real docx's XML rarely exceeds double digits; a bomb's does
// not have to lie about its declared size to make the point, so this one
// doesn't either — the danger is the ratio, not a forged header.
function zipBombDocx() {
  const unit = Buffer.from(
    '<w:p><w:r><w:t>ааааааааааааааааааааааааааааааа</w:t></w:r></w:p>',
    'utf8'
  );
  const repeats = Math.ceil((4 * 1024 * 1024) / unit.length);
  const body = Buffer.concat(Array(repeats).fill(unit));
  const bombXml = Buffer.concat([
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      'utf8'
    ),
    body,
    Buffer.from('</w:body></w:document>', 'utf8'),
  ]);
  return buildZip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES_XML },
    { name: '_rels/.rels', data: RELS_XML },
    { name: 'word/document.xml', data: bombXml, method: 'deflate' },
  ]);
}

/* -------------------------------------------------------------------------
 * PDF fixtures
 *
 * Hand-built per the classic "minimal PDF" recipe: an uncompressed object
 * stream with literal `Tj` text-showing operators, so no zlib is needed for
 * the readable cases and the file is inspectable as plain text.
 * ---------------------------------------------------------------------- */

function buildPdf(objects, trailerExtra = '') {
  // objects: array of strings, each a full "N 0 obj ... endobj" body without
  // the "N 0 obj"/"endobj" wrapper — index 0 is object 1, etc.
  const chunks = ['%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'];
  const offsets = [0]; // object 0 is always free
  let pos = Buffer.byteLength(chunks[0], 'binary');

  objects.forEach((body, index) => {
    const objNum = index + 1;
    const text = `${objNum} 0 obj\n${body}\nendobj\n`;
    offsets.push(pos);
    chunks.push(text);
    pos += Buffer.byteLength(text, 'binary');
  });

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(xref);

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${trailerExtra} >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(trailer);

  return Buffer.from(chunks.join(''), 'binary');
}

function textPageObjects(pageText) {
  const content = `BT /F1 18 Tf 72 720 Td (${pageText}) Tj ET`;
  return [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`,
  ];
}

function minimalPdf() {
  return buildPdf(
    textPageObjects(
      '(Zakaz izmenilsya posle vstrechi s cehom, a ne do neyo.)'
    )
  );
}

// Truncated mid-object: no `endobj`, no xref, no trailer. pdf.js has to fall
// back to a structural repair scan and, given how little is left, has
// nothing to recover — the same shape of failure a half-uploaded PDF leaves.
function corruptedPdf() {
  const good = minimalPdf();
  return good.subarray(0, Math.floor(good.length * 0.4));
}

// A page with a valid content stream that draws a rectangle and never calls a
// text-showing operator — the same shape a scanned page produces: an image
// XObject in the resources, an empty text layer. There is no `Tj`/`TJ`
// anywhere in this file, which is exactly the condition the "no text layer"
// guard has to catch, distinct from `corruptedPdf`, which pdf.js cannot open
// at all.
function scannedPdfWithoutTextLayer() {
  const content = '0 0 1 rg 0 0 612 792 re f';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`,
  ]);
}

// `/Encrypt` present in the trailer, Standard security handler, V1/R2 — the
// PDF32000 shape that makes pdf.js treat the document as requiring a
// password before it will open it. The O/U hash values are not
// cryptographically derived (that needs RC4 keyed off a real user password,
// which stage 2 will source from pdf.js's own encrypted.pdf test fixture
// rather than a hand-rolled hash); this fixture only has to make pdf.js reach
// its password-required branch, which the dictionary's *shape* — not the
// hash's correctness — is what triggers.
function passwordProtectedPdf() {
  const padding = Buffer.from(
    [
      0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
      0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
      0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
    ]
  ); // the standard 32-byte PDF password-padding string, PDF32000 §7.6.3.3
  const hex = (buffer) => `<${buffer.toString('hex')}>`;
  return buildPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] /Contents 4 0 R >>',
      '<< /Length 0 >>\nstream\n\nendstream',
      `<< /Filter /Standard /V 1 /R 2 /O ${hex(padding)} /U ${hex(padding)} /P -3904 >>`,
    ],
    ' /Encrypt 5 0 R /ID [<00000000000000000000000000000000> <00000000000000000000000000000000>]'
  );
}

// `/OpenAction` runs JavaScript on open, and the page carries a link
// annotation with a `/URI` action pointing off-host. Neither is executed by
// `pdf.js`'s core parsing path — no scripting engine is wired in when the
// caller only asks for text — but the fixture has to actually contain both,
// or the test would just be proving a straw man never ran.
function hostilePdfWithJsAndExternalLink() {
  const content =
    'BT /F1 18 Tf 72 720 Td (Otchet s aktivnoy ssylkoy i skriptom pri otkrytii.) Tj ET';
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R /Annots [7 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Action /S /JavaScript /JS (app.alert\\("hostile"\\); this.exportDataObject\\({cName: "x", nLaunch: 2}\\);) >>',
    '<< /Type /Annot /Subtype /Link /Rect [72 700 300 730] /A << /Type /Action /S /URI /URI (http://example-attacker.invalid/exfiltrate) >> >>',
  ]);
}

/* -------------------------------------------------------------------------
 * Write everything
 * ---------------------------------------------------------------------- */

const files = {
  'valid-minimal.docx': minimalDocx(),
  'corrupted.docx': corruptedDocx(),
  'password-protected.docx': passwordProtectedDocx(),
  'nested-embedded.docx': nestedDocx(),
  'zip-bomb.docx': zipBombDocx(),
  'valid-minimal.pdf': minimalPdf(),
  'corrupted.pdf': corruptedPdf(),
  'scanned-no-text-layer.pdf': scannedPdfWithoutTextLayer(),
  'password-protected.pdf': passwordProtectedPdf(),
  'hostile-js-and-link.pdf': hostilePdfWithJsAndExternalLink(),
};

for (const [name, data] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), data);
  console.log(`wrote ${name} (${data.length} bytes)`);
}
