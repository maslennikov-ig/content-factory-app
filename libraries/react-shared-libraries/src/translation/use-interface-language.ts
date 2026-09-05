'use client';

import { useTranslation } from 'react-i18next';
import { fallbackLng } from './i18n.config';
import { useVariables } from '../helpers/variable.context';

/**
 * Язык интерфейса прямо сейчас — для экранов, которые несут свои слова.
 *
 * `content-factory-next-fn33.146`. Панель фильтра этапов календаря брала язык
 * из `useVariables().language`. Это язык запроса, посчитанный один раз при
 * серверной отрисовке: `VariableContextComponent` получает его из
 * `resolveRequestLanguage()` и больше не меняет. Кнопка смены языка в шапке
 * вызывает `i18next.changeLanguage`, и переменная её не слышит — поэтому шапка
 * становилась русской, а панель оставалась английской до перезагрузки.
 *
 * Здесь тот же источник, что у `useT`: i18next в браузере и переменная запроса
 * на сервере, где детектор языка (он читает `document.cookie` и `navigator`)
 * не может ничего разрешить. `useTranslation()` берётся ради подписки —
 * компонент, который его позвал, перерисуется на `languageChanged` сам, без
 * перезагрузки страницы.
 *
 * Возвращается тег языка как есть (`ru`, `ka_ge`), а не двухбуквенный код:
 * решение, что с ним делать, принадлежит вызывающему — `resolveEditorialStageLocale`
 * сводит его к двум языкам, `Intl.DateTimeFormat` берёт целиком.
 */
export function useInterfaceLanguage(): string {
  const { language } = useVariables();
  const { i18n } = useTranslation();

  if (typeof window === 'undefined') {
    return language || fallbackLng;
  }

  return i18n.resolvedLanguage || i18n.language || language || fallbackLng;
}
