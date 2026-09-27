import { withoutActiveAiConfig } from '@contentfactory/nestjs-libraries/openai/ai.provider.config';

/**
 * The only way a `paid` capability runs (`content-factory-next-kcxz.6`,
 * premortem U1, spec §4.8, ADR-0012 §5).
 *
 * An agent turn runs inside its own `agent` admission. `AiUsageService`
 * short-circuits any operation opened inside an active admission of the same
 * workspace, so a paid capability called from the turn would be silently
 * absorbed: one `agent` row, no row of its own, the wrong role in the ledger.
 * The door never has that problem because it is not inside a turn.
 *
 * Here the capability — the service call and every pull of its generator,
 * since they all continue from this callback — runs with the turn's admitted
 * configuration removed, so the service admits its own operation exactly as
 * its door does. The acting user and every other context stay in place.
 *
 * The Mastra adapter picks this runner by risk class; the guard in `tests/`
 * checks that a paid capability run from inside a turn writes its own row.
 */
export const runPaidCapability = <T>(invoke: () => Promise<T>): Promise<T> =>
  withoutActiveAiConfig(invoke);
