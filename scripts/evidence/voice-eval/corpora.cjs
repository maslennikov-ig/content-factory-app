'use strict';

/**
 * The corpora the stand can be pointed at, and the one read of the database
 * each of them needs.
 *
 * Everything a run needs from the stand — the author's texts, the active
 * profile's content, the organization's model settings — is pulled once and
 * cached as JSON next to the run. After that the measurement is offline, which
 * is the difference between "we can recompute this" and "we can pay to find
 * out again".
 *
 * The cache never enters the repository: it holds an author's own writing and,
 * for the model settings, a decrypted key. `.gitignore` covers the file by
 * name; the run directory holds only what is safe to read years from now.
 *
 * A corpus is one avatar's, not one workspace's. Until 2026-08-26 the two were
 * the same thing and this file could read by `organizationId` alone; since
 * `pl1.26` a space holds several authors, and reading by space would pile all
 * of them into one averaged writer — the very defect the product removed. The
 * registry therefore names the avatar, and every read here is scoped to it the
 * way `VoiceService.corpusScope` scopes the product's: the avatar's own rows,
 * plus the rows that predate avatars when — and only when — it is the default.
 */

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const REPO = path.resolve(__dirname, '..', '..', '..');
// `VOICE_EVAL_CORPORA` points the stand at another registry — a second stand,
// or the fixture a test needs so it can check the scoping rules without the
// three real authors in the file.
const REGISTRY = process.env.VOICE_EVAL_CORPORA || path.join(__dirname, 'corpora.json');

const DEFAULT_DATABASE_URL =
  process.env.VOICE_EVAL_DATABASE_URL ||
  'postgresql://cf-dev:cf-dev-pwd@localhost:5433/cf-dev-db';

const registry = () => JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));

const describe = (name) => {
  const found = registry()[name];
  if (!found) {
    throw new Error(
      `unknown corpus "${name}"; known: ${Object.keys(registry()).join(', ')}`
    );
  }
  return { name, ...found };
};

/**
 * Which avatar a registry entry names, resolved by name rather than by id.
 *
 * An id would tie `corpora.json` to one database: the same three authors carry
 * different ids on the stand and on production, and a run pointed at the wrong
 * one would not fail — it would quietly find nothing and measure an empty
 * corpus. A name is what the owner typed on screen 12, it is what the seeding
 * script writes, and it is the same string in both places.
 *
 * A registry entry without `avatar` is refused rather than defaulted to the
 * space's first profile. Defaulting is exactly how the stand read three
 * corpora as one, and a silent default here would put it back.
 */
async function resolveAvatar(client, corpus) {
  if (!corpus.avatar) {
    throw new Error(
      `corpus "${corpus.name}" names no avatar; add "avatar" to corpora.json`
    );
  }
  const { rows } = await client.query(
    `select id, name, "isDefault"
       from "ProjectBrandProfile"
      where "organizationId" = $1 and name = $2 and "deletedAt" is null
      order by "isDefault" desc, "createdAt" asc`,
    [corpus.organizationId, corpus.avatar]
  );
  if (!rows.length) {
    throw new Error(
      `no avatar named "${corpus.avatar}" in space ${corpus.organizationId}`
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `${rows.length} avatars named "${corpus.avatar}" in space ` +
        `${corpus.organizationId}; the name has to identify one`
    );
  }
  return rows[0];
}

/**
 * The author's samples, the active profile version and the model settings, in
 * one connection.
 *
 * The samples are read in the same order and with the same filter the product
 * uses when it analyses a voice, because the analyser splits training from
 * holdout by content hash and a different order would give a different split —
 * and then a different threshold, and then a different number.
 *
 * `avatarId is null` joins the default avatar's corpus and nobody else's:
 * those rows were written before avatars existed and belong to whoever the
 * space answered as back then. `VoiceSampleRepository.listActive` decides it
 * the same way, and the two have to agree or the stand measures a corpus the
 * product would not have analysed.
 */
