const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { Client } = require('pg');

// Runs the exact `UPDATE` statement text from
// `docs/operations/editorial-stage-schema-apply.sql` against a real
// PostgreSQL, in a throwaway schema holding stand-in `Post`/`Tags`/
// `TagsPosts` tables. This is not a copy of the migration's logic — it reads
// the real file at run time, so an edit to the shipped SQL is what this test
// exercises, not a second hand-written version of the same rule.
const databaseUrl = process.env.EDITORIAL_STAGE_POSTGRES_URL;
if (databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    parsed = null;
  }
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const targetOverrideKeys = new Set([
    'host',
    'hostaddr',
    'service',
    'servicefile',
  ]);
  const hasTargetOverride = parsed
    ? [...parsed.searchParams.keys()].some((key) =>
        targetOverrideKeys.has(key.toLowerCase())
      )
    : false;
  if (
    !parsed ||
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname) ||
    hasTargetOverride ||
    process.env.CF_DOCKER_CI_DISPOSABLE_POSTGRES !== '1'
  ) {
    throw new Error(
      'EDITORIAL_STAGE_POSTGRES_URL must identify an explicitly marked loopback disposable PostgreSQL database'
    );
  }
}

function extractBackfillStatement() {
  const sqlPath = path.resolve(
    __dirname,
    '..',
    'docs/operations/editorial-stage-schema-apply.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const match = sql.match(/UPDATE "Post" p\s[\s\S]*?;\s*\nCOMMIT;/);
  if (!match) {
    throw new Error(
      'editorial-stage-schema-apply.sql no longer contains the expected backfill UPDATE shape'
    );
  }
  // Drop the trailing `COMMIT;` the regex needed as an anchor.
  return match[0].replace(/\nCOMMIT;$/, '');
}

test(
  'existing process tags carry over to Post.editorialStage one-to-one',
  {
    skip: databaseUrl
      ? false
      : 'EDITORIAL_STAGE_POSTGRES_URL is not configured',
  },
  async (t) => {
    const schema = `editorial_stage_${randomUUID().replaceAll('-', '')}`;
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    t.after(async () => {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    });

    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(
      `CREATE TYPE "EditorialStage" AS ENUM ('PLAN', 'DRAFT', 'REVIEW', 'SCHEDULED')`
    );
    await client.query(
      `CREATE TABLE "Post" (id text PRIMARY KEY, "editorialStage" "EditorialStage")`
    );
    await client.query(
      `CREATE TABLE "Tags" (id text PRIMARY KEY, name text NOT NULL, color text NOT NULL, "deletedAt" timestamp)`
    );
    await client.query(
      `CREATE TABLE "TagsPosts" ("postId" text NOT NULL, "tagId" text NOT NULL)`
    );

    // The last three rows are the ones that keep the migration honest. Tags in
    // this product are free: a person can rename one and can repaint one
    // through the colour picker, and can create their own tag in any colour —
    // including these four. Matching on colour alone would mis-assign a
    // stranger's tag and miss a repainted one, so the migration matches the
    // pair, and these rows prove it.
    await client.query(`
      INSERT INTO "Tags" (id, name, color, "deletedAt") VALUES
        ('tag-plan', 'Plan', '#7FB03A', NULL),
        ('tag-draft', 'Draft', '#4D7CFE', NULL),
        ('tag-review', 'Review', '#F59E0B', NULL),
        ('tag-schedule', 'Schedule', '#8B5CF6', NULL),
        ('tag-review-ru', 'Проверка', '#F59E0B', NULL),
        ('tag-review-deleted', 'Review', '#F59E0B', now()),
        ('tag-stranger-same-colour', 'Идеи на потом', '#7FB03A', NULL),
        ('tag-plan-repainted', 'Plan', '#942828', NULL),
        ('tag-plan-renamed', 'Планчик', '#7FB03A', NULL)
    `);

    await client.query(`
      INSERT INTO "Post" (id, "editorialStage") VALUES
        ('post-plan-only', NULL),
        ('post-draft-and-review', NULL),
        ('post-all-four', NULL),
        ('post-no-stage-tag', NULL),
        ('post-only-deleted-tag', NULL),
        ('post-already-set', 'DRAFT'),
        ('post-russian-review', NULL),
        ('post-stranger-tag', NULL),
        ('post-repainted-tag', NULL),
        ('post-renamed-tag', NULL)
    `);

    await client.query(`
      INSERT INTO "TagsPosts" ("postId", "tagId") VALUES
        ('post-plan-only', 'tag-plan'),
        ('post-draft-and-review', 'tag-draft'),
        ('post-draft-and-review', 'tag-review'),
        ('post-all-four', 'tag-plan'),
        ('post-all-four', 'tag-draft'),
        ('post-all-four', 'tag-review'),
        ('post-all-four', 'tag-schedule'),
        ('post-only-deleted-tag', 'tag-review-deleted'),
        ('post-already-set', 'tag-plan'),
        ('post-russian-review', 'tag-review-ru'),
        ('post-stranger-tag', 'tag-stranger-same-colour'),
        ('post-repainted-tag', 'tag-plan-repainted'),
        ('post-renamed-tag', 'tag-plan-renamed')
    `);

    const backfill = extractBackfillStatement();
    await client.query(backfill);

    const { rows } = await client.query(
      `SELECT id, "editorialStage" FROM "Post" ORDER BY id`
    );
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.editorialStage]));

    assert.equal(byId['post-plan-only'], 'PLAN');
    // Two matching stage tags on one post: the more advanced one wins.
    assert.equal(byId['post-draft-and-review'], 'REVIEW');
    assert.equal(byId['post-all-four'], 'SCHEDULED');
    // No stage tag at all: field stays untouched.
    assert.equal(byId['post-no-stage-tag'], null);
    // Only a soft-deleted stage tag: does not count as a match.
    assert.equal(byId['post-only-deleted-tag'], null);
    // Already had a value before the backfill ran: not overwritten, even
    // though it also carries the Plan tag.
    assert.equal(byId['post-already-set'], 'DRAFT');
    // The tag name is localised at registration, so a Russian workspace's
    // «Проверка» must carry over exactly like the English «Review».
    assert.equal(byId['post-russian-review'], 'REVIEW');

    // The three that must NOT move. A stranger's own tag that happens to be
    // the same green is not the Plan tag, and mis-assigning it would be worse
    // than leaving the field empty. A repainted or renamed stage tag drops out
    // of the migration too — the person sets the stage by hand, and nothing is
    // silently wrong.
    assert.equal(byId['post-stranger-tag'], null);
    assert.equal(byId['post-repainted-tag'], null);
    assert.equal(byId['post-renamed-tag'], null);

    // Tags themselves are read, never written: the migration must not touch
    // people's labels.
    const { rows: tagRows } = await client.query(
      `SELECT count(*)::int AS count FROM "Tags"`
    );
    assert.equal(tagRows[0].count, 9);
    const { rows: tagsPostsRows } = await client.query(
      `SELECT count(*)::int AS count FROM "TagsPosts"`
    );
    assert.equal(tagsPostsRows[0].count, 13);
  }
);

