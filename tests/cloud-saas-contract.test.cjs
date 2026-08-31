const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  loadTypeScriptModule,
  repositoryRoot,
} = require('./helpers/load-ts-module.cjs');

// WHAT THIS GUARD CAN AND CANNOT CATCH
//
// The product ships in sixteen languages. Nobody on the team reads most of
// them, and a regular expression cannot read any of them. So this file is
// built in three layers, and it is worth being blunt about the reach of each,
// because a long ledger of allowlisted lines looks like coverage whether or not
// any coverage exists.
//
// 1. Signals. A price is a currency symbol or code next to a number. An uptime
//    promise is a run of nines next to a percent sign. A certification is a
//    proper noun — SOC 2, ISO 27001, GDPR, DSGVO, ФЗ-152 — and so is a hosting
//    company, a cloud region slug and a city. None of that changes when the
//    sentence around it is translated into Japanese or Arabic, so these fire in
//    all sixteen languages. A free-or-trial offer is the one soft signal: a
//    short list of the words for "free of charge" and "trial", one per shipped
//    language, and only when a digit or the other word stands next to it. That
//    combination keeps ordinary copy — Spanish "Prueba el flujo", French
//    "nécessaire" — out of the way.
//
// 2. Phrases. The hand-written English and Russian alternations. They are the
//    only layer that understands a sentence, and they understand exactly two
//    languages out of sixteen.
//
// 3. Structure. For the published legal documents, a translation is held to the
//    Russian and English sources it was translated from: the same headings and
//    paragraph/list blocks in the same order, the same `updated` date, and no
//    signal the sources do not already carry.
//
// Structure cannot understand pure prose in a language nobody here reads. It
// can, however, keep the translation mechanically narrow: a standalone claim
// such as "we guarantee the service will never be interrupted" cannot be added
// as a new paragraph without changing the skeleton. Rewording an existing
// paragraph remains a semantic review problem for a person who reads it; the
// machine contract deliberately does not pretend otherwise.

// `\b` is ASCII-only. `\bбесплатн` cannot match at the start of a string and
// `certified\b` does not end at a Japanese full stop. Every boundary in this
// file is a Unicode-aware lookaround instead, and a test below fails if a `\b`
// is ever added back.
//
// The lookarounds name the scripts that write spaces between words. Japanese,
// Chinese, Korean, Arabic, Hebrew, Bengali and Georgian text runs letters
// together — `ISO 27001認証取得済み` puts a letter straight after the mark, and
// `の無料` puts one straight before it — so a boundary against every `\p{L}`
// silently refuses to match in exactly the languages this layer exists for.
// Against a Latin or Cyrillic letter the boundary still holds, which is what
// keeps `sla` out of `translate` and `free` out of `freedom`.
const BOUNDED_SCRIPT = String.raw`[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}_]`;
const EDGE_BEFORE = String.raw`(?<!${BOUNDED_SCRIPT})`;
const EDGE_AFTER = String.raw`(?!${BOUNDED_SCRIPT})`;
const edged = (body) => `${EDGE_BEFORE}${body}${EDGE_AFTER}`;

// Within one line: the two halves of a signal have to be near each other, not
// merely somewhere in the same document.
const NEAR = String.raw`[^\n]{0,24}`;

// Latin digits plus the Arabic-Indic and Bengali forms, because the Arabic and
// Bengali bundles write their numbers in them: `٧ أيام`, `৭ দিনের`.
const DIGIT = String.raw`[\d٠-٩۰-۹০-৯]`;

const CURRENCY_SYMBOL = String.raw`[€£₽¥₩₺৳₾₪₴₹]`;
const CURRENCY_CODE = String.raw`(?:USD|EUR|GBP|RUB|JPY|CNY|KRW|TRY|BDT|GEL|ILS|VND|BRL|INR|AED)`;

// One word per shipped language for "free of charge" and for "trial". English
// `free` is polysemous — "feel free", "free up space" — so the bare word is not
// a signal on its own; it only counts next to a digit or a trial word, which is
// what the offer patterns require of every language here.
const FREE_WORDS = String.raw`free|бесплатн\p{L}*|kostenlos\p{L}*|gratuit\p{L}*|gratis|grátis|gratuito\p{L}*|ücretsiz|無料|무료|免费|免費|miễn\s*phí|مجان\p{L}*|বিনামূল্যে|უფასო|חינם`;
const TRIAL_WORDS = String.raw`trial|пробн\p{L}*|триал\p{L}*|testversion|testphase|prueba\p{L}*|essai\p{L}*|prova|teste|deneme\p{L}*|試用|お試し|체험|dùng\s*thử|تجريب\p{L}*|ট্রায়াল|საცდელ\p{L}*|ניסיון`;

/**
 * Layer 1. Nothing here depends on the language of the sentence around it,
 * except the offer lexicon, which lists one stem per shipped language.
 *
 * The family names double as token names: `signalTokens` below turns a match
 * into `region:eu-west-1` or `money`, and the legal translation guard compares
 * those tokens between a translation and its source.
 */
const SIGNAL_FAMILIES = {
  money: [
    // `$` also means a regex backreference and a template hole in the source
    // files this pattern is pointed at. `'$2'` inside a `replace` call is one
    // digit followed by a quote; a price is two digits, or one digit followed
    // by anything else.
    String.raw`(?<!\p{L})\$\s?(?:${DIGIT}{2,}|${DIGIT}(?![\u0027\u0022\u0060]))`,
    String.raw`${CURRENCY_SYMBOL}\s?${DIGIT}`,
    String.raw`${DIGIT}\s?${CURRENCY_SYMBOL}`,
    String.raw`${EDGE_BEFORE}${CURRENCY_CODE}${EDGE_AFTER}[^\p{L}\n]{0,4}${DIGIT}`,
    String.raw`${DIGIT}[^\p{L}\n]{0,4}${EDGE_BEFORE}${CURRENCY_CODE}${EDGE_AFTER}`,
  ],
  // A run of nines against a percent sign, on either side of it, because
  // Turkish and Hebrew write `%99,9`. `100%` is deliberately not an uptime
  // claim — it is how the inherited billing copy says "no risk".
  uptime: [
    String.raw`9\s*9(?:[.,]\s?\d+)?\s*%`,
    String.raw`%\s*9\s*9(?:[.,]\s?\d+)?`,
    edged('sla'),
  ],
  offer: [
    String.raw`${EDGE_BEFORE}(?:${FREE_WORDS})${EDGE_AFTER}${NEAR}${DIGIT}`,
    String.raw`${DIGIT}${NEAR}${EDGE_BEFORE}(?:${FREE_WORDS})${EDGE_AFTER}`,
    String.raw`${EDGE_BEFORE}(?:${TRIAL_WORDS})${EDGE_AFTER}${NEAR}${DIGIT}`,
    String.raw`${DIGIT}${NEAR}${EDGE_BEFORE}(?:${TRIAL_WORDS})${EDGE_AFTER}`,
    String.raw`${EDGE_BEFORE}(?:${FREE_WORDS})${EDGE_AFTER}${NEAR}${EDGE_BEFORE}(?:${TRIAL_WORDS})${EDGE_AFTER}`,
    String.raw`${EDGE_BEFORE}(?:${TRIAL_WORDS})${EDGE_AFTER}${NEAR}${EDGE_BEFORE}(?:${FREE_WORDS})${EDGE_AFTER}`,
  ],
  // Compliance marks are proper nouns and survive translation unchanged. The
  // local names of the same regulation are listed beside the English one:
  // DSGVO is GDPR in German, RGPD in French, Spanish and Portuguese, KVKK is
  // the Turkish data protection act, APPI the Japanese one.
  certification: [
    edged(String.raw`soc\s?2`),
    edged(
      String.raw`iso(?:\s?/\s?iec)?\s?-?\s?(?:9001|14001|22301|27001|27017|27018|27701|42001)`
    ),
    edged(String.raw`pci[-\s]?dss`),
    edged(
      String.raw`(?:hipaa|gdpr|ccpa|cpra|sox|fedramp|hitrust|dsgvo|rgpd|lgpd|pipl|appi|kvkk|pdpa|pipeda)`
    ),
    edged(String.raw`(?:ФЗ[-\s]?152|152[-\s]?ФЗ)`),
  ],
  provider: [
    edged(
      String.raw`(?:hetzner|ovh|digitalocean|linode|vultr|scaleway|selectel|timeweb|beget|equinix|leaseweb|contabo|netcup)`
    ),
    edged(
      String.raw`(?:aws|amazon\s+web\s+services|gcp|google\s+cloud|microsoft\s+azure|azure|yandex\s+cloud|vk\s+cloud|sber\s?cloud|alibaba\s+cloud)`
    ),
  ],
  region: [
    edged(
      String.raw`(?:eu|us|ap|ca|sa|me|af)-(?:central|west|east|north|south|northeast|southeast|northwest|southwest)-\d`
    ),
  ],
  city: [
    edged(
      String.raw`(?:falkenstein|n(?:u|ü)rnberg|nuremberg|frankfurt|helsinki|amsterdam|ashburn|hillsboro|singapore|франкфурт\p{L}*|фалькенштайн\p{L}*|нюрнберг\p{L}*|амстердам\p{L}*)`
    ),
  ],
  entity: [
    edged('(?:ООО|ОАО|ЗАО|ПАО|ИНН|ОГРН|ОГРНИП|КПП)'),
    edged(String.raw`(?:LLC|GmbH|OÜ|s\.r\.o\.)`),
    edged(String.raw`Ltd\.?`),
    edged(String.raw`Inc\.`),
  ],
};

/**
 * Layer 2. English and Russian only.
 *
 * A literal-phrase blocklist catches only the phrasing whoever wrote it
 * happened to think of: `free tier` was listed and `Free plan` was not,
 * `pricing from $19/mo` was listed and `Starts at $19 per month` was not. What
 * follows is one family per forbidden claim, so a writer reaching for the
 * natural English or Russian wording hits the guard rather than the exact
 * wording of an old review comment. Fourteen other languages get layer 1 and,
 * in the legal directory, layer 3.
 */
