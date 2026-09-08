const { test } = require('@jest/globals');
const assert = require('node:assert/strict');
const { retention, makeReport, markdown, readPieces } = require('../scripts/evidence/liveness-report.cjs');

test('overlapping windows count original words once; punctuation and case match', () => {
  const source = 'Ёж сегодня принёс восемь яблок прямо к дому утром.';
  const result = retention(source, 'еж сегодня принес восемь яблок прямо к дому утром!', 5);
  assert.equal(result.wordShare, 1);
  assert.equal(result.sentenceShare, 1);
  assert.equal(retention(source, 'совсем другая история', 5).wordShare, 0);
});

test('partial copied fragment is word retention but not a retained sentence', () => {
  const result = retention('один два три четыре пять шесть семь восемь девять десять.', 'один два три четыре пять', 5);
  assert.equal(result.wordShare, 0.5);
  assert.equal(result.sentenceShare, 0);
  assert.equal(retention('пять слов', 'пять слов', 5).wordShare, null);
});

test('report excludes foreign text, missing bodies, and all private fields', () => {
  const thought = { id: 'secret-id', kind: 'CORE', title: 'secret-title', body: 'один два три четыре пять',
    brief: { personText: 'один два три четыре пять', brief: { inputKind: 'thought' } },
    derivations: [{ platform: 'telegram', body: 'один два три четыре пять' }, { platform: 'vk', body: null }] };
  const report = makeReport([thought, { ...thought, brief: { ...thought.brief, brief: { inputKind: 'foreign_post' } } }]);
  assert.equal(report.eligiblePieces, 1);
  assert.equal(report.missingBodies, 1);
  assert.equal(report.rows.length, 4);
  assert.equal(report.adaptationPairs, 1);
  const output = markdown(report);
  assert.doesNotMatch(output, /secret-id|secret-title|один два три/);
  assert.match(output, /100\.0%/);
  assert.match(markdown(makeReport([])), /не означает успешную проверку/);
  assert.match(markdown(makeReport([{ ...thought, derivations: [] }])), /долю переноса в адаптацию установить нельзя/);
});

test('database reader only selects and keeps workspace scope across pages', async () => {
  const calls = [];
  const p = { contentPiece: { findMany: async (args) => {
    calls.push(args);
    return calls.length === 1 ? Array.from({length: 200}, (_, i) => ({ id: String(i) })) : [];
  } } };
  assert.equal((await readPieces(p, 'workspace')).length, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].where.organizationId, 'workspace');
  assert.deepEqual(calls[1].cursor, { id: '199' });
});
