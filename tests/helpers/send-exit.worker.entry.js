'use strict';

/**
 * A worker for `tests/brand-voice.parse-isolation.test.cjs` only
 * (`content-factory-next-97dq.69`): it sends its outcome and ends at once,
 * the way the real parse workers end after `process.send` calls back. The
 * parent must read the outcome, not report PARSE_CRASHED because the child
 * ended before the IPC pipe was read.
 */
process.send({ ok: true, value: { text: 'sent before exit' } }, () => process.exit(0));
