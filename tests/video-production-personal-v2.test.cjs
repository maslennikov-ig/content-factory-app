const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const root = 'libraries/nestjs-libraries/src/videos/production/';
const personal = loadTypeScriptModule(root + 'video-production.personal.v2.ts');
const v1 = loadTypeScriptModule(root + 'video-production.v1.ts');
const { Prisma } = require('@prisma/client');

const HEYGEN = '11111111-1111-4111-8111-111111111111';
const HIGGSFIELD = '22222222-2222-4222-8222-222222222222';
const OTHER_HEYGEN = '33333333-3333-4333-8333-333333333333';
const funding = () => ({ kind: 'personal_subscription', connections: { heygen: HEYGEN, higgsfield: HIGGSFIELD }, finalProvider: 'heygen' });
const manifest = () => ({ version: 1, pieceId: '44444444-4444-4444-8444-444444444444', pieceRevision: 'source-revision-1',
  title: 'Owned scene production', locale: 'ru', aspectRatio: '9:16', resolution: '1080p', durationSeconds: 10, audio: false, captions: false,
  scenes: [{ id: 'opening', kind: 'video', durationSeconds: 5, script: '', mediaId: '55555555-5555-4555-8555-555555555555' },
    { id: 'closing', kind: 'video', durationSeconds: 5, script: '', mediaId: '66666666-6666-4666-8666-666666666666' }] });
const connections = [{ connectionId: HEYGEN, unit: 'heygen_credit' }, { connectionId: HIGGSFIELD, unit: 'higgsfield_credit' },
  { connectionId: OTHER_HEYGEN, unit: 'heygen_credit' }];
const operation = (amount, connectionId = HEYGEN, unit = 'heygen_credit') => ({ connectionId, unit, amount });
const errorCode = run => { try { run(); } catch (error) { return error.getResponse?.().code; } throw new Error('Expected a domain error'); };

test('an incomplete personal funding choice remains an honest persisted draft and converts to validated V1 content', () => {
  const input = manifest(), choice = { kind: 'personal_subscription', connections: {} };
  const stored = personal.personalManifestV2(input, choice);
  expect(stored).toMatchObject({ version: 2, funding: choice });
  expect(stored.funding.finalProvider).toBeUndefined();
  expect(personal.isPersonalProductionV2(stored)).toBe(true);
  expect(personal.isPersonalProductionV2(input)).toBe(false);
  expect(personal.productionContentManifestV2(stored)).toEqual(v1.parseProductionManifestV1(input));
  expect(input).toEqual(manifest());
  expect(choice).toEqual({ kind: 'personal_subscription', connections: {} });
  expect(v1.ProductionManifestSchemaV1.safeParse(stored).success).toBe(false);
});

test('personal storage and content helpers retain full V1 semantic validation', () => {
  const stored = personal.personalManifestV2(manifest(), funding());
  const badTiming = { ...stored, durationSeconds: 11 };
  expect(personal.PersonalProductionManifestSchemaV2.safeParse(badTiming).success).toBe(false);
  expect(personal.isPersonalProductionV2(badTiming)).toBe(false);
  expect(() => personal.productionContentManifestV2(badTiming)).toThrow();
  expect(() => personal.personalManifestV2({ ...manifest(), scenes: [manifest().scenes[0], manifest().scenes[0]] }, funding())).toThrow();
  expect(personal.PersonalProductionFundingSchemaV2.safeParse({ ...funding(), maxTotalUsd: 5 }).success).toBe(false);
  expect(personal.PersonalProductionFundingSchemaV2.safeParse({ ...funding(), connections: { heygen: HEYGEN, fallback: HIGGSFIELD } }).success).toBe(false);
  expect(personal.PersonalProductionFundingSchemaV2.safeParse({ ...funding(), connections: { heygen: 'not-a-connection' } }).success).toBe(false);
});

test('scene reuse remains stable under identical funding and a selective parent revision changes only the edited scene key', () => {
  const first = personal.personalManifestV2(manifest(), funding());
  const revision = structuredClone(first); revision.title = 'Selective revision'; revision.scenes[1].generationAttempt++;
  const key = (m, index, productionId = 'root-production') => personal.personalSceneKeyV2(productionId, m, m.scenes[index], [{ id: 'owned', revision: 'bytes-v1' }]);
  expect(key(first, 0)).toBe(key(structuredClone(first), 0));
  expect(key(first, 0)).toBe(key(revision, 0));
  expect(key(first, 1)).not.toBe(key(revision, 1));
  expect(key(first, 0)).not.toBe(key(first, 0, 'another-production'));
  expect(key(first, 0)).not.toBe(personal.personalSceneKeyV2('root-production', first, first.scenes[0], [{ id: 'owned', revision: 'bytes-v2' }]));
  expect(key(first, 0)).not.toBe(v1.productionSceneKeyV1('root-production', personal.productionContentManifestV2(first), first.scenes[0], [{ id: 'owned', revision: 'bytes-v1' }]));
});

