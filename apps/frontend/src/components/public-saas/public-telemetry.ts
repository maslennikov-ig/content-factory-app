'use client';

import { useCallback } from 'react';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

export type PublicGrowthEventName =
  | 'landing_view'
  | 'demo_started'
  | 'demo_completed'
  | 'signup_started';
export type DemoStep = 'plan' | 'draft' | 'review' | 'schedule';

export function publicGrowthEventPayload(
  name: PublicGrowthEventName,
  language: string,
  viewportWidth: number,
  demoStep?: DemoStep
) {
  const widthRange =
    viewportWidth < 480
      ? 'small'
      : viewportWidth < 1024
      ? 'medium'
      : viewportWidth < 1440
      ? 'large'
      : 'wide';
  return {
    name,
    locale: language === 'ru' ? 'ru' : 'en',
    widthRange,
    uiVersion: 'public-demo-v1',
    ...(demoStep ? { demoStep } : {}),
  };
}

export function sendPublicGrowthEvent(
  payload: ReturnType<typeof publicGrowthEventPayload>,
  backendUrl: string,
  fetcher: typeof fetch = fetch
) {
  return fetcher(`${backendUrl.replace(/\/$/, '')}/public-growth-events`, {
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function usePublicTelemetry() {
  const { language, backendUrl } = useVariables();
  return useCallback(
    (name: PublicGrowthEventName, demoStep?: DemoStep) =>
      sendPublicGrowthEvent(
        publicGrowthEventPayload(name, language, window.innerWidth, demoStep),
        backendUrl
      ),
    [backendUrl, language]
  );
}
