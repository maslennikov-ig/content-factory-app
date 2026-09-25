'use strict';

/**
 * Billing actions are the administrator's (`content-factory-next-zg8w`,
 * owner's decision of 24.09.2026). The server answers 403 to anyone else on
 * subscribe, embedded, cancel, apply-discount and finish-trial; the screen
 * must not offer those presses to a non-administrator, and must say why.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const { BillingManageView } = loadTypeScriptModule(
  'apps/frontend/src/components/billing/billing-manage.view.tsx'
);
const { BillingFirstUseView } = loadTypeScriptModule(
  'apps/frontend/src/components/billing/billing-first-use.view.tsx'
);

const PLANS = [{ id: 'STANDARD', name: 'Standard', monthly: 29, yearly: 290, features: [] }];
const h = React.createElement;

describe('the views say who can pay, in both languages', () => {
  test.each(['ru', 'en'])('manage (%s): a note under the heading, only for a non-administrator', (locale) => {
    const view = (adminOnly) =>
      renderToStaticMarkup(
        h(BillingManageView, {
          state: 'default',
          locale,
          plans: PLANS,
          currentPlan: 'STANDARD',
          period: 'MONTHLY',
          adminOnly,
        })
      );
    const note = view(true);
    expect(note).toContain('data-billing-admin-only="manage"');
    expect(note).toContain('role="note"');
    expect(note).toMatch(locale === 'ru' ? /только администратор пространства/ : /Only a workspace administrator/);
    expect(view(false)).not.toContain('data-billing-admin-only');
  });

  test.each(['ru', 'en'])('first use (%s): the checkout box names who pays instead of a form', (locale) => {
    const markup = renderToStaticMarkup(
      h(BillingFirstUseView, {
        state: 'default',
        locale,
        plans: PLANS,
        selectedPlan: 'STANDARD',
        period: 'MONTHLY',
        allowTrial: false,
        checkoutBoundary: h('div', { 'data-checkout': 'stripe' }),
        adminOnly: true,
      })
    );
    expect(markup).toContain('data-billing-admin-only="first-use"');
    expect(markup).not.toContain('data-checkout');
    expect(markup).toMatch(locale === 'ru' ? /Оплатить тариф может только администратор/ : /Only a workspace administrator can pay/);
  });

  test('no capitals and no «модель» in the new words', () => {
    for (const file of [
      'apps/frontend/src/components/billing/billing-manage.view.tsx',
      'apps/frontend/src/components/billing/billing-first-use.view.tsx',
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/модел/i);
    }
  });
});

describe('the screens use the shared role helper on every admin-only door', () => {
  const main = read('apps/frontend/src/components/billing/main.billing.component.tsx');
  const first = read('apps/frontend/src/components/billing/first.billing.component.tsx');

  test('manage: plan buttons, cancel and the trial finish are off for a non-administrator', () => {
    expect(main).toMatch(/const canManage = isOrganizationAdmin\(user\?\.role\);/);
    expect(main).toMatch(/disabled=\{\s*!canManage \|\|\s*current/);
    expect(main).toMatch(/variant="destructive"\s*disabled=\{!canManage\}/);
    expect(main).toMatch(/\{finishTrial && canManage && \(/);
    expect(main).toMatch(/adminOnly=\{!canManage\}/);
  });

  test('first use: no checkout request and no form for a non-administrator', () => {
    expect(first).toMatch(/const canPay = isOrganizationAdmin\(user\?\.role\);/);
    expect(first).toMatch(/canPay \? `\/billing-\$\{tier\}-\$\{period\}` : null/);
    expect(first).toMatch(/adminOnly=\{!canPay\}/);
    expect(first).toMatch(/canPay && !data\?\.blocked && data\?\.client_secret/);
  });
});

/* Review W1 of the fifteenth walk: F5 (the portal is ADMIN) and F6 (the trial dialog after a 403). */
describe('the payment portal and the trial dialog for a non-administrator', () => {
  const { runFinishTrial, finishTrialFailureText } = loadTypeScriptModule(
    'apps/frontend/src/components/billing/finish-trial.flow.ts'
  );
  const answer = (status, body = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const script = (...answers) => {
    const calls = [];
    return {
      calls,
      fetch: async (url, init) => {
        calls.push([url, init?.method ?? 'GET']);
        const next = answers.shift();
        if (!next) throw new Error(`unexpected ${url}`);
        return next;
      },
    };
  };
  const options = { wait: async () => undefined, active: () => true };

  test('«Update payment method» is off for a non-administrator, and a refused portal does not navigate', () => {
    const main = read('apps/frontend/src/components/billing/main.billing.component.tsx');
    expect(main).toMatch(/variant="secondary"\s*disabled=\{!canManage\}\s*onClick=\{updatePayment\}/);
    expect(main).toMatch(/const response = await fetch\('\/billing\/portal'\);\s*if \(!response\.ok\) return;/);
  });

  test('403 on finish-trial: no polling, a plain message', async () => {
    const { fetch, calls } = script(answer(403, { message: 'forbidden' }));
    await expect(runFinishTrial(fetch, options)).resolves.toBe('forbidden');
    expect(calls).toEqual([['/billing/finish-trial', 'POST']]);
  });

  test('a refused check stops the polling too; a finished trial ends it', async () => {
    const refused = script(answer(200), answer(200, { finished: false }), answer(403));
    await expect(runFinishTrial(refused.fetch, options)).resolves.toBe('forbidden');
    expect(refused.calls).toHaveLength(3);
    const done = script(answer(200), answer(200, { finished: false }), answer(200, { finished: true }));
    await expect(runFinishTrial(done.fetch, options)).resolves.toBe('finished');
    const broken = script(answer(500));
    await expect(runFinishTrial(broken.fetch, options)).resolves.toBe('failed');
  });

  test('closing the dialog stops the checks', async () => {
    let open = true;
    const { fetch, calls } = script(answer(200), answer(200, { finished: false }));
    const outcome = await runFinishTrial(fetch, {
      wait: async () => {
        open = false;
      },
      active: () => open,
    });
    expect(outcome).toBe('stopped');
    expect(calls).toHaveLength(2);
  });

  test('the message is plain, in both languages, without «модель»', () => {
    for (const ru of [true, false]) {
      for (const outcome of ['forbidden', 'failed']) {
        const text = finishTrialFailureText(outcome, ru);
        expect(text).not.toMatch(/модел/i);
        expect(text).toMatch(ru ? /[а-я]/ : /^[^а-я]+$/);
      }
    }
    expect(finishTrialFailureText('forbidden', true)).toMatch(/только администратор пространства/);
    expect(finishTrialFailureText('forbidden', false)).toMatch(/Only a workspace administrator/);
    const dialog = read('apps/frontend/src/components/billing/finish.trial.tsx');
    expect(dialog).toMatch(/runFinishTrial\(fetch/);
    expect(dialog).toMatch(/data-finish-trial-failure=\{failure\}/);
  });
});

/* Review W2 of the fifteenth walk: F9 (an unknown user is loading) and the FinishTrial words. */
describe('an unknown user is loading; trial words only for the one who can pay', () => {
  const main = read('apps/frontend/src/components/billing/main.billing.component.tsx');
  const first = read('apps/frontend/src/components/billing/first.billing.component.tsx');

  test('both screens load, rather than show the administrator note, until the user is known', () => {
    expect(main).toMatch(/const userKnown = Boolean\(user\);/);
    expect(main).toMatch(/state=\{!userKnown \? 'loading' : loading \? 'disabled' : 'default'\}/);
    expect(first).toMatch(/const userKnown = Boolean\(user\);/);
    expect(first).toMatch(/state=\{\s*!userKnown\s*\?\s*'loading'/);
    // The loading views return before any note is drawn.
    for (const [View, extra] of [
      [BillingManageView, { currentPlan: 'STANDARD' }],
      [BillingFirstUseView, { selectedPlan: 'STANDARD', allowTrial: true }],
    ]) {
      const markup = renderToStaticMarkup(
        h(View, { state: 'loading', locale: 'ru', plans: PLANS, period: 'MONTHLY', adminOnly: true, ...extra })
      );
      expect(markup).toContain('aria-busy="true"');
      expect(markup).not.toContain('data-billing-admin-only');
    }
  });

  test('the first-use screen offers the trial and «Выберите тариф» only to the one who can pay', () => {
    expect(first).toMatch(/allowTrial=\{canPay && Boolean\(user\?\.allowTrial\)\}/);
    // The unused intro that promised «change or cancel from settings» is gone.
    expect(first).not.toMatch(/billing_choose_plan_intro|PlanIntro/);
    for (const locale of ['ru', 'en']) {
      const view = (adminOnly) =>
        renderToStaticMarkup(
          h(BillingFirstUseView, {
            state: 'default',
            locale,
            plans: PLANS,
            selectedPlan: 'STANDARD',
            period: 'MONTHLY',
            allowTrial: true,
            adminOnly,
          })
        );
      const trial = locale === 'ru' ? 'Пробный период доступен' : 'A trial is available';
      const choose = locale === 'ru' ? 'Выберите тариф' : 'Choose a workspace plan';
      expect(view(false)).toContain(trial);
      expect(view(false)).toContain(choose);
      expect(view(true)).not.toContain(trial);
      expect(view(true)).not.toContain(choose);
      expect(view(true)).toContain(locale === 'ru' ? 'Тарифы рабочего пространства' : 'Workspace plans');
    }
  });

  test('the finish-trial dialog speaks both languages, with no English left in the markup', () => {
    const { finishTrialCopy } = loadTypeScriptModule(
      'apps/frontend/src/components/billing/finish-trial.flow.ts'
    );
    const ru = finishTrialCopy(true);
    const en = finishTrialCopy(false);
    expect(Object.keys(ru)).toEqual(Object.keys(en));
    for (const key of Object.keys(ru)) {
      expect(ru[key]).toMatch(/[а-я]/);
      expect(en[key]).not.toMatch(/[а-яё]/i);
      for (const text of [ru[key], en[key]]) {
        expect(text).not.toMatch(/модел/i);
        // No capitals past the first letter.
        expect(text.slice(1)).toBe(text.slice(1).toLowerCase());
      }
    }
    const dialog = read('apps/frontend/src/components/billing/finish.trial.tsx');
    expect(dialog).not.toMatch(/Finishing Trial|You trial|Close window|Close dialog|aria-label="Close"/);
    for (const key of Object.keys(ru)) expect(dialog).toContain(`words.${key}`);
  });
});

describe('an instance without Stripe shows one card, not tiers (2q28.30)', () => {
  test.each(['ru', 'en'])('unavailable (%s): no tiers, no prices, one plain sentence', (locale) => {
    const markup = renderToStaticMarkup(
      h(BillingManageView, {
        state: 'unavailable',
        locale,
        plans: PLANS,
        currentPlan: 'FREE',
        period: 'MONTHLY',
      })
    );
    expect(markup).toContain('data-billing-view="unavailable"');
    expect(markup).not.toContain('$');
    expect(markup).not.toContain('Standard');
    expect(markup).toMatch(
      locale === 'ru'
        ? /Оплата пока не подключена\. Пока идёт тест, всё доступно без оплаты\./
        : /Payments are not connected yet/
    );
  });

  test('the screen asks nothing of the server when billing is off', () => {
    const screen = read('apps/frontend/src/components/billing/billing.component.tsx');
    expect(screen).toContain("useSWR(billingEnabled ? '/user/subscription/tiers' : null, load)");
    expect(screen).toContain("useSWR(billingEnabled ? '/user/subscription' : null, load)");
    expect(screen).toMatch(/if \(!billingEnabled\) \{\s+return \(\s+<BillingManageView\s+state="unavailable"/);
  });

  test('the tier cards read their features in the screen language', () => {
    const main = read('apps/frontend/src/components/billing/main.billing.component.tsx');
    expect(main).toContain('<BillingFeatures tier={pack} stacked={true} />');
    expect(main).not.toMatch(/'\/month'|'\/year'|AI copilots/);
  });
});