const PHRASE_FAMILIES = {
  freePlan: [
    edged(String.raw`free\s+(?:tier|plan|forever|account|version)`),
    edged(String.raw`forever\s+free`),
    edged(String.raw`start\s+for\s+free`),
    `${EDGE_BEFORE}(?:start|starting|begin|try|get\\s+started|sign\\s+up|join)${EDGE_AFTER}[^\\n]{0,20}${edged(
      String.raw`for\s+free`
    )}`,
    edged(String.raw`(?:start|begin|try|join)\s+(?:it\s+|this\s+)?free`),
    // "Pay nothing for the first 7 days" says free without saying free, in
    // both languages. The English and Russian layer missed it until the
    // Japanese, Chinese and Georgian translations of the same key — which do
    // use their word for free — were caught by the offer signal and had no
    // source claim to point back at.
    edged(String.raw`pay\s+nothing`),
    `${EDGE_BEFORE}(?:не\\s+)?плат\\p{L}+\\s+ничего`,
    `${EDGE_BEFORE}бесплатн\\p{L}*\\s+(?:тариф\\p{L}*|план\\p{L}*|верси\\p{L}*|аккаунт\\p{L}*|навсегда)`,
    `${EDGE_BEFORE}(?:навсегда|всегда)\\s+бесплатн\\p{L}*`,
    `${EDGE_BEFORE}(?:начн\\p{L}+|попробуйте|регистрируйтесь|подключайтесь)[^\\n]{0,24}бесплатн\\p{L}*`,
    `${EDGE_BEFORE}(?:перв\\p{L}+|один)\\s+(?:месяц\\p{L}*|недел\\p{L}+)\\s+бесплатн\\p{L}*`,
  ],
  trial: [
    edged(String.raw`free\s+trial`),
    edged(String.raw`trial\s+period`),
    edged(String.raw`\d+[-\s]day\s+(?:free\s+)?trial`),
    edged(String.raw`trial\s+for\s+\d+\s+days?`),
    edged(String.raw`free\s+for\s+\d+\s+(?:days?|weeks?|months?)`),
    edged(String.raw`\d+\s+(?:days?|weeks?|months?)\s+free\s+trial`),
    `${EDGE_BEFORE}пробн\\p{L}+\\s+период\\p{L}*`,
    `${EDGE_BEFORE}тестов\\p{L}+\\s+период\\p{L}*`,
    `${EDGE_BEFORE}бесплатн\\p{L}*\\s+триал\\p{L}*`,
    `${EDGE_BEFORE}\\d+\\s*-?\\s*(?:дн\\p{L}+|недел\\p{L}+|месяц\\p{L}*)\\s+(?:бесплатн\\p{L}*|пробн\\p{L}*)`,
  ],
  price: [
    `[$€£₽]\\s?\\d[\\d\\s.,]*\\s*(?:/|\\s+(?:per|a|в|за)\\s+)\\s*(?:mo${EDGE_AFTER}|month|yr${EDGE_AFTER}|year|user|seat|мес\\p{L}*|год\\p{L}*|пользовател\\p{L}*)`,
    `\\d[\\d\\s.,]*\\s*(?:₽|руб\\p{L}*|usd|eur|rub|долл\\p{L}*|евро)\\.?\\s*(?:/|\\s+(?:в|за|per|a)\\s+)\\s*(?:мес\\p{L}*|год\\p{L}*|month|year|mo${EDGE_AFTER}|yr${EDGE_AFTER})`,
    `${EDGE_BEFORE}(?:from|starts?\\s+at|starting\\s+(?:at|from)|only|just)\\s+[$€£₽]\\s?\\d`,
    edged(String.raw`pricing\s+from`),
    `${EDGE_BEFORE}(?:от|всего|начиная\\s+с)\\s+\\d[\\d\\s]*\\s*(?:₽|руб\\p{L}*|€|\\$)`,
    `${EDGE_BEFORE}(?:стоит|стоимость|цена)[^\\n]{0,20}\\d[\\d\\s.,]*\\s*(?:₽|руб\\p{L}*|\\$|€)`,
    edged(String.raw`per\s+(?:user|seat)\s+per\s+month`),
  ],
  uptime: [
    `\\d{1,3}(?:[.,]\\d+)?\\s*%\\s*(?:uptime|availability|доступност\\p{L}*|аптайм\\p{L}*)`,
    `${EDGE_BEFORE}uptime\\s+(?:of\\s+)?\\d`,
    edged(String.raw`service[-\s]level\s+agreement`),
    edged(String.raw`(?:three|four|five)\s+nines`),
    `${EDGE_BEFORE}соглашени\\p{L}*\\s+об\\s+уровне\\s+(?:сервиса|обслуживания|услуг)`,
    `${EDGE_BEFORE}гарант\\p{L}*\\s+(?:доступност\\p{L}*|аптайм\\p{L}*|бесперебойн\\p{L}*)`,
  ],
  commitment: [
    edged(String.raw`cancel\s+(?:at\s+)?any\s?time`),
    `${EDGE_BEFORE}отмен\\p{L}*\\s+(?:подписк\\p{L}+\\s+)?в\\s+любой\\s+момент`,
    edged(String.raw`money[-\s]back`),
    `${EDGE_BEFORE}\\d+[-\\s]day\\s+(?:money|refund)`,
    `${EDGE_BEFORE}гарант\\p{L}*\\s+возврат\\p{L}*`,
    `${EDGE_BEFORE}возврат\\s+(?:денег|средств|платеж\\p{L}*)`,
    edged(String.raw`no\s+(?:credit\s+)?card`),
    edged(String.raw`without\s+a\s+(?:credit\s+)?card`),
    edged(String.raw`required\s+card`),
    edged(String.raw`без\s+карт(?:ы|у|ой)`),
    `${EDGE_BEFORE}карт\\p{L}*\\s+не\\s+(?:нужн\\p{L}*|требуется|потребуется)`,
  ],
  infrastructure: [
    `${EDGE_BEFORE}hosted\\s+(?:in|on|at|by)\\s+\\p{L}`,
    // `(?:are\s+)?` covered "servers are in Germany" and missed "the server is
    // in Russia" — one machine instead of several, which is the sentence a
    // small product actually writes. The copula is optional and either number
    // now, so "server in Russia" is caught as well.
    `${EDGE_BEFORE}servers?\\s+(?:is\\s+|are\\s+)?(?:in|located\\s+in|hosted\\s+in)\\s+\\p{L}`,
    edged(String.raw`data\s+cent(?:er|re)s?\s+(?:in|located)`),
    edged(String.raw`data\s+residen(?:cy|t)`),
    `${EDGE_BEFORE}резидентност\\p{L}*\\s+данных`,
    // Stems, not two fixed word forms. `серверы` and `данные` are nominative
    // plural only, so "Сервер находится в России" — singular, and the way the
    // sentence is actually written — walked past the guard in Russian at the
    // same time as its English twin did.
    `${EDGE_BEFORE}(?:сервер\\p{L}*|данн\\p{L}+|дата-?центр\\p{L}*)\\s+(?:наход\\p{L}+|размещ\\p{L}+|хран\\p{L}+)\\s+в\\s+\\p{L}`,
    `${EDGE_BEFORE}размещ\\p{L}+\\s+(?:в|на)\\s+(?:hetzner|aws|selectel|облаке)${EDGE_AFTER}`,
  ],
  // `certif-` is the stem in English, Spanish, French, Italian and Portuguese
  // at once, which is luck rather than design; German `Zertifizierung`,
  // Turkish `sertifika` and every non-Latin script are not covered here. The
  // certification marks in layer 1 are what carry those languages.
  legalAndCertification: [
    edged(String.raw`certif(?:ied|ication|icates?|y|ying)`),
    edged(String.raw`compl(?:iance|iant)`),
    `${EDGE_BEFORE}сертифи(?:цир\\p{L}*|кац\\p{L}*|кат\\p{L}*)`,
  ],
};

// Both layers name a family `uptime`, and spreading one object over the other
// dropped the signal half of it: `SLA` and `99.9%` stopped matching while the
// suite stayed green, because the phrase family caught the two examples the
// table happened to hold. The families are concatenated, never replaced.
const mergeFamilies = (...groups) => {
  const merged = {};
  for (const group of groups) {
    for (const [family, patterns] of Object.entries(group)) {
      merged[family] = [...(merged[family] ?? []), ...patterns];
    }
  }
  return merged;
};

const CLAIM_TOKEN_FAMILIES = mergeFamilies(SIGNAL_FAMILIES, PHRASE_FAMILIES);

// Named families produce `family:value` tokens — a translation naming a
// different region than its source is a different claim, not the same one.
// Unnamed families produce the bare family name, because "some price" is as
// much as the pattern honestly knows.
const NAMED_SIGNAL_FAMILIES = new Set([
  'certification',
  'provider',
  'region',
  'city',
  'entity',
]);

const UNDECIDED_PUBLIC_CLAIM_PATTERN = new RegExp(
  Object.values(CLAIM_TOKEN_FAMILIES).flat().join('|'),
  'iu'
);

const CLAIM_PATTERN =
  /\bself[- ]?host(?:ed|ing)?\b|\b(?:deploy|install)\s+(?:it|content factory)\s+(?:on|to)\s+(?:your|an?)\s+(?:own\s+)?server\b|самостоятельн(?:ое|ого|ую)\s+(?:размещени|установк)|на\s+сво(?:е|ё)м\s+сервер|разверн(?:уть|ите|ывание)[^\n]{0,80}сервер/iu;

const normaliseToken = (value) =>
  value
    .toLowerCase()
    .replace(/[\s./\\-]+/gu, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/^-+|-+$/g, '');

/**
 * Every claim this file can recognise in `text`, as a set of comparable
 * tokens. Used by the legal translation guard: a translation may carry a claim
 * only where the Russian or English source it came from already carries the
 * same one.
 */
