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
 * ones nobody has read yet: it kept the guard green on the day it was turned
 * on, while ten queries were still being worked through, and it is empty now.
 * Empty is enforced rather than observed — the ceiling used to be ten, which
 * was right while the backlog was shrinking and wrong the moment it emptied,
 * because a list that «may only shrink» with ten free places can still grow
 * ten times. Blessing an unread query is how a suite ends up proving a node
 * instead of the wiring.
 *
 * Two holes were found the day it was written, and both were the same shape —
 * an organisation carried all the way down and dropped at the last line.
 * `editTag` let a signed-in person rename another workspace's tag by its id;
 * `getMediaById` resolved any media id into its storage path, and a post's
 * image list is whatever the person submitting it sent. In both cases the
 * neighbouring method — `deleteTag`, `deleteMedia` — had always filtered.
 *
 * The weakness this used to carry, and how it went. An entry was keyed by
 * file, model and operation, so every call site in one file collapsed into one
 * line and a legitimate one masked whatever stood beside it. Two entries were
 * marked «key collapse» and left. `content-factory-next-5w6u` narrowed the key
 * by the method the call sits in — not by line number, which would churn on
 * every edit, and not by file, which was the defect. Twenty-four lines became
 * forty, and the nineteen that appeared had never been read by anybody. Two of
 * the old reasons turned out to describe a different call from the one they
 * were filed under: `oAuthApp.findFirst` was excused as «the flagged
 * occurrence does filter», and the occurrence that is actually flagged is
 * `getAppByClientId`, which does not filter and should not.
 *
 * What is left of the weakness: two call sites of the same model and operation
 * inside one method still share a line. Three such pairs exist and are listed
 * in `COLLAPSED` with what the second one is, so a third call appearing inside
 * one of those methods is a red test rather than a shrug.
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
 * Does this `where` name a row rather than describe a set?
 *
 * `id` as a key of the clause, at any depth the balanced read reaches. The
 * character before it has to be a brace, a comma or space, which is what keeps
 * `organizationId:` and `contentContextSnapshotId:` out — an identifier
 * ending in `Id` is a foreign key, not the row's own name.
 */
