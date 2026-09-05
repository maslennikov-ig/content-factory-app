'use client';

import { useCallback, useMemo, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { AllowanceHint } from '@contentfactory/frontend/components/ui/allowance-hint';
import {
  SEARCH_API,
  SEARCH_EVIDENCE_API,
  buildAcceptPayload,
  failureNotice,
  jsonReader,
  readAcceptedEvidence,
  readFailure,
  readSearchAnswer,
  type AcceptedEvidence,
  type SearchAnswer,
  type SearchFailure,
  type SearchResultRow,
} from './content-search.adapter';
import { resolveContentLocale } from './content-section.copy';

/**
 * `content-factory-next-lh5s`: the place a person sees what the search found
 * and says «this one».
 *
 * It sits in the brief, beside the fact form, because that is where the map
 * puts it (`docs/product/content-section-map.md`, §3 «Следствие, которое
 * нельзя потерять»): the question «чем подтвердишь» is asked while writing, so
 * the answer has to be reachable while writing. «Откуда факты» stays a place
 * to look at afterwards, with no forms on it.
 *
 * Accepting does not create a fact. It freezes the excerpt and hands the
 * person's own words the evidence to stand on — the claim is still theirs to
 * write, in the form below, and until they write it nothing has been claimed.
 * That order is the owner's rule of 02.09.2026 read forwards: what the product
 * found is the one thing that needs a look, so it never turns itself into a
 * confirmed claim on its own.
 */

const copy = {
  ru: {
    title: 'Найти подтверждение',
    body: 'Поиск в вебе по теме. Из найденного выбираете то, на что готовы опереться: фрагмент замораживается вместе со ссылкой и датой чтения. Статья потом может измениться или исчезнуть — копия останется.',
    subject: 'О чём ищем',
    subjectHelp: 'Тема или утверждение, которое надо подтвердить.',
    run: 'Найти',
    running: 'Ищем…',
    accept: 'Взять как доказательство',
    accepting: 'Берём…',
    accepted: 'Взято. Ниже напишите утверждение своими словами — доказательство привяжется к нему.',
    empty: 'Ничего не нашлось. Попробуйте переформулировать тему.',
    summaryTitle: 'Коротко о найденном',
    resultsTitle: 'Что нашлось',
    published: 'Опубликовано',
    provider: 'Нашёл',
    notConfigured:
      'Поиск не подключён. Включите его и добавьте ключ Tavily в настройках модели.',
    searchFallback: 'Поиск не отработал. Ничего не потеряно — попробуйте ещё раз.',
    acceptFallback: 'Не удалось взять этот результат. Попробуйте ещё раз.',
    unverifiedNote:
      'Взятое поиском не считается подтверждённым само по себе: подтвердить его нужно на витрине «Откуда факты».',
  },
  en: {
    title: 'Find a confirmation',
    body: 'A web search on the subject. From what it finds you pick what you are willing to stand on: the excerpt is frozen together with its link and the date it was read. The page may later change or disappear — the copy stays.',
    subject: 'What to look for',
    subjectHelp: 'The subject, or the claim that needs backing.',
    run: 'Search',
    running: 'Searching…',
    accept: 'Take as evidence',
    accepting: 'Taking…',
    accepted: 'Taken. Write the claim in your own words below — the evidence attaches to it.',
    empty: 'Nothing came back. Try wording the subject differently.',
    summaryTitle: 'What it says, briefly',
    resultsTitle: 'What was found',
    published: 'Published',
    provider: 'Found by',
    notConfigured:
      'Search is not connected. Enable it and add a Tavily key in the model settings.',
    searchFallback: 'The search did not run. Nothing is lost — try again.',
    acceptFallback: 'That result could not be taken. Try again.',
    unverifiedNote:
      'Something taken from search does not count as confirmed on its own: confirm it on the "Where facts come from" screen.',
  },
} as const;

export function ContentSearchContainer({
  onEvidenceAccepted,
  defaultSubject = '',
}: {
  /**
   * Fired once the excerpt is frozen and has an id. The panel above carries
   * it into the fact form, so the same words are not typed twice.
   */
  onEvidenceAccepted?: (evidence: AcceptedEvidence) => void;
  defaultSubject?: string;
} = {}) {
  const request = useFetch();
  const { language } = useVariables();
  const locale = resolveContentLocale(language);
  const t = copy[locale];
  const read = useMemo(() => jsonReader(request), [request]);

  const [subject, setSubject] = useState(defaultSubject);
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [failure, setFailure] = useState<SearchFailure | null>(null);
  const [searching, setSearching] = useState(false);
  const [acceptingUrl, setAcceptingUrl] = useState<string | null>(null);
  const [takenUrls, setTakenUrls] = useState<readonly string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const search = useCallback(async () => {
    setSearching(true);
    setFailure(null);
    setNote(null);
    setAnswer(null);
    setTakenUrls([]);
    try {
      const body = await read(SEARCH_API, {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim() }),
      });
      setAnswer(readSearchAnswer(body));
    } catch (error) {
      /*
        One refusal is worth translating rather than repeating: the server
        answers «search is not configured» in English with a route through the
        settings, and this is the one a person will actually hit before they
        have a Tavily key. `readFailure` deliberately keeps only codes it
        knows, so the code is read off the error itself.
      */
      const code = (error as { code?: unknown } | null)?.code;
      setFailure(
        code === 'CONTENT_SEARCH_NOT_CONFIGURED'
          ? { code: null, message: t.notConfigured, screenState: 'error' }
          : readFailure(error, t.searchFallback)
      );
    } finally {
      setSearching(false);
    }
  }, [read, subject, t]);

  const accept = useCallback(
    async (row: SearchResultRow) => {
      setAcceptingUrl(row.url);
      setFailure(null);
      setNote(null);
      try {
        const body = await read(SEARCH_EVIDENCE_API, {
          method: 'POST',
          body: JSON.stringify(buildAcceptPayload(row)),
        });
        const evidence = readAcceptedEvidence(body, row);
        if (!evidence) {
          setFailure(readFailure(null, t.acceptFallback));
          return;
        }
        setTakenUrls((current) => [...current, row.url]);
        setNote(t.accepted);
        onEvidenceAccepted?.(evidence);
      } catch (error) {
        setFailure(readFailure(error, t.acceptFallback));
      } finally {
        setAcceptingUrl(null);
      }
    },
    [onEvidenceAccepted, read, t]
  );

  return (
    <section
      data-content-intelligence-section="search"
      aria-labelledby="content-search-title"
      className="scroll-mt-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
    >
      <h2
        id="content-search-title"
        tabIndex={-1}
        className="cf-heading-md text-cf-ink [text-wrap:balance]"
      >
        {t.title}
      </h2>
      <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t.body}
      </p>

      {failure && (
        <p
          role="alert"
          className="mt-[16px] rounded-[8px] border border-cf-danger bg-cf-danger-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {failureNotice(failure)}
        </p>
      )}
      {!failure && note && (
        <p
          role="status"
          className="mt-[16px] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {note}
        </p>
      )}

      <form
        data-content-search-form="true"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
        className="mt-[16px] flex flex-col gap-[12px]"
      >
        <div className="flex flex-col gap-[4px]">
          <Textarea
            disableForm
            label={t.subject}
            name="searchSubject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            disabled={searching}
          />
          <p className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
            {t.subjectHelp}
          </p>
        </div>
        {/*
          The search spends the workspace's AI allowance — a model call to read
          the subject and a search call — so what is left is said beside the
          button rather than after the wait (`content-factory-next-fn33.28.3`).
        */}
        <div className="flex flex-wrap items-center gap-[8px]">
          <Button
            type="submit"
            variant="secondary"
            disabled={searching || subject.trim().length < 2}
          >
            {searching ? t.running : t.run}
          </Button>
          <AllowanceHint />
        </div>
      </form>

      {answer && (
        <div className="mt-[20px] border-t border-cf-border pt-[16px]">
          {answer.summary && (
            <div className="mb-[16px]">
              <h3 className="cf-label-sm uppercase text-cf-ink-muted">
                {t.summaryTitle}
              </h3>
              <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                {answer.summary}
              </p>
            </div>
          )}

          {answer.results.length === 0 ? (
            <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {t.empty}
            </p>
          ) : (
            <>
              <h3 className="cf-label-sm uppercase text-cf-ink-muted">
                {t.resultsTitle}
              </h3>
              <ul className="mt-[8px] divide-y divide-cf-border">
                {answer.results.map((row) => {
                  const taken = takenUrls.includes(row.url);
                  return (
                    <li
                      key={`${row.url}-${row.excerpt.slice(0, 32)}`}
                      data-content-search-result={row.url}
                      className="py-[12px]"
                    >
                      <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
                        {row.excerpt}
                      </p>
                      <div className="mt-[4px] flex flex-wrap items-center gap-x-[12px] gap-y-[4px]">
                        {/*
                          The link opens away from a half-written brief, so it
                          leaves in its own tab; `noopener` because the opened
                          page is a stranger's.
                        */}
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all cf-caption text-cf-accent underline"
                        >
                          {row.title || row.url}
                        </a>
                        {row.publishedAt && (
                          <span className="cf-caption text-cf-ink-muted">
                            {t.published}: {row.publishedAt.slice(0, 10)}
                          </span>
                        )}
                        <span className="cf-caption text-cf-ink-muted">
                          {t.provider}: {row.provider}
                        </span>
                      </div>
                      <div className="mt-[8px]">
                        <Button
                          type="button"
                          variant="secondary"
                          density="dense"
                          data-content-search-accept={row.url}
                          disabled={taken || acceptingUrl !== null}
                          onClick={() => void accept(row)}
                        >
                          {acceptingUrl === row.url
                            ? t.accepting
                            : t.accept}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-[12px] max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.unverifiedNote}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default ContentSearchContainer;
