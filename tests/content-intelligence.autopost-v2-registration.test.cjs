const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

describe('AutoPost draft V2 orchestrator registration', () => {
  test('exports the versioned workflow without replacing AutoPost V1', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/orchestrator/src/workflows/index.ts'),
      'utf8'
    );

    expect(source).toContain("export * from './autopost.workflow';");
    expect(source).toContain(
      "export * from './autopost-draft-v2.workflow';"
    );
  });

  test('registers the V2 activity alongside the existing V1 activity', () => {
    const source = fs.readFileSync(
      path.join(root, 'apps/orchestrator/src/app.module.ts'),
      'utf8'
    );

    expect(source).toContain(
      "import { AutopostActivity } from '@contentfactory/orchestrator/activities/autopost.activity';"
    );
    expect(source).toContain(
      "import { AutopostDraftV2Activity } from '@contentfactory/orchestrator/activities/autopost-draft-v2.activity';"
    );
    expect(source).toMatch(
      /const activities = \[[\s\S]*AutopostActivity,[\s\S]*AutopostDraftV2Activity,/
    );
  });
});
