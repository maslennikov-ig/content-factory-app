import { ReactNode } from 'react';
import { PreviewWrapper } from '@contentfactory/frontend/components/preview/preview.wrapper';

export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-cf-canvas text-cf-ink min-h-screen">
      <PreviewWrapper>{children}</PreviewWrapper>
    </div>
  );
}
