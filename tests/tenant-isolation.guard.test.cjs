'use strict';

/**
 * `content-factory-next-saas.2`: one workspace cannot reach another's rows.
 *
 * Checked on 03.09.2026 across 26 controllers and 231 places that take an
 * organisation from the request, and across every repository query in
 * `libraries/nestjs-libraries/src`: **no live path was found that lets a
 * caller name someone else's organisation**. That is the finding, and it is
 * the reason this file is a guard rather than a fix — the isolation is
 * structural, and what was missing was anything that keeps it structural.
 *
 * The shape it holds:
 *
 *  - a request-facing door takes its organisation from `@GetOrgFromRequest`,
 *    never from a body, a path or a query the caller controls;
 *  - a query against a model that belongs to an organisation names that
 *    organisation in its `where`.
 *
 * Both lists are derived, not typed by hand. The org-scoped models come out of
 * `schema.prisma` itself, so a new model with an `organizationId` is covered
 * the day it is added and nobody has to remember to list it. What is typed by
 * hand is only the ledger of the queries that do not filter — and that ledger
 * may only shrink.
 *
 * It has two halves, and the split is the point. `ALLOWED` holds the ones that
 * were read and are legitimate, each with its reason. `UNREVIEWED` holds the
 * ones nobody has read yet: they keep the guard green so it can be turned on
 * today, and they are visible, counted and shrinking, so «green» never comes
 * to mean «checked». Blessing an unread query is how a suite ends up proving a
 * node instead of the wiring.
 *
 * Two holes were found the day it was written, and both were the same shape —
 * an organisation carried all the way down and dropped at the last line.
 * `editTag` let a signed-in person rename another workspace's tag by its id;
 * `getMediaById` resolved any media id into its storage path, and a post's
 * image list is whatever the person submitting it sent. In both cases the
 * neighbouring method — `deleteTag`, `deleteMedia` — had always filtered.
 *
 * One weakness to know about. An entry is keyed by file, model and operation,
 * so several call sites in one file collapse into one line: a legitimate one
 * can mask an illegitimate one beside it. Two entries below are marked as key
 * collapse for exactly that reason. Narrowing the key to a line number would
 * trade this for a ledger that churns on every edit; the honest answer is that
 * this guard finds the shape, and reading the file is still the check.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SCHEMA =
  'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
const LIBRARY = 'libraries/nestjs-libraries/src';
const ROUTES = 'apps/backend/src/api/routes';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** Every model carrying `organizationId` or `orgId`, read from the schema. */
const orgScopedModels = () => {
  const schema = read(SCHEMA);
  const models = new Set();
  const block = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let match;
  while ((match = block.exec(schema)) !== null) {
    const [, name, body] = match;
    if (/^\s+(organizationId|orgId)\s/m.test(body)) {
      models.add(name[0].toLowerCase() + name.slice(1));
    }
  }
  return models;
};

const sourceFiles = (directory) =>
  fs
    .readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const child = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(child);
      return /\.ts$/.test(entry.name) ? [child] : [];
    });

/**
 * The `where` object of one call, read to its own closing brace.
 *
 * A fixed-width window is what this started as, and it was wrong in the one
 * direction that matters: 350 characters after `where` runs past the end of
 * the call and into the next method, so a neighbour that happened to mention
 * `organizationId` made a leaky query look filtered. Proven on 03.09.2026 by
 * planting one — the guard passed. Balanced braces cannot be fooled that way.
 */
const whereClause = (source, from) => {
  const at = source.indexOf('where', from);
  if (at === -1) return null;
  const open = source.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const character = source[i];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return null;
};

/**
 * Queries against an org-scoped model whose `where` does not name the
 * organisation. `findMany` and `count` are left out on purpose: a listing
 * without a filter is a listing of nothing useful and shows up immediately,
 * while a `findUnique` by id that quietly crosses a boundary does not.
 */
