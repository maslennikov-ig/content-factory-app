'use strict';

/**
 * `content-factory-next-97dq.17` — the markdown branch of the publish helper
 * keeps entities now, because dev.to, Hashnode, Medium and Whop render them
 * and would run a bare `<b>` as HTML. Discord has no HTML layer: `&lt;` would
 * print as five characters, so its provider decodes once, itself, before the
 * mention placeholders become `<@id>`.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const HELPER = 'libraries/helpers/src/utils/strip.html.validation.ts';
const helper = loadTypeScriptModule(HELPER);

const stub = new Proxy(
  {},
  { get: (_target, name) => (name === '__esModule' ? true : class {}) }
);
const passthrough = () => () => undefined;
const { discordContent } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/integrations/social/discord.provider.ts',
  {
    '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface':
      stub,
    '@contentfactory/nestjs-libraries/services/make.is': { makeId: () => 'id' },
    '@contentfactory/nestjs-libraries/integrations/social.abstract': {
      SocialAbstract: class {},
    },
    '@prisma/client': {},
    '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/discord.dto':
      { DiscordDto: class {} },
    '@contentfactory/nestjs-libraries/integrations/tool.decorator': {
      Tool: passthrough,
    },
  },
  {
    sources: { '@contentfactory/helpers/utils/strip.html.validation': HELPER },
  }
);

/** What `post.activity.ts` hands a markdown provider. */
const publish = (content, mention) =>
  helper.stripHtmlValidation('markdown', content, true, false, false, mention);

describe('Discord reads the body as text', () => {
  test('a person’s literal tag and comparison arrive as they wrote them', () => {
    const message = publish('<p>&lt;b&gt;x&lt;/b&gt; a &amp;lt; b</p>');
    expect(message).toBe('&lt;b&gt;x&lt;/b&gt; a &amp;lt; b\n');
    // One pass: `&amp;lt;` is the letters «&lt;», not a «<».
    expect(discordContent(message)).toBe('<b>x</b> a &lt; b\n');
  });

  test('mentions still become Discord mentions after the decode', () => {
    const message = publish(
      '<p>Привет <span data-mention-id="123" data-mention-label="Ivan">@Ivan</span> &amp; все</p>',
      (id) => `[[[@${id.replace('@', '')}]]]`
    );
    expect(message).toContain('[[[@123]]]');
    const content = discordContent(message);
    expect(content).toContain('<@123>');
    expect(content).toContain('& все');
    expect(content).not.toContain('&amp;');
  });
});

/**
 * The decision per provider, held where a new markdown provider would have
 * to make it: article platforms take the helper's entity-kept markdown as
 * is; Discord alone decodes; Lemmy is not on the markdown branch.
 */
describe('every markdown recipient has made its entity decision', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(
    __dirname,
    '..',
    'libraries/nestjs-libraries/src/integrations/social'
  );
  const markdownProviders = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.provider.ts'))
    .filter((file) =>
      /editor\s*=\s*'markdown'/u.test(fs.readFileSync(path.join(dir, file), 'utf8'))
    )
    .sort();

  test('the markdown recipients are the five the decision covers', () => {
    expect(markdownProviders).toEqual([
      'dev.to.provider.ts',
      'discord.provider.ts',
      'hashnode.provider.ts',
      'medium.provider.ts',
      'whop.provider.ts',
    ]);
    expect(
      fs.readFileSync(path.join(dir, 'lemmy.provider.ts'), 'utf8')
    ).toMatch(/editor\s*=\s*'normal'/u);
  });

  test.each(['dev.to', 'hashnode', 'medium', 'whop'])(
    '%s sends the entity-kept markdown unchanged',
    (name) => {
      const source = fs.readFileSync(path.join(dir, `${name}.provider.ts`), 'utf8');
      expect(source).not.toMatch(/decodeTextEntities|decodeForText/u);
    }
  );

  test('discord decodes both the post and the comment', () => {
    const source = fs.readFileSync(path.join(dir, 'discord.provider.ts'), 'utf8');
    expect(source.match(/discordContent\((?:firstPost|commentPost)\.message\)/gu)).toHaveLength(2);
  });
});
