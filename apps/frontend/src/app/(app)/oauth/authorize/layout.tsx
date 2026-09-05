import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { ReactNode } from 'react';

export const generateMetadata = pageTitle('authorize_application', 'Authorize Application');

export default async function OAuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-cf-canvas flex flex-1 min-h-screen w-screen">
      {children}
    </div>
  );
}