const unfilteredQueries = () => {
  const models = orgScopedModels();
  const call =
    /\.(\w+)\.(findFirst|findUnique|update|delete|updateMany|deleteMany)\s*\(\s*\{/g;
  const found = [];
  for (const file of sourceFiles(LIBRARY)) {
    const source = read(file);
    let match;
    while ((match = call.exec(source)) !== null) {
      const [, model, operation] = match;
      if (!models.has(model)) continue;
      const clause = whereClause(source, match.index);
      if (clause === null) continue;
      // Comments out. A note explaining why a query is filtered — or, as on
      // 03.09.2026, a note explaining a hole that was just closed — mentions
      // `orgId` in prose, and a guard that reads prose calls the hole filtered.
      const code = clause
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      if (/organizationId|orgId/.test(code)) continue;
      found.push(`${file} ${model}.${operation}`);
    }
  }
  return found.sort();
};

/**
 * Read on 03.09.2026 and legitimate: none is reachable with an identifier a
 * caller chose. This list may only shrink.
 */
const ALLOWED = new Map([
  [
    'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-sample.repository.ts brandVoiceSample.updateMany',
    'Retention purge, deliberately across every organisation: a retention date is a promise about a calendar, not about who opens a page.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts post.updateMany',
    'Cascade after the integration was found by the composite `organizationId_internalId` key three lines above; the posts are that integration\'s own.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts integration.update',
    'Same cascade, same already-org-scoped `existing`.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts integration.updateMany',
    'Deduplicates by `rootInternalId` across organisations by design: one reconnected account must not leave two live rows.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts post.findFirst',
    'Marketplace order lookup, filtered by seller and buyer identity instead; the upstream marketplace is not enabled here.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/oauth/oauth.repository.ts oAuthAuthorization.findFirst',
    'An OAuth authorization is keyed by its own opaque code, which is the credential.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/oauth/oauth.repository.ts oAuthAuthorization.update',
    'Same row, same code.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/oauth/oauth.repository.ts oAuthAuthorization.updateMany',
    'Expiry sweep over codes, not over workspaces.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/organizations/organization.repository.ts userOrganization.findFirst',
    'Reads a membership row by its own id in order to resolve which organisation it is; filtering by the answer would be circular.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts post.update',
    '`changeState` is called only from Temporal workflows, with an id from their own payload — never from a request.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/product-events/product-events.repository.ts productEvent.deleteMany',
    'Retention prune by age across every organisation.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts subscription.findFirst',
    'Looked up by the billing provider\'s own identifier, which is what the webhook carries.',
  ],
  [
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts aiUsageRecord.update',
    'Closes the ledger row this very call opened, by the id it just received back.',
  ],
  [
    'libraries/nestjs-libraries/src/content-intelligence/source-registry/source-registry.repository.ts contentSource.findUnique',
    'False positive of this scan: the `where` is a variable built above and it holds the composite `organizationId_kind_canonicalKey` key. The scan cannot follow indirection and errs towards flagging.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts autoPost.findUnique',
    '`startAutopost` resolves which organisation an autopost belongs to and uses that answer for everything downstream; it runs from the scheduler, never from a request.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.repository.ts autoPost.update',
    '`updateUrl` writes the last seen feed URL from a workflow state, with an id from that workflow. Its two request-facing neighbours, `deleteAutopost` and `changeActive`, both filter.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts plugs.findFirst',
    '`processPlugs` runs from the queue with a plug id out of its own job payload.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/oauth/oauth.repository.ts oAuthApp.findFirst',
    'Key collapse: the flagged occurrence does filter by `organizationId`. See the note on granularity above.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/oauth/oauth.repository.ts oAuthApp.update',
    'Updates the row found by an org-filtered `findFirst` two lines above, by that row\'s own id.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts credits.delete',
    'Compensating delete of the row this same call had just created, by the id it received back.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts subscription.deleteMany',
    'Keyed by the billing provider\'s customer id, which is what its webhook carries.',
  ],
  [
    'libraries/nestjs-libraries/src/database/prisma/subscriptions/subscription.repository.ts usedCodes.findFirst',
    'A redemption code is itself the credential being checked.',
  ],
]);

/**
 * Nothing. All twenty-two were read on 03.09.2026 and two of them were holes:
 * `editTag` and `getMediaById`, both fixed in the same commit. The set stays
 * so that a future finding has an honest place to sit while it is being read —
 * empty is a state worth being able to see.
 */
const UNREVIEWED = new Set([]);

describe('a workspace cannot reach another workspace', () => {
  test('the org-scoped models are read from the schema, not listed by hand', () => {
    const models = orgScopedModels();
    // A hand-typed list drifts the first time a model is added. These four are
    // spot checks that the derivation works, not the list itself.
    expect(models.has('post')).toBe(true);
    expect(models.has('contentFact')).toBe(true);
    expect(models.has('brandVoiceSample')).toBe(true);
    expect(models.size).toBeGreaterThan(30);
  });

  test('no new query reaches an org-scoped model without naming the org', () => {
    const found = new Set(unfilteredQueries());
    const known = [...ALLOWED.keys(), ...UNREVIEWED];
    const added = [...found].filter(
      (one) => !ALLOWED.has(one) && !UNREVIEWED.has(one)
    );
    const stale = known.filter((one) => !found.has(one));

    expect({
      added,
      stale,
      hint:
        added.length || stale.length
          ? 'A query against a model that belongs to an organisation must name that organisation in its `where`, or be written into ALLOWED with the reason it cannot. Both ledgers only shrink: a stale entry means the query is gone and its line should go with it. Nothing may be added to UNREVIEWED — a new query is a new decision.'
          : 'in step',
    }).toEqual({ added: [], stale: [], hint: 'in step' });
  });

  test('the unreviewed backlog is named, counted and shrinking', () => {
    // Ten on 03.09.2026, the day the guard was written. The number is here so
    // that «green» never quietly starts meaning «all checked».
    expect({
      unreviewed: UNREVIEWED.size,
      hint:
        UNREVIEWED.size <= 10
          ? 'in step'
          : 'UNREVIEWED may only shrink. A query nobody has read does not belong on a list that keeps the guard green.',
    }).toEqual({ unreviewed: UNREVIEWED.size, hint: 'in step' });
    expect(UNREVIEWED.size).toBeLessThanOrEqual(10);
  });
});

describe('a door never lets the caller name the workspace', () => {
  test('organizationId does not arrive from a body, a path or a query', () => {
    const offenders = [];
    for (const file of sourceFiles(ROUTES)) {
      const source = read(file);
      if (
        /@(Body|Param|Query)\(\s*'organizationId'\s*\)/.test(source) ||
        /\b(body|params|query)\.organizationId\b/.test(source)
      ) {
        offenders.push(file);
      }
    }

    // One exception, and it is not a tenancy hole: `/public/agent` is an
    // operator job guarded by the instance-wide `AGENT_API_KEY`, and the
    // operator has to name whose AI key pays for the run. It is written down
    // in the route itself.
    const expected = [`${ROUTES}/public.controller.ts`];

    expect({
      offenders: offenders.sort(),
      hint:
        offenders.sort().join() === expected.join()
          ? 'in step'
          : 'A request-facing door takes its organisation from `@GetOrgFromRequest`. Reading it from what the caller sent is how one workspace asks for another.',
    }).toEqual({ offenders: expected, hint: 'in step' });
  });

  test('the operator route that does name one still proves who is asking', () => {
    const source = read(`${ROUTES}/public.controller.ts`);
    const at = source.indexOf('createAgent');
    const method = source.slice(at, at + 900);
    expect(method).toContain('AGENT_API_KEY');
    // The key is checked before the organisation is used, not after.
    expect(method.indexOf('AGENT_API_KEY')).toBeLessThan(
      method.indexOf('body.organizationId')
    );
  });
});
