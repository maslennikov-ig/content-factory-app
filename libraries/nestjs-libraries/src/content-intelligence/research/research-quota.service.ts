/** Stable research-domain import path; the runtime implementation lives next to the service. */
export {
  RESEARCH_MONTHLY_QUOTAS,
  ResearchQuotaExceeded,
  ResearchQuotaService,
  ResearchQueryCache,
} from '../../openai/web.research.service';
export type { ResearchCacheJournalEntry, ResearchLevel } from '../../openai/web.research.service';