const claimTokens = (text) => {
  const tokens = new Set();
  for (const [family, patterns] of Object.entries(CLAIM_TOKEN_FAMILIES)) {
    const pattern = new RegExp(patterns.join('|'), 'giu');
    for (const [match] of text.matchAll(pattern)) {
      tokens.add(
        NAMED_SIGNAL_FAMILIES.has(family)
          ? `${family}:${normaliseToken(match)}`
          : family
      );
    }
  }
  return tokens;
};

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const loadPublicCopy = (translate) =>
  loadTypeScriptModule(
    'apps/frontend/src/components/public-saas/public-copy.ts',
    {
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => translate,
      },
      '@contentfactory/react/helpers/variable.context': {
        useVariables: () => ({ language: 'en' }),
      },
    }
  );

// Filtering on `public_saas_` left every other shipped string unscanned, and
// the commercially closest copy in the product — the `ai_usage_` allowance
// messages — lives outside that namespace. Every key is scanned now; the
// upstream billing copy this turns up is held in an exact ledger below.
const localeClaims = (bundles) => {
  const found = [];
  for (const [locale, messages] of Object.entries(bundles)) {
    for (const [key, text] of Object.entries(messages)) {
      if (
        typeof text === 'string' &&
        UNDECIDED_PUBLIC_CLAIM_PATTERN.test(text)
      ) {
        found.push({ file: `${locale}/${key}`, text });
      }
    }
  }
  return found;
};

// The languages the ledgers are written in, because they are the two the team
// reads. Everything else is held to them rather than written down again.
const SOURCE_LANGUAGES = ['en', 'ru'];

const localeOf = (entry) => entry.file.slice(0, entry.file.indexOf('/'));
const keyOf = (entry) => entry.file.slice(entry.file.indexOf('/') + 1);

const pickLocales = (bundles, locales) =>
  Object.fromEntries(
    locales.filter((locale) => bundles[locale]).map((l) => [l, bundles[l]])
  );

/**
 * A translated string may trip the claim pattern only where the same key trips
 * it in English or Russian.
 *
 * Sixteen locales × the inherited Postiz billing copy is around eighty lines of
 * text in scripts the team cannot proofread. Pinning each one exactly would be
 * a ledger nobody rereads — length standing in for assurance. The invariant
 * that actually matters is that translation cannot introduce a commercial claim
 * where the source has none, and that is derived rather than written down.
 * `tests/locale-key-set.test.cjs` holds all sixteen bundles to the same key set,
 * so there is always a source key to compare against.
 */
const translationOnlyLocaleClaims = (bundles) => {
  const sourceKeys = new Set(
    localeClaims(pickLocales(bundles, SOURCE_LANGUAGES)).map(keyOf)
  );
  return localeClaims(bundles).filter(
    (entry) =>
      !SOURCE_LANGUAGES.includes(localeOf(entry)) &&
      !sourceKeys.has(keyOf(entry))
  );
};

// The contract documents used to be checked for existence only, so a price or
// an SLA written into `PRODUCT.md` passed. `readFile` is injectable so the
// reading itself can be asserted rather than assumed.
const documentClaims = (files, readFile = read) =>
  files.flatMap((file) =>
    readFile(file)
      .split(/\r?\n/)
      .flatMap((line, index) =>
        UNDECIDED_PUBLIC_CLAIM_PATTERN.test(line)
          ? [{ file, line: index + 1, text: line.trim() }]
          : []
      )
  );

const LOCALES_ROOT = 'libraries/react-shared-libraries/src/translation/locales';

