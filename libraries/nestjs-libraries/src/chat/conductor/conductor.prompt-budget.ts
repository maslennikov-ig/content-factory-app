import {
  TokenLimiterProcessor,
  type ProcessLLMRequestArgs,
} from '@mastra/core/processors';

/** Keep native pair-aware trimming, using the selected model's available context. */
export class ConductorPromptBudget extends TokenLimiterProcessor {
  constructor(
    private readonly fallbackLimit: number,
    private readonly resolveLimit: (args: ProcessLLMRequestArgs) => Promise<number | undefined>
  ) {
    super({ limit: fallbackLimit, strategy: 'truncate', trimMode: 'best-fit' });
  }

  override async processLLMRequest(args: ProcessLLMRequestArgs) {
    // Optional catalog/config metadata may be unavailable in a restored step.
    // Model admission still runs in the model factory; this read-only sizing
    // hint must not turn an admitted request into a provider failure.
    const resolved = await this.resolveLimit(args).catch(() => undefined);
    const limit = typeof resolved === 'number' && Number.isSafeInteger(resolved) && resolved > 0
      ? resolved : this.fallbackLimit;
    // An instance per request avoids sharing a mutable budget between users or
    // fallback models. Mastra retains tool pairs and leaves stored history intact.
    return new TokenLimiterProcessor({ limit, strategy: 'truncate', trimMode: 'best-fit' })
      .processLLMRequest(args);
  }
}
