import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fallbackLng,
  languages,
} from '@contentfactory/react/translation/i18n.config';
import {
  LegalDocumentId,
  ServedLegalDocument,
  parseLegalDocument,
} from './legal-content';

/**
 * Reads one legal document off disk for the language of the current request.
 *
 * Server side only: the pages that call it are server components and the
 * markdown never reaches the browser as markdown. Sixteen languages ship and
 * the documents arrive in waves, so a missing file is the ordinary case rather
 * than an error — the caller gets the next language down the chain, and is told
 * which one it got so the page can say so.
 */

/**
 * English first because it is the product's fallback language everywhere else,
 * then Russian because the documents are authored in it and it is the one
 * language guaranteed to exist.
 */
export const LEGAL_FALLBACK_LANGUAGES = [fallbackLng, 'ru'];

const CONTENT_RELATIVE = join('src', 'content', 'legal');

/**
 * `__dirname` points into the compiled output rather than at the sources once
 * Next has built the route, so the documented way to reach a repository file is
 * `process.cwd()`. That is the frontend package when the application is started
 * by its own `start` script and the repository root when it is started from
 * there, so both are tried and the first that exists wins.
 */
export const legalContentDirectory = () => {
  const candidates = [
    join(process.cwd(), CONTENT_RELATIVE),
    join(process.cwd(), 'apps', 'frontend', CONTENT_RELATIVE),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};

/** The languages to try, in order, for a visitor who asked for `requested`. */
export const legalLanguageOrder = (requested: string) => [
  ...new Set(
    [requested, ...LEGAL_FALLBACK_LANGUAGES].filter((language) =>
      languages.includes(language)
    )
  ),
];

export const loadLegalDocument = (
  id: LegalDocumentId,
  requested: string,
  directory: string = legalContentDirectory()
): ServedLegalDocument | null => {
  for (const served of legalLanguageOrder(requested)) {
    const file = join(directory, `${id}.${served}.md`);
    if (!existsSync(file)) continue;
    return {
      ...parseLegalDocument(readFileSync(file, 'utf8')),
      requested,
      served,
    };
  }
  return null;
};