const shippedLanguages = () =>
  fs
    .readdirSync(path.join(repositoryRoot, LOCALES_ROOT), {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const readLocaleBundles = () =>
  Object.fromEntries(
    shippedLanguages().map((language) => [
      language,
      JSON.parse(read(`${LOCALES_ROOT}/${language}/translation.json`)),
    ])
  );

const USER_FACING_ROOTS = [
  'apps/frontend/src',
  'apps/frontend/public',
  'apps/sdk',
  'libraries/react-shared-libraries/src',
];

const PUBLIC_CLAIM_ROOTS = [
  'apps/frontend/src/app/(public)',
  'apps/frontend/src/components/public-saas',
];

const LEGAL_CONTENT_ROOT = 'apps/frontend/src/content/legal';

const CONTRACT_FILES = [
  'PRODUCT.md',
  'docs/product/cloud-saas-growth-spec.md',
  'docs/adr/0010-cloud-first-agpl-saas.md',
  'docs/operations/saas-readiness.md',
];

// The four documents that name the open gates have to say what the gates are,
// so the sentences enumerating them read like the claims they forbid. They are
// held exactly and shrink-only: reword one and the guard asks for the new
// wording to be looked at, which is the point of writing them down here rather
// than teaching the pattern to ignore a negation.
const CONTRACT_DOCUMENT_ALLOWLIST = new Map([
  [
    'PRODUCT.md',
    new Set([
      'До отдельных решений продукт не заявляет стоимость, бесплатный тариф, условия',
      'провайдер, регион хранения, юридическое лицо, SLA или сертификация. Публичная',
    ]),
  ],
  [
    'docs/product/cloud-saas-growth-spec.md',
    new Set([
      '- стоимость, бесплатный план, условия trial и необходимость карты;',
      '- SLA, сертификации и формальные compliance-утверждения;',
    ]),
  ],
  [
    'docs/adr/0010-cloud-first-agpl-saas.md',
    new Set([
      '- Цена, trial/card policy, provider, region, legal entity, subprocessors, SLA и',
      'certification не выводятся из Cloud-first решения и требуют отдельных',
    ]),
  ],
  [
    'docs/operations/saas-readiness.md',
    new Set([
      'публиковать цену, trial/card policy, provider/region, legal, SLA или',
      'certification до отдельных решений и доказательств.',
      '- SLA, certification и формальные compliance claims;',
    ]),
  ],
]);

// Upstream Postiz billing copy, inherited with the fork and still referenced by
// the billing screens. None of it is reachable from a public surface and none
// of it was written for this product's commercial gates; it is grandfathered
// exactly so that new copy cannot hide behind it. The two
// `public_saas_security_limits_body` entries are this product's own strings and
// they deny a certification rather than claim one.
//
// English and Russian only. The other fourteen translations of these same keys
// are covered by `translationOnlyLocaleClaims`, which needs no ledger.
const LOCALE_CLAIM_ALLOWLIST = new Map(
  [
    ['en/100_no_risk_trial', '100% no-risk trial'],
    ['en/billing_100_percent_free', '100% free'],
    ['en/billing_cancel_anytime', 'Cancel anytime, from settings'],
    ['en/billing_cancel_anytime_short', 'Cancel anytime from settings'],
    [
      'en/billing_cancel_notice',
      'Cancel anytime from settings without talking to a person and never be charged.',
    ],
    ['en/billing_no_risk_trial', '100% No-Risk Free Trial'],
    ['en/billing_pay_0_start_trial', 'Pay $0 Today - Start your free trial!'],
    ['en/billing_pay_nothing_7_days', 'Pay NOTHING for the first 7-days'],
    ['en/billing_your_7_day_trial_is', 'Your 7-day trial is'],
    ['en/cancel_anytime_hassle_free', 'Cancel anytime, from settings'],
    [
      'en/cancel_subscription_confirm',
      'This will immediately cancel the subscription. The user will be downgraded to the FREE plan. This cannot be undone.',
    ],
    [
      'en/faq_to_confirm_credit_card_information_we_will_hold',
      'To confirm credit card information Content Factory will hold $2 and release it immediately, you can cancel your subscription anytime from settings without talking to a person',
    ],
    ['en/pay_nothing_for_the_first_7_days', 'Pay nothing for the first 7 days'],
    [
      'en/purchase_a_life_time_pro_account_with_sol_199',
      'Purchase a Life-time PRO account with SOL ($199), Please be advised that there is no refund for this purchase.',
    ],
    [
      'en/public_saas_security_limits_body',
      'This page describes product boundaries, not a certification. Verify deployment, retention, and incident practices with your operator.',
    ],
    ['en/start_7_days_free_trial', 'Start 7 days free trial'],
    ['ru/100_no_risk_trial', '100% безрисковый пробный период'],
    ['ru/billing_100_percent_free', '100% бесплатно'],
    ['ru/billing_no_risk_trial', '100% бесплатный пробный период без риска'],
    [
      'ru/billing_pay_0_start_trial',
      'Заплатите $0 сегодня — начните бесплатный пробный период!',
    ],
    ['ru/billing_pay_nothing_7_days', 'Платите НИЧЕГО первые 7 дней'],
    ['ru/billing_your_7_day_trial_is', 'Ваш 7-дневный пробный период'],
    [
      'ru/faq_to_confirm_credit_card_information_we_will_hold',
      'Для подтверждения информации о кредитной карте Content Factory временно удержит $2 и сразу же их вернет. Вы можете отменить подписку в любое время через настройки без необходимости разговаривать с оператором.',
    ],
    ['ru/fast_track_charge_now', 'Завершить пробный период и оплатить'],
    ['ru/pay_nothing_for_the_first_7_days', 'Не платите ничего первые 7 дней'],
    [
      'ru/public_saas_security_limits_body',
      'Страница описывает границы продукта, а не сертификацию. Уточняйте развёртывание, хранение и работу с инцидентами у оператора.',
    ],
    [
      'ru/purchase_a_life_time_pro_account_with_sol_199',
      'Приобретите пожизненный PRO-аккаунт за SOL ($199). Обратите внимание, что возврат средств за эту покупку не предусмотрен.',
    ],
    [
      'ru/social_channel_connected_elsewhere',
      'Этот канал уже был подключён к другому аккаунту Content Factory.\nЧтобы продолжить, завершите пробный период и оплатите подписку сейчас.\n\nПлатёж окончательный и возврату не подлежит.',
    ],
    [
      'ru/start_7_days_free_trial',
      'Начать 7-дневную бесплатную пробную версию',
    ],
  ].map(([key, text]) => [key, new Set([text])])
);

const USER_FACING_ALLOWLIST = new Map([
  [
    'apps/frontend/src/components/new-launch/providers/reddit/subreddit.tsx',
    new Set(['placeholder="/r/selfhosted"']),
  ],
  [
    'libraries/react-shared-libraries/src/platform/platform.card.tsx',
    new Set([
      '* against a self-hosted server, a LinkedIn profile against a company page.',
    ]),
  ],
  [
    'libraries/react-shared-libraries/src/platform/platform.families.ts',
    new Set([
      '* against a self-hosted one, a LinkedIn profile against a company page. The',
    ]),
  ],
]);

// The published legal documents are the one surface where some of the
// forbidden vocabulary is not a forbidden claim. A privacy policy has to name
// the country its servers stand in and the service that sends its mail, and a
// terms document has to describe rights and refunds; refusing to say those
// things would not make the product safer, it would make the document useless.
//
// So for the two source languages the pattern is not weakened and the directory
// is not skipped: every line of Russian or English legal text that trips it is
// written down here, exactly, and the comparison runs both ways. A new claim
// fails as `extra`, and a line that stops matching has to leave the ledger, so
// the list can only shrink unless someone deliberately adds to it.
//
// The other fourteen languages are not pinned line by line — see
// `legalTranslationProblems` for what holds them instead, and why.
const LEGAL_CONTENT_ALLOWLIST = new Map(
  [
    // The hosting country, in four places and two languages. This is the entry
    // the ledger exists for: the product has not published where it runs
    // anywhere else, so these four lines are the decision, and moving the
    // country — or the owner correcting a fact nobody could verify from the
    // repository — has to come back through here. It has already happened once:
    // these said Russia until the machine was found to be in Amsterdam and the
    // owner confirmed the Netherlands.
    [
      'apps/frontend/src/content/legal/privacy.en.md',
      'The server is in the Netherlands. The database, the files, the newsletter',
    ],
    [
      'apps/frontend/src/content/legal/privacy.ru.md',
      'Сервер находится в Нидерландах. База данных, файлы, система рассылок и сборщик',
    ],
    [
      'apps/frontend/src/content/legal/subprocessors.en.md',
      'The server is in the Netherlands. The database, the files, the newsletter',
    ],
    [
      'apps/frontend/src/content/legal/subprocessors.ru.md',
      'Сервер находится в Нидерландах. База данных, файлы, система рассылок и сборщик',
    ],
    // Who provides the service, in both sources. This is a decision and belongs
    // here: the documents named no one until 2026-08-22, and a data subject
    // cannot address a request to "the owner". The owner confirmed that the
    // company operating megacampus.ru operates this service too. Changing the
    // operator has to come back through this ledger.
    [
      'apps/frontend/src/content/legal/terms.en.md',
      'The service is provided by OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS), OGRN',
    ],
    [
      'apps/frontend/src/content/legal/terms.ru.md',
      'Сервис предоставляет ООО «МЕГАКАМПУС», ОГРН 1107746107204, ИНН 7719743262,',
    ],
    // The same decision in the privacy policy, where the registered address
    // makes the line read as a location claim. It is a legal address, not where
    // the machine runs — that stays the Netherlands, four entries above.
    [
      'apps/frontend/src/content/legal/privacy.en.md',
      'The operator of personal data is OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS), OGRN',
    ],
    [
      'apps/frontend/src/content/legal/privacy.ru.md',
      '«МЕГАКАМПУС», ОГРН 1107746107204, ИНН 7719743262, адрес: 105318, г. Москва,',
    ],
    [
      'apps/frontend/src/content/legal/privacy.en.md',
      "sends this product's mail from the `eu-west-1` region. That means your email",
    ],
    [
      'apps/frontend/src/content/legal/privacy.ru.md',
      'отправляет письма нашего продукта из региона `eu-west-1`. Это значит, что ваш',
    ],
    [
      'apps/frontend/src/content/legal/subprocessors.en.md',
      "product's mail is sent from the `eu-west-1` region.",
    ],
    [
      'apps/frontend/src/content/legal/subprocessors.ru.md',
      'продукта отправляются из региона `eu-west-1`.',
    ],
    [
      'apps/frontend/src/content/legal/terms.en.md',
      'There is no service level agreement here, and we are not entering into one.',
    ],
    [
      'apps/frontend/src/content/legal/terms.ru.md',
      'Никакого соглашения об уровне обслуживания здесь нет, и мы его не заключаем.',
    ],
  ].reduce((ledger, [file, text]) => {
    if (!ledger.has(file)) ledger.set(file, new Set());
    ledger.get(file).add(text);
    return ledger;
  }, new Map())
);

const HISTORICAL_OPERATOR_ALLOWLIST = new Map([
  [
    'docs/operations/configuration.md',
    new Set([
      'Включённый `CONTENT_FACTORY_GENERIC_OAUTH="true"` заменяет собой все остальные кнопки входа — Google, GitHub и Telegram на странице входа не появятся. Не задавайте переменную, если self-hosted provider не настроен.',
      'Каждая OAuth-платформа имеет client id/secret или token variables в `.env.example`: X, LinkedIn, Reddit, Threads/Facebook/Instagram, YouTube, TikTok, Pinterest, Dribbble, Tumblr, Discord, Slack и другие. Некоторые self-hosted providers принимают URL/credentials на уровне подключения канала.',
    ]),
  ],
  [
    'docs/operations/error-collection.md',
    new Set([
      'self-hosted Sentry с минимумом 4 GB этот стек не требует отдавать ему весь',
    ]),
  ],
  [
    'docs/operations/outbound-connections.md',
    new Set([
      '| Редактор изображений Polotno | **удалён** вместе с зависимостью `polotno`. Встроенного редактора у продукта нет — это осознанный пробел | `ry5.1` — закрыта решением; новый редактор только self-hosted |',
      '| `ghcr.io/gitroomhq/postiz-app:latest` | корневой `docker-compose.yaml` — упакованный пример самостоятельного размещения апстрима — тянул чужой образ вместо нашего кода | **исправлено**: файл удалён (`content-factory-next-woy`). Локальная разработка идёт через `docker-compose.dev.yaml`, развёртывание — через `deploy/production/` |',
    ]),
  ],
  [
    'docs/prompts/codex-memory-and-external-services.md',
    new Set([
      'The mechanism is intact and waiting: `NewsletterInterface`, `NewsletterService.getProvider()` and three providers, of which the empty one is active. Wire up listmonk, which is self-hosted, so subscriber addresses stay on our server. Do not use beehiiv; it is an external service.',
      'Then the part that matters more than the plumbing: today the product subscribes people silently when they register. That is wrong however self-hosted it is. Add an explicit consent checkbox to registration and an unsubscribe page, and only call the newsletter when consent was given. New interface strings go into all sixteen locale files in the same commit, or the locale guard turns red.',
      '- `ry5.1` — the Polotno image editor: pay for a key, replace it with a self-hosted editor, or drop the editor. The owner has not chosen. Do not choose for them.',
    ]),
  ],
  [
    'docs/prompts/deep-research-image-editor.md',
    new Set([
      'Goal: Recommend one embedded image editor, plus one fallback, to replace Polotno in a self-hosted AGPL-3.0 social-publishing product. Deliver a decision with evidence, not a vendor survey. The incumbent is being dropped for cost, so a recommendation that merely trades one subscription for another has not answered the question.',
      '- Cost expressed as total cost of ownership for one self-hosted instance with a handful of users — not per seat, not per MAU, unless the vendor only prices that way, in which case say so and compute it for 5 and for 50 users.',
      '- The product is Content Factory, a self-hosted social-publishing tool licensed **AGPL-3.0**. Its source is published. Any library bundled into the frontend is therefore distributed as part of an AGPL work and must be licence-compatible with that: permissive licences (MIT, Apache-2.0, BSD, ISC) and GPL-family licences are workable; a proprietary or source-available library linked into the bundle is not, and neither is a "free for open source, paid for commercial" library whose commercial terms forbid redistribution of the source.',
      '- Penpot, self-hosted — assess whether it can be embedded at all, or only linked to as a separate application.',
    ]),
  ],
  [
    'docs/prompts/deep-research-search-backend.md',
    new Set([
      '- The product is a self-hosted, multi-tenant social-publishing tool. Each workspace stores its own encrypted AI key; model calls already route through OpenRouter. Adding a second search vendor means a second key, a second bill, and a second place to configure per workspace.',
      '- SearXNG, self-hosted',
    ]),
  ],
  [
    'docs/research/image-editor-selection.md',
    new Set([
      'self-hosted сборка обслуживает 5 и 50 пользователей без оплаты за место.',
      '[self-hosting](https://help.penpot.app/technical-guide/getting-started/)). Публичной',
      '| **miniPaint 4.14.3** | MIT, проходит | Self-host локален, но Google Fonts API надо удалить | Почти весь floor готов | $0 | 22 дн. | Активен, release 2026-04-20, bus factor 1 | Готовое приложение, не React library; SSR неприменим | Google Fonts path; лок. Cyrillic fork нужен | Keyboard shortcuts есть; screen-reader status не подтв. |',
      '| **Penpot 2.17.1** | MPL-2.0, проходит с notice/source obligations | Self-host без vendor-call, но требует свой backend/exporter | Функции есть, client-only floor нет | $0 + infra | 35 дн. | Очень активен, release 2026-08-17 | Не React component; отдельный stack | Upload fonts; Cyrillic не проверен здесь | Продуктовая UI; embed accessibility не подтв. |',
      '| 8. Полностью client-side, zero third-party | **Готово** при локальных assets | Доработать: remote translations off, cloud off, deny-test | **Готово** при локальных assets | Доработать: deny-test | Доработать: embeds/links off, deny-test | Доработать: self-host + удалить Google Fonts/API | **Нет**: backend/storage/exporter обязательны |',
      'Расчёт: **$800/инженерный день**, один релиз для одного self-hosted instance,',
      'использует Google Fonts API; обещание верно только после self-host fork,',
    ]),
  ],
  [
    'docs/research/web-search-backend-tavily-primary-2026-08-13.md',
    new Set([
      "| **SearXNG (self-host)** | Can enable Yandex engine → RU coverage; but Google engine actively blocked | AGPL self-host; upstream engines' ToS still apply | SERP snippets (JSON `format=json`); not full page text | Self-hosted; no per-tenant billing | Server cost only (~flat) | engine-dependent | **Fragile**: Google/Bing block instances | LangChain `SearxSearchWrapper` |",
      "- **SearXNG** — AGPL self-hosted; the project itself warns that public instances are rate-limited/blocked by upstream engines, and upstream engines' ToS still apply to scraped results. **Verdict: self-host shifts the compliance burden to you.**",
      '| SearXNG (self-host) | — | — | — | ~flat server cost (small VPS), 0 marginal |',
    ]),
  ],
  [
    'docs/research/web-search-backend-openrouter-parallel-primary-2026-08-13.md',
    new Set([
      '| **SearXNG self-hosted — 3.13/5** | **3.6/5.** Есть language/locale parameter и агрегация множества внешних engines; реальный RU recall полностью определяется выбранными upstreams. [docs version 2026.7.28] citeturn30search0turn30search4 | **2/5.** AGPL определяет права на сам SearXNG, но не даёт лицензию на контент Google/Yandex/прочих upstreams; это следует из архитектуры, где query передаётся external search services. [2026.7.28] citeturn30search0turn13search1 | **2/5.** JSON/RSS/CSV возвращают metasearch results/snippets; полноценного cleaned-page extraction layer по умолчанию нет. [2026.7.28] citeturn30search0 | **4.5/5.** Vendor keys для собственного SearXNG отсутствуют, но tenant accounting, abuse control и infra полностью ваши. citeturn13search6 | **4/5***. Vendor API fee = $0; реальная цена infra/egress/maintenance публично не вычисляется. citeturn13search6 | **4/5.** `time_range=day/month/year` и engine-specific support. [2026.7.28] citeturn30search0turn30search1 | **2/5.** Надёжность = собственный uptime × работоспособность upstream engines; исторически отдельные engines страдали от CAPTCHA, но найденное свидетельство по Yandex старое, 2022 года. citeturn13search5 | **3.5/5.** Нет SaaS dependency, зато появляются hosting, monitoring, upgrades и extraction. citeturn13search6 |',
      '**SearXNG.** AGPL-3.0 регулирует сам software, а не права на third-party search results. citeturn13search1 Поскольку SearXNG прямо передаёт запросы external search services, self-hosting не отменяет ToS и content/IP restrictions соответствующих engines; это архитектурный вывод из документации, а не отдельная лицензия SearXNG. citeturn30search0 То есть «self-hosted» решает key/vendor-control problem, но не делает Google/Yandex content юридически вашим.',
      '| **SearXNG self-hosted** | $0 vendor API | **$0 vendor fee + infra/ops** | **$0 vendor fee + infra/ops** | Инфраструктурная цена публично не выводится и не притворяется нулевой. citeturn13search6 |',
    ]),
  ],
  [
    // One line, and it is a premise rather than a promise: the report reasons
    // about which licences a self-hosted AGPL product may depend on. It is a
    // research record, so it is held here exactly rather than edited —
    // rewriting an owner's report to satisfy a guard would falsify the
    // evidence this epic rests on.
    'docs/research/writer-voice-style-transfer-2026-08-22.md',
    new Set([
      '- **For a self-hosted AGPL product with Russian as primary language, licensing and language coverage are the binding constraints**: LUAR is Apache-2.0 but English-only; Wegmann Style-Embeddings have no stated weights license and are English-only; Russian NLP tooling (Natasha/Slovnet MIT, DeepPavlov Apache-2.0, Stanza Apache-2.0, spaCy MIT, UDPipe MPL/CC) is AGPL-compatible and should carry the interpretable feature layer.',
    ]),
  ],
  [
    'docs/adr/0009-external-services-allowed-when-justified.md',
    new Set([
      'self-hosted Listmonk, которого никто не поднимал. Каждый такой пробел — это',
    ]),
  ],
]);

const walk = (relativeRoot, base = repositoryRoot) => {
  const root = path.join(base, relativeRoot);
  if (!fs.existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.(?:ts|tsx|json|md|scss|css)$/.test(entry.name))
        files.push(absolute);
    }
  };
  visit(root);
  return files;
};

