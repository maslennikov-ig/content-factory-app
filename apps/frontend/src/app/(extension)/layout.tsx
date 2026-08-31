export const dynamic = 'force-dynamic';
import '../global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import '@copilotkit/react-ui/styles.css';
import LayoutContext from '@contentfactory/frontend/components/layout/layout.context';
import { ReactNode } from 'react';
import { appMono, appSans } from '@contentfactory/frontend/styles/fonts';
import clsx from 'clsx';
import { VariableContextComponent } from '@contentfactory/react/helpers/variable.context';
import UtmSaver from '@contentfactory/helpers/utils/utm.saver';
import { resolveThemeMode } from '@contentfactory/frontend/app/theme';
import { resolveRequestLanguage } from '@contentfactory/react/translation/get.translation.service.backend';
import { languageDirection } from '@contentfactory/react/translation/i18n.config';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const mode = await resolveThemeMode();
  const language = await resolveRequestLanguage();
  return (
    <html lang={language} dir={languageDirection(language)}>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className={clsx(
          appSans.variable,
          appMono.variable,
          appSans.className,
          mode,
          'text-cf-ink bg-cf-canvas'
        )}
      >
        <VariableContextComponent
          language={language}
          storageProvider={
            process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'
          }
          stripeClient=""
          environment={process.env.NODE_ENV!}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}
          billingEnabled={!!process.env.STRIPE_PUBLISHABLE_KEY}
          supportUrl={process.env.NEXT_PUBLIC_SUPPORT_URL || ''}
          frontEndUrl={process.env.FRONTEND_URL!}
          isGeneral={!!process.env.IS_GENERAL}
          genericOauth={process.env.CONTENT_FACTORY_GENERIC_OAUTH === 'true'}
          oauthLogoUrl={process.env.NEXT_PUBLIC_CONTENT_FACTORY_OAUTH_LOGO_URL!}
          oauthDisplayName={process.env.NEXT_PUBLIC_CONTENT_FACTORY_OAUTH_DISPLAY_NAME!}
          uploadDirectory={process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY!}
          cloudflareUrl={process.env.CLOUDFLARE_BUCKET_URL || ''}
          mainUrl={process.env.MAIN_URL || ''}
          mcpUrl={process.env.MCP_URL}
          telegramBotName={process.env.TELEGRAM_BOT_NAME!}
          neynarClientId={process.env.NEYNAR_CLIENT_ID!}
          isSecured={!process.env.NOT_SECURED}
          disableImageCompression={!!process.env.DISABLE_IMAGE_COMPRESSION}
          disableXAnalytics={!!process.env.DISABLE_X_ANALYTICS}
          extensionId={process.env.EXTENSION_ID || ''}
          googleAuthEnabled={
            !!process.env.YOUTUBE_CLIENT_ID && !!process.env.YOUTUBE_CLIENT_SECRET
          }
          termsUrl={process.env.NEXT_PUBLIC_TERMS_URL || ''}
          privacyUrl={process.env.NEXT_PUBLIC_PRIVACY_URL || ''}
          docsUrl={process.env.NEXT_PUBLIC_DOCS_URL || ''}
          transloadit={
            process.env.TRANSLOADIT_AUTH && process.env.TRANSLOADIT_TEMPLATE
              ? [
                  process.env.TRANSLOADIT_AUTH!,
                  process.env.TRANSLOADIT_TEMPLATE!,
                ]
              : []
          }
        >
          <LayoutContext>
            <UtmSaver />
            {children}
          </LayoutContext>
        </VariableContextComponent>
      </body>
    </html>
  );
}
