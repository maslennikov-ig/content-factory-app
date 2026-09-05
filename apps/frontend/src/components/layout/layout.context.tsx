'use client';

import { ReactNode, useCallback } from 'react';
import { FetchWrapperComponent } from '@contentfactory/helpers/utils/custom.fetch';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { areYouSure } from '@contentfactory/frontend/components/layout/new-modal';
import { useReturnUrl } from '@contentfactory/frontend/app/(app)/auth/return.url.component';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import i18next from '@contentfactory/react/translation/i18next';

/**
 * The refusals `SubscriptionExceptionFilter` writes, and the key each one is
 * read in the person's own language under.
 *
 * `content-factory-next-fn33.64`: the dialog showed the server's English
 * sentence with an English title and an English button on an otherwise Russian
 * screen. The backend has no i18next runtime and no browser language — it
 * answers an API, not a screen — so the translation belongs here, and the
 * English sentence is the key it arrives under. Anything unrecognised is still
 * shown as sent: a refusal nobody can read is better than no refusal at all.
 *
 * `tests/role-refusal-localized.test.cjs` holds this table against the filter,
 * so a reworded refusal on the server cannot quietly go back to English here.
 */
const BACKEND_REFUSALS: Record<string, { key: string; fallback: string }> = {
  'This action is available to organization administrators only. Ask an administrator of your organization to do it for you.':
    {
      key: 'role_refusal_admin_only',
      fallback:
        'This action is available to organization administrators only. Ask an administrator of your organization to do it for you.',
    },
  'You are not allowed to perform this action.': {
    key: 'role_refusal_generic',
    fallback: 'You are not allowed to perform this action.',
  },
};
/**
 * Пределы тарифа, которые тот же фильтр присылает с 402, и ключ, под которым
 * человек читает каждый на своём языке.
 *
 * `content-factory-next-nkei`. Устройство то же, что у таблицы выше, и по той
 * же причине: сервер отвечает API, у него нет ни языка браузера, ни i18next, а
 * его английская фраза — это ещё и то, что читает клиент API. Разница только в
 * том, что здесь отказ можно снять оплатой, поэтому у модалки есть кнопка в
 * тарифы.
 *
 * `tests/plan-refusal-localized.test.cjs` держит таблицу против фильтра.
 */
