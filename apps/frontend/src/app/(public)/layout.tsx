import '../global.scss';
import { ReactNode } from 'react';
import clsx from 'clsx';
import type { Metadata } from 'next';
import { appMono, appSans } from '@contentfactory/frontend/styles/fonts';
import { VariableContextComponent } from '@contentfactory/react/helpers/variable.context';
import { resolveRequestLanguage } from '@contentfactory/react/translation/get.translation.service.backend';
import { languageDirection } from '@contentfactory/react/translation/i18n.config';
import { ChangeDirClient } from '@contentfactory/frontend/components/new-layout/change.dir.client';
import { resolveThemeMode } from '@contentfactory/frontend/app/theme';
import { PublicShell } from '@contentfactory/frontend/components/public-saas/public-shell';
import LayoutContext from '@contentfactory/frontend/components/layout/layout.context';

export const metadata: Metadata = {
  title: { default: 'Content Factory', template: '%s · Content Factory' },
  description: 'Plan, draft, review and schedule content in one workspace.',
};

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const language = await resolveRequestLanguage();
  const mode = await resolveThemeMode();
  return (
    <html lang={language} dir={languageDirection(language)}>
      <body
        className={clsx(
          appSans.variable,
          appMono.variable,
          appSans.className,
          mode,
          'bg-cf-canvas text-cf-ink'
        )}
      >
        <ChangeDirClient />
        <VariableContextComponent
          storageProvider={
            process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'
          }
          environment={process.env.NODE_ENV!}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}
          stripeClient=""
          billingEnabled={false}
          supportUrl={process.env.NEXT_PUBLIC_SUPPORT_URL || ''}
          frontEndUrl={process.env.FRONTEND_URL!}
          isGeneral={!!process.env.IS_GENERAL}
          genericOauth={false}
          oauthLogoUrl=""
          oauthDisplayName=""
          uploadDirectory=""
          cloudflareUrl=""
          mainUrl={process.env.MAIN_URL || ''}
          mcpUrl={undefined}
          telegramBotName=""
          telegramLoginEnabled={false}
          neynarClientId=""
          isSecured={!process.env.NOT_SECURED}
          disableImageCompression={false}
          disableXAnalytics
          extensionId=""
          googleAuthEnabled={false}
          termsUrl={process.env.NEXT_PUBLIC_TERMS_URL || ''}
          privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL || ''}
          docsUrl=""
          language={language}
          transloadit={[]}
        >
          <LayoutContext>
            <PublicShell>{children}</PublicShell>
          </LayoutContext>
        </VariableContextComponent>
      </body>
    </html>
  );
}
