import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { VoiceSampleRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-sample.repository';

/**
 * The retention date, kept by a clock rather than by a page view.
 *
 * A reference corpus is somebody else's writing, held on the strength of a
 * date the workspace named when it brought the texts in. If the erasure only
 * ran when a person opened the voice screen, a workspace that stopped using
 * the section would keep those words indefinitely — which is the opposite of
 * what the date promised, and the promise is the whole legal frame ADR-0011
 * rests on.
 *
 * Daily is the right cadence: a retention date has a day's resolution, and a
 * sweep more often would be a query with nothing to do.
 */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class VoiceRetentionScheduler {
  private readonly logger = new Logger(VoiceRetentionScheduler.name);

  /**
   * The repository class, not a narrower structural type of it.
   *
   * Nest resolves a constructor argument by the metadata the decorator emits,
   * and a `Pick<>` leaves nothing there to resolve — the container refuses to
   * start rather than injecting anything. A test still hands this one method,
   * which is what structural typing is for.
   */
  constructor(private readonly samples: VoiceSampleRepository) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<number> {
    const erased = await this.samples.purgeExpiredReferences();
    if (erased) {
      // The count, never the texts: this line goes to a log that outlives the
      // retention date it is reporting on.
      this.logger.log(`Erased ${erased} expired reference sample(s)`);
    }
    return erased;
  }
}
