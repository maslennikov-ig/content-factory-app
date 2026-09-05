'use strict';

/**
 * `content-factory-next-fn33.28.3`: the door a member may read.
 *
 * `/settings/ai` is administrator-only, and rightly: it reads and writes the
 * workspace key and prints who spent what. The allowance beside it is neither,
 * because every paid button in the product is open to any member and a number
 * a member cannot read is a number that cannot stand in front of the button.
 *
 * So this holds three things at once: the allowance door carries no policy and
 * therefore is open to any signed-in member, its neighbours keep theirs, and
 * the organisation still comes from the request rather than from anything the
 * caller writes.
 */

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const CONTROLLER = 'apps/backend/src/api/routes/settings.controller.ts';

const source = ts.createSourceFile(
  CONTROLLER,
  fs.readFileSync(path.join(root, CONTROLLER), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);

const HTTP_METHODS = new Set(['Get', 'Post', 'Put', 'Delete', 'Patch']);
const literalOf = (node) =>
  node && ts.isStringLiteralLike(node) ? node.text : '';

const doors = [];
source.forEachChild((node) => {
  if (!ts.isClassDeclaration(node)) return;
  let prefix = null;
  for (const decorator of ts.getDecorators(node) || []) {
    const call = decorator.expression;
    if (ts.isCallExpression(call) && call.expression.getText() === 'Controller') {
      prefix = literalOf(call.arguments[0]);
    }
  }
  if (prefix === null) return;

  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    let method;
    let route = '';
    let policies = null;
    for (const decorator of ts.getDecorators(member) || []) {
      const call = decorator.expression;
      if (!ts.isCallExpression(call)) continue;
      const name = call.expression.getText();
      if (HTTP_METHODS.has(name)) {
        method = name.toUpperCase();
        route = literalOf(call.arguments[0]);
      }
      if (name === 'CheckPolicies') {
        policies = call.arguments.map((argument) => argument.getText());
      }
    }
    if (!method) continue;
    doors.push({
      method,
      path: `${prefix}${route}`,
      policies,
      body: member.getText(),
    });
  }
});

const doorFor = (method, route) =>
  doors.find((door) => door.method === method && door.path === route);

describe('the AI allowance door', () => {
  test('any member of the workspace may read the allowance', () => {
    const door = doorFor('GET', '/settings/ai/allowance');

    expect(door).toBeDefined();
    expect(door.policies).toBeNull();
  });

  test('the organisation comes from the request and the answer carries no key', () => {
    const door = doorFor('GET', '/settings/ai/allowance');

    expect(door.body).toContain('@GetOrgFromRequest()');
    expect(door.body).toContain('readAllowance(organization.id)');
    // No body, no query, no parameter: nothing the caller writes reaches it.
    expect(door.body).not.toContain('@Body(');
    expect(door.body).not.toContain('@Query(');
    expect(door.body).not.toContain('@Param(');
  });

  test('the settings doors beside it stay administrator-only', () => {
    for (const [method, route] of [
      ['GET', '/settings/ai'],
      ['POST', '/settings/ai'],
      ['DELETE', '/settings/ai/key'],
      ['DELETE', '/settings/ai/search-key'],
      ['GET', '/settings/ai/models'],
    ]) {
      expect({ route, policies: doorFor(method, route).policies }).toEqual({
        route,
        policies: ['[AuthorizationActions.Create, Sections.ADMIN]'],
      });
    }
  });

  test('reading the allowance never admits an operation', () => {
    const service = fs.readFileSync(
      path.join(
        root,
        'libraries/nestjs-libraries/src/openai/ai.usage.service.ts'
      ),
      'utf8'
    );
    const method = service
      .slice(service.indexOf('async readAllowance('))
      .slice(0, service.slice(service.indexOf('async readAllowance(')).indexOf('\n  }\n'));

    expect(method).not.toMatch(/createAdmission|\.create\(|\.update\(|\$transaction/);
    expect(method).toContain('count');
  });
});
