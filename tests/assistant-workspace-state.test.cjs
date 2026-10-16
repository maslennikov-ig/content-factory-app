const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { emptyArtifactWorkspace, artifactWorkspaceReducer: reduce, distinctArtifacts, persistedArtifactSelection } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.workspace-state.ts');
const artifact = (id, kind = 'piece') => ({ kind, id, title: id, code: null, data: { id } });

describe('assistant artifact selection and draft protection', () => {
  test('turn one artifacts remain when the server later names a new thread', () => {
    const state = reduce(emptyArtifactWorkspace(), { type: 'produced', artifacts: [artifact('one'), artifact('two')] });
    expect(persistedArtifactSelection(state).artifacts.map((one) => one.id)).toEqual(['one', 'two']);
    expect(state.active).toBe('piece:two');
  });
  test('a hidden pane stays hidden while new results are available for explicit selection', () => {
    let state = reduce(emptyArtifactWorkspace(), { type: 'select', artifact: artifact('one') });
    state = reduce(state, { type: 'hide' });
    state = reduce(state, { type: 'produced', artifacts: [artifact('two')] });
    expect(state.active).toBe('piece:one');
    expect(state.hidden).toBe(true);
    expect(state.unread).toEqual(['piece:two']);
    expect(persistedArtifactSelection(state).activeArtifact).toBeNull();
    state = reduce(state, { type: 'select', artifact: artifact('two') });
    expect(state.hidden).toBe(false);
    expect(state.active).toBe('piece:two');
  });
  test('automatic results do not replace edited work, while an explicit choice can open a result', () => {
    let state = reduce(emptyArtifactWorkspace(), { type: 'select', artifact: artifact('one') });
    state = reduce(state, { type: 'dirty', key: 'piece:one' });
    state = reduce(state, { type: 'produced', artifacts: [artifact('two')] });
    expect(state.active).toBe('piece:one');
    expect(state.unread).toEqual(['piece:two']);
  });
  test('repeated updates are one object and independent adaptation variants stay distinct', () => {
    const rows = distinctArtifacts([artifact('one'), artifact('a', 'adaptation'), artifact('b', 'adaptation'), { ...artifact('one'), title: 'Updated' }]);
    expect(rows.map((one) => one.id)).toEqual(['a', 'b', 'one']);
    expect(rows.at(-1).title).toBe('Updated');
  });
  test('late history cannot replace a material explicitly selected and edited during loading', () => {
    let state = emptyArtifactWorkspace(false);
    state = reduce(state, { type: 'select', artifact: artifact('B') });
    state = reduce(state, { type: 'dirty', key: 'piece:B' });
    state = reduce(state, { type: 'restore', artifacts: [artifact('A')], workspace: { version: 'assistant-workspace/v1', artifacts: [{ kind: 'piece', id: 'A' }], activeArtifact: { kind: 'piece', id: 'A' }, workContext: null } });
    expect(state.active).toBe('piece:B');
    expect(state.dirty).toContain('piece:B');
    expect(state.ready).toBe(true);
  });
  test('a repeated stream snapshot cannot undo the person selecting an older artifact', () => {
    let state = reduce(emptyArtifactWorkspace(), { type: 'produced', artifacts: [artifact('one'), artifact('two')] });
    state = reduce(state, { type: 'select', artifact: artifact('one') });
    state = reduce(state, { type: 'produced', artifacts: [artifact('one'), artifact('two')] });
    expect(state.active).toBe('piece:one');
  });
  test('restoring an explicitly closed panel and many refs preserves selected ownership bounds', () => {
    const workspace = { version: 'assistant-workspace/v1', artifacts: [], activeArtifact: null, workContext: null };
    const restored = reduce(emptyArtifactWorkspace(false), { type: 'restore', artifacts: [artifact('one')], workspace });
    expect(restored.hidden).toBe(true);
    let state = reduce(emptyArtifactWorkspace(), { type: 'select', artifact: artifact('one') });
    state = reduce(state, { type: 'dirty', key: 'piece:one' });
    state = reduce(state, { type: 'produced', artifacts: Array.from({ length: 30 }, (_, i) => artifact(String(i))) });
    const saved = persistedArtifactSelection(state);
    expect(saved.artifacts).toHaveLength(24);
    expect(saved.artifacts.some((one) => one.id === 'one')).toBe(true);
    expect(saved.activeArtifact.id).toBe('one');
  });
});
