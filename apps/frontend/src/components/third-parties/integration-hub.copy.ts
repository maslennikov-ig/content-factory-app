import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';

const copy = {
  manage: ['Manage integrations', 'Управление интеграциями'],
  hubNote: ['Manage connections in Integrations.', 'Управляйте подключениями в разделе «Интеграции».'],
  personal: ['Personal subscription', 'Личная подписка'],
  api: ['API · workspace', 'API · рабочее пространство'],
  legacyApi: ['Existing API integration', 'Существующая API-интеграция'],
  videoApi: ['Video API settings', 'Настройки видео API'],
  bindingNote: ['Choose an existing HeyGen API connection explicitly in Video API settings to use its key for videos. Personal subscriptions use separate access.', 'В настройках видео API можно явно выбрать существующее API-подключение HeyGen для видео. Личные подписки используют отдельный доступ.'],
  saveSettings: ['Save settings', 'Сохранить настройки'],
  source: ['Video API key source', 'Источник ключа видео API'],
  inlineSource: ['Separate video API key', 'Отдельный ключ видео API'],
  sourceNote: ['Save to apply this source. The payer and personal subscriptions stay as configured. Disconnect video source disables new API videos; the saved API connection and separate video key are retained.', 'Сохраните настройки, чтобы применить источник. Плательщик и личные подписки сохраняются. Кнопка «Отключить источник видео» запрещает новые видео API; существующее API-подключение и отдельный ключ видео сохраняются.'],
  sourceUnavailable: ['Selected API connection is unavailable. Restore it or explicitly choose another source.', 'Выбранное API-подключение недоступно. Восстановите его или явно выберите другой источник.'],
  sourceInactive: ['This workspace source is inactive while the included allowance is selected.', 'Источник рабочего пространства не используется, пока выбран включённый лимит.'],
  removeSource: ['Disconnect video source', 'Отключить источник видео'],
  admin: ['API credentials are managed by a workspace administrator.', 'API-ключами управляет администратор рабочего пространства.'],
  returnSaved: ['Return to saved video', 'Вернуться к сохранённому видео'],
  invalidReturn: ['The saved return link is invalid. Open integrations from the saved video again.', 'Ссылка возврата недействительна. Откройте интеграции из сохранённого видео ещё раз.'],
  personalNote: ['Sign in with your own account. Connection availability and generation readiness are checked separately.', 'Войдите в свой аккаунт. Возможность подключиться и готовность генерации проверяются отдельно.'],
} as const;
export function useIntegrationHubWords() {
  const index = useInterfaceLanguage().toLowerCase().startsWith('ru') ? 1 : 0;
  return Object.fromEntries(Object.entries(copy).map(([key, values]) => [key, values[index]])) as Record<keyof typeof copy, string>;
}
