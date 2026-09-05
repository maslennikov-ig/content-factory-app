'use strict';

/**
 * `content-factory-next-fn33.121`: the Russian interface called the same thing
 * two names on one screen.
 *
 * The AI provider settings read «Провайдер ИИ», «Режим использования AI»,
 * «Включённый AI недоступен», «пока AI-провайдер — OpenAI» — one after another.
 * A reader who does not already know the product has no way to tell that «ИИ»
 * and «AI» are the same subject, and reasonably assumes they are two.
 *
 * Russian has its own abbreviation for this and the product already used it in
 * fourteen strings, including the settings heading, the section name in the
 * menu, and the billing lines. So «ИИ» is the word, and a bare Latin `AI` in a
 * Russian string is the defect. The check is narrow on purpose: it looks for
 * `AI` standing alone as a word, which leaves product names — OpenAI, Vertex
 * AI Studio and anything else spelled by its owner — to the exception list
 * below, named one at a time.
 *
 * English is not touched: `AI` is the English word.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const localesDir = path.join(
  repositoryRoot,
  'libraries/react-shared-libraries/src/translation/locales'
);

const russian = JSON.parse(
  fs.readFileSync(path.join(localesDir, 'ru/translation.json'), 'utf8')
);

/**
 * Keys whose Russian text is allowed to keep a bare `AI`, each because the
 * letters belong to a name somebody else owns. Empty today; a name added later
 * belongs here with its reason beside it, not in a widened pattern.
 */
const NAMES_SPELLED_BY_THEIR_OWNERS = {};

/** `AI` as a word of its own: `AI-провайдер` counts, `OpenAI` does not. */
const BARE_AI = /(^|[^\p{L}\p{N}_])AI([^\p{L}\p{N}_]|$)/u;

describe('the Russian interface has one word for AI', () => {
  test('no Russian string says AI where it means ИИ', () => {
    const offenders = Object.entries(russian)
      .filter(
        ([key, value]) =>
          typeof value === 'string' &&
          BARE_AI.test(value) &&
          !(key in NAMES_SPELLED_BY_THEIR_OWNERS)
      )
      .map(([key, value]) => `${key}: ${value}`);

    expect(offenders).toEqual([]);
  });

  test('the word itself is still ИИ, so there is something to be consistent with', () => {
    expect(russian.ai).toBe('ИИ');
    expect(russian.ai_provider).toContain('ИИ');
  });

  test('English keeps the English word', () => {
    const english = JSON.parse(
      fs.readFileSync(path.join(localesDir, 'en/translation.json'), 'utf8')
    );
    expect(english.ai).toBe('AI');
    expect(english.ai_usage_mode).toContain('AI');
  });
});
