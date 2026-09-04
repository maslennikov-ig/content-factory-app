import { pageTitle } from '@contentfactory/frontend/app/page-title';
import { getT } from '@contentfactory/react/translation/get.translation.service.backend';
export const generateMetadata = pageTitle('error', 'Error');
export default async function Page() {
  const t = await getT();
  return (
    <div>
      {t(
        'we_are_experiencing_some_difficulty_try_to_refresh_the_page',
        'We are experiencing some difficulty, try to refresh the page'
      )}
    </div>
  );
}
