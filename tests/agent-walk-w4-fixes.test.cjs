'use strict';

/**
 * W4 live walk 29.09.2026 (`content-factory-next-kcxz.27`), fixes P3-G and
 * P3-H. The others have their own files: P2-B `agent-w3-review-fixes`, P3-D
 * `fact-fresh-until-door`, P3-E `agent-screen.w2-walk`, P3-F
 * `adaptation-picture`, P3-I `agent-media`.
 */
const { IDENTITY, loadRegistry, servicesFrom, loadCapabilityModule } = require('./helpers/agent-capabilities.cjs');

const registry = loadRegistry();
const find = (id) => registry.CAPABILITY_CATALOGUE.find((one) => one.id === id);

describe('P3-G: «Производство» with nothing published has no lead time', () => {
  const production = (publishedVolume, averageLeadTimeHours) => ({
    getProductionAnalytics: async () => ({
      period: { days: 30, from: '', to: '' },
      summary: { publishedVolume, failureCount: 0, failureRate: 0, averageLeadTimeHours },
      originMix: [],
      failureReasons: [],
    }),
  });
  const run = (posts) => find('analytics.production').run({ ...IDENTITY, service: servicesFrom({ PostsService: posts }) }, {});

  test('nothing went out: `null` and a note, never 0 hours', async () => {
    const output = await run(production(0, 0));
    expect(output.averageLeadTimeHours).toBeNull();
    expect(output.leadTimeNote).toMatch(/never say 0 hours/);
  });

  test('posts went out: the average as the service counts it, no note', async () => {
    const output = await run(production(3, 12.5));
    expect(output.averageLeadTimeHours).toBe(12.5);
    expect(output).not.toHaveProperty('leadTimeNote');
  });
});

describe('P3-H: the analysis’s state comes from the tool', () => {
  test('the skill and the description say to call it and report its answer', () => {
    const { CONDUCTOR_SKILL_SPECS } = loadCapabilityModule('../conductor/conductor.skills.ts');
    const avatar = CONDUCTOR_SKILL_SPECS.find((skill) => skill.name === 'avatars');
    const text = JSON.stringify(avatar);
    expect(text).toMatch(/never what this conversation said earlier/);
    expect(text).toContain('VOICE_ANALYSIS_RUNNING');
    expect(find('avatar.analyse').description).toMatch(/even if the conversation says one is running/);
  });
});
