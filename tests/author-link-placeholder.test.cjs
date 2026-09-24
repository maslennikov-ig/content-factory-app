/**
 * The author's link reaches the model as a token and comes back as the address
 * (`content-factory-next-97dq.91`). Production, 24.09.2026: a percent-encoded
 * Wikipedia address cost hundreds of output tokens and the JSON was cut inside
 * it. No model is called here.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const directives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/channel-directives.ts'
);
const profiles = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/channels/channel-writing-profile.ts'
);

const TOKEN = directives.AUTHOR_LINK_PLACEHOLDER;
// Cyrillic path, percent-encoded, with a `$` that a replacement pattern would eat.
const WIKI =
  'https://ru.wikipedia.org/wiki/%D0%9F%D1%80%D0%B8%D0%BD%D1%86%D0%B8%D0%BF_%D0%9F%D0%B0%D1%80%D0%B5%D1%82%D0%BE?x=$1&y=%28a%29';
const HTML = { identifier: 'telegram', name: 'Telegram', maxLength: 4096, editor: 'html' };
const PLAIN = { identifier: 'x', name: 'X', maxLength: 280, editor: 'normal' };

describe('the prompt carries the token, never the address', () => {
  const telegram = profiles.defaultWritingProfileFor('telegram', 'ru');

  test('on words (html) and bare (plain): the token, the note, no address', () => {
    for (const provider of [HTML, PLAIN]) {
      const lines = directives.channelInstructionLines(
        { ...telegram, linkPolicy: 'inline' },
        provider,
        { authorLink: { url: TOKEN, text: 'принцип Парето' } }
      );
      const line = lines.find((item) => item.includes('The author chose this link'));
      expect(line).toContain(TOKEN);
      expect(line).toContain('stands for the address');
      expect(line).not.toContain('wikipedia');
    }
  });

  test('a real address keeps the line it had, without the note', () => {
    expect(directives.AUTHOR_LINK_LINE('https://x.com')).not.toContain('stands for the address');
  });

  test('the generator hands the token to the lines and puts the address back', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'libraries/nestjs-libraries/src/agent/agent.graph.service.ts'),
      'utf8'
    );
    expect(source).toMatch(/url: hints\.authorLink\.url \? AUTHOR_LINK_PLACEHOLDER : null/);
    expect(source).toMatch(/const outputContent = withAuthorLink\(state, response\.content\)/);
    expect(source).toMatch(/hook: withAuthorLink\(state, outputHook\)/);
  });
});

describe('the address comes back after parsing', () => {
  test('html editor keeps [words](url), the address byte for byte', () => {
    const text = `Подробнее — [принцип Парето](${TOKEN}).`;
    expect(directives.restoreAuthorLink(text, WIKI, true)).toBe(
      `Подробнее — [принцип Парето](${WIKI}).`
    );
  });

  test('plain editor keeps the bare address, even where the model put words on it', () => {
    expect(directives.restoreAuthorLink(`Читайте: ${TOKEN}`, WIKI, false)).toBe(`Читайте: ${WIKI}`);
    expect(directives.restoreAuthorLink(`Читайте [статью](${TOKEN}).`, WIKI, false)).toBe(
      `Читайте статью ${WIKI}.`
    );
  });

  test('bent tokens are still the link: single braces, spaces, angle brackets', () => {
    for (const bent of ['{AUTHOR_LINK}', '{{ AUTHOR_LINK }}', `<${TOKEN}>`]) {
      expect(directives.restoreAuthorLink(`см. ${bent}`, WIKI, true)).toBe(`см. ${WIKI}`);
    }
  });

  test('a Cyrillic, percent-encoded address with $ and %28 survives unchanged', () => {
    const answer = {
      content: [{ content: `Раз [два](${TOKEN})`, usedCitationIds: [] }],
      hook: `${TOKEN}`,
      n: 3,
    };
    const restored = directives.restoreAuthorLinkDeep(answer, WIKI, true);
    expect(restored.content[0].content).toBe(`Раз [два](${WIKI})`);
    expect(restored.hook).toBe(WIKI);
    expect(restored.n).toBe(3);
    expect(decodeURI(restored.hook)).toContain('Принцип_Парето');
  });
});

/* Review W1 of the fifteenth walk, F3: bent tokens, leftovers, the question, the prompt. */
describe('a bent token still comes back as the address (fifteenth F3)', () => {
  const forms = [
    '{{AUTHOR\\_LINK}}',
    '\\{\\{AUTHOR\\_LINK\\}\\}',
    '{{author_link}}',
    '{{Author_Link}}',
    '{{AUTHOR-LINK}}',
    '{{AUTHOR–LINK}}',
    '{{ AUTHOR LINK }}',
    '{AUTHOR_LINK}',
    '<{{AUTHOR_LINK}}>',
  ];

  test.each(forms)('bare: %s', (form) => {
    expect(directives.restoreAuthorLink(`Читайте: ${form}`, WIKI, false)).toBe(`Читайте: ${WIKI}`);
  });

  test.each(forms)('on words: [words](%s)', (form) => {
    expect(directives.restoreAuthorLink(`[принцип Парето](${form})`, WIKI, true)).toBe(
      `[принцип Парето](${WIKI})`
    );
    expect(directives.restoreAuthorLink(`[принцип Парето](${form})`, WIKI, false)).toBe(
      `принцип Парето ${WIKI}`
    );
  });
});

