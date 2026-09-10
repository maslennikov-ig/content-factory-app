/**
 * Pure egress guard for research requests.
 *
 * Query terms are compiled from an explicit public topic contract. This module
 * has no network, clock, repository or credentials and is therefore safe to
 * replay in tests and in an audit receipt.
 */
export const RESEARCH_EGRESS_POLICY_VERSION = 'ci_egress_policy_v1' as const;
export const MAX_RESEARCH_QUERY_LENGTH = 300;

export type ResearchEgressDenialCode =
  | 'global_kill_switch'
  | 'tenant_kill_switch'
  | 'provider_kill_switch'
  | 'provider_not_approved'
  | 'source_role_not_allowed'
  | 'budget_search_queries'
  | 'budget_accepted_sources'
  | 'budget_response_bytes'
  | 'budget_wall_clock'
  | 'budget_model_tokens'
  | 'budget_provider_cost'
  | 'budget_concurrency'
  | 'query_contains_tenant_data'
  | 'query_empty'
  | 'query_too_long';

export type ResearchEgressDecision =
  | { allowed: true; policyVersion: typeof RESEARCH_EGRESS_POLICY_VERSION }
  | { allowed: false; policyVersion: typeof RESEARCH_EGRESS_POLICY_VERSION; code: ResearchEgressDenialCode };

export interface ResearchEgressBudget {
  maxSearchQueries: number;
  maxAcceptedSources: number;
  maxResponseBytes: number;
  maxWallClockMs: number;
  maxModelTokens?: number;
  maxProviderCostMicros: number;
  maxConcurrency: number;
}

export interface ResearchEgressSpend {
  searchQueries: number;
  acceptedSources: number;
  responseBytes: number;
  wallClockMs: number;
  modelTokens?: number;
  providerCostMicros: number;
  inFlight: number;
}

export interface ResearchEgressRequest {
  organizationId: string;
  providerId: string;
  approvedProviderIds: readonly string[];
  globalKillSwitch?: boolean;
  tenantKillSwitches?: readonly string[];
  providerKillSwitches?: readonly string[];
  budget: ResearchEgressBudget;
  spend: ResearchEgressSpend;
  kind?: 'search' | 'fetch';
  /** Caller has already checked the source role against its frozen contract. */
  sourceRoleAllowed?: boolean;
}

const deny = (code: ResearchEgressDenialCode): ResearchEgressDecision => ({
  allowed: false,
  policyVersion: RESEARCH_EGRESS_POLICY_VERSION,
  code,
});

export function decideResearchEgress(input: ResearchEgressRequest): ResearchEgressDecision {
  if (input.globalKillSwitch) return deny('global_kill_switch');
  if (input.tenantKillSwitches?.includes(input.organizationId)) return deny('tenant_kill_switch');
  if (input.providerKillSwitches?.includes(input.providerId)) return deny('provider_kill_switch');
  if (!input.approvedProviderIds.includes(input.providerId)) return deny('provider_not_approved');
  if (input.sourceRoleAllowed === false) return deny('source_role_not_allowed');
  if (input.spend.inFlight >= input.budget.maxConcurrency) return deny('budget_concurrency');
  if (input.spend.wallClockMs >= input.budget.maxWallClockMs) return deny('budget_wall_clock');
  if (
    input.budget.maxModelTokens !== undefined &&
    (input.spend.modelTokens ?? 0) >= input.budget.maxModelTokens
  ) return deny('budget_model_tokens');
  if (input.spend.providerCostMicros >= input.budget.maxProviderCostMicros) return deny('budget_provider_cost');
  if (input.spend.responseBytes >= input.budget.maxResponseBytes) return deny('budget_response_bytes');
  if (input.kind === 'fetch' && input.spend.acceptedSources >= input.budget.maxAcceptedSources) return deny('budget_accepted_sources');
  if ((input.kind ?? 'search') === 'search' && input.spend.searchQueries >= input.budget.maxSearchQueries) return deny('budget_search_queries');
  return { allowed: true, policyVersion: RESEARCH_EGRESS_POLICY_VERSION };
}

export interface ResearchQueryContract {
  /** Public facts explicitly supplied by the caller or organization contract. */
  publicTerms: readonly string[];
  /** Fixed vocabulary owned by the operator, such as pricing or reviews. */
  templateTerms: readonly string[];
  /** Terms proposed by a planner; each must be in one of the two lists above. */
  proposedTerms: readonly string[];
}

export type CompiledResearchQuery =
  | { compiled: true; query: string; policyVersion: typeof RESEARCH_EGRESS_POLICY_VERSION }
  | { compiled: false; policyVersion: typeof RESEARCH_EGRESS_POLICY_VERSION; code: 'query_contains_tenant_data' | 'query_empty' | 'query_too_long'; rejectedTerm?: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase('en-US');
const tokensOf = (value: string): string[] =>
  value.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [];

export function compileResearchQuery(input: ResearchQueryContract): CompiledResearchQuery {
  // The planner may return a phrase as one item. Validate its words rather
  // than requiring callers to split it first; punctuation and whitespace are
  // never sent as query terms and cannot smuggle tenant text through the port.
  const allowed = new Set(
    [...input.publicTerms, ...input.templateTerms]
      .flatMap(tokensOf)
      .map(normalize)
      .filter(Boolean)
  );
  const terms: string[] = [];
  for (const raw of input.proposedTerms) {
    const term = raw.trim();
    if (!term) continue;
    const tokens = tokensOf(term);
    if (!tokens.length || tokens.some((token) => !allowed.has(normalize(token)))) {
      return { compiled: false, policyVersion: RESEARCH_EGRESS_POLICY_VERSION, code: 'query_contains_tenant_data', rejectedTerm: raw };
    }
    terms.push(term);
  }
  if (!terms.length) return { compiled: false, policyVersion: RESEARCH_EGRESS_POLICY_VERSION, code: 'query_empty' };
  const query = terms.join(' ');
  if (query.length > MAX_RESEARCH_QUERY_LENGTH) return { compiled: false, policyVersion: RESEARCH_EGRESS_POLICY_VERSION, code: 'query_too_long' };
  return { compiled: true, query, policyVersion: RESEARCH_EGRESS_POLICY_VERSION };
}