// `base` exists so the scan can be pointed at a fixture directory. A ledger
// that only ever runs over the real tree passes for two reasons — nothing to
// find, or nothing looking — and those have to be told apart.
const matches = (roots, pattern, base = repositoryRoot) => {
  const found = [];
  for (const root of roots) {
    for (const absolute of walk(root, base)) {
      const file = path.relative(base, absolute).split(path.sep).join('/');
      for (const [index, line] of fs
        .readFileSync(absolute, 'utf8')
        .split(/\r?\n/)
        .entries()) {
        if (pattern.test(line))
          found.push({ file, line: index + 1, text: line.trim() });
      }
    }
  }
  return found;
};

const compareExactAllowlist = (found, allowlist) => {
  const actual = new Map();
  for (const item of found) {
    if (!actual.has(item.file)) actual.set(item.file, new Set());
    actual.get(item.file).add(item.text);
  }
  const extra = found.filter(
    (item) => !allowlist.get(item.file)?.has(item.text)
  );
  const stale = [];
  for (const [file, lines] of allowlist) {
    for (const text of lines) {
      if (!actual.get(file)?.has(text)) stale.push({ file, text });
    }
  }
  return { extra, stale };
};

// ---------------------------------------------------------------------------
// Layer 3: the legal directory.
//
// Three documents in up to sixteen languages is forty-eight files. Pinning
// every claim-bearing line of all of them would be several hundred ledger
// entries in scripts the team cannot proofread — the same fake assurance this
// file is trying to remove, only larger. Russian and English are the sources
// and stay pinned exactly, because they are what a reviewer can actually check.
// Each translation is instead held to its sources:
//
//   - it exists under a name the loader can find, in a shipped language;
//   - its front matter is complete and its `language` matches the file name;
//   - its `updated` date equals the Russian source's, so a stale translation of
//     a changed document cannot pass as current;
//   - its paragraph skeleton — heading anchors plus prose/list blocks, not
//     words — equals the Russian source's, so a section or standalone paragraph
//     cannot be dropped or invented;
//   - it carries no claim token the Russian or English source does not carry,
//     so a price, a region, a provider, a certification or a free-trial offer
//     cannot appear in translation alone.
//
// The repository-level test additionally requires the complete 3 x 16 matrix.
// `loadLegalDocument` can fall back at runtime, but removing a published
// translation is now a visible contract change rather than a silent fallback.
// ---------------------------------------------------------------------------

const LEGAL_DOCUMENT_IDS = ['privacy', 'terms', 'subprocessors'];
const LEGAL_SOURCE_LANGUAGES = ['ru', 'en'];
const LEGAL_REFERENCE_LANGUAGE = 'ru';
const LEGAL_FILE_NAME =
  /^(privacy|terms|subprocessors)\.([a-z]{2}(?:_[a-z]{2})?)\.md$/;

// Deliberately the same subset as `legal-content.ts` parses, so the guard reads
// the front matter the renderer will read rather than a stricter YAML.
const frontMatterFields = (source) => {
  const matter = /^---[^\S\n]*\r?\n([\s\S]*?)\r?\n---[^\S\n]*(?:\r?\n|$)/.exec(
    source
  );
  const fields = {};
  for (const line of (matter?.[1] ?? '').split(/\r?\n/)) {
    const field = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (field)
      fields[field[1].toLowerCase()] = field[2]
        .trim()
        .replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return fields;
};

/** Heading levels and their section numbers, with the wording left out. */
const headingSkeleton = (source) =>
  source.split(/\r?\n/).flatMap((line) => {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!heading) return [];
    const number = /^(\d+(?:\.\d+)*)\.?(?:\s|$)/.exec(heading[2].trim());
    return [`h${heading[1].length}:${number ? number[1] : ''}`];
  });

/**
 * Blank-line-delimited content blocks, anchored to numbered headings. Line
 * wrapping and translated wording are ignored; adding or removing a prose
 * paragraph or list item changes the skeleton.
 */
const paragraphSkeleton = (source) =>
  source
    .replace(/^---[^\S\n]*\r?\n[\s\S]*?\r?\n---[^\S\n]*(?:\r?\n|$)/, '')
    .split(/\r?\n[^\S\n]*\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = /^(#{1,6})\s+(.*)$/.exec(block);
      if (heading) {
        const number = /^(\d+(?:\.\d+)*)\.?(?:\s|$)/.exec(heading[2].trim());
        return `h${heading[1].length}:${number ? number[1] : ''}`;
      }

      const listItems = block
        .split(/\r?\n/)
        .filter((line) => /^(?:[-+*]|\d+[.)])\s+/.test(line)).length;
      return listItems ? `list:${listItems}` : 'p';
    });

const readLegalFiles = (directory) =>
  fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((name) => !name.startsWith('.'))
        .sort()
        .map((name) => ({
          name,
          parsed: LEGAL_FILE_NAME.exec(name),
          source: fs.readFileSync(path.join(directory, name), 'utf8'),
        }))
    : [];