test('SQL contains all sixteen locales for each of four workflow tags', () => {
  const sqlPath = path.resolve(
    __dirname,
    '..',
    'docs/operations/editorial-stage-schema-apply.sql'
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Parse backend-strings.ts to extract all locale strings for each tag.
  const stringsPath = path.resolve(
    __dirname,
    '..',
    'libraries/nestjs-libraries/src/locale/backend-strings.ts'
  );
  const stringsContent = fs.readFileSync(stringsPath, 'utf8');

  // Extract the CATALOG object containing the four workflow tag translations.
  const catalogMatch = stringsContent.match(/const CATALOG = \{([\s\S]*?)\n\}/);
  if (!catalogMatch) {
    throw new Error('Could not find CATALOG in backend-strings.ts');
  }

  const tagKeys = ['content_workflow_tag_plan', 'content_workflow_tag_draft', 'content_workflow_tag_review', 'content_workflow_tag_schedule'];
  const stageMappings = {
    content_workflow_tag_plan: 'PLAN',
    content_workflow_tag_draft: 'DRAFT',
    content_workflow_tag_review: 'REVIEW',
    content_workflow_tag_schedule: 'SCHEDULED',
  };

  for (const tagKey of tagKeys) {
    const stage = stageMappings[tagKey];
    const tagPattern = new RegExp(`${tagKey}:\\s*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}`, 's');
    const tagMatch = stringsContent.match(tagPattern);

    if (!tagMatch) {
      throw new Error(`Could not find ${tagKey} translations in backend-strings.ts`);
    }

    // Extract all translation values from this tag.
    const localeStrings = [];
    const translationBlock = tagMatch[1];
    const linePattern = /(?:en|he|ru|zh|fr|es|pt|de|it|ja|ko|ar|tr|vi|bn|ka_ge):\s*'([^']*)'/g;
    let lineMatch;
    while ((lineMatch = linePattern.exec(translationBlock)) !== null) {
      localeStrings.push(lineMatch[1]);
    }

    assert.ok(localeStrings.length > 0, `No translations found for ${tagKey}`);

    // Check that all strings appear in the SQL.
    for (const str of localeStrings) {
      const escapedStr = str.replace(/'/g, "''");
      const inSql = sql.includes(`'${escapedStr}'`);
      assert.ok(
        inSql,
        `Translation "${str}" for ${tagKey} (stage ${stage}) not found in editorial-stage-schema-apply.sql`
      );
    }
  }
});