test.each([
  choice => { choice.connections.heygen = OTHER_HEYGEN; },
  choice => { delete choice.connections.higgsfield; },
  choice => { choice.finalProvider = 'higgsfield'; },
  choice => { delete choice.finalProvider; },
])('a changed exact funding choice cannot reuse the old funded scene key', change => {
  const first = personal.personalManifestV2(manifest(), funding()), next = structuredClone(first); change(next.funding);
  expect(personal.personalSceneKeyV2('root', first, first.scenes[0], [])).not.toBe(personal.personalSceneKeyV2('root', next, next.scenes[0], []));
});

test('preflight accepts only explicit unique native-credit limits', () => {
  const limits = { creditLimits: [{ connectionId: HEYGEN, unit: 'heygen_credit', maxCredits: '0.000001' },
    { connectionId: HIGGSFIELD, unit: 'higgsfield_credit', maxCredits: '999999999999.999999' }] };
  expect(personal.PersonalProductionPreflightSchemaV2.parse(limits)).toEqual(limits);
  expect(personal.PersonalProductionPreflightSchemaV2.safeParse({ creditLimits: [] }).success).toBe(false);
  expect(personal.PersonalProductionPreflightSchemaV2.safeParse({ creditLimits: [...limits.creditLimits, { ...limits.creditLimits[0], connectionId: OTHER_HEYGEN }] }).success).toBe(false);
  expect(personal.PersonalProductionPreflightSchemaV2.safeParse({ creditLimits: [limits.creditLimits[0], { ...limits.creditLimits[0], unit: 'higgsfield_credit' }] }).success).toBe(false);
  expect(personal.PersonalProductionPreflightSchemaV2.safeParse({ ...limits, maxTotalUsd: 10 }).success).toBe(false);
  expect(personal.PersonalProductionCreditLimitSchemaV2.safeParse({ ...limits.creditLimits[0], unit: 'USD' }).success).toBe(false);
});

test.each([0, 0.1, NaN, Infinity, null, undefined, '', '0', '0.000000', '-1', '+1', '1e3', 'Infinity', 'NaN', ' 1', '1 ', '.1', '1.', '0.0000001', '1000000000000'])('credit limit rejects invalid or coerced amount %p', maxCredits => {
  expect(personal.PersonalProductionCreditLimitSchemaV2.safeParse({ connectionId: HEYGEN, unit: 'heygen_credit', maxCredits }).success).toBe(false);
});

test('credit totals use exact Decimal arithmetic, preserve native units and do not merge connections', () => {
  const precision = Prisma.Decimal.precision;
  expect(personal.creditTotalsV2([operation('0.1'), operation('0.2'), operation('1.000001', HIGGSFIELD, 'higgsfield_credit'), operation('7', OTHER_HEYGEN)], connections)).toEqual([
    { connectionId: HEYGEN, unit: 'heygen_credit', amount: '0.3' },
    { connectionId: HIGGSFIELD, unit: 'higgsfield_credit', amount: '1.000001' },
    { connectionId: OTHER_HEYGEN, unit: 'heygen_credit', amount: '7' },
  ]);
  expect(personal.creditTotalsV2(Array.from({ length: 51 }, () => operation('999999999999.999999')), connections)).toEqual([
    { connectionId: HEYGEN, unit: 'heygen_credit', amount: '50999999999999.999949' },
  ]);
  expect(Prisma.Decimal.precision).toBe(precision);
  expect(personal.creditTotalsV2([], connections)).toEqual([]);
});

test('unknown prices, unknown connections and inconsistent units fail rather than fabricating zero or switching funding', () => {
  for (const amount of [null, undefined, 0.1, '0', 'NaN', '1e3']) expect(() => personal.creditTotalsV2([operation(amount)], connections)).toThrow();
  expect(errorCode(() => personal.creditTotalsV2([operation('1')], []))).toBe('VIDEO_PRODUCTION_CREDIT_CONNECTION_MISSING');
  expect(errorCode(() => personal.creditTotalsV2([operation('1', HEYGEN, 'higgsfield_credit')], connections))).toBe('VIDEO_PRODUCTION_CREDIT_UNIT_MISMATCH');
  expect(errorCode(() => personal.creditTotalsV2([operation('1')], [connections[0], { ...connections[0] }]))).toBe('VIDEO_PRODUCTION_CREDIT_CONNECTION_DUPLICATE');
  expect(() => personal.creditTotalsV2([{ connectionId: HEYGEN, unit: 'heygen_credit', costUsd: 1 }], connections)).toThrow();
});
