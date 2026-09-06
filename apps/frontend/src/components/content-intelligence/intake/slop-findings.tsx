'use client';

import { useCallback, useMemo, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { ErrorState, Status, type StatusTone } from '../../ui/surface';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  INTAKE_API,
  readSlopReport,
  type SlopReportV1,
  type SlopVerdictV1,
} from './intake.adapter';

/**
 * Проверка на ИИ-штампы: только по нажатию и только показать.
 *
 * Решение владельца 06.09.2026 (пункт 6). Два запрета здесь важнее любой
 * находки. Проверка не запускается сама — ни при появлении черновика, ни при
 * его пересборке: человек решает, хочет ли он этот взгляд, и до нажатия
 * никакого запроса нет. И проверка ничего не правит: она не шлёт `PUT` на
 * пост, не подставляет замену и не «улучшает» текст. Подпись под вердиктом
 * говорит это вслух, потому что кнопка рядом с текстом обычно означает
 * обратное.
 *
 * Вердикт несёт цвет и слово сразу: «Чисто», «Стоит взглянуть», «Лучше
 * переписать». Цвет один ничего не сообщает человеку, который его не
 * различает, — правило системы, а не вкус.
 */

const VERDICT_TONE: Record<SlopVerdictV1, StatusTone> = {
  clean: 'accent',
  review: 'warning',
  rewrite: 'danger',
};

export function SlopFindings({
  locale,
  text,
  platform,
  report: given,
}: {
  locale: IntakeLocale;
  text: string;
  /** Площадка канала: пороги вопросов, эмодзи и списков у неё свои. */
  platform?: string;
  /** Отчёт, пришедший вместе с черновиком, когда его просили в запросе. */
  report?: SlopReportV1 | null;
}) {
  const t = intakeCopy[locale];
  const request = useFetch();
  const [report, setReport] = useState<SlopReportV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const shown = report ?? given ?? null;

  const check = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const response = await request(INTAKE_API.slopCheck, {
        method: 'POST',
        body: JSON.stringify({ text, platform, locale }),
      });
      if (!response.ok) throw new Error('slop check failed');
      const parsed = readSlopReport(await response.json());
      if (!parsed) throw new Error('slop check unreadable');
      setReport(parsed);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [locale, platform, request, text]);

  const verdictWord = useMemo(() => {
    if (!shown) return null;
    return shown.verdict === 'clean'
      ? t.slopClean
      : shown.verdict === 'review'
      ? t.slopReview
      : t.slopRewrite;
  }, [shown, t]);

  return (
    <section
      data-slop-check="true"
      data-slop-verdict={shown?.verdict ?? 'none'}
      className="flex min-w-0 flex-col gap-[8px]"
    >
      <div className="flex flex-wrap items-center gap-[8px]">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !text.trim()}
          onClick={() => void check()}
        >
          {busy ? t.slopChecking : t.slopCheck}
        </Button>
        {shown && verdictWord && (
          <Status tone={VERDICT_TONE[shown.verdict]}>{verdictWord}</Status>
        )}
      </div>

      <p className="max-w-[64ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
        {t.slopCaption}
      </p>

      {failed && (
        <ErrorState
          title={t.slopFailed}
          action={
            <Button type="button" variant="secondary" onClick={() => void check()}>
              {t.slopRetry}
            </Button>
          }
        />
      )}

      {shown &&
        (shown.findings.length === 0 ? (
          <p className="cf-body-sm text-cf-ink-muted">{t.slopEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-[8px]">
            {shown.findings.map((finding, index) => (
              <li
                key={`${finding.ruleId}-${finding.start}-${index}`}
                data-slop-finding={finding.ruleId}
                data-slop-severity={finding.severity}
                className="flex min-w-0 flex-col gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[8px]"
              >
                <p className="max-w-[64ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                  «{finding.excerpt}»
                </p>
                <p className="max-w-[64ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
                  {locale === 'ru' ? finding.hint.ru : finding.hint.en}
                </p>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export default SlopFindings;
