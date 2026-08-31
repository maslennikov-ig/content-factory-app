
export const dynamic = 'force-dynamic';
import '../global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import '@copilotkit/react-ui/styles.css';
import LayoutContext from '@contentfactory/frontend/components/layout/layout.context';
import { ReactNode } from 'react';
import {
  appMono,
  appSans,
  editorText,
} from '@contentfactory/frontend/styles/fonts';
import clsx from 'clsx';
import { VariableContextComponent } from '@contentfactory/react/helpers/variable.context';
import { resolveRequestLanguage } from '@contentfactory/react/translation/get.translation.service.backend';
import { languageDirection } from '@contentfactory/react/translation/i18n.config';
import { HtmlComponent } from '@contentfactory/frontend/components/layout/html.component';
import { ChangeDirClient } from '@contentfactory/frontend/components/new-layout/change.dir.client';
import type { Metadata } from 'next';
import { resolveThemeMode } from '@contentfactory/frontend/app/theme';

export const metadata: Metadata = {
  title: {
    default: 'Content Factory',
    template: '%s · Content Factory',
  },
  description:
    'Plan, draft, review and publish content across channels in one workspace.',
  applicationName: 'Content Factory',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    siteName: 'Content Factory',
    title: 'Content Factory',
    description:
      'Plan, draft, review and publish content across channels in one workspace.',
    images: ['/opengraph-image.png'],
    type: 'website',
  },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const language = await resolveRequestLanguage();
  const mode = await resolveThemeMode();
  return (
    <html lang={language} dir={languageDirection(language)}>
      {/* Nothing is mounted in this head, and nothing third-party is meant to
          be. A page-view tag belonging to somebody else used to live here. If
          this instance ever counts anything, it counts it on our own domain and
          without a name or an address attached — content-factory-next-ry5.3. */}
      <head />
      <ChangeDirClient />
      <body
        className={clsx(
          appSans.variable,
          appMono.variable,
          editorText.variable,
          appSans.className,
          mode,
          'text-cf-ink bg-cf-canvas'
        )}
      >
        <VariableContextComponent
          storageProvider={
            process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'
          }
          environment={process.env.NODE_ENV!}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}
          stripeClient={process.env.STRIPE_PUBLISHABLE_KEY!}
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
          telegramLoginEnabled={
            !!process.env.TELEGRAM_CLIENT_ID &&
            !!process.env.TELEGRAM_CLIENT_SECRET
          }
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
          language={language}
          transloadit={
            process.env.TRANSLOADIT_AUTH && process.env.TRANSLOADIT_TEMPLATE
              ? [
                  process.env.TRANSLOADIT_AUTH!,
                  process.env.TRANSLOADIT_TEMPLATE!,
                ]
              : []
          }
        >
          {/* Nothing wraps the page but the product's own context. Six vendor
              wrappers used to sit here, each reporting to a server that is not
              ours, and one of them was handed the user's email and name. They
              are gone from the tree, not merely unmounted, and
              tests/external-services.purge.test.cjs fails if any returns. */}
          <HtmlComponent />
          <LayoutContext>{children}</LayoutContext>
        </VariableContextComponent>
      </body>
    </html>
  );
}
