'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(
  root,
  'apps/frontend/src/app/(app)/(site)/join-org/page.tsx'
);

test('the confirmation route exposes preview, explicit choices, and named success', () => {
  expect(fs.existsSync(pagePath)).toBe(true);
  if (!fs.existsSync(pagePath)) return;

  const source = fs.readFileSync(pagePath, 'utf8');
  for (const key of [
    'team_invitation_workspace',
    'team_invitation_role',
    'team_invitation_inviter',
    'team_invitation_accept',
    'team_invitation_decline',
    'team_invitation_success_body',
  ]) {
    expect(source).toContain(`'${key}'`);
  }
  expect(source).toContain("fetch(`/user/join-org?${query}`)");
  expect(source).toContain("fetch('/user/join-org'");
  expect(source).toContain('workspaceName: result.workspaceName');
  expect(source).toContain('role: result.role');
});
test('the confirmation route uses Content Factory primitives and token colors', () => {
  expect(fs.existsSync(pagePath)).toBe(true);
  if (!fs.existsSync(pagePath)) return;

  const source = fs.readFileSync(pagePath, 'utf8');
  expect(source).toContain("from '@contentfactory/react/layout'");
  expect(source).toContain("from '@contentfactory/react/form/button'");
  expect(source).not.toMatch(/#[0-9a-f]{3,8}/i);
  expect(source).not.toContain('border-l-');
  expect(source).not.toContain('border-r-');
});
