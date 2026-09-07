'use client';

import Link from 'next/link';
import { PageHeader, PageShell } from '@contentfactory/react/layout';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { HelpDisclosure } from './help-disclosure';
import {
  HELP_CONTENT_HREF,
  HELP_ONBOARDING_HREF,
  helpCopy,
  resolveHelpLocale,
} from './help.copy';

/**
 * Раздел «Помощь»: одиннадцать вопросов и ответы на них.
 *
 * Решение владельца 07.09.2026 (`m2eg.25`). Ни один из вопросов не придуман
 * здесь: каждый прозвучал на живом прогоне, и ответ до сих пор жил в
 * переписке. Экран ничего не спрашивает у сервера и ни от чего не зависит —
 * поэтому у него нет ни загрузки, ни ошибки, ни отказа по роли: он одинаков
 * для наблюдателя и администратора, и это единственная страница продукта, про
 * которую это можно сказать честно.
 *
 * Первый вопрос раскрыт: список из одиннадцати одинаковых закрытых строк не
 * показывает, что за ними лежит, и человек, открывший раздел впервые, должен
 * увидеть ответ, а не оглавление. Раскрывать все — значит вернуть ту самую
 * стену текста, из-за которой раздела и не было.
 *
 * Каркас — `PageShell` и `PageHeader`: полотно, отступ и ритм у этого экрана
 * ровно те же, что у остальных, и своих чисел он не заводит.
 *
 * Название раздела берётся из ключа `help`, а не из `help.copy.ts`: тот же
 * ключ читают пункт меню и заголовок вкладки браузера, и одно имя раздела в
 * трёх местах должно приходить из одного места.
 */
export function HelpScreen() {
  const { language } = useVariables();
  const translate = useT();
  const t = helpCopy[resolveHelpLocale(language)];

  return (
    <PageShell>
      <PageHeader
        title={translate('help', 'Help')}
        description={t.pageLead}
        headingLevel={1}
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
        существующие адреса: «С чего начать» отвечает на последний вопрос
        списка и живёт во вкладке настроек, «Контент» — там, где заготовка
        пишется без канала, о чём говорит второй вопрос.
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
