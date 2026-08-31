'use strict';

/**
 * How a post is laid out on the page, as opposed to how its sentences read.
 *
 * `post-layout.ts` measures the group the research found missing on
 * 2026-08-30: a live author breaks a paragraph with a soft line return
 * mid-thought, and a model asked to sound like them writes even blocks
 * separated by a blank line instead. All four measures are level A — no word
 * list on any of the sixteen product locales — so unlike `post-habits.ts`
 * none of them is allowed to return `null` for a missing dictionary; the only
 * absence here is the whole corpus being smaller than `MIN_POSTS`.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const pack = loadTypeScriptModule(`${base}/locale-pack.ru.ts`).RU_LOCALE_PACK;
const layout = loadTypeScriptModule(`${base}/post-layout.ts`);

const post = (text) => ({ text });
const repeat = (text, count) => Array.from({ length: count }, () => post(text));

describe('observing one text', () => {
  it('counts a single line break with no second one beside it as a soft break', () => {
    // 'AAAA\nBBBB\n\nCCCC' — 4 + 1 + 4 + 2 + 4 = 15 characters. The lone \n
    // between AAAA and BBBB has no other \n on either side of it: one soft
    // break. '\n\n' between BBBB and CCCC is a run of two: one block break.
    const observed = layout.observeLayout('AAAA\nBBBB\n\nCCCC', pack);
    expect(observed.charCount).toBe(15);
    expect(observed.softBreaks).toBe(1);
    expect(observed.blockBreaks).toBe(1);
  });

  it('splits into blocks at the blank line, keeping a soft break inside a block', () => {
    // Two blocks: 'AAAA\nBBBB' (9 chars, the soft break stays inside it — it
    // is not a separator) and 'CCCC' (4 chars). Neither carries sentence
    // punctuation, so `splitSentences` returns each whole as one sentence.
    const observed = layout.observeLayout('AAAA\nBBBB\n\nCCCC', pack);
    expect(observed.blockCount).toBe(2);
    expect(observed.blockCharsTotal).toBe(13);
    expect(observed.oneSentenceBlocks).toBe(2);
  });

  it('reads a block with two sentences as not one-sentence, by the same splitter the rest of the product uses', () => {
    // 'Раз. Два.' — a full stop, a space and a capital letter is the boundary
    // `splitSentences` already uses everywhere else in this product; it reads
    // two sentences here. Second block, 'Одно предложение без точки', carries
    // no terminal punctuation at all, so the trailing-buffer branch of
    // `splitSentences` returns it whole, as one sentence.
    const twoSentenceBlock = layout.observeLayout('Раз. Два.', pack);
    expect(twoSentenceBlock.oneSentenceBlocks).toBe(0);

    const oneSentenceBlock = layout.observeLayout(
      'Одно предложение без точки',
      pack
    );
    expect(oneSentenceBlock.oneSentenceBlocks).toBe(1);
  });

  it('treats a Windows line ending as one break, not two', () => {
    // A CRLF export must measure exactly like the LF text it came from — the
    // whole reason `\r\n` is folded to `\n` before anything is counted.
    const crlf = layout.observeLayout(
      'Первая строка\r\nВторая строка\r\n\r\nВторой блок.',
      pack
    );
    const lf = layout.observeLayout(
      'Первая строка\nВторая строка\n\nВторой блок.',
      pack
    );
    expect(crlf).toEqual(lf);
    expect(crlf.softBreaks).toBe(1);
    expect(crlf.blockBreaks).toBe(1);
  });

  it('reads text with no line break at all as one block', () => {
    const observed = layout.observeLayout(
      'Просто один блок без переносов вовсе.',
      pack
    );
    expect(observed.softBreaks).toBe(0);
    expect(observed.blockBreaks).toBe(0);
    expect(observed.blockCount).toBe(1);
  });

  it('reads text made only of blank lines as zero blocks, not as an error', () => {
    expect(layout.observeLayout('\n\n\n\n', pack)).toEqual({
      charCount: 0,
      softBreaks: 0,
      blockBreaks: 0,
      blockCount: 0,
      blockCharsTotal: 0,
      oneSentenceBlocks: 0,
    });
    // A line of bare spaces is blank too — trimming leaves nothing behind.
    expect(layout.observeLayout('   \n \n\n  ', pack).blockCount).toBe(0);
  });
});

describe('reading a corpus of posts', () => {
  it('says nothing at all below five posts', () => {
    const text = 'Раз. Два.\n\nОдно предложение без точки';
    expect(layout.computePostLayout(repeat(text, 4), pack)).toBeNull();
  });

  it('turns soft and block breaks into a rate per thousand characters', () => {
    // Five copies of a 15-character post, one soft break and one block break
    // each: 5 breaks of each kind over 75 characters total.
    // perThousand = round(1000 * 5 / 75) = round(66.67) = 67, for both rates —
    // this text happens to carry exactly one of each kind of break.
    const measured = layout.computePostLayout(
      repeat('AAAA\nBBBB\n\nCCCC', 5),
      pack
    );
    expect(measured.softBreakRate).toBe(67);
    expect(measured.blockBreakRate).toBe(67);
    expect(measured.counts.softBreaks).toBe(5);
    expect(measured.counts.blockBreaks).toBe(5);
  });

  it('averages block length in characters over the whole corpus', () => {
    // Two blocks per post, 10 and 20 characters, over six identical posts:
    // mean = (10 + 20) * 6 / (2 * 6) = 180 / 12 = 15 exactly, no rounding.
    const measured = layout.computePostLayout(
      repeat('a'.repeat(10) + '\n\n' + 'a'.repeat(20), 6),
      pack
    );
    expect(measured.meanBlockChars).toBe(15);
    expect(measured.counts.blocks).toBe(12);
  });

  it('reports the share of one-sentence blocks, grounded with a count', () => {
    // Five identical posts, each with one two-sentence block ('Раз. Два.')
    // and one one-sentence block ('Одно предложение без точки'): 10 blocks in
    // total, 5 of them one-sentence — share(5, 10) = 50%.
    const measured = layout.computePostLayout(
      repeat('Раз. Два.\n\nОдно предложение без точки', 5),
      pack
    );
    expect(measured.oneSentenceBlockShare).toBe(50);
    expect(measured.counts.oneSentenceBlocks).toBe(5);
    expect(measured.counts.blocks).toBe(10);
  });

  it('never reports null for a missing dictionary — every value here is level A', () => {
    const measured = layout.computePostLayout(
      repeat('Обычный пост без пустых строк совсем.', 5),
      pack
    );
    expect(measured.softBreakRate).not.toBeNull();
    expect(measured.blockBreakRate).not.toBeNull();
    expect(measured.meanBlockChars).not.toBeNull();
    expect(measured.oneSentenceBlockShare).not.toBeNull();
  });
});

describe('rendering for the prompt', () => {
  it('prints every number for both report locales, with a count beside the share', () => {
    const measured = layout.computePostLayout(
      repeat('Раз. Два.\n\nОдно предложение без точки', 5),
      pack
    );
    const ru = layout.renderPostLayout(measured, 'ru');
    const en = layout.renderPostLayout(measured, 'en');
    expect(ru).toContain('постов разобрано: 5');
    expect(ru).toContain('(5 из 10)');
    expect(en).toContain('posts analysed: 5');
    expect(en).toContain('(5 of 10)');
    // Level A: nothing here can come from a missing word list, so neither
    // rendering has anywhere a `null` or `undefined` could leak through.
    expect(ru).not.toMatch(/null|undefined/);
    expect(en).not.toMatch(/null|undefined/);
  });

  it('renders nothing for a corpus too small to have a layout at all', () => {
    expect(layout.renderPostLayout(null, 'ru')).toBe('');
  });
});
