/**
 * The capability registry of the agent harness (`content-factory-next-kcxz.6`,
 * `docs/product/agent-harness-spec.md` §4.2): declarations, the Mastra and MCP
 * adapters, the per-call hooks and the guards. The conductor agent (`kcxz.7`)
 * and the MCP rebuild (`kcxz.26`) import from here.
 */
export * from './agent-parts.contract';
export * from './capability.types';
export * from './capability.context';
export * from './capability.input-guards';
export * from './capability.admission';
export * from './capability.registry';
export * from './approval-fingerprint';
export * from './approval-summary';
export * from './door-policy';
export * from './mastra.adapter';
export * from './mcp.adapter';
export * from './mcp-confirmation';
export * from './paid-adapter';
export * from './untrusted-data';
export * from './person-time';
export * from './question-card';
export * from './catalogue/overview.capabilities';
export * from './catalogue/piece.capabilities';
export * from './catalogue/core.capabilities';
export * from './catalogue/adaptation.capabilities';
export * from './catalogue/plan.capabilities';
export * from './catalogue/selection';
export * from './catalogue/avatar.capabilities';
export * from './catalogue/ai-settings.capabilities';
export * from './catalogue/idea.capabilities';
export * from './catalogue/fact.capabilities';
export * from './catalogue/text.capabilities';
export * from './catalogue/analytics.capabilities';
export * from './catalogue/media.capabilities';