const namesARow = (code) => /(^|[{,\s])id\s*:/.test(code);

/**
 * The method a call sits in, found by walking back to the nearest declaration.
 *
 * `content-factory-next-5w6u`. The ledger used to be keyed by file, so five
 * `post.update` call sites in `posts.repository.ts` shared one line and one
 * excuse; a sixth would have inherited it. A line number would be exact and
 * would churn on every edit above it, which turns the ledger into noise and
 * teaches everyone to re-record it without reading. A method name is stable
 * for as long as the method means the same thing, and when it is renamed the
 * entry goes stale — which is the ledger asking to be read again, correctly.
 *
 * Two shapes are recognised: a class member at two-space indentation, and a
 * top-level function or arrow. Nothing else lives at those indentations in
 * this package.
 */
const MEMBER =
  /^ {2}(?:(?:public|private|protected|static|readonly|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/;
const TOP_LEVEL =
  /^(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=)/;

const enclosingMethod = (source, index) => {
  const lines = source.slice(0, index).split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const member = MEMBER.exec(lines[i]);
    if (member) return member[1];
    const top = TOP_LEVEL.exec(lines[i]);
    if (top) return top[1] || top[2];
  }
  return '(file)';
};

/**
 * Queries against an org-scoped model whose `where` does not name the
 * organisation.
 *
 * `count` is left out on purpose: a count without a filter answers a number
 * about everybody, which is a different and much smaller thing than handing a
 * row over.
 *
 * `findMany` used to be left out beside it, on the reasoning that a listing
 * without a filter is a listing of nothing useful and shows up immediately.
 * That is true of a listing. It is not true of `findMany` used as a lookup:
 * `content-factory-next-fn33.101` found the ownership check in
 * `posts.repository.ts` reading `{ id: { in: requestedPostIds } }` — ids the
 * client sent — with no organisation named. That one is deliberate and is
 * written into `ALLOWED` below with its reasoning, but the guard could not
 * see it, and so could not have seen the next one. So `findMany` is scanned
 * when its `where` names a row, and still ignored when it describes a set.
 */
const unfilteredQueries = () => {
  const models = orgScopedModels();
  const call =
    /\.(\w+)\.(findFirst|findUnique|findMany|update|delete|updateMany|deleteMany)\s*\(\s*\{/g;
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
      if (operation === 'findMany' && !namesARow(code)) continue;
      found.push(
        `${file} ${model}.${operation} in ${enclosingMethod(source, match.index)}`
      );
    }
  }
  return found.sort();
};


const PRISMA = 'libraries/nestjs-libraries/src/database/prisma';
const CI = 'libraries/nestjs-libraries/src/content-intelligence';

/**
 * Read and legitimate: none is reachable with an identifier a caller chose.
 * This list may only shrink.
 *
 * Twenty-four of these were read on 03.09.2026 under a key that named only the
 * file, and nineteen more became visible on 05.09.2026 when
 * `content-factory-next-5w6u` narrowed the key to the method. The nineteen are
 * marked with that date. Two of them had been standing behind a reason written
 * about a different call.
 */
const ALLOWED = new Map([
  [
    `${PRISMA}/users/users.repository.ts userOrganization.deleteMany in deleteAccount`,
    'Account deletion by the instance administrator (`content-factory-next-fn33.23`): the subject is the person, not a workspace, so their membership rows go from every organisation at once; the rejection path in the same file keeps its `organizationId`.',
  ],
  [
    `${CI}/brand-voice/voice-sample.repository.ts brandVoiceSample.updateMany in purgeExpiredReferences`,
    'Retention purge, deliberately across every organisation: a retention date is a promise about a calendar, not about who opens a page.',
  ],
  [
    `${CI}/source-registry/source-registry.repository.ts contentSource.findUnique in createOrGet`,
    'False positive of this scan: the `where` is a variable built above and it holds the composite `organizationId_kind_canonicalKey` key. The scan cannot follow indirection and errs towards flagging.',
  ],
  [
    `${CI}/source-registry/source-registry.repository.ts contentSource.findUnique in createManualSource`,
    'Same variable, same composite key, same false positive. Read on 05.09.2026: the old ledger held one line for this file and this method was the half nobody had looked at.',
  ],
  [
    `${PRISMA}/admin-stats/admin-stats.repository.ts integration.findMany in postStats`,
    'Instance-wide statistics behind `assertSuperAdmin` on `GET /admin/stats`: counting every organisation is the point of the number. The ids come from this method\'s own `groupBy` over published posts, not from the request, and only `providerIdentifier` — the name of the network — is read back. Read on 05.09.2026, brought into view by `content-factory-next-fn33.101`.',
  ],
  [
    `${PRISMA}/autopost/autopost.repository.ts autoPost.findUnique in getAutopost`,
    '`startAutopost` resolves which organisation an autopost belongs to and uses that answer for everything downstream; it runs from the scheduler, never from a request.',
  ],
  [
    `${PRISMA}/autopost/autopost.repository.ts autoPost.update in updateUrl`,
    '`updateUrl` writes the last seen feed URL from a workflow state, with an id from that workflow. Its two request-facing neighbours, `deleteAutopost` and `changeActive`, both filter.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts integration.update in updateIntegration`,
    'Cascade after the integration was found by the composite `organizationId_internalId` key in the same method, and the only caller — `saveProviderPage` — has already resolved the channel through `getIntegrationById(org, id)`. Collapsed with a second write; see `COLLAPSED`.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts post.updateMany in updateIntegration`,
    'Same cascade: the posts belong to the integration that composite key just resolved.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts integration.update in disableIntegrations`,
    'Read on 05.09.2026. The ids come from the `findMany` six lines above, which filters by `organizationId`; this loop switches off channels over a plan\'s limit inside one workspace.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts integration.update in setBetweenRefreshSteps`,
    'Read on 05.09.2026. Called only by `RefreshIntegrationService.setBetweenSteps`, with the id of the integration row that service is already holding — a token refresh running from the queue, not a request.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts integration.update in updateNameAndUrl`,
    'Read on 05.09.2026. `POST /integrations/:id/nickname` resolves the channel through `getIntegrationById(org.id, id)` and refuses when it is not there, before the provider is called and this write happens.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts integration.updateMany in createOrUpdateIntegration`,
    'Deduplicates by `rootInternalId` across organisations by design: one reconnected account must not leave two live rows.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts post.findFirst in getIntegrationForOrder`,
    'Marketplace order lookup, filtered by seller and buyer identity instead; the upstream marketplace is not enabled here.',
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts plugs.findFirst in getPlug`,
    '`processPlugs` runs from the queue with a plug id out of its own job payload.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthApp.findFirst in getAppByClientId`,
    'Read on 05.09.2026, and the reason it stood behind was about a different call: the old ledger excused this line as «the flagged occurrence does filter», which was true of a neighbour and never of this one. A `client_id` is the app\'s own name in the OAuth protocol, sent by an authorization request before anything is known about whose app it is; resolving it is how the server learns that. The row it returns is then used to check the redirect URL and the secret.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthApp.update in updateApp`,
    'Updates the row found by an org-filtered `findFirst` immediately above, by that row\'s own id.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthApp.update in deleteApp`,
    'Read on 05.09.2026. Same shape as `updateApp`: an org-filtered `findFirst` six lines above, then a soft delete of that row by its id.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthApp.update in updateClientSecret`,
    'Read on 05.09.2026. Same shape again, and the one where it matters most: the secret is rotated on the app the caller\'s own organisation owns, because that is the only app the `findFirst` above can return.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthAuthorization.findFirst in findByCode`,
    'An OAuth authorization is keyed by its own opaque code, which is the credential.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthAuthorization.findFirst in findByAccessToken`,
    'Read on 05.09.2026. The access token is the credential being presented; this is the lookup that decides which organisation the request belongs to, so filtering by the answer would be circular.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthAuthorization.update in exchangeCodeForToken`,
    'Same row, same code: the id comes from the authorization `findByCode` just returned.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthAuthorization.update in revokeAuthorization`,
    'Read on 05.09.2026. Filtered by `userId` rather than by organisation, which is the right scope for this door: «the apps I approved» is a list belonging to a person, and it is their own grant they are withdrawing.',
  ],
  [
    `${PRISMA}/oauth/oauth.repository.ts oAuthAuthorization.updateMany in revokeAllForApp`,
    'Read on 05.09.2026. Withdraws every grant of one app, and the app is the one `OAuthService.deleteApp` resolved through `getAppByOrgId(orgId)`. Every authorization of that app belongs to it by definition.',
  ],
  [
    `${PRISMA}/organizations/organization.repository.ts userOrganization.findFirst in getUserOrg`,
    'Reads a membership row by its own id in order to resolve which organisation it is; filtering by the answer would be circular.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.findFirst in createOrUpdatePostWithClient`,
    'An existence probe over a client-minted `group`, and it has to see across organisations to do its job: the composer mints the group before anything is saved, so "free" and "taken by someone else" have to be told apart. It selects `id`, nothing from the row is returned, and the only answer it can produce is the same 404 as a group that does not exist.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.findMany in createOrUpdatePostWithClient`,
    'The ownership check of `content-factory-next-fn33.49`, unscoped for the same reason as the group probe beside it: a tenant-scoped read cannot tell "free" from "taken by someone else". It selects six columns and returns none of them — every id belonging to another organisation, and every id deleted here, leaves through the same 404 with the same text. Read on 05.09.2026 for `content-factory-next-fn33.101`, which is why `findMany` is scanned at all now.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.findMany in getPostByForWebhookId`,
    'Read on 05.09.2026. The body of an outgoing webhook, assembled by the `sendWebhooks` Temporal activity from the post id in its own payload — the post it has just published. The organisation is already settled: the webhooks it delivers to were fetched by `getWebhooks(orgId)` four lines above.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.update in changeState`,
    '`changeState` is called only from Temporal workflows, with an id from their own payload — never from a request.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.update in updatePost`,
    'Read on 05.09.2026. The publish result — state, release id, release URL — written by the `updatePost` Temporal activity with the id it was handed when the workflow was started.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.update in updateImages`,
    'Read on 05.09.2026. Writes back the image list `PostsService.updateMedia` has just resolved, and both of its callers reached the post through an org-filtered read first (`getPostsByGroup(orgId, …)`, `getPostsRecursively(…, orgId, …)`). The media inside that list is org-scoped since the `getMediaById` hole was closed on 03.09.2026.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.update in submit`,
    'Read on 05.09.2026. Upstream marketplace: a seller offering a post against an order. Nothing in this fork calls it — the marketplace is not enabled — and if it is ever turned on, the caller has to prove the post is the seller\'s before this line, because this line does not.',
  ],
  [
    `${PRISMA}/posts/posts.repository.ts post.update in updateMessage`,
    'Read on 05.09.2026. The other half of the same upstream marketplace: the last chat message id on a submitted post. Also uncalled in this fork, and carrying the same condition if it is ever wired up.',
  ],
  [
    `${PRISMA}/product-events/product-events.repository.ts productEvent.deleteMany in pruneOlderThan`,
    'Retention prune by age across every organisation.',
  ],
  [
    `${PRISMA}/subscriptions/subscription.repository.ts subscription.findFirst in getSubscriptionByCustomerId`,
    'Looked up by the billing provider\'s own identifier, which is what the webhook carries.',
  ],
  [
    `${PRISMA}/subscriptions/subscription.repository.ts subscription.findFirst in getSubscriptionByIdentifier`,
    'Read on 05.09.2026. The billing provider\'s subscription identifier, the same kind of key as the customer id beside it. Reachable only through a service passthrough that nothing in this fork calls.',
  ],
  [
    `${PRISMA}/subscriptions/subscription.repository.ts subscription.deleteMany in deleteSubscriptionByCustomerId`,
    'Keyed by the billing provider\'s customer id, which is what its webhook carries.',
  ],
  [
    `${PRISMA}/subscriptions/subscription.repository.ts credits.delete in useCredit`,
    'Compensating delete of the row this same call had just created, by the id it received back.',
  ],
  [
    `${PRISMA}/subscriptions/subscription.repository.ts usedCodes.findFirst in getCode`,
    'A redemption code is itself the credential being checked.',
  ],
  [
    'libraries/nestjs-libraries/src/openai/ai.usage.service.ts aiUsageRecord.update in finishAdmission',
    'Closes the ledger row this very call opened, by the id it just received back.',
  ],
]);

/**
 * The last of the key collapse, named rather than left implicit.
 *
 * A method name is not a call site, so two calls to the same model and
 * operation inside one method still share a ledger line. Three do. The value
 * says what the second call is, so that a *third* one appearing in one of
 * these methods fails the count below instead of inheriting an excuse written
 * for its neighbours.
 */
const COLLAPSED = new Map([
  [
    `${CI}/source-registry/source-registry.repository.ts contentSource.findUnique in createOrGet`,
    2,
  ],
  [
    `${CI}/source-registry/source-registry.repository.ts contentSource.findUnique in createManualSource`,
    2,
  ],
  [
    `${PRISMA}/integrations/integration.repository.ts integration.update in updateIntegration`,
    2,
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

  test('a findMany that names a row is in scope, not only a listing', () => {
    // `content-factory-next-fn33.101`. The exclusion this replaces was not
    // wrong about listings and was wrong about lookups, and the difference is
    // invisible from the operation name alone. Pinned so that narrowing the
    // scan back to "findMany is always a listing" cannot pass quietly.
    expect(unfilteredQueries()).toContain(
      `${PRISMA}/posts/posts.repository.ts post.findMany in createOrUpdatePostWithClient`
    );
  });

  /**
   * `content-factory-next-5w6u`. The ledger is keyed by method now, and a
   * method is not a call site: a second call to the same model and operation
   * inside one method still shares a line. Three do, and they are named. This
   * is what stops a fourth from arriving under one of those names quietly —
   * which is the whole defect the re-keying was for, one level down.
   */
  test('the call sites sharing a ledger line are counted, not assumed', () => {
    const counted = new Map();
    for (const one of unfilteredQueries()) {
      counted.set(one, (counted.get(one) || 0) + 1);
    }
    // Sorted pairs rather than objects, so the comparison is about what is
    // shared and how often, not about which order two maps were written in.
    const asPairs = (entries) =>
      [...entries].sort(([a], [b]) => a.localeCompare(b));
    const sharing = asPairs([...counted].filter(([, times]) => times > 1));
    const expected = asPairs(COLLAPSED);

    expect({
      sharing,
      hint:
        JSON.stringify(sharing) === JSON.stringify(expected)
          ? 'in step'
          : 'Two calls to one model and operation inside one method share a ledger line, so one reason has to cover both. Read the new one and either give it its own method or record it in COLLAPSED.',
    }).toEqual({ sharing: expected, hint: 'in step' });
  });

  test('the ledger names call sites, not files', () => {
    // The five `post.update` sites in one repository used to be one line with
    // one excuse. Spot-checked rather than counted, because a count is a
    // number to update and this is a shape to keep.
    const posts = [...ALLOWED.keys()].filter((one) =>
      one.includes('posts.repository.ts post.update')
    );
    expect(posts.length).toBeGreaterThan(1);
    expect(new Set(posts).size).toBe(posts.length);
    for (const one of [...ALLOWED.keys(), ...UNREVIEWED]) {
      expect(one).toMatch(/ in [A-Za-z_$][\w$]*$/);
    }
  });

  /**
   * `content-factory-next-saas.2`. Ten on 03.09.2026, the day the guard was
   * written; empty by that evening, when all of them had been read and two
   * turned out to be holes.
   *
   * The ceiling used to be ten, which was right while the backlog was being
   * worked through and wrong the moment it emptied: a list that «may only
   * shrink» with ten places still free is a list that can grow ten times.
   * Zero is the only honest ceiling for an empty backlog, and it is what makes
   * `UNREVIEWED` a place to stand while something is being read rather than a
   * place to leave it.
   *
   * It stays in the file rather than being deleted, because a future finding
   * needs an honest place to sit while somebody reads it — and putting one
   * there now costs a red test and a conversation, which is the point.
   */
  test('nothing unread is keeping this guard green', () => {
    expect({
      unreviewed: [...UNREVIEWED],
      hint: UNREVIEWED.size
        ? 'A query nobody has read does not belong on a list that keeps the guard green. Read it, then move it to ALLOWED with its reason or fix it.'
        : 'in step',
    }).toEqual({ unreviewed: [], hint: 'in step' });
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
