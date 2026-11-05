const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/launches'});
for (const key of ['window', 'document', 'navigator', 'HTMLElement']) Object.defineProperty(global, key, {configurable: true, value: key === 'window' ? dom.window : dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const {render, screen, fireEvent, cleanup, act} = require('@testing-library/react');
const {useForm, FormProvider, useFormContext} = require('react-hook-form');
const {classValidatorResolver} = require('@hookform/resolvers/class-validator');
const {validate} = require('class-validator');
const i18next = require('i18next');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const {TikTokDto: ActualTikTokDto} = loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/posts/providers-settings/tiktok.dto.ts');
const h = React.createElement;
let metadata, form, language = 'en';
const locales = Object.fromEntries(['en', 'ru'].map(locale => [locale, {translation: require(`../libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`)}]));
const t = (key, fallback) => locales[language].translation[key] ?? fallback;
const creator = (change = {}) => ({creatorNickname: 'Synthetic owner', privacyLevelOptions: ['SELF_ONLY'],
  commentDisabled: true, duetDisabled: true, stitchDisabled: false, maxVideoDurationSeconds: 300, ...change});
const swr = jest.fn(() => metadata);
const nativeControl = type => React.forwardRef(({label, children, ...props}, ref) =>
  h('label', null, label, h(type, {...props, ref}, children)));
const {default: Settings} = loadTypeScriptModule('apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx', {
  '@contentfactory/frontend/components/new-launch/providers/high.order.provider': {PostComment: {COMMENT: 'comment'}, withProvider: value => value.SettingsComponent},
  '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto': {TikTokDto: class {}},
  '@contentfactory/frontend/components/launches/helpers/use.values': {useSettings: useFormContext},
  '@contentfactory/frontend/components/launches/helpers/use.integration': {useIntegration: () => ({integration: {id: 'synthetic-channel'}, value: [{image: [{path: 'https://example.com/owned.mp4'}]}]})},
  '@contentfactory/react/form/select': {Select: nativeControl('select')},
  '@contentfactory/react/form/checkbox.field': {CheckboxField: React.forwardRef(({label, ...props}, ref) => h('label', null, label, h('input', {...props, ref, type: 'checkbox'})))},
  '@contentfactory/react/form/input': {Input: nativeControl('input')},
  '@contentfactory/react/form/button': {Button: ({children, variant, density, ...props}) => h('button', props, children)},
  '@contentfactory/react/translation/get.transation.service.client': {useT: () => t},
  '@contentfactory/frontend/components/new-launch/providers/tiktok/tiktok.preview': {},
  '@contentfactory/helpers/utils/custom.fetch': {useFetch: () => async () => {throw Error('No real request in component fixture');}},
  swr: {__esModule: true, default: swr},
});
function Harness({values = {}, validateSettings = false}) {
  form = useForm({defaultValues: {content_posting_method: 'DIRECT_POST', ...values},
    ...(validateSettings ? {resolver: classValidatorResolver(ActualTikTokDto)} : {})});
  return h(FormProvider, {...form}, h(Settings));
}
beforeEach(() => {language = 'en'; metadata = {data: creator(), isLoading: false, isValidating: false, mutate: jest.fn()}; swr.mockClear();});
afterEach(cleanup);

test('fresh TikTok settings offer only the current account options and never select privacy or comments automatically', async () => {
  await act(async () => render(h(Harness)));
  const select = screen.getByLabelText('Who can see this video?');
  expect([...select.options].map(option => option.value)).toEqual(['', 'SELF_ONLY']);
  expect(select.value).toBe(''); expect(form.getValues('privacy_level')).toBe('');
  expect(screen.getByLabelText('Allow Comments').checked).toBe(false);
  expect(screen.getByLabelText('Allow Comments').disabled).toBe(true);
  expect(screen.getByLabelText('Allow Duet').disabled).toBe(true);
  expect(screen.getByText('Synthetic owner')).toBeDefined();
  await act(async () => fireEvent.change(select, {target: {value: 'SELF_ONLY'}}));
  expect(form.getValues('privacy_level')).toBe('SELF_ONLY');
});

test('stale unavailable privacy is cleared without selecting another option and forbidden saved interactions are unchecked', async () => {
  await act(async () => render(h(Harness, {values: {privacy_level: 'PUBLIC_TO_EVERYONE', comment: true, duet: true}})));
  expect(form.getValues('privacy_level')).toBe(''); expect(form.getValues('comment')).toBe(false); expect(form.getValues('duet')).toBe(false);
  expect(screen.getByLabelText('Who can see this video?').value).toBe('');
});

test('current allowed saved privacy remains unchanged', async () => {
  await act(async () => render(h(Harness, {values: {privacy_level: 'SELF_ONLY'}})));
  expect(form.getValues('privacy_level')).toBe('SELF_ONLY');
});

test('every Direct Post shows Music Usage Confirmation and the current video limit before commercial disclosure is enabled', async () => {
  await act(async () => render(h(Harness)));
  expect(screen.getByRole('link', {name: 'Music Usage Confirmation'}).getAttribute('href')).toBe('https://www.tiktok.com/legal/page/global/music-usage-confirmation/en');
  expect(screen.queryByRole('link', {name: 'Branded Content Policy'})).toBeNull();
  expect(screen.getByText(/≤ 300/)).toBeDefined();
});

test('branded content removes private visibility without choosing a public audience, and clearing disclosure clears both brand flags', async () => {
  metadata.data = creator({privacyLevelOptions: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE']});
  await act(async () => render(h(Harness, {values: {privacy_level: 'SELF_ONLY', disclose: true}})));
  await act(async () => fireEvent.click(screen.getByLabelText('Branded content')));
  const select = screen.getByLabelText('Who can see this video?');
  expect(form.getValues('privacy_level')).toBe(''); expect(select.value).toBe('');
  expect([...select.options].map(option => option.value)).toEqual(['', 'PUBLIC_TO_EVERYONE']);
  expect(screen.getByRole('link', {name: 'Branded Content Policy'}).getAttribute('href')).toBe('https://www.tiktok.com/legal/page/global/bc-policy/en');
  await act(async () => fireEvent.click(screen.getByLabelText('Your brand')));
  await act(async () => fireEvent.click(screen.getByLabelText('Disclose Video Content')));
  expect(form.getValues('brand_content_toggle')).toBe(false); expect(form.getValues('brand_organic_toggle')).toBe(false);
});

test('actual form and server validation reject empty commercial disclosure and private branded content', async () => {
  metadata.data = creator({privacyLevelOptions: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE']});
  await act(async () => render(h(Harness, {values: {privacy_level: 'PUBLIC_TO_EVERYONE', disclose: true}, validateSettings: true})));
  let valid; await act(async () => {valid = await form.trigger();}); expect(valid).toBe(false);
  await act(async () => fireEvent.click(screen.getByLabelText('Your brand')));
  await act(async () => {valid = await form.trigger();}); expect(valid).toBe(true);
  const values = form.getValues();
  const errors = await validate(Object.assign(new ActualTikTokDto(), {...values, privacy_level: 'SELF_ONLY', brand_content_toggle: true}));
  expect(errors.some(error => error.constraints?.validTikTokDisclosure)).toBe(true);
  expect(await validate(Object.assign(new ActualTikTokDto(), {...values, content_posting_method: 'UPLOAD', privacy_level: 'SELF_ONLY', brand_content_toggle: true}))).toEqual([]);
});

test.each(['en', 'ru'])('unavailable account state is actionable in %s and cannot expose a static privacy fallback', async locale => {
  language = locale; metadata = {error: Error('Synthetic unavailable'), mutate: jest.fn()};
  await act(async () => render(h(Harness)));
  expect(screen.getByText(locales[locale].translation.validation_tiktok_account_unavailable)).toBeDefined();
  const select = screen.getByLabelText(t('label_who_can_see_this_video'));
  expect(select.disabled).toBe(true); expect([...select.options].map(option => option.value)).toEqual(['']);
  fireEvent.click(screen.getByText(locales[locale].translation.try_again)); expect(metadata.mutate).toHaveBeenCalledTimes(1);
});

test('UPLOAD preserves its stored fields and makes no creator-info request', async () => {
  metadata = {};
  await act(async () => render(h(Harness, {values: {content_posting_method: 'UPLOAD', privacy_level: 'SELF_ONLY', comment: true}})));
  expect(swr.mock.calls.every(call => call[0] === null)).toBe(true);
  expect(form.getValues('privacy_level')).toBe('SELF_ONLY'); expect(form.getValues('comment')).toBe(true);
  expect(screen.queryByRole('link', {name: 'Music Usage Confirmation'})).toBeNull();
});

test('a fresh UPLOAD form and the actual server DTO both validate without inventing privacy', async () => {
  metadata = {};
  await act(async () => render(h(Harness, {values: {content_posting_method: 'UPLOAD'}, validateSettings: true})));
  let valid;
  await act(async () => {valid = await form.trigger();});
  expect(valid).toBe(true);
  const values = form.getValues();
  expect(values.privacy_level).toBe('');
  expect(await validate(Object.assign(new ActualTikTokDto(), values))).toEqual([]);
  expect(swr.mock.calls.every(call => call[0] === null)).toBe(true);
  for (const privacy_level of ['', undefined, 'PUBLIC']) {
    const errors = await validate(Object.assign(new ActualTikTokDto(), {...values, content_posting_method: 'DIRECT_POST', privacy_level}));
    expect(errors.some(error => error.property === 'privacy_level')).toBe(true);
  }
  expect(await validate(Object.assign(new ActualTikTokDto(), {...values, content_posting_method: 'DIRECT_POST', privacy_level: 'SELF_ONLY'}))).toEqual([]);
});

test('existing validation and notification translators localize the exact TikTok messages without leaking provider payloads', async () => {
  const {translateValidationMessage} = loadTypeScriptModule('apps/frontend/src/components/new-launch/validation-message.text.ts');
  const {translateNotification} = loadTypeScriptModule('apps/frontend/src/components/notifications/notification.text.ts');
  for (const locale of ['en', 'ru']) {
    const i18n = i18next.createInstance(); await i18n.init({lng: locale, fallbackLng: false, initImmediate: false, resources: locales});
    const translate = (key, fallback, values) => i18n.t(key, {defaultValue: fallback, ...values});
    for (const key of ['validation_tiktok_privacy_required', 'validation_tiktok_account_unavailable', 'validation_tiktok_interactions_changed', 'validation_tiktok_disclosure_invalid', 'validation_tiktok_duration_invalid']) {
      const english = locales.en.translation[key], expected = locales[locale].translation[key];
      expect(translateValidationMessage(english, translate)).toBe(expected);
      expect(translateNotification(`An error occurred while posting on tiktok: ${english}`, translate)).toContain(expected);
    }
  }
});