const legalTranslationProblems = (directory, languages) => {
  const problems = [];
  const documents = new Map();

  for (const file of readLegalFiles(directory)) {
    if (!file.parsed) {
      problems.push({ file: file.name, problem: 'not a legal document name' });
      continue;
    }
    const [, document, language] = file.parsed;
    if (!languages.includes(language)) {
      problems.push({
        file: file.name,
        problem: 'language is not shipped by the product',
      });
      continue;
    }
    documents.set(`${document}.${language}`, { ...file, document, language });
  }

  for (const document of LEGAL_DOCUMENT_IDS) {
    const sources = LEGAL_SOURCE_LANGUAGES.map((language) =>
      documents.get(`${document}.${language}`)
    );
    if (sources.some((source) => !source)) {
      problems.push({
        file: `${document}.*.md`,
        problem: 'a source language document is missing',
      });
      continue;
    }

    const reference = documents.get(`${document}.${LEGAL_REFERENCE_LANGUAGE}`);
    const referenceUpdated = frontMatterFields(reference.source).updated;
    const referenceSkeleton = headingSkeleton(reference.source);
    const referenceParagraphs = paragraphSkeleton(reference.source);
    const permitted = new Set(
      sources.flatMap((source) => [...claimTokens(source.source)])
    );

    for (const language of [...languages].sort()) {
      const file = documents.get(`${document}.${language}`);
      if (!file) continue;

      const fields = frontMatterFields(file.source);
      for (const field of ['title', 'updated', 'language']) {
        if (!fields[field])
          problems.push({
            file: file.name,
            problem: `front matter has no ${field}`,
          });
      }
      if (fields.language && fields.language !== language)
        problems.push({
          file: file.name,
          problem: `front matter says language ${fields.language}`,
        });
      if (fields.updated && fields.updated !== referenceUpdated)
        problems.push({
          file: file.name,
          problem: `updated ${fields.updated} does not match ${reference.name} (${referenceUpdated})`,
        });

      const skeleton = headingSkeleton(file.source);
      const headingsMatch = skeleton.join(' ') === referenceSkeleton.join(' ');
      if (!headingsMatch)
        problems.push({
          file: file.name,
          problem: `heading skeleton does not match ${reference.name}`,
          expected: referenceSkeleton,
          actual: skeleton,
        });

      const paragraphs = paragraphSkeleton(file.source);
      if (
        headingsMatch &&
        paragraphs.join(' ') !== referenceParagraphs.join(' ')
      )
        problems.push({
          file: file.name,
          problem: `paragraph skeleton does not match ${reference.name}`,
          expected: referenceParagraphs,
          actual: paragraphs,
        });

      if (LEGAL_SOURCE_LANGUAGES.includes(language)) continue;

      const invented = [...claimTokens(file.source)]
        .filter((token) => !permitted.has(token))
        .sort();
      if (invented.length)
        problems.push({
          file: file.name,
          problem: 'claims the source documents do not make',
          invented,
        });
    }
  }

  return problems;
};

// One row per way a writer would naturally phrase a forbidden claim in the two
// languages the phrase layer reads. The blocklist this replaced held the left
// column only for the first four rows. Every row here was caught before this
// file was restructured and has to stay caught.
const FORBIDDEN_CLAIM_PHRASES = [
  ['freePlan', 'free tier'],
  ['freePlan', 'Start for free'],
  ['freePlan', 'Free plan'],
  ['freePlan', 'Free forever'],
  ['freePlan', 'start free'],
  ['freePlan', 'Sign up for free'],
  ['freePlan', 'Бесплатный тариф'],
  ['freePlan', 'Бесплатный план навсегда'],
  ['freePlan', 'Первый месяц бесплатно'],
  ['freePlan', 'Pay nothing for the first 7 days'],
  ['freePlan', 'Не платите ничего первые 7 дней'],
  ['trial', 'free trial'],
  ['trial', 'trial period'],
  ['trial', '14-day trial'],
  ['trial', 'Try it free for 14 days'],
  ['trial', 'Start your 30 day free trial'],
  ['trial', 'пробный период'],
  ['trial', 'бесплатный триал'],
  ['trial', '14 дней бесплатно'],
  ['price', 'Pricing from $19/mo'],
  ['price', 'Starts at $19 per month'],
  ['price', '$19 per user per month'],
  ['price', 'от 1490 ₽ в месяц'],
  ['price', '1490 руб. в месяц'],
  ['uptime', '99.9% uptime'],
  ['uptime', 'SLA'],
  ['uptime', 'We offer a service-level agreement'],
  ['uptime', 'Гарантируем доступность 99,9%'],
  ['commitment', 'Cancel anytime'],
  ['commitment', '30-day money-back guarantee'],
  ['commitment', 'No credit card required'],
  ['commitment', 'без карты'],
  ['commitment', 'Отменить подписку в любой момент'],
  ['commitment', 'Гарантия возврата денег'],
  ['infrastructure', 'Hosted on Hetzner in Falkenstein'],
  ['infrastructure', 'Servers in Frankfurt'],
  ['infrastructure', 'AWS eu-central-1'],
  ['infrastructure', 'hosted in AWS'],
  ['infrastructure', 'data residency'],
  ['infrastructure', 'резидентность данных'],
  ['infrastructure', 'Серверы находятся в Германии'],
  // One machine and singular agreement, in both languages. Both of these
  // passed the guard while the plural forms above were caught.
  ['infrastructure', 'The server is in Russia.'],
  ['infrastructure', 'Сервер находится в России.'],
  ['legalAndCertification', 'GDPR compliant'],
  ['legalAndCertification', 'ФЗ-152'],
  ['legalAndCertification', 'certified ISO'],
  ['legalAndCertification', 'ISO 27001'],
  ['legalAndCertification', 'SOC 2'],
  ['legalAndCertification', 'ООО «Контент Фабрика»'],
  ['legalAndCertification', 'ИНН 7701234567'],
  ['legalAndCertification', 'Content Factory Ltd'],
  ['legalAndCertification', 'сертифицировано'],
];

/**
 * The honest coverage table.
 *
 * The same forbidden claims, written the way a translator would write them in
 * the shipped languages, with what this file does about each. `false` rows are
 * not oversights waiting to be fixed with one more alternation — they are the
 * shape of claim a regular expression cannot recognise without reading the
 * language, and they are listed so the gap is visible in the test output rather
 * than only in a comment.
 */
const MULTILINGUAL_CLAIM_CORPUS = [
  // A price carries a currency mark and a number in every script.
  ['tr', 'price', true, 'Aylık ₺499 ile başlayın.'],
  ['ja', 'price', true, '月額 ¥2,000 からご利用いただけます。'],
  ['ko', 'price', true, '월 ₩29,000부터 시작합니다.'],
  ['ar', 'price', true, 'ابدأ من 19 USD شهريًا.'],
  ['he', 'price', true, 'החל מ-₪69 לחודש.'],
  ['bn', 'price', true, 'মাসিক ৳৯৯৯ থেকে শুরু।'],
  ['zh', 'price', true, '每月 ¥99 起。'],
  ['de', 'price', true, 'Ab 19 EUR pro Monat.'],
  ['vi', 'price', true, 'Chỉ từ 199000 VND mỗi tháng.'],
  ['ka_ge', 'price', true, 'თვეში 49 GEL-დან.'],
  // A free or trial offer, when it is quantified — and every marketing one is.
  ['tr', 'trial', true, '14 gün ücretsiz deneme.'],
  ['ja', 'trial', true, '14日間の無料トライアル。'],
  ['ko', 'trial', true, '14일 무료 체험.'],
  ['ar', 'trial', true, 'تجربة مجانية لمدة ١٤ يومًا.'],
  ['zh', 'trial', true, '14 天免费试用。'],
  ['pt', 'trial', true, 'Teste gratuito de 14 dias.'],
  ['it', 'trial', true, 'Prova gratuita di 14 giorni.'],
  ['he', 'trial', true, 'ניסיון חינם ל-14 ימים.'],
  ['bn', 'trial', true, '১৪ দিনের বিনামূল্যে ট্রায়াল।'],
  ['ka_ge', 'trial', true, '14-დღიანი უფასო საცდელი პერიოდი.'],
  // Uptime, when the nines are written as digits.
  ['ja', 'uptime', true, '稼働率 99.9% を保証します。'],
  ['tr', 'uptime', true, '%99,9 çalışma süresi garantisi.'],
  ['vi', 'uptime', true, 'Cam kết thời gian hoạt động 99,95%.'],
  ['ar', 'uptime', true, 'نضمن توفرًا بنسبة 99.9%.'],
  // Certifications and regulations are proper nouns everywhere.
  ['de', 'certification', true, 'Wir sind ISO 27001 zertifiziert.'],
  ['ja', 'certification', true, '当社は SOC 2 認証を取得しています。'],
  ['ko', 'certification', true, '당사는 GDPR 를 준수합니다.'],
  ['tr', 'certification', true, 'KVKK uyumluyuz.'],
  ['de', 'certification', true, 'DSGVO-konform.'],
  ['ar', 'certification', true, 'نحن متوافقون مع HIPAA.'],
  // Providers, regions and cities are proper nouns too.
  [
    'ja',
    'infrastructure',
    true,
    'サーバーは Hetzner の Falkenstein にあります。',
  ],
  ['zh', 'infrastructure', true, '数据存储在 AWS eu-central-1。'],
  ['ko', 'infrastructure', true, '서버는 Amsterdam 에 있습니다.'],
  ['he', 'infrastructure', true, 'השרתים מתארחים ב-Frankfurt.'],
  // And the gap. Prose, no number, no symbol, no proper noun.
  [
    'tr',
    'uptime in prose',
    false,
    'Hizmetin kesintisiz çalışacağını garanti ediyoruz.',
  ],
  ['ja', 'free plan in prose', false, '無料でずっとお使いいただけます。'],
  ['ko', 'money-back in prose', false, '언제든지 환불해 드립니다.'],
  ['vi', 'no card in prose', false, 'Không cần thẻ tín dụng.'],
  [
    'ar',
    'hosting country in prose',
    false,
    'تقع خوادمنا في هولندا ولا تغادر البيانات البلاد.',
  ],
  [
    'bn',
    'certification in prose',
    false,
    'আমাদের নিরাপত্তা মান স্বাধীনভাবে পরীক্ষিত ও অনুমোদিত।',
  ],
];

// Ordinary product copy and the vocabulary the interface already ships. A guard
// that trips on these would be turned off within a week.
const PERMITTED_PRODUCT_COPY = [
  'Source code is available under AGPL-3.0.',
  'Download the Corresponding Source.',
  'Plan, draft, review, schedule.',
  'Content Factory plans your publishing week.',
  'The workspace plan view shows every scheduled post.',
  'Feel free to reach out to support.',
  'Free up space by deleting old drafts.',
  'Schedule a post for next month.',
  'Review the plan before publishing.',
  'Included by Content Factory',
  'The included AI allowance is exhausted.',
  'Choose Workspace API key to enable AI.',
  'Tenant isolation keeps workspaces apart.',
  'Your data is encrypted at rest.',
  'Backups run daily.',
  'Unsubscribe at any time from the newsletter.',
  'Sign in',
  'Create account',
  'Cancel',
  // Shipped copy in other languages that reads like a claim and is not. These
  // are why the offer signal needs a digit or a second word rather than firing
  // on `prueba` or `essai` alone.
  'Prueba el flujo de contenido completo',
  'Comprueba cómo encajan planificación, borradores, revisión y programación.',
  'Révision nécessaire',
  'Enviar prueba',
  'Ihre Beiträge, ein Plan.',
];