const PLAN_REFUSALS: Record<string, { key: string; fallback: string }> = {
  'You have reached the maximum number of posts for your subscription. Please upgrade your subscription to add more posts.':
    {
      key: 'plan_refusal_posts',
      fallback:
        'You have used every post your plan includes this month. Change the plan to write more.',
    },
  'You have reached the maximum number of channels for your subscription. Please upgrade your subscription to add more channels.':
    {
      key: 'plan_refusal_channels',
      fallback:
        'You have connected every channel your plan includes. Change the plan to add more.',
    },
  'You have reached the maximum number of webhooks for your subscription. Please upgrade your subscription to add more webhooks.':
    {
      key: 'plan_refusal_webhooks',
      fallback:
        'You have added every webhook your plan includes. Change the plan to add more.',
    },
  'You have reached the maximum number of generated videos for your subscription. Please upgrade your subscription to generate more videos.':
    {
      key: 'plan_refusal_videos',
      fallback:
        'You have used every generated video your plan includes this month. Change the plan to generate more.',
    },
  'You are not allowed to perform this action.': {
    key: 'plan_refusal_generic',
    fallback:
      'Your plan does not include this action. Change the plan to continue.',
  },
};
export default function LayoutContext(params: { children: ReactNode }) {
  if (params?.children) {
    // eslint-disable-next-line react/no-children-prop
    return <LayoutContextInner children={params.children} />;
  }
  return <></>;
}
export function setCookie(cname: string, cvalue: string, exdays: number) {
  if (typeof document === 'undefined') {
    return;
  }
  const d = new Date();
  d.setTime(d.getTime() + exdays * 24 * 60 * 60 * 1000);
  const expires = 'expires=' + d.toUTCString();
  document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/';
}
function LayoutContextInner(params: { children: ReactNode }) {
  const returnUrl = useReturnUrl();
  const { backendUrl, isSecured } = useVariables();
  const afterRequest = useCallback(
    async (url: string, options: RequestInit, response: Response) => {
      if (
        typeof window !== 'undefined' &&
        (window.location.href.includes('/p/') ||
          window.location.pathname.startsWith('/provider/'))
      ) {
        return true;
      }
      const headerAuth =
        response?.headers?.get('auth') || response?.headers?.get('Auth');
      const showOrg =
        response?.headers?.get('showorg') || response?.headers?.get('Showorg');
      const impersonate =
        response?.headers?.get('impersonate') ||
        response?.headers?.get('Impersonate');
      const logout =
        response?.headers?.get('logout') || response?.headers?.get('Logout');
      if (headerAuth) {
        setCookie('auth', headerAuth, 365);
      }
      if (showOrg) {
        setCookie('showorg', showOrg, 365);
      }
      if (impersonate) {
        setCookie('impersonate', impersonate, 365);
      }
      if (logout && !isSecured) {
        setCookie('auth', '', -10);
        setCookie('showorg', '', -10);
        setCookie('impersonate', '', -10);
        window.location.href = '/';
        return true;
      }
      const reloadOrOnboarding =
        response?.headers?.get('reload') ||
        response?.headers?.get('onboarding');
      if (reloadOrOnboarding) {
        const getAndClear = returnUrl.getAndClear();
        if (getAndClear) {
          window.location.href = getAndClear;
          return true;
        }
      }
      if (response?.headers?.get('onboarding')) {
        /*
          `content-factory-next-rrs9`: a fresh space lands on the walkthrough
          itself rather than on a screen with a modal over it. The modal is
          still reachable at `?onboarding=true` for the channel-connecting step
          it owns; what changed is where someone with an empty workspace is
          sent first, and it is now a page they can leave and come back to.
        */
        window.location.href = '/onboarding';
        return true;
      }

      if (response?.headers?.get('reload')) {
        window.location.reload();
        return true;
      }

      if (response.status === 401 || response?.headers?.get('logout')) {
        if (!isSecured) {
          setCookie('auth', '', -10);
          setCookie('showorg', '', -10);
          setCookie('impersonate', '', -10);
        }
        window.location.href = '/';
      }
      if (response.status === 406) {
        if (
          await deleteDialog(
            'You are currently on trial, in order to use the feature you must finish the trial',
            'Finish the trial, charge me now',
            'Trial',

          )
        ) {
          window.open('/billing?finishTrial=true', '_blank');
          return false;
        }
        return false;
      }

      // A role refusal, not a plan limit. 402 would put a billing button on it,
      // and no payment buys a role — on an instance without billing that button
      // leads nowhere at all. A body that is not our refusal is left alone, so
      // this stays a handler for the backend's own answer.
      if (response.status === 403) {
        const body = await response
          .json()
          .then((parsed: { message?: string; code?: string }) => parsed)
          .catch(() => undefined);
        const refusal = body?.message;
        // A refusal that names itself belongs to the surface that asked. The
        // Content section draws `restricted` as a state — the passport stays
        // readable and the buttons go — and a modal over a blank panel would
        // replace that with "Not allowed" and nothing behind it.
        if (typeof body?.code === 'string' && body.code) {
          return true;
        }
        if (!refusal) {
          return true;
        }

        const known = BACKEND_REFUSALS[refusal];
        await areYouSure({
          title: i18next.t('role_refusal_title', 'Not allowed'),
          description: known ? i18next.t(known.key, known.fallback) : refusal,
          approveLabel: i18next.t('close', 'Close'),
          onlyApprove: true,
        });
        return false;
      }

      // Предел тарифа. Одно место показа на весь продукт: раньше модалка
      // печатала `undefined` (у тела есть `message`, но читалось оно до того,
      // как фильтр научился его писать), а экран под ней показывал вторую
      // плашку без причины — человек с исчерпанным месячным пределом получал
      // два сообщения и ни одного объяснения (`content-factory-next-nkei`).
      if (response.status === 402) {
        const body = await response
          .json()
          .then((parsed: { message?: string | string[]; code?: string }) => parsed)
          .catch(() => undefined);
        // Отказ, который называет себя, принадлежит поверхности, которая
        // спрашивала, — то же правило, что на 403 выше.
        if (typeof body?.code === 'string' && body.code) {
          return true;
        }

        const raw = Array.isArray(body?.message)
          ? body?.message[0]
          : body?.message;
        const refusal = typeof raw === 'string' ? raw.trim() : '';
        const known = PLAN_REFUSALS[refusal];
        const description = known
          ? i18next.t(known.key, known.fallback)
          : refusal ||
            i18next.t(
              'plan_refusal_generic',
              'Your plan does not include this action. Change the plan to continue.'
            );

        if (
          await deleteDialog(
            description,
            i18next.t('plan_refusal_billing', 'Move to billing'),
            i18next.t('plan_refusal_title', 'Plan limit reached'),
            i18next.t('close', 'Close')
          )
        ) {
          window.open('/billing', '_blank');
        }
        return false;
      }
      return true;
    },
    []
  );
  return (
    <FetchWrapperComponent baseUrl={backendUrl} afterRequest={afterRequest}>
      {params?.children || <></>}
    </FetchWrapperComponent>
  );
}
