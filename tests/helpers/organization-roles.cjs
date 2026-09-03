/**
 * The real `libraries/nestjs-libraries/src/user/organization.roles.ts`,
 * compiled, for any suite that loads a source file importing it.
 *
 * Mapped in `jest.config.js` rather than stubbed per suite, and it hands over
 * the real module rather than a stand-in on purpose. That file exists because
 * the role ranking was written out by hand in four places and answered
 * «superadmin» for any role it did not name; a stub here would be the fifth
 * copy, free to drift from the four it replaced while every suite stayed
 * green.
 */
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

module.exports = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/user/organization.roles.ts'
);
