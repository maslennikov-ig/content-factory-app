/**
 * A stand-in for `apps/frontend/src/components/auth/form.errors.ts`.
 *
 * Several suites compile one `.tsx` component and hand it a table of mocked
 * imports. The shared refusal helper is `.ts`, which those bespoke loaders
 * cannot resolve, so every one of them needs a stub — and four copies of the
 * same three functions is exactly the duplication the helper itself exists to
 * remove. Its own behaviour is proved in `tests/auth-form-errors.test.cjs`;
 * here it only has to be present and predictable, so a suite asserting on a
 * message can recognise it.
 */
const formErrorsMock = {
  parseRequestFailure: async (response) => ({
    status: response.status,
    fields: {},
    raw: typeof response.text === 'function' ? await response.text() : '',
  }),
  // The identity is deliberate: a component under test should show whatever
  // the helper hands back, and a suite checking a class-validator message can
  // still see it.
  useFieldErrorMessage: () => (_field, message) => message,
  useRequestErrorMessage: () => (failure) => `refused:${failure.status}`,
};

module.exports = { formErrorsMock };
