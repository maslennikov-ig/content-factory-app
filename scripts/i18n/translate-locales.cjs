/**
 * Fills the missing interface translations with the workspace's own model.
 *
 * The run is resumable by construction: it reads the locale file, translates
 * only what is still missing, and writes after every batch. Interrupting it
 * loses at most one batch, and starting it again picks up where it stopped.
 *
 * It never overwrites a translation that already exists, so a human correction
 * survives a later run. `--retranslate-copies` additionally revisits entries
 * whose value is byte-identical to the English one — those are placeholders
 * left behind by an earlier change, not translations.
 *
 * Usage:
 *   OPENROUTER_API_KEY=… node scripts/i18n/translate-locales.cjs [options]
 *
 *   --locales ru,de       only these locales (default: every one but English)
 *   --batch 40            keys per request
 *   --max-batches 2       stop early, for measuring cost before a long run
 *   --retranslate-copies  also replace values identical to the English text
 *   --dry-run             show what would be sent, call nothing
 */
const {
  translatableKeys,
  localeNames,
  readLocale,
  writeLocale,
  isFilled,
} = require('./collect-ui-keys.cjs');

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-5.6-luna';
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const LANGUAGE_NAMES = {
  ar: 'Arabic',
  bn: 'Bengali',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  he: 'Hebrew',
  it: 'Italian',
  ja: 'Japanese',
  ka_ge: 'Georgian',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  vi: 'Vietnamese',
  zh: 'Simplified Chinese',
};

const parseArguments = (argv) => {
  const options = {
    locales: null,
    batch: 40,
    maxBatches: Infinity,
    retranslateCopies: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--locales') options.locales = argv[++index].split(',');
    else if (argument === '--batch') options.batch = Number(argv[++index]);
    else if (argument === '--max-batches')
      options.maxBatches = Number(argv[++index]);
    else if (argument === '--retranslate-copies')
      options.retranslateCopies = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
};

/** `{{name}}` and `{name}` must survive translation or the string breaks. */
const placeholders = (text) => (text.match(/\{\{?[^{}]+\}?\}/g) || []).sort();

const sameSet = (left, right) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const instruction = (language) =>
  [
    `Translate user-interface strings from English into ${language}.`,
    '',
    'Rules:',
    '- Return a JSON object only: the same keys, the translated text as values.',
    '- Translate every key you are given. Never drop or add a key.',
    '- These are interface labels, buttons, headings and short messages. Keep',
    '  them as short as the English and in the register software uses.',
    '- Keep every placeholder exactly as written, including its braces and the',
    '  name inside: {{count}} stays {{count}}.',
    '- Never translate the product name "Content Factory", the names of other',
    '  products and networks (Tavily, OpenRouter, OpenAI, Telegram, LinkedIn,',
    '  Mastodon and so on), HTML tags, URLs or code identifiers.',
    '- Use the orthography of the language in full, including every diacritic',
    '  and accent. Never substitute an accented character with a plain one.',
    '- If a string is a single ambiguous word, translate it as an interface',
    '  label for that concept, not as prose.',
  ].join('\n');

const callModel = async (apiKey, language, entries) => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: instruction(language) },
        { role: 'user', content: JSON.stringify(entries, null, 1) },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(
      `${response.status}: ${detail.slice(0, 300)}`
    );
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('The model returned no content.');
  return { translations: JSON.parse(content), usage: payload.usage || {} };
};

const run = async () => {
  const options = parseArguments(process.argv.slice(2));
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey && !options.dryRun) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }

  const { translatable } = translatableKeys();
  const english = readLocale('en');
  const targets = (options.locales || localeNames()).filter(
    (locale) => locale !== 'en'
  );

  let batches = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let written = 0;
  const rejected = [];

  for (const locale of targets) {
    const language = LANGUAGE_NAMES[locale];
    if (!language) {
      console.log(`${locale}: пропущен, язык не описан в скрипте`);
      continue;
    }

    const data = readLocale(locale);
    const pending = [...translatable.keys()]
      .filter((key) => isFilled(english[key]))
      .filter((key) => {
        if (!isFilled(data[key])) return true;
        return options.retranslateCopies && data[key] === english[key];
      })
      .sort();

    if (!pending.length) {
      console.log(`${locale}: заполнено, работы нет`);
      continue;
    }
    console.log(`${locale} (${language}): к переводу ${pending.length}`);

    for (let from = 0; from < pending.length; from += options.batch) {
      if (batches >= options.maxBatches) {
        console.log('достигнут предел --max-batches, остановка');
        console.log(`итог: записей ${written}, запросов ${batches}`);
        return;
      }
      const slice = pending.slice(from, from + options.batch);
      const entries = Object.fromEntries(
        slice.map((key) => [key, english[key]])
      );

      if (options.dryRun) {
        console.log(`  [dry-run] ${slice.length} ключей: ${slice.slice(0, 3).join(', ')}…`);
        batches += 1;
        continue;
      }

      let result;
      try {
        result = await callModel(apiKey, language, entries);
      } catch (error) {
        console.log(`  ошибка запроса: ${error.message}`);
        // A failed batch is left for the next run rather than retried blindly:
        // the run is resumable, so nothing is lost by moving on.
        batches += 1;
        continue;
      }
      batches += 1;
      promptTokens += result.usage.prompt_tokens || 0;
      completionTokens += result.usage.completion_tokens || 0;

      let accepted = 0;
      for (const key of slice) {
        const value = result.translations[key];
        if (typeof value !== 'string' || !value.trim()) {
          rejected.push(`${locale}:${key}: пустой ответ`);
          continue;
        }
        if (!sameSet(placeholders(english[key]), placeholders(value))) {
          rejected.push(`${locale}:${key}: потеряна подстановка`);
          continue;
        }
        if (
          english[key].includes('Content Factory') &&
          !value.includes('Content Factory')
        ) {
          rejected.push(`${locale}:${key}: имя продукта переведено`);
          continue;
        }
        data[key] = value;
        accepted += 1;
      }

      writeLocale(locale, data);
      written += accepted;
      console.log(
        `  ${locale} ${from + slice.length}/${pending.length}` +
          ` принято ${accepted}/${slice.length}` +
          ` · токенов ${promptTokens + completionTokens}`
      );
    }
  }

  console.log(`\nзаписей добавлено: ${written}`);
  console.log(`запросов: ${batches}`);
  console.log(`токены: prompt ${promptTokens}, completion ${completionTokens}`);
  if (rejected.length) {
    console.log(`отклонено проверкой: ${rejected.length}`);
    for (const line of rejected.slice(0, 40)) console.log('   ·', line);
  }
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { placeholders, sameSet, instruction };
