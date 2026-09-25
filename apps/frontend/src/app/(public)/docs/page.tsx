import { PublicInfoPage } from '@contentfactory/frontend/components/public-saas/public-info-page';

// «Как начать»: the path a new client actually walks, in the order the menu
// shows it (2q28.9). The route keeps its `/docs` name — it is linked from the
// public header and nothing is gained by breaking bookmarks.
export default function DocsPage() {
  return (
    <PublicInfoPage
      titleKey="docsTitle"
      bodyKey="docsBody"
      items={[
        { titleKey: 'docsSignUpTitle', bodyKey: 'docsSignUpBody' },
        { titleKey: 'docsApprovalTitle', bodyKey: 'docsApprovalBody' },
        { titleKey: 'docsStartTitle', bodyKey: 'docsStartBody' },
        { titleKey: 'docsSetupTitle', bodyKey: 'docsSetupBody' },
        { titleKey: 'docsWorkTitle', bodyKey: 'docsWorkBody' },
        { titleKey: 'docsHelpTitle', bodyKey: 'docsHelpBody' },
      ]}
    />
  );
}