async function pull(corpus) {
  const client = new Client({
    connectionString: corpus.databaseUrl || DEFAULT_DATABASE_URL,
  });
  await client.connect();
  try {
    const avatar = await resolveAvatar(client, corpus);
    const samples = await client.query(
      `select id, title, text, "contentHash", language
         from "BrandVoiceSample"
        where "organizationId" = $1 and "deletedAt" is null
          and ("avatarId" = $2 or ("avatarId" is null and $3))
        order by "createdAt", id`,
      [corpus.organizationId, avatar.id, avatar.isDefault]
    );
    const profile = await client.query(
      `select v.id, v.label, v."versionNumber", v.content, v."measurementId"
         from "ProjectBrandProfile" p
         join "ProjectBrandProfileVersion" v on v.id = p."activeVersionId"
        where p.id = $1`,
      [avatar.id]
    );
    const ai = await client.query(
      `select "usageMode", provider, "apiKey", "textModel", "imageModel",
              "searchEnabled", "searchProvider", "searchApiKey", "searchTopic",
              "searchDepth"
         from "AiProviderSetting"
        where "organizationId" = $1`,
      [corpus.organizationId]
    );
    return {
      // The resolved avatar rides in the cached corpus so an offline recount
      // can tell whose texts it is holding without a database.
      corpus: {
        ...corpus,
        avatarId: avatar.id,
        avatarIsDefault: avatar.isDefault,
      },
      samples: samples.rows,
      profile: profile.rows[0] || null,
      aiSetting: ai.rows[0] || null,
    };
  } finally {
    await client.end();
  }
}

/**
 * @param name key in `corpora.json`
 * @param cachePath where the pulled copy lives; the default sits beside this
 *   file and is ignored by git.
 */
/**
 * Which version is in force right now, in one cheap query.
 *
 * The cache used to be trusted whenever its `organizationId` matched, and a
 * rebuilt voice was therefore invisible to the stand: the profile moved from
 * v3 to v6 and every run went on measuring v3, with the version label printed
 * in the header as if it were current. On 2026-08-25 the factorial guard
 * caught it — the cached profile had no portrait — but only because that run
 * happened to need a field the old one lacked. A run whose variants the old
 * profile could answer would have paid in full for numbers about a voice
 * nobody uses.
 *
 * One `select` against an indexed column, and only on the paid path: the
 * measurement stays offline, which is the property the cache exists for.
 *
 * It asks about the avatar the registry names. Ordering by `isDefault` and
 * taking the first — what this did while a space held one profile — now
 * answers about the default avatar whichever corpus was asked for, so a run on
 * a second author would check the freshness of somebody else's voice.
 */
async function activeVersionId(corpus) {
  const client = new Client({
    connectionString: corpus.databaseUrl || DEFAULT_DATABASE_URL,
  });
  await client.connect();
  try {
    const avatar = await resolveAvatar(client, corpus);
    const { rows } = await client.query(
      `select "activeVersionId" from "ProjectBrandProfile" where id = $1`,
      [avatar.id]
    );
    return rows[0]?.activeVersionId ?? null;
  } finally {
    await client.end();
  }
}

/**
 * @param name key in `corpora.json`
 * @param cachePath where the pulled copy lives; the default sits beside this
 *   file and is ignored by git.
 * @param options.offline skip the freshness check — for `measure`, which must
 *   not need a database at all.
 */
async function load(name, cachePath, options = {}) {
  const corpus = describe(name);
  const file =
    cachePath || path.join(__dirname, `corpus.${name}.json`);
  if (fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
    /**
     * The same space *and* the same author.
     *
     * Matching on the space alone was enough while a space meant one author.
     * With three it hands one avatar's texts to a run asked for another — and
     * silently, because the header prints the corpus name from the registry
     * rather than from what was cached. A cache written before the avatar was
     * recorded has no name to match and is re-pulled, which is right: it was
     * built by a read that could not tell the three apart.
     */
    const sameAuthor =
      cached.corpus?.organizationId === corpus.organizationId &&
      cached.corpus?.avatar === corpus.avatar;
    if (sameAuthor && options.offline) return cached;
    if (sameAuthor) {
      const current = await activeVersionId(corpus);
      if ((cached.profile?.id ?? null) === current) return cached;
    }
  }
  const pulled = await pull(corpus);
  fs.writeFileSync(file, JSON.stringify(pulled));
  return pulled;
}

module.exports = {
  load,
  describe,
  registry,
  resolveAvatar,
  REPO,
  DEFAULT_DATABASE_URL,
};
