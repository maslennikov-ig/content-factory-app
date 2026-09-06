/**
 * Что в тексте не проза и правилами не проверяется.
 *
 * `content-factory-next-tu3k.3`. Статья о том, как узнать машинный текст,
 * цитирует все признаки разом, и наивная проверка забракует её за слова, о
 * которых она написана. Поэтому перед правилами гасятся код, кавычки, ссылки,
 * теги и цитатные строки: признак считается только там, где текст им
 * пользуется, а не говорит о нём. Мысль и порядок гашения — из
 * `brand-voice/ai-artefacts.ts`, он здесь и переиспользован.
 *
 * Гасится пробелами, а не вырезается. Каждая находка возвращается со
 * смещением в исходной строке, и любое сокращение длины сдвинуло бы подсветку
 * в редакторе на всё, что было вырезано выше.
 */
import { maskQuotedAndCode } from '../brand-voice/ai-artefacts';

const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]*`/g;
const URL = /https?:\/\/\S+|www\.[^\s<]+/gi;
const HTML_TAG = /<[^>]*>/g;

/** Заменяет всё, кроме переводов строк, пробелами той же длины. */
export const blankKeepingLines = (value: string): string =>
  value.replace(/[^\n]/g, ' ');

/**
 * Только код.
 *
 * Правила класса A — метки чат-ботов — гоняются по этому тексту: `utm_source`
 * и `turn0search1` живут внутри ссылок, и погасив ссылки, мы погасили бы
 * ровно то, что ищем. А вот артефакт в бэктиках — это цитирование, и он не
 * находка (правило автора в `lint.py`).
 */
export const maskCode = (text: string): string =>
  text.replace(FENCED_CODE, blankKeepingLines).replace(INLINE_CODE, blankKeepingLines);

/**
 * Проза и ничего кроме прозы: без кода, «кавычек», "кавычек", цитатных строк,
 * ссылок и HTML-тегов.
 */
export const maskSkipZones = (text: string): string =>
  maskQuotedAndCode(text)
    .replace(URL, blankKeepingLines)
    .replace(HTML_TAG, blankKeepingLines);
