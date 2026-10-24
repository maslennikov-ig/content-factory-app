'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('real process recreation restores bundled skill/material-read policy and explicit ask/deny without duplicate writes', () => {
  const raw = execFileSync(process.execPath, [path.join(__dirname, 'helpers/agent-chat-cold-permissions.probe.cjs')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 85000, stdio: ['ignore', 'pipe', 'pipe'] });
  expect(JSON.parse(raw.trim().split('\n').at(-1))).toEqual(['allow', 'ask'].map(mode => ({mode, skill:'allow',materialRead:mode,restrictedSkill:'deny',writes:1,completed:true,actualProcessRecreated:true})));
}, 90000);
