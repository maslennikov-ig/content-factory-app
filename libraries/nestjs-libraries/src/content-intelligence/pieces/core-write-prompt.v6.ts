/**
 * Ninth-wave core prompt, successor of `core-write/v5` by one line of the brief
 * block (`content-factory-next-97dq.14`, P3).
 *
 * Nothing in the prompt TEXT changed: the system rules, the block titles, the
 * enrichment lead and the repair line are v5's own values, re-exported here
 * unchanged. What changed is which row the brief block prints under which
 * title, and that is part of what the model reads — so it gets its own version
 * rather than a quiet edit of a label a released receipt already names.
 *
 * Что именно: строка-поправка, которую источник подтвердил не целиком, стоит
 * `selected: true`, `verified: false`, `status: 'unverified'` и до этой версии
 * проходила `isOwnOrConfirmed` — то есть печаталась под «факты
 * подтверждённые», и тут же второй раз под «взято из ресерча (не
 * подтверждено)». Квитанция всё это время называла её в `ungrounded`
 * («не подтвердилось и в текст не вошло» — `ungroundedOf` через
 * `selectedFactsBrief`), а промпт говорил модели обратное. С v6 в блоке
 * подтверждённого стоит только сверенное поиском или памятью и слово самого
 * человека; выбранное, но не подтверждённое, стоит один раз и честно.
 *
 * `core-write-prompt.v5.ts` остаётся импортируемым и нетронутым: выпуск
 * `2542f433e993` печатал `core-write/v5`, и квитанция той сути обязана
 * называть ровно тот контракт, по которому она написана.
 */

import {
  CORE_WRITE_BLOCK_TITLES_V5,
  CORE_WRITE_ENRICH_LEAD_V5,
  CORE_WRITE_REPAIR_V5,
  coreWriteSystemV5,
} from './core-write-prompt.v5';

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v6' as const;

/** Правила системы у v6 — v5 слово в слово. */
export const coreWriteSystemV6 = coreWriteSystemV5;

export const CORE_WRITE_BLOCK_TITLES_V6 = CORE_WRITE_BLOCK_TITLES_V5;
export const CORE_WRITE_ENRICH_LEAD_V6 = CORE_WRITE_ENRICH_LEAD_V5;
export const CORE_WRITE_REPAIR_V6 = CORE_WRITE_REPAIR_V5;
