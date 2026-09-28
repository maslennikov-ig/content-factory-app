/**
 * Where a person who comes back to an avatar's analysis stands (`2q28.34`).
 *
 * Written for the wizard, which used to offer only «Дальше — разбор» to a
 * person who came back, and that button paid for the whole analysis again —
 * nine model calls and five minutes — over a proposal already stored. Moved
 * here unchanged (`content-factory-next-kcxz.18`) so the agent chat decides
 * the same way from the same `GET …/analysis` reading: one rule, read by the
 * screen and by the chat, instead of a second copy that drifts.
 */

/**
 * How long a stored run without a proposal may still be finishing.
 *
 * The server does not stop a run when the page is left: the arithmetic is
 * saved in seconds, and the proposal is written onto the same row when the
 * last model call returns. Eight texts took 270–330 s on the walk of
 * 25.09.2026; twenty-eight, the most the analysis reads, run in about three
 * times as many rounds. Twenty minutes covers that with room. Past it, a
 * measurement without a proposal is a run the model did not finish.
 */
export const ANALYSIS_BACKGROUND_WINDOW_MS = 20 * 60_000;

/**
 * - `proposal`: the stored run answers for these texts and carries a proposal.
 *   Nothing needs paying for again.
 * - `waiting`: the arithmetic is stored for these texts and the proposal is
 *   not, but the run started recently enough to still be going on the server.
 * - `analysis`: the numbers are stored and the model did not finish; the
 *   screen shows them and offers the rerun as its own button.
 * - `samples`: nothing stored answers for these texts — none yet, or the
 *   texts changed since. Only here does «Дальше — разбор» start a paid run.
 *
 * An older server that sends no `corpusChanged` reads as `samples`: without it
 * nobody can say the stored run is about these texts.
 */
export type ResumeStep = 'samples' | 'analysis' | 'waiting' | 'proposal';

/** The part of `VoiceAnalysisResponseV1` (as either side reads it) this needs. */
export type AnalysisStanding = {
  outcome: string;
  corpusChanged?: boolean;
  hasProposal?: boolean;
  measuredAt?: string;
};

export function resumeStepFor(
  reading: AnalysisStanding | null | undefined,
  now: number
): ResumeStep {
  if (!reading || reading.outcome !== 'ready') return 'samples';
  if (reading.corpusChanged !== false) return 'samples';
  if (reading.hasProposal) return 'proposal';
  const measuredAt = reading.measuredAt ? Date.parse(reading.measuredAt) : NaN;
  if (
    Number.isFinite(measuredAt) &&
    now - measuredAt < ANALYSIS_BACKGROUND_WINDOW_MS
  ) {
    return 'waiting';
  }
  return 'analysis';
}
