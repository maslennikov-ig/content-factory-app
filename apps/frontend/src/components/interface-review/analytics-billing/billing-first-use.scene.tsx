import {
  defineInterfaceReviewScene,
  InterfaceReviewFrame,
  type InterfaceReviewContext,
} from '../fixture-contract';
import { BillingFirstUseView } from '../../billing/billing-first-use.view';

export const scene = defineInterfaceReviewScene({
  id: 'analytics-billing/billing-first-use',
  states: [
    'loading',
    'default',
    'selected',
    'success',
    'error',
    'restricted',
    'disabled',
    'long-content',
  ],
  fixture: {
    plans: [
      {
        id: 'STANDARD',
        name: 'Standard',
        monthly: 29,
        yearly: 278,
        features: ['5 channels', 'Publishing calendar'],
      },
      {
        id: 'TEAM',
        name: 'Team',
        monthly: 39,
        yearly: 374,
        features: ['10 channels', 'Workspace collaboration'],
      },
    ],
    exclusions: {
      empty:
        'The first-use plan catalogue is backed by static pricing and cannot be empty.',
    },
  },
});

export function Scene({ context }: { context: InterfaceReviewContext }) {
  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <BillingFirstUseView
        state={
          context.state as
            | 'loading'
            | 'default'
            | 'selected'
            | 'success'
            | 'error'
            | 'restricted'
            | 'disabled'
            | 'long-content'
        }
        locale={context.locale}
        plans={scene.fixture.plans}
        selectedPlan="STANDARD"
        period="MONTHLY"
        allowTrial={true}
      />
    </InterfaceReviewFrame>
  );
}
