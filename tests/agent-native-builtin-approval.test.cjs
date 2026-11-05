'use strict';
const React = require('react');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/agents/native-thread'});
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, {configurable: true, value: dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT = true;
const {render, cleanup, fireEvent, within} = require('@testing-library/react');
const {loadTypeScriptModule} = require('./helpers/load-tsx.cjs');
const {loadWithMocks} = require('./helpers/load-ts-with-mocks.cjs');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const {ApprovalCard} = loadWithMocks('apps/frontend/src/components/agents/agent.cards.tsx', {
  '@contentfactory/react/translation/get.transation.service.client': {useT: () => (_key, fallback) => fallback},
  '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage: () => 'en'},
  '../layout/user.context': {useUser: () => ({id: 'actor', orgId: 'organization'})},
});
const {agentCopy} = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const runId = 'native-run', toolCallId = 'native-call', id = `${runId}::${toolCallId}`;
const task = 'Prepare three text concepts. The brief requests Sol; do not claim an identity without evidence.';
const input = {agentType: 'writing', task, prompt: null, forked: false, modelId: null, _background: null};
const pending = [{runId, toolCallId, toolName: 'subagent', kind: 'approval', suspendPayload: null, summary: null}];
const message = (state = 'approval-requested', extra = {}) => ({id: 'assistant', role: 'assistant', parts: [{type: 'tool-subagent', toolCallId, title: 'Delegate to a specialist', state, input, approval: {id}, ...extra}]});
const read = (m = message(), waits = pending) => {
  const history = contract.readThreadHistory({messages: [m], pending: waits});
  return {history, blocks: contract.readMessageBlocks(history.messages[0], history.pending)};
};
const draw = (block, locale = 'en', extra = {}) => {
  const response = jest.fn();
  const view = render(React.createElement(ApprovalCard, {...block, words: agentCopy[locale], busy: false,
    canAnswer: contract.approvalWaits(pending, block.approvalId), onAnswer: approved => response({id: block.approvalId, approved}), ...extra}));
  return {...view, response};
};
afterEach(cleanup);

test.each(['approval-requested', 'input-available'])('current native subagent %s renders approval before working-card projection, including reload', state => {
  const original = message(state), before = JSON.stringify(original);
  const {blocks} = read(original);
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({type: 'approval', state: 'asked', approvalId: id, toolName: 'subagent', reason: null,
    subagentApproval: {agentType: 'writing', task, modelId: null}});
  expect(contract.waitingApprovalIds(read(original).history.messages[0])).toEqual([id]);
  expect(JSON.stringify(original)).toBe(before);
});

test.each(['ru', 'en'])('real input scope makes native Yes/No reviewable, with unspecified model honest and a single decline callback (%s)', locale => {
  const block = read().blocks[0];
  expect(block.type).toBe('approval');
  const view = draw(block, locale), w = agentCopy[locale];
  expect(view.container.textContent).toContain(task);
  expect(view.container.textContent).toContain(w.subagent.modelUnspecified);
  expect(within(view.container).getByRole('button', {name: w.approval.yes}).disabled).toBe(false);
  const no = within(view.container).getByRole('button', {name: w.approval.no});
  expect(no.disabled).toBe(false); expect(view.response).not.toHaveBeenCalled();
  fireEvent.click(no); fireEvent.click(no);
  expect(view.response.mock.calls).toEqual([[{id, approved: false}]]);
});

test('native approval exposes exact explicit model and approval answers once without changing identity', () => {
  const block = read(message('approval-requested', {input: {...input, modelId: 'openai/gpt-6.1-sol'}})).blocks[0];
  expect(block.type).toBe('approval');
  const view = draw(block);
  expect(view.container.textContent).toContain('openai/gpt-6.1-sol');
  const yes = within(view.container).getByRole('button', {name: agentCopy.en.approval.yes});
  fireEvent.click(yes); fireEvent.click(yes);
  expect(view.response.mock.calls).toEqual([[{id, approved: true}]]);
});

test('closed pending approval has no controls even though its task still exists', () => {
  const block = read(message(), []).blocks[0];
  expect(block).toMatchObject({type: 'approval', state: 'closed', approvalId: id});
  const view = draw(block);
  expect(view.container.querySelectorAll('button')).toHaveLength(0); expect(view.response).not.toHaveBeenCalled();
});

test('missing native task details never enables Yes but still permits native decline', () => {
  const block = read(message('approval-requested', {input: {...input, task: ''}})).blocks[0];
  expect(block.type).toBe('approval');
  const view = draw(block);
  expect(within(view.container).queryByRole('button', {name: agentCopy.en.approval.yes})).toBeNull();
  fireEvent.click(within(view.container).getByRole('button', {name: agentCopy.en.approval.no}));
  expect(view.response.mock.calls).toEqual([[{id, approved: false}]]);
});

test.each([
  ['task_write', {tasks: [{content: 'Draft', status: 'pending'}]}],
  ['set_objective', {objective: 'Draft a text'}],
])('native %s approval takes precedence over ordinary progress rendering', (toolName, args) => {
  const nativePending = [{...pending[0], toolName, summary: 'Review this exact native task before it executes.'}];
  const m = message('approval-requested', {type: `tool-${toolName}`, input: args});
  const blocks = read(m, nativePending).blocks;
  expect(blocks).toHaveLength(1); expect(blocks[0]).toMatchObject({type: 'approval', approvalId: id, state: 'asked'});
});
