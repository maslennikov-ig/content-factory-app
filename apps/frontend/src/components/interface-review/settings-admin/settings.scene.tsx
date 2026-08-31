'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../fixture-contract';
import { SettingsSurface } from '../../settings/settings-surface.component';
import {
  SignInMethodsView,
  type UserIdentity,
} from '../../settings/sign-in-methods.component';

export const settingsScene = defineInterfaceReviewScene({
  id: 'settings-admin/settings',
  fixture: {
    identity: {
      provider: 'LOCAL',
      providerIdentifier: 'editor@synthetic.invalid',
      linkedAt: '2026-08-20T08:00:00.000Z',
    },
    longIdentity:
      'very.long.localized.account.identifier.for.layout.review@synthetic.invalid',
    longRussianIdentity:
      'редактор.распределённой.международной.команды@synthetic.invalid',
  },
  states: [
    'loading',
    'empty',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ] as const satisfies readonly InterfaceReviewState[],
});

export const settingsExclusions = Object.freeze({});

export function SettingsReviewScene({
  context,
}: {
  context: InterfaceReviewContext;
}) {
  const identity: UserIdentity = {
    ...settingsScene.fixture.identity,
    provider: 'LOCAL',
    providerIdentifier:
      context.state === 'long-content'
        ? context.locale === 'ru'
          ? settingsScene.fixture.longRussianIdentity
          : settingsScene.fixture.longIdentity
        : settingsScene.fixture.identity.providerIdentifier,
  };
  const restricted = context.state === 'restricted';
  const identities = context.state === 'empty' ? [] : [identity];
  const labels =
    context.locale === 'ru'
      ? { global: 'Общие настройки', signIn: 'Способы входа' }
      : { global: 'Global settings', signIn: 'Sign-in methods' };

  return (
    <InterfaceReviewFrame scene={settingsScene} context={context}>
      <SettingsSurface
        tabs={[
          { value: 'global', label: labels.global },
          { value: 'sign-in', label: labels.signIn },
        ]}
        value="sign-in"
        onChange={() => undefined}
      >
        {restricted ? (
          <section className="max-w-[720px] rounded-[8px] border border-cf-warning bg-cf-warning-soft p-[16px]">
            <h2 className="cf-heading-md text-cf-warning">
              Administrator access required
            </h2>
            <p className="mt-[8px] cf-body-md text-cf-warning [text-wrap:pretty]">
              Only a workspace administrator can change organization-wide
              settings.
            </p>
          </section>
        ) : (
          <SignInMethodsView
            identities={identities}
            availableProviders={['LOCAL', 'TELEGRAM']}
            loading={context.state === 'loading'}
            error={
              context.state === 'error'
                ? 'Could not load sign-in methods.'
                : undefined
            }
            statusMessage={
              context.state === 'success'
                ? 'Sign-in method updated.'
                : undefined
            }
            busyProvider={context.state === 'disabled' ? 'LOCAL' : null}
            email=""
            password=""
            onRetry={() => undefined}
            onEmailChange={() => undefined}
            onPasswordChange={() => undefined}
            onLinkLocal={() => undefined}
            onLinkExternal={() => undefined}
            onUnlink={() => undefined}
          />
        )}
      </SettingsSurface>
    </InterfaceReviewFrame>
  );
}
