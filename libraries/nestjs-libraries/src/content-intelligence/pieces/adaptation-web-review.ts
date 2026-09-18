/**
 * Источники проверки фактов: только настоящие выдержки настоящих страниц.
 *
 * Вся полоса — исследование, разбор утверждений и вызов проверяющей модели —
 * живёт в `piece.service.reviewV2`. Здесь остался её чистый шов: что из ответа
 * поисковика вправе стать доказательством и сколько его доезжает до читающего.
 *
 * Своего хода у этого файла больше нет. `reviewAdaptationWithSearch` и
 * `adaptation-review.ts` удалены вместе с дверью `reviewAdaptation`, на которую
 * не вёл ни один маршрут (`content-factory-next-97dq.14`, P3): вторая полоса
 * проверки покупала разбор утверждений, не имела ветки «проверять нечего» и
 * расходилась с первой ровно там, где это стоило бы денег.
 */
import {
  usableHttpsUrl,
  type WebResearchResult,
} from '../../openai/web.research.service';
import type { AdaptationReviewSource } from './adaptation-review.contract';

/**
 * Сколько источников доезжает до проверяющей модели. За это число держится
 * `REVIEW_CLAIM_QUERIES_MAX`: покупать запрос, чей источник заведомо сюда не
 * поместится, — это деньги ни за что.
 */
export const WEB_REVIEW_MAX_SOURCES = 6;
export const WEB_REVIEW_SOURCE_CHARS = 1_600;

/** Only actual excerpts tied to returned HTTPS sources can become evidence. */
export function webReviewSources(
  research: WebResearchResult
): AdaptationReviewSource[] {
  const sources = new Map<string, AdaptationReviewSource>();
  for (const fact of research.facts ?? []) {
    const url = usableHttpsUrl(fact.sourceUrl);
    const source = (research.sources ?? []).find(
      (item) => usableHttpsUrl(item.url) === url
    );
    if (!url || !source || !fact.text?.trim() || sources.has(url)) continue;
    sources.set(url, {
      url,
      title: source.title?.trim().slice(0, 240) || url,
      excerpt: fact.text.trim().slice(0, WEB_REVIEW_SOURCE_CHARS),
    });
    if (sources.size === WEB_REVIEW_MAX_SOURCES) break;
  }
  return [...sources.values()];
}
