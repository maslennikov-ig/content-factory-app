'use client';

import Link from 'next/link';
import { PageHeader, PageShell } from '@contentfactory/react/layout';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { HelpDisclosure } from './help-disclosure';
import {
  HELP_CONTENT_HREF,
  HELP_ONBOARDING_HREF,
  helpCopy,
  resolveHelpLocale,
} from './help.copy';

/**
 * Раздел «Помощь»: вопросы и ответы на них — столько, сколько их в
 * `HELP_QUESTION_IDS`.
 *
 * Решение владельца 07.09.2026 (`m2eg.25`). Вопросы не придуманы здесь: они
 * прозвучали на живых прогонах или их задаст первый клиент (`2q28.8`), и
 * ответ до того жил в переписке. Экран ничего не спрашивает у сервера и ни
 * от чего не зависит — поэтому у него нет ни загрузки, ни ошибки, ни отказа
 * по роли: он одинаков для пользователя и администратора, и это единственная
 * страница продукта, про которую это можно сказать честно.
 *
 * Первый вопрос — «С чего начать?» — раскрыт: список одинаковых закрытых
 * строк не показывает, что за ними лежит, и человек, открывший раздел
 * впервые, должен увидеть ответ, а не оглавление. Раскрывать все — значит вернуть ту самую
 * стену текста, из-за которой раздела и не было.
 *
 * Каркас — `PageShell` и `PageHeader`: полотно, отступ и ритм у этого экрана
 * ровно те же, что у остальных, и своих чисел он не заводит.
 *
 * Название раздела рисует верхняя оболочка. Экран оставляет здесь только
 * пояснение, чтобы заголовок не повторялся перед первым вопросом.
 */
export function HelpScreen() {
  const { language } = useVariables();
  const t = helpCopy[resolveHelpLocale(language)];

  return (
    <PageShell>
      <PageHeader
        description={t.pageLead}
      />

      <div
        data-help-list="true"
        className="flex max-w-[80ch] flex-col gap-[8px]"
      >
        {t.questions.map((item, index) => (
          <HelpDisclosure
            key={item.id}
            id={item.id}
            question={item.question}
            answer={item.answer}
            defaultOpen={index === 0}
          />
        ))}
      </div>

      {/*
        Куда идти за тем, чего ответом не закроешь. Две ссылки, обе на уже
        существующие адреса: «С чего начать» — продолжение первого вопроса
        списка, «Контент» — там, где заготовка пишется без канала.
      */}
      <p className="max-w-[70ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        <span>{t.whereLabel}: </span>
        <Link
          href={HELP_ONBOARDING_HREF}
          data-help-link="onboarding"
          className="text-cf-accent underline"
        >
          {t.whereOnboarding}
        </Link>
        <span>, </span>
        <Link
          href={HELP_CONTENT_HREF}
          data-help-link="content"
          className="text-cf-accent underline"
        >
          {t.whereContent}
        </Link>
        <span>.</span>
      </p>
    </PageShell>
  );
}

export default HelpScreen;
