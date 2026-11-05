'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/social-factory/contracts/';
const { parseSourceArtifactSelectionV1 } = loadTypeScriptModule(base + 'native-journey.schemas.v1.ts');
const { SourceArtifactSelectionSchemaV1 } = loadTypeScriptModule(base + 'source-artifact.v1.ts');

test('native V2 source calls resolve piece null placeholders, preserve a pin and retain adaptation selection', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, 'helpers/source-artifact-native-input.probe.cjs')], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 70_000,
  });
  expect(JSON.parse(output.trim().split('\n').at(-1))).toEqual({ cases: [
    { kind: 'piece', pinned: false, resolverCalls: 1, transportCalls: 2, outputOk: true, outcome: 'completed', inputUnchanged: true },
    { kind: 'piece', pinned: true, resolverCalls: 1, transportCalls: 2, outputOk: true, outcome: 'completed', inputUnchanged: true },
    { kind: 'adaptation', pinned: false, resolverCalls: 1, transportCalls: 2, outputOk: true, outcome: 'completed', inputUnchanged: true },
  ], externalRequests: 0 });
}, 75_000);

test('native optional undefined fields are removed without mutating input or relaxing the domain contract', () => {
  const input = Object.freeze({ version: 1, kind: 'piece', pieceId: 'source-owned', adaptationId: undefined, postId: undefined, revision: 'a'.repeat(64) });
  const keys = Object.keys(input);
  expect(SourceArtifactSelectionSchemaV1.safeParse(input).success).toBe(false);
  expect(parseSourceArtifactSelectionV1(input)).toEqual({ version: 1, kind: 'piece', pieceId: 'source-owned', revision: 'a'.repeat(64) });
  expect(Object.keys(input)).toEqual(keys);
});

test.each([
  { adaptationId: 'unexpected-adaptation' },
  { postId: 'unexpected-post' },
  { text: 'caller-supplied source' },
  { actorId: undefined },
  { revision: 'invalid-revision' },
])('incompatible selectors, authority and invalid revisions stay rejected: %j', extra => {
  expect(() => parseSourceArtifactSelectionV1({ version: 1, kind: 'piece', pieceId: 'source-owned', ...extra })).toThrow();
});

test('an adaptation still requires its own identity and keeps an explicit post and revision', () => {
  expect(() => parseSourceArtifactSelectionV1({ version: 1, kind: 'adaptation', pieceId: 'source-owned', adaptationId: undefined })).toThrow();
  const input = { version: 1, kind: 'adaptation', pieceId: 'source-owned', adaptationId: 'adaptation-owned', postId: 'post-owned', revision: 'b'.repeat(64) };
  expect(parseSourceArtifactSelectionV1(input)).toEqual(input);
});