const legalContentDirectory = () =>
  path.join(repositoryRoot, LEGAL_CONTENT_ROOT);

const writeFixture = (directory, name, lines) =>
  fs.writeFileSync(path.join(directory, name), lines.join('\n'));

describe('Cloud-first SaaS public contract', () => {
  test.each(FORBIDDEN_CLAIM_PHRASES)(
    'catches the %s claim written in English or Russian as %s',
    (_family, claim) => {
      expect(UNDECIDED_PUBLIC_CLAIM_PATTERN.test(claim)).toBe(true);
    }
  );

  test.each(MULTILINGUAL_CLAIM_CORPUS)(
    'in %s a %s claim is caught: %s — %s',
    (_language, _kind, caught, text) => {
      expect(UNDECIDED_PUBLIC_CLAIM_PATTERN.test(text)).toBe(caught);
    }
  );

  test('every claim family uses Unicode-aware boundaries instead of ASCII \\b', () => {
    const withWordBoundary = Object.entries(CLAIM_TOKEN_FAMILIES).flatMap(
      ([family, patterns]) =>
        patterns.filter((pattern) => /\\b/.test(pattern)).map(() => family)
    );
    expect(withWordBoundary).toEqual([]);

    // `\b` fails silently rather than loudly: it never matches between two
    // non-Latin letters, so a Cyrillic, Japanese or Arabic claim with nothing
    // but letters around it walks past. These are the shapes that regressed
    // before, one per script, at the very start and the very end of a line.
    for (const claim of [
      'Бесплатный тариф',
      'бесплатный триал навсегда',
      '無料トライアルは14日間',
      'ISO 27001認証取得済み',
      'خوادمنا في AWS eu-central-1',
      '월 ₩29,000',
    ]) {
      expect(UNDECIDED_PUBLIC_CLAIM_PATTERN.test(claim)).toBe(true);
    }
  });

  test('leaves ordinary product copy alone', () => {
    expect(
      PERMITTED_PRODUCT_COPY.filter((line) =>
        UNDECIDED_PUBLIC_CLAIM_PATTERN.test(line)
      )
    ).toEqual([]);
  });

  test('turns a claim into a token that can be compared across languages', () => {
    expect([
      ...claimTokens('Hosted on Hetzner in Falkenstein, eu-central-1.'),
    ]).toEqual(
      expect.arrayContaining([
        'provider:hetzner',
        'city:falkenstein',
        'region:eu-central-1',
      ])
    );
    expect([...claimTokens('当社は SOC 2 認証を取得しています。')]).toEqual([
      'certification:soc-2',
    ]);
    expect([...claimTokens('14 gün ücretsiz deneme.')]).toEqual(['offer']);
    expect([...claimTokens('Черновики и расписание публикаций.')]).toEqual([]);
  });

  test('scans every shipped locale key, not only the public SaaS namespace', () => {
    expect(
      localeClaims({
        en: {
          public_saas_cta: 'Start for free',
          ai_usage_included: 'Included free forever',
          harmless_label: 'Draft',
        },
      })
    ).toEqual([
      { file: 'en/public_saas_cta', text: 'Start for free' },
      { file: 'en/ai_usage_included', text: 'Included free forever' },
    ]);
  });

  test('lets a translation carry a claim only where its English or Russian source does', () => {
    const bundles = {
      en: {
        billing_trial: 'Start 7 days free trial',
        public_saas_cta: 'Plan your week',
      },
      ru: {
        billing_trial: 'Начать 7-дневную бесплатную пробную версию',
        public_saas_cta: 'Планируйте неделю',
      },
      tr: {
        billing_trial: '7 gün ücretsiz denemeyi başlat',
        public_saas_cta: 'Haftanı planla',
      },
      ja: {
        billing_trial: '7日間の無料トライアルを開始',
        public_saas_cta: '月額 ¥2,000 で始めましょう',
      },
    };

    // The translated trial strings match, and are allowed, because the same key
    // matches in English and Russian. The invented Japanese price is not.
    expect(translationOnlyLocaleClaims(bundles)).toEqual([
      { file: 'ja/public_saas_cta', text: '月額 ¥2,000 で始めましょう' },
    ]);
  });

  test('reads the contract documents rather than only checking they exist', () => {
    const readFiles = [];
    const claims = documentClaims(CONTRACT_FILES, (file) => {
      readFiles.push(file);
      return 'Content Factory\nStarts at $19 per month.\n';
    });

    expect(readFiles).toEqual(CONTRACT_FILES);
    expect(claims).toEqual(
      CONTRACT_FILES.map((file) => ({
        file,
        line: 2,
        text: 'Starts at $19 per month.',
      }))
    );
  });

  test('public copy resolves shared locale keys without an English fallback map', () => {
    const calls = [];
    const translated = new Map([
      ['public_saas_nav_product', 'Translated product'],
      ['public_saas_sign_in', 'Translated sign in'],
    ]);
    const { usePublicCopy, PUBLIC_COPY_KEYS } = loadPublicCopy((key) => {
      calls.push(key);
      return translated.get(key);
    });
    const copy = usePublicCopy();

    expect(copy('navProduct')).toBe('Translated product');
    expect(copy('signIn')).toBe('Translated sign in');
    expect(PUBLIC_COPY_KEYS).toContain('signIn');
    expect(calls).toEqual(['public_saas_nav_product', 'public_saas_sign_in']);
  });

  test('detects product installation claims without treating AGPL Source as hosting', () => {
    const claims = [
      'Content Factory is a self-hosted platform.',
      'Self-host Content Factory on your server.',
      'Deploy Content Factory on your own server.',
      'Разверните Content Factory на своём сервере.',
    ];
    for (const claim of claims) expect(CLAIM_PATTERN.test(claim)).toBe(true);

    expect(CLAIM_PATTERN.test('Source code is available under AGPL-3.0.')).toBe(
      false
    );
    expect(CLAIM_PATTERN.test('Download the Corresponding Source.')).toBe(
      false
    );
  });

  test('keeps the user-facing exception ledger exact and shrink-only', () => {
    const result = compareExactAllowlist(
      matches(USER_FACING_ROOTS, CLAIM_PATTERN),
      USER_FACING_ALLOWLIST
    );
    expect(result).toEqual({ extra: [], stale: [] });
  });

  test('preserves historical and operator records without allowing new claims', () => {
    const result = compareExactAllowlist(
      matches(
        ['docs/operations', 'docs/prompts', 'docs/research', 'docs/adr'],
        CLAIM_PATTERN
      ),
      HISTORICAL_OPERATOR_ALLOWLIST
    );
    expect(result).toEqual({ extra: [], stale: [] });
  });

  test('keeps undecided commercial and infrastructure promises off public surfaces', () => {
    expect(matches(PUBLIC_CLAIM_ROOTS, UNDECIDED_PUBLIC_CLAIM_PATTERN)).toEqual(
      []
    );
  });

  test('scans the legal documents with the same pattern as every other surface', () => {
    // Proven against a fixture rather than against the shipped documents,
    // because the shipped ones are written in waves: an empty directory would
    // otherwise make the ledger below look strict while checking nothing.
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-legal-guard-'));
    const directory = path.join(base, LEGAL_CONTENT_ROOT);
    fs.mkdirSync(directory, { recursive: true });
    writeFixture(directory, 'privacy.en.md', [
      '# Privacy policy',
      '',
      'Servers are in Germany and backups stay with them.',
      'Draft content is deleted when the workspace is deleted.',
      'We are ISO 27001 certified.',
      '',
    ]);

    expect(
      matches([LEGAL_CONTENT_ROOT], UNDECIDED_PUBLIC_CLAIM_PATTERN, base)
    ).toEqual([
      {
        file: `${LEGAL_CONTENT_ROOT}/privacy.en.md`,
        line: 3,
        text: 'Servers are in Germany and backups stay with them.',
      },
      {
        file: `${LEGAL_CONTENT_ROOT}/privacy.en.md`,
        line: 5,
        text: 'We are ISO 27001 certified.',
      },
    ]);

    // And the ledger has to reject a line it was not told about.
    expect(
      compareExactAllowlist(
        matches([LEGAL_CONTENT_ROOT], UNDECIDED_PUBLIC_CLAIM_PATTERN, base),
        new Map([
          [
            `${LEGAL_CONTENT_ROOT}/privacy.en.md`,
            new Set(['Servers are in Germany and backups stay with them.']),
          ],
        ])
      )
    ).toEqual({
      extra: [
        {
          file: `${LEGAL_CONTENT_ROOT}/privacy.en.md`,
          line: 5,
          text: 'We are ISO 27001 certified.',
        },
      ],
      stale: [],
    });
  });

  test('holds the Russian and English legal sources to an exact, shrink-only ledger', () => {
    // The documents live where the renderer reads them and inside the tree the
    // user-facing hosting-claim scan already walks, so neither guard can be
    // stepped around by moving a file.
    expect(LEGAL_CONTENT_ROOT.startsWith('apps/frontend/src/')).toBe(true);
    expect(USER_FACING_ROOTS).toContain('apps/frontend/src');

    const sourceDocuments = matches(
      [LEGAL_CONTENT_ROOT],
      UNDECIDED_PUBLIC_CLAIM_PATTERN
    ).filter((item) =>
      LEGAL_SOURCE_LANGUAGES.some((language) =>
        item.file.endsWith(`.${language}.md`)
      )
    );

    expect(
      compareExactAllowlist(sourceDocuments, LEGAL_CONTENT_ALLOWLIST)
    ).toEqual({ extra: [], stale: [] });
  });

  test('states the hosting country as the Netherlands in both sources of both documents', () => {
    // The one fact in the ledger that is a fact about the world rather than
    // about wording. It was wrong once — pinned as Russia while the machine
    // geolocated to Amsterdam — so it is asserted directly and not only through
    // the ledger, which would go green again if all four lines were changed
    // back together.
    for (const document of ['privacy', 'subprocessors']) {
      expect(read(`${LEGAL_CONTENT_ROOT}/${document}.en.md`)).toContain(
        'The server is in the Netherlands.'
      );
      expect(read(`${LEGAL_CONTENT_ROOT}/${document}.ru.md`)).toContain(
        'Сервер находится в Нидерландах.'
      );
    }
  });

  test('holds every shipped legal translation to its Russian and English sources', () => {
    const languages = shippedLanguages();
    expect(languages).toHaveLength(16);

    // The real directory, whatever is in it right now.
    expect(
      legalTranslationProblems(legalContentDirectory(), languages)
    ).toEqual([]);

    // Not vacuous. Every file in the complete 3 x 16 matrix was recognised and
    // compared. Runtime fallback remains an implementation detail; deleting a
    // published translation is a contract change and must fail here.
    const present = fs.readdirSync(legalContentDirectory());
    expect(present).toHaveLength(LEGAL_DOCUMENT_IDS.length * languages.length);
    expect(
      present.filter(
        (name) =>
          !LEGAL_FILE_NAME.test(name) ||
          !languages.includes(LEGAL_FILE_NAME.exec(name)[2])
      )
    ).toEqual([]);
    for (const document of LEGAL_DOCUMENT_IDS) {
      for (const language of languages) {
        expect(present).toContain(`${document}.${language}.md`);
      }
    }
  });

  test('rejects a translation that drops a section, goes stale or invents a claim', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-legal-tr-'));
    const source = (language, sections) => [
      '---',
      `title: Privacy ${language}`,
      'updated: 2026-08-19',
      `language: ${language}`,
      '---',
      '',
      '# Privacy',
      '',
      ...sections,
    ];
    const body = [
      '## 1. Who is responsible',
      '',
      'The owner runs the service.',
      '',
      '## 2. Where data is processed',
      '',
      'The server is in the Netherlands.',
      '',
    ];
    for (const language of LEGAL_SOURCE_LANGUAGES) {
      writeFixture(directory, `privacy.${language}.md`, source(language, body));
      writeFixture(directory, `terms.${language}.md`, source(language, body));
      writeFixture(
        directory,
        `subprocessors.${language}.md`,
        source(language, body)
      );
    }

    // A faithful translation passes, in a script the pattern cannot read.
    writeFixture(directory, 'privacy.ja.md', [
      '---',
      'title: プライバシー',
      'updated: 2026-08-19',
      'language: ja',
      '---',
      '',
      '# プライバシー',
      '',
      '## 1. 責任者',
      '',
      'サービスは所有者が運営しています。',
      '',
      '## 2. データの処理場所',
      '',
      'サーバーはオランダにあります。',
      '',
    ]);

    // A section quietly dropped.
    writeFixture(directory, 'privacy.tr.md', [
      '---',
      'title: Gizlilik',
      'updated: 2026-08-19',
      'language: tr',
      '---',
      '',
      '# Gizlilik',
      '',
      '## 1. Sorumlu kim',
      '',
      'Hizmeti sahibi yönetir.',
      '',
    ]);

    // A translation of an older revision, and a `language` that disagrees with
    // the file name.
    writeFixture(directory, 'privacy.de.md', [
      '---',
      'title: Datenschutz',
      'updated: 2026-05-01',
      'language: en',
      '---',
      '',
      '# Datenschutz',
      '',
      '## 1. Wer ist verantwortlich',
      '',
      'Der Eigentümer betreibt den Dienst.',
      '',
      '## 2. Wo Daten verarbeitet werden',
      '',
      'Der Server steht in den Niederlanden.',
      '',
    ]);

    // A claim invented in translation: a provider, a region and a
    // certification none of the sources mention.
    writeFixture(directory, 'privacy.ko.md', [
      '---',
      'title: 개인정보',
      'updated: 2026-08-19',
      'language: ko',
      '---',
      '',
      '# 개인정보',
      '',
      '## 1. 책임자',
      '',
      '소유자가 서비스를 운영합니다.',
      '',
      '## 2. 데이터 처리 위치',
      '',
      '서버는 AWS eu-central-1 에 있으며 ISO 27001 인증을 받았습니다.',
      '',
    ]);

    expect(
      legalTranslationProblems(directory, ['ru', 'en', 'ja', 'tr', 'de', 'ko'])
    ).toEqual([
      {
        file: 'privacy.de.md',
        problem: 'front matter says language en',
      },
      {
        file: 'privacy.de.md',
        problem: 'updated 2026-05-01 does not match privacy.ru.md (2026-08-19)',
      },
      {
        file: 'privacy.ko.md',
        problem: 'claims the source documents do not make',
        invented: [
          'certification:iso-27001',
          'provider:aws',
          'region:eu-central-1',
        ],
      },
      {
        file: 'privacy.tr.md',
        problem: 'heading skeleton does not match privacy.ru.md',
        expected: ['h1:', 'h2:1', 'h2:2'],
        actual: ['h1:', 'h2:1'],
      },
    ]);
  });

  test('rejects a pure-prose paragraph added only to an unread translation', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-legal-prose-'));
    const document = (language, paragraphs) => [
      '---',
      `title: Privacy ${language}`,
      'updated: 2026-08-19',
      `language: ${language}`,
      '---',
      '',
      '# Privacy',
      '',
      '## 1. Service',
      '',
      ...paragraphs,
      '',
    ];
    const sourceParagraphs = ['The service can be interrupted.'];

    for (const documentId of LEGAL_DOCUMENT_IDS) {
      for (const language of LEGAL_SOURCE_LANGUAGES) {
        writeFixture(
          directory,
          `${documentId}.${language}.md`,
          document(language, sourceParagraphs)
        );
      }
    }

    writeFixture(
      directory,
      'privacy.tr.md',
      document('tr', [
        'Hizmet kesintiye uğrayabilir.',
        '',
        'Hizmetin asla kesintiye uğramayacağını garanti ederiz.',
      ])
    );

    expect(legalTranslationProblems(directory, ['ru', 'en', 'tr'])).toEqual([
      {
        file: 'privacy.tr.md',
        problem: 'paragraph skeleton does not match privacy.ru.md',
        expected: ['h1:', 'h2:1', 'p'],
        actual: ['h1:', 'h2:1', 'p', 'p'],
      },
    ]);
  });

  test('catches a claim invented in a translation of the real privacy notice', () => {
    // The fixtures above prove the rules; this proves they bite on the
    // documents that actually ship. Only the Russian and English sources are
    // copied, so a translation landing while the suite runs cannot change the
    // result.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-legal-real-'));
    for (const document of LEGAL_DOCUMENT_IDS) {
      for (const language of LEGAL_SOURCE_LANGUAGES) {
        const name = `${document}.${language}.md`;
        fs.copyFileSync(
          path.join(legalContentDirectory(), name),
          path.join(directory, name)
        );
      }
    }

    fs.writeFileSync(
      path.join(directory, 'privacy.tr.md'),
      `${read(`${LEGAL_CONTENT_ROOT}/privacy.en.md`)
        .replace('language: en', 'language: tr')
        .trimEnd()} Sunucularımız Hetzner eu-central-1 bölgesinde ve ISO 27001 sertifikalıdır.\n`
    );

    expect(legalTranslationProblems(directory, shippedLanguages())).toEqual([
      {
        file: 'privacy.tr.md',
        problem: 'claims the source documents do not make',
        invented: [
          'certification:iso-27001',
          'provider:hetzner',
          'region:eu-central-1',
        ],
      },
    ]);
  });

  test('reports a legal file the renderer could never serve', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-legal-name-'));
    writeFixture(directory, 'privacy.md', ['# Privacy']);
    writeFixture(directory, 'privacy.xx.md', ['# Privacy']);

    expect(legalTranslationProblems(directory, ['ru', 'en'])).toEqual([
      { file: 'privacy.md', problem: 'not a legal document name' },
      {
        file: 'privacy.xx.md',
        problem: 'language is not shipped by the product',
      },
      ...LEGAL_DOCUMENT_IDS.map((document) => ({
        file: `${document}.*.md`,
        problem: 'a source language document is missing',
      })),
    ]);
  });

  test('holds the contract documents to the gates they declare', () => {
    for (const file of CONTRACT_FILES) {
      expect(fs.existsSync(path.join(repositoryRoot, file))).toBe(true);
    }
    expect(
      compareExactAllowlist(
        documentClaims(CONTRACT_FILES),
        CONTRACT_DOCUMENT_ALLOWLIST
      )
    ).toEqual({ extra: [], stale: [] });
  });

  test('keeps the English and Russian locale claim ledger exact and shrink-only', () => {
    expect(
      compareExactAllowlist(
        localeClaims(pickLocales(readLocaleBundles(), SOURCE_LANGUAGES)),
        LOCALE_CLAIM_ALLOWLIST
      )
    ).toEqual({ extra: [], stale: [] });
  });

  test('finds no claim in the other fourteen locales that its source does not make', () => {
    expect(translationOnlyLocaleClaims(readLocaleBundles())).toEqual([]);
  });

  test('documents included allowance as admitted operation attempts, not completed work', () => {
    for (const file of [
      'PRODUCT.md',
      'docs/product/cloud-saas-growth-spec.md',
    ]) {
      const contract = read(file);
      expect(contract).toMatch(
        /допущенн(?:ых|ые) к выполнению попыт(?:ок|ки) продуктовых AI-операций/
      );
      expect(contract).toMatch(/failed/);
      expect(contract).toMatch(/incomplete/);
      expect(contract).toMatch(/admitted/);
      expect(contract).not.toMatch(/завершённые продуктовые AI-операции/);
    }
  });

  test('keeps the AGPL Source route and visible link outside the hosting claim guard', () => {
    expect(read('apps/backend/src/api/routes/source.controller.ts')).toContain(
      "@Controller('/public/source')"
    );
    expect(
      read('apps/frontend/src/components/layout/source.link.tsx')
    ).toContain('/public/source');
    expect(
      read('apps/frontend/src/components/layout/source.link.tsx')
    ).toContain("t('source_code', 'Source')");
  });
});
