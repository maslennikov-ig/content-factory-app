export const dynamic = 'force-dynamic';
import { AdminAiDefaultsComponent } from '@contentfactory/frontend/components/admin/admin-ai-defaults.component';
import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { PageShell } from '@contentfactory/react/layout';

/**
 * Вкладка браузера называется тем же словом, что и пункт админской панели и
 * режим в настройках области, — «Ключи системы». Это единственное название,
 * которое связывает три места, где о них вообще говорят.
 */
export const generateMetadata = pageTitle('ai_usage_included', 'System keys');

export default async function Page() {
  return (
    <PageShell>
      <AdminAiDefaultsComponent />
    </PageShell>
  );
}
