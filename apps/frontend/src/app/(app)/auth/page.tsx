import { internalFetch } from '@contentfactory/helpers/utils/internal.fetch';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
export const dynamic = 'force-dynamic';
import { Register } from '@contentfactory/frontend/components/auth/register';
import Link from 'next/link';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';
import { LoginWithOidc } from '@contentfactory/frontend/components/auth/login.with.oidc';
import { TelegramLinkReturn } from '@contentfactory/frontend/components/auth/telegram.link.return';
export const generateMetadata = pageTitle('sign_up', 'Sign Up');
export default async function Auth(params: {
  searchParams: Promise<{ provider?: string; code?: string }>;
}) {
  const t = await getT();
  const searchParams = await params?.searchParams;
  if (process.env.DISABLE_REGISTRATION === 'true') {
    const canRegister = (
      await (await internalFetch('/auth/can-register')).json()
    ).register;
    if (!canRegister && !searchParams?.provider) {
      return (
        <>
          <LoginWithOidc />
          <div className="text-center">
            {t('registration_is_disabled', 'Registration is disabled')}
            <br />
            <Link className="underline hover:font-bold" href="/auth/login">
              {t('login_instead', 'Login instead')}
            </Link>
          </div>
        </>
      );
    }
  }
  // Telegram has one address to return to, so a connection started in Settings
  // comes back here too. The gate below sends that one onward and leaves an
  // ordinary sign-in untouched.
  if (
    searchParams?.provider?.toUpperCase() === 'TELEGRAM' &&
    searchParams?.code
  ) {
    return (
      <TelegramLinkReturn>
        <Register />
      </TelegramLinkReturn>
    );
  }
  return <Register />;
}
