export const chatModeCopy = {
  ru: {
    label: 'Режим чата',
    options: { collaborative: 'С согласованием', autopilot: 'Автопилот' },
    saving: 'Сохраняю режим…',
    failed: 'Не удалось сохранить режим. Выбранный ранее режим сохранён. Попробуйте ещё раз.',
  },
  en: {
    label: 'Chat mode',
    options: { collaborative: 'With approval', autopilot: 'Autopilot' },
    saving: 'Saving mode…',
    failed: 'Could not save the mode. The previous mode is retained. Try again.',
  },
} as const;
