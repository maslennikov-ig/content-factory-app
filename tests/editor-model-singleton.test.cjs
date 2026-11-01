'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('the actual installed editor graph shares Fragment/Schema identity across TipTap, view, state and transform', () => {
  const script = `
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const model = require('@tiptap/pm/model');
    const schema = new model.Schema({ nodes: { doc: { content: 'text*' }, text: {} } });
    const text = schema.text('A real editor insertion');
    for (const dependency of ['@tiptap/core', 'prosemirror-view', 'prosemirror-state', 'prosemirror-transform']) {
      const local = createRequire(require.resolve(dependency))('prosemirror-model');
      assert.equal(local.Fragment, model.Fragment, dependency + ' loaded a different Fragment constructor');
      assert.equal(local.Fragment.from(text).firstChild.text, 'A real editor insertion');
    }
  `;
  expect(() => execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), stdio: 'pipe' })).not.toThrow();
});
