#!/usr/bin/env node
/**
 * A session token for a dev-stand user whose login password is not on hand.
 *
 * The night walkthrough's workspace (`walkthrough-07h@cf-dev.local`) survived
 * in the local database, but its password was never written down anywhere —
 * correctly so, since evidence must not carry credentials. Rather than create
 * a second workspace and re-seed thirty samples, a measurement, a proposal and
 * a content piece a second time, this mints the same JWT `AuthService.jwt()`
 * would have handed back, from `JWT_SECRET` in the stand's own `.env` and the
 * user row already in `cf-dev-postgres`.
 *
 * Local stands only, and the value is never printed here or anywhere else: on
 * a stand the secret is the placeholder that ships with the example
 * configuration, and on any other instance it is a real one. A script that
 * signs sessions belongs nowhere near an instance with real users.
 *
 * Usage: node scripts/evidence/mint-dev-session-token.cjs <email>
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const CONTAINER = process.env.CF_PG_CONTAINER || 'cf-dev-postgres';
const USER = process.env.CF_PG_USER || 'cf-dev';
const DB = process.env.CF_PG_DB || 'cf-dev-db';
const email = process.argv[2];
const REPO = path.resolve(__dirname, '../..');

if (!email) {
  console.error('need an email');
  process.exit(2);
}

const row = execFileSync(
  'docker',
  [
    'exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', DB, '-At', '-c',
    `SELECT row_to_json(u) FROM "User" u WHERE email='${email.replace(/'/g, "''")}'`,
  ],
  { encoding: 'utf8' }
).trim();

if (!row) {
  console.error(`no user for ${email}`);
  process.exit(1);
}

const user = JSON.parse(row);
delete user.password;

const envText = fs.readFileSync(path.join(REPO, '.env'), 'utf8');
const secretLine = envText.split('\n').find((line) => line.startsWith('JWT_SECRET='));
if (!secretLine) {
  console.error('no JWT_SECRET in .env');
  process.exit(1);
}
const secret = secretLine.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '');

console.log(jwt.sign(user, secret));
