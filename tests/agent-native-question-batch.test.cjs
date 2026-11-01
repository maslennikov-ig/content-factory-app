'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const batch = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/native-question-batch.ts');
const card = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/question-card.ts');

test('complete ordered answers are validated against the suspended questions', () => {
  const payload = { kind: 'question-batch', questions: [{ question: 'Q1' }, { question: 'Q2', canDecideForPerson: false }, { question: 'Q3', options: [{label: 'A'}], selectionMode: 'multi_select' }] };
  const good = { answers: [{ skipped: true }, { answer: 'личный текст' }, { answer: ['A'] }] };
  expect(card.answerFitsCard(payload, good, 'ask_user')).toBe(true);
  for (const invalid of [
    { answers: good.answers.slice(0, 2) },
    { answers: [{ skipped: true, decideForPerson: true }, good.answers[1], good.answers[2]] },
    { answers: [good.answers[0], { decideForPerson: true }, good.answers[2]] },
    { answers: [{ answer: ' ' }, good.answers[1], good.answers[2]] },
    { answers: [{ answer: ['A'] }, good.answers[1], good.answers[2]] },
    { answers: good.answers, extra: true },
  ]) expect(card.answerFitsCard(payload, invalid, 'ask_user')).toBe(false);
  expect(card.answerFitsCard({ question: 'single' }, { answer: 'old' }, 'ask_user')).toBe(true);
  expect(batch.createNativeQuestionTool().inputSchema.safeParse({ question: 'single' }).success).toBe(true);
  expect(batch.createNativeQuestionTool().inputSchema.safeParse({ questions: payload.questions }).success).toBe(true);
});

test('native batch survives cold process recovery and continues once', () => {
  const stdout = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-native-question-batch.probe.cjs')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 100000 });
  expect(JSON.parse(stdout.trim().split('\n').at(-1))).toEqual({ nativePgRedis: true, processRecreated: true, modelCallsBefore: 1, modelCallsAfter: 1,
    orderedAnswersPreserved: true, invalidAndStaleRejected: true, oneSuspension: true, noApprovalHop: true, stoppedBatchCannotResume: true });
}, 110000);
