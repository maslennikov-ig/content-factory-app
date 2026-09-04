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
    // `content-factory-next-fn33.11`: whom the invitation is for, and the two
    // answers that replace an «Accept» button that could not work.
    'team_invitation_recipient',
    'team_invitation_recipient_any',
    'team_invitation_mismatch_notice',
    'team_invitation_already_member',
    'team_invitation_accept',
    'team_invitation_decline',
    'team_invitation_success_body',
    // `content-factory-next-fn33.6`: the two answers that used to arrive as
    // «could not be checked, try again» — advice that cannot work for either.
    'team_invitation_error_membership',
    'team_invitation_error_already_member',
  ]) {
    expect(source).toContain(`'${key}'`);
  }
  expect(source).toContain("fetch(`/user/join-org?${query}`)");
  expect(source).toContain("fetch('/user/join-org'");
  // `content-factory-next-fn33.5`: refusing has to reach the server.
  expect(source).toContain("fetch('/user/join-org/decline'");
  expect(source).toContain('workspaceName: result.workspaceName');
  expect(source).toContain('role: result.role');
  // No accepting on behalf of an account the invitation is not for, and none
  // for an account that is already inside.
  expect(source).toMatch(/preview\.emailMismatch/);
  expect(source).toMatch(/preview\.alreadyMember/);
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

/**
 * Review of `content-factory-next-fn33.11`/`fn33.5`: four of the six end
 * states left the person on a page with nothing to press. Success and decline
 * had «Continue»; «this is not your invitation», «you are already here» and
 * every error without a retry did not. A dead end is not a state, it is a
 * place someone has to close the tab to leave.
 */
test('every dead end offers a way onward', () => {
  expect(fs.existsSync(pagePath)).toBe(true);
  if (!fs.existsSync(pagePath)) return;

  const source = fs.readFileSync(pagePath, 'utf8');

  // Success, decline, an error with no retry, and the two preview dead ends.
  expect(source.match(/t\('continue', 'Continue'\)/g) || []).toHaveLength(4);
  // The retry and the way out are alternatives, never both and never neither.
  expect(source).toContain("{error === 'invite_unknown' ? (");
  expect(source).toContain("{t('try_again', 'Try Again')}");
});


/**
 * `content-factory-next-fn33.26`: «Continue» after accepting has to leave
 * through the browser.
 *
 * Accepting sets the `showorg` cookie server side, and that cookie is the only
 * thing that makes the invited workspace the current one. The button used to
 * call `router.push('/')` — a client transition — so the layout kept the user
 * context it already had, and the workspace list behind
 * `useSWR('organizations')` never revalidates on its own: the owner landed
 * back in his old workspace with the new one absent from the switcher until he
 * reloaded by hand.
 */
test('accepting an invitation ends in a full page load, not a client transition', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  expect(source).toContain("window.location.assign('/')");
  const success = source.slice(
    source.indexOf('team_invitation_success_title'),
    source.indexOf('team_invitation_declined_title')
  );
  expect(success).toContain('onClick={enterWorkspace}');
  expect(success).not.toContain("router.push('/')");
});

test('switching workspace by hand already reloads, for the same reason', () => {
  const selector = fs.readFileSync(
    path.join(
      root,
      'apps/frontend/src/components/layout/organization.selector.tsx'
    ),
    'utf8'
  );

  // The cookie `change-org` sets is the same one, and this is the move the
  // invitation page now copies.
  expect(selector).toContain("fetch('/user/change-org'");
  expect(selector).toContain('window.location.reload()');
});
