import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';

export function useVideoPersonalWords() {
  const ru = useInterfaceLanguage().toLowerCase().startsWith('ru');
  return ru ? {
    workspaceAccessRequired: 'Нужен доступ для этого пространства',
    connectedNeedsDiscovery: 'Аккаунт подключён. Нужно проверить доступные действия у провайдера.',
    generationBlocked: 'Подключение доступно; создание видео пока не подтверждено.',
    generationReady: 'Возможность генерации у провайдера подтверждена; требования к аккаунту проверяются отдельно.',
    readiness: 'Доступные действия', ready: 'Доступно', blocked: 'Пока недоступно',
    presenter: 'Видео с аватаром', generated_clip: 'Генерация клипа', narration: 'Озвучивание', captions: 'Субтитры', final_composition: 'Сборка видео',
    checkAccount: 'Проверьте подключение и права у провайдера. Черновик сохранится.',
    wallet: 'Подключённый аккаунт ещё не подтверждён.', schema: 'Доступ к созданию видео ещё не проверен.', workspace: 'Подписки отключены в настройках рабочей области.',
    integrationNotReady: 'Аккаунт подключён. Интеграцию ещё нужно настроить для проверки аккаунта и создания видео.', chooseAccount: 'Выберите аккаунт',
    operationUnavailable: 'Это действие пока недоступно через личную подписку.',
    ownedAssets: 'Ваши аватар и голос', assetsUnavailable: 'Если вашего аватара или голоса не хватает, создайте недостающий материал и подтвердите согласие у провайдера, затем обновите список.',
    catalogOnly: 'Выберите образ и голос для черновика. Для генерации потребуется проверить согласие, доступность выбранного образа и стоимость.',
    consentUnknown: 'согласие на рендер не подтверждено', trainingAsset: 'ещё готовится', failedAsset: 'ошибка — проверьте материал в HeyGen',
    openProvider: 'Открыть провайдера', staleAssets: 'Выбранный материал недоступен для этого аккаунта. Выберите свой аватар и голос снова.',
    discover: 'Проверить аккаунт', discovering: 'Проверка аккаунта…', checked: 'Проверка аккаунта завершена.',
    saveChatFirst: 'Откройте сохранённый чат и сохраните черновик перед подключением аккаунта.',
    bindFailed: 'Не удалось сохранить связь черновика с чатом. Проверьте соединение и попробуйте снова.',
  } : {
    workspaceAccessRequired: 'Access needed for this workspace',
    connectedNeedsDiscovery: 'Account connected. Check the provider for available actions.',
    generationBlocked: 'Connection is available; video generation is not yet verified.',
    generationReady: 'Provider generation capability verified; account requirements are checked separately.',
    readiness: 'Available actions', ready: 'Available', blocked: 'Not available yet',
    presenter: 'Avatar video', generated_clip: 'Generate clip', narration: 'Narration', captions: 'Captions', final_composition: 'Final composition',
    checkAccount: 'Check the account and permissions at the provider. Your draft will be kept.',
    wallet: 'The connected account has not been verified yet.', schema: 'Video creation access has not been verified yet.', workspace: 'Subscriptions are disabled in workspace settings.',
    integrationNotReady: 'Account connected. The integration still needs configuration to verify the account and create video.', chooseAccount: 'Choose an account',
    operationUnavailable: 'This action is not available through a personal subscription yet.',
    ownedAssets: 'Your avatar and voice', assetsUnavailable: 'If your avatar or voice is missing, create the missing item and complete consent at the provider, then refresh.',
    catalogOnly: 'Choose a look and voice for your draft. Rendering requires verified consent, eligibility and pricing.',
    consentUnknown: 'render consent unverified', trainingAsset: 'still training', failedAsset: 'failed — check the item in HeyGen',
    openProvider: 'Open provider', staleAssets: 'The selected item is unavailable for this account. Choose your avatar and voice again.',
    discover: 'Check account', discovering: 'Checking account…', checked: 'Account check completed.',
    saveChatFirst: 'Open a saved chat and save the draft before connecting your account.',
    bindFailed: 'Could not save the draft in this chat. Check the connection and try again.',
  };
}

export function videoPersonalBlocker(code: string, words: ReturnType<typeof useVideoPersonalWords>) {
  if (code === 'VIDEO_WALLET_IDENTITY_UNVERIFIED') return words.wallet;
  if (code === 'VIDEO_SCHEMA_UNSUPPORTED') return words.schema;
  if (code === 'VIDEO_WORKSPACE_SUBSCRIPTION_DISABLED') return words.workspace;
  if (code === 'VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE') return words.operationUnavailable;
  return words.checkAccount;
}
