/**
 * Move the calendar forward for a whole suite run, without freezing time.
 *
 * Why this exists. On 31.08.2026 five backup tests died at 12:00 UTC on code
 * nobody had touched: the fixture pinned an artifact's name at 20260817T120000Z
 * while retention counted fourteen days back from the real clock, so the run
 * eventually swept the artifact it had just published. Nothing was wrong with
 * the code that morning and everything was wrong with it that afternoon. A
 * suite that only ever runs on today's date cannot see that coming.
 *
 * So the check is: run everything again with the calendar moved forward, and
 * anything that quietly depends on today falls over while there is still time
 * to fix it.
 *
 * What moves and what does not. Only the answer to "what is the date" moves —
 * `new Date()` with no arguments, and `Date.now()`. Timers stay real, so
 * nothing that waits actually waits longer. An explicit moment, `new Date(x)`
 * or `Date.parse(s)`, is left exactly as written: a pinned instant is the one
 * thing a calendar shift must not rewrite, or every fixture would drift by the
 * offset and the check would report failures it invented itself.
 *
 * The filesystem does not move either, and it cannot: `fs` timestamps and
 * `find -mtime` read the operating system. A test that ages a file must
 * therefore measure against the filesystem rather than this clock. That is a
 * property worth keeping, not a wrinkle to paper over — the code under test
 * reads the same two clocks, and a test that mixes them is describing a
 * machine that does not exist.
 */
const days = Number(process.env.CF_TIME_TRAVEL_DAYS || 0);

if (Number.isFinite(days) && days !== 0) {
  const shift = days * 24 * 60 * 60 * 1000;
  const RealDate = Date;

  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(RealDate.now() + shift);
      } else {
        super(...args);
      }
    }

    static now() {
      return RealDate.now() + shift;
    }
  }

  // Parsing and UTC arithmetic answer questions about a given moment, not
  // about the present one, so they are handed over untouched.
  ShiftedDate.parse = RealDate.parse;
  ShiftedDate.UTC = RealDate.UTC;

  global.Date = ShiftedDate;
}
