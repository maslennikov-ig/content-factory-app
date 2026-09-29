'use strict';

/**
 * Guards of the conductor (`content-factory-next-kcxz.7`) and its doors
 * (`kcxz.8`): what must stay true of the source, whoever edits it next.
 *
 * - the web agent is built with the capability hooks — the per-call CASL
 *   re-check, the paid cap and the approval binding live only there (kcxz.6
 *   note on kcxz.7);
 * - the inherited agent, its eleven tools, `AgentState` and its proverbs are
 *   gone, and so is `@ag-ui/mastra`;
 * - titles and observational memory call no model;
 * - the conductor runs under its own AI role, which falls back to the text
 *   model like the other text roles;
 * - the card contract the screen mirrors is one importless file, and every
 *   refusal code the registry answers with is in it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const CHAT = 'libraries/nestjs-libraries/src/chat';

const sourceFiles = (directory) => {
  const found = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (/\.tsx?$/.test(entry.name)) found.push(next);
    }
  };
  walk(directory);
  return found;
};
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the web agent is the conductor, with the hooks', () => {
  test('the only Mastra agent of the backend is built by buildConductorAgent with createCapabilityHooks', () => {
    const agentFile = `${CHAT}/conductor/conductor.agent.ts`;
    const code = withoutComments(read(agentFile));
    expect(code).toMatch(/hooks:\s*createCapabilityHooks\(capabilities,\s*deps\.gate,\s*deps\.services\)/);
    expect(code).toMatch(/requestContextSchema:\s*conductorContextSchema/);
    expect(code).toMatch(/maxRetries:\s*CONDUCTOR_MAX_RETRIES/);
    expect(code).toMatch(/defaultOptions:\s*\{\s*maxSteps:\s*CONDUCTOR_MAX_STEPS,\s*stopWhen:\s*stopAfterOpenProposalRefusal\b[^}]*\}/);

    const mastraAgents = [...sourceFiles('libraries/nestjs-libraries/src'), ...sourceFiles('apps/backend/src')]
      .filter((relative) => /from '@mastra\/core\/agent'/.test(read(relative)))
      .filter((relative) => /new Agent\(/.test(withoutComments(read(relative))));
    expect(mastraAgents).toEqual([agentFile]);

    const service = withoutComments(read(`${CHAT}/mastra.service.ts`));
    expect(service).toMatch(/\[CONDUCTOR_AGENT_ID\]:\s*buildConductorAgent\(/);
    expect(service).toMatch(/gate:\s*this\.gate\(\)/);
    expect(service).toMatch(/prepareModelExecution\(\s*organizationId,\s*'agent'/);
    expect(service).toMatch(/getModelForRole\(organizationId, 'agent'\)/);
  });

  test('the doors run the conductor through handleChatStream pinned to v7 with onError', () => {
    const code = withoutComments(read('apps/backend/src/api/routes/agent.controller.ts'));
    expect(code).toMatch(/version:\s*AGENT_STREAM_VERSION/);
    // With the request's scope: a refused picture step is worded as such (review W4-25 vision F5).
    expect(code).toMatch(/onError:\s*\(error: unknown\) => conductorOnError\(error, errorScope\)/);
    expect(code).toMatch(/agentId:\s*CONDUCTOR_AGENT_ID/);
    // One admission per model-running request, role `agent`.
    expect(code.match(/beginAiOperation\(/g)).toHaveLength(1);
    expect(code).toMatch(/'agent',\s*'agent'/);
  });
});

describe('the inherited agent is gone', () => {
  test('the eleven tools, LoadToolsService and its helpers are deleted', () => {
    for (const relative of [
      `${CHAT}/tools`,
      `${CHAT}/load.tools.service.ts`,
      `${CHAT}/agent.tool.interface.ts`,
      `${CHAT}/auth.context.ts`,
    ]) {
      expect({ relative, exists: exists(relative) }).toEqual({ relative, exists: false });
    }
  });

  test('no source names AgentState, proverbs, LoadToolsService or the old copilot agent doors', () => {
    const offenders = [];
    for (const relative of [
      ...sourceFiles('libraries/nestjs-libraries/src'),
      ...sourceFiles('apps/backend/src'),
    ]) {
      const code = withoutComments(read(relative));
      if (/\bAgentState\b|\bproverbs\b|LoadToolsService|getLocalAgents|@ag-ui\/mastra/.test(code)) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('@ag-ui/mastra is no longer a dependency', () => {
    const manifest = JSON.parse(read('package.json'));
    expect(manifest.dependencies['@ag-ui/mastra']).toBeUndefined();
    expect(manifest.devDependencies?.['@ag-ui/mastra']).toBeUndefined();
    expect(read('pnpm-lock.yaml')).not.toMatch(/^ {2}'@ag-ui\/mastra@/m);
  });

  test('no background model call: generateTitle and observational memory stay off in chat/', () => {
    for (const relative of sourceFiles(CHAT)) {
      const code = withoutComments(read(relative));
      expect({ relative, title: /generateTitle:\s*true/.test(code) }).toEqual({ relative, title: false });
      expect({ relative, om: /observationalMemory:\s*true/.test(code) }).toEqual({ relative, om: false });
    }
  });
});

describe('the AI role `agent` (ADR-0012 §6)', () => {
  const roles = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.roles.ts');

  test('is a role of its own, and the `agent` operation runs under it', () => {
    expect(roles.AI_ROLES).toContain('agent');
    expect(roles.roleForOperation('agent')).toBe('agent');
    expect(roles.isAiRole('agent')).toBe(true);
  });

  test('falls back to the workspace text model, as the other text roles do', () => {
    const source = { textModel: 'openai/gpt-6-luna', imageModel: 'image-model' };
    expect(roles.modelFor('agent', source)).toBe('openai/gpt-6-luna');
    expect(roles.modelFor('agent', { ...source, roleModels: { agent: 'openai/gpt-6-sol' } })).toBe(
      'openai/gpt-6-sol'
    );
    expect(roles.parseRoleModels({ agent: ' openai/gpt-6-luna ' })).toEqual({
      agent: 'openai/gpt-6-luna',
    });
  });
});

describe('the card contract the screen mirrors', () => {
  const CONTRACT = `${CHAT}/capabilities/agent-parts.contract.ts`;

  test('is one importless file', () => {
    const code = withoutComments(read(CONTRACT));
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/require\(/);
  });

  test('owns the card kinds; the registry re-exports them', () => {
    const types = withoutComments(read(`${CHAT}/capabilities/capability.types.ts`));
    expect(types).toMatch(/import \{ CARD_KINDS, type CardKind \} from '\.\/agent-parts\.contract'/);
    expect(types).not.toMatch(/export const CARD_KINDS/);
  });

  test('names every refusal code the registry and its hooks answer with', () => {
    const { CAPABILITY_REFUSAL_CODES } = loadTypeScriptModule(CONTRACT);
    const used = new Set();
    for (const relative of sourceFiles(`${CHAT}/capabilities`)) {
      const code = withoutComments(read(relative));
      for (const [, name] of code.matchAll(/refusal\(\s*'([A-Z_]+)'/g)) used.add(name);
      for (const [, name] of code.matchAll(/code:\s*'([A-Z_]+)'/g)) used.add(name);
    }
    // `CAPABILITY_FAILED` is the error transform's, not a refusal.
    used.delete('CAPABILITY_FAILED');
    expect([...used].filter((name) => !CAPABILITY_REFUSAL_CODES.includes(name))).toEqual([]);
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  test('pins the stream and names the progress part', () => {
    const contract = loadTypeScriptModule(CONTRACT);
    expect(contract.AGENT_STREAM_VERSION).toBe('v7');
    expect(contract.PROGRESS_PART_TYPE).toBe('data-progress');
    expect(contract.CARD_KINDS.map(contract.cardPartType)).toEqual([
      'data-workspace',
      'data-channels',
      'data-piece',
      'data-avatar',
      'data-adaptation',
      'data-plan',
      // A channel beside the chat, and connecting one in the conversation (kcxz.19).
      'data-channel',
      'data-channel-connect',
      // The key card, drawn in the conversation (kcxz.20).
      'data-secret',
      // «Откуда идеи» beside the chat (kcxz.23).
      'data-ideas',
      // «Откуда факты» beside the chat (kcxz.24).
      'data-facts',
      // «Медиатека» beside the chat (kcxz.25).
      'data-media',
    ]);
  });
});

describe('kcxz.32 N2 (c): a thanks is not a request', () => {
  const { CONDUCTOR_SKILL_SPECS } = require('./helpers/load-ts-module.cjs').loadTypeScriptModule(
    'libraries/nestjs-libraries/src/chat/conductor/conductor.skills.ts',
    { '@mastra/core/skills': { createSkill: (spec) => spec } }
  );
  const content = CONDUCTOR_SKILL_SPECS.find((spec) => spec.name === 'content').instructions;

  test('the content skill says a thanks or «посмотрю» never re-runs a paid step', () => {
    expect(content).toMatch(/Thanks, «ок», «посмотрю»[^\n]*are not a request/);
    expect(content).toMatch(/only when the person asks for it again/);
  });

  test('it names the refusal that holds it and the honest stale outcome', () => {
    expect(content).toMatch(/PROPOSAL_CARD_OPEN/);
    expect(content).toMatch(/`outcome: stale`[^\n]*nothing was applied and nothing more spent/);
  });
});