describe('nothing of the token reaches the saved text (fifteenth F3)', () => {
  test('leftovers are stripped and counted; the words of a link stay', () => {
    expect(directives.stripLeftoverAuthorLink('Читайте тут AUTHOR_LINK.')).toEqual({
      text: 'Читайте тут.',
      found: 1,
    });
    expect(directives.stripLeftoverAuthorLink('[статья](AUTHOR\\_LINK) и {{AUTHOR_LINK}}')).toEqual({
      text: 'статья и',
      found: 2,
    });
  });

  test('ordinary words about an author link are the author\'s, not a token', () => {
    const text = 'The author link sits below; Author-link policy is ours.';
    expect(directives.stripLeftoverAuthorLink(text)).toEqual({ text, found: 0 });
  });

  test('deep: every string of an answer, the same object when nothing is found', () => {
    const clean = { content: [{ content: 'ok' }] };
    expect(directives.stripLeftoverAuthorLinkDeep(clean).value).toBe(clean);
    const dirty = { hook: 'x {{author_link}}', content: [{ content: 'y AUTHOR_LINK' }] };
    expect(directives.stripLeftoverAuthorLinkDeep(dirty)).toEqual({
      value: { hook: 'x', content: [{ content: 'y' }] },
      found: 2,
    });
  });

  test('the piece service strips leftovers before persisting an adaptation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts'),
      'utf8'
    );
    const strip = source.indexOf('stripLeftoverAuthorLinkDeep(output)');
    const persist = source.indexOf('await this.persist(organizationId, plan, output, answers)');
    expect(strip).toBeGreaterThan(0);
    expect(strip).toBeLessThan(persist);
  });
});

describe('the address never reaches the prompt beside the token (fifteenth W1)', () => {
  test('the address and its decoded form become the token; other links stay', () => {
    const decoded = decodeURI(WIKI);
    const text = `Ядро: ${WIKI} и ещё ${decoded}; см. https://example.com`;
    expect(directives.tokenizeAuthorLink(text, WIKI)).toBe(
      `Ядро: ${TOKEN} и ещё ${TOKEN}; см. https://example.com`
    );
    expect(directives.tokenizeAuthorLinkDeep({ answers: [`a: ${WIKI}`] }, WIKI)).toEqual({
      answers: [`a: ${TOKEN}`],
    });
  });

  test('the generator tokenizes brief, request, research and related, drops the kept copy, restores the question', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'libraries/nestjs-libraries/src/agent/agent.graph.service.ts'),
      'utf8'
    );
    expect(source.match(/brief: inPrompt\(state, briefBlock\(state\)\)/g)).toHaveLength(2);
    expect(source.match(/request: inPrompt\(state, state\.messages\[0\]\.content\)/g)).toHaveLength(2);
    expect(source).toMatch(/related: inPrompt\(state, relatedBlock\(state\)\)/);
    expect(source).toMatch(/information: inPrompt\(state, this\.researchText\(state\)\)/);
    expect(source).toMatch(/unavoidableQuestionV2\(withAuthorLink\(state, \(response as any\)\.unavoidableQuestion\)/);
    expect(source).toMatch(/keepLinks: hints\?\.authorLink\?\.url\s*\? hints\.keepLinks\?\.filter/);
  });
});
