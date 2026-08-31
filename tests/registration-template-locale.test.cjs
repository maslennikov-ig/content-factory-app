const fs = require('node:fs');
const path = require('node:path');

const localesRoot = path.resolve(
  __dirname,
  '../libraries/react-shared-libraries/src/translation/locales'
);
const requiredKeys = [
  'starter_template_legend',
  'starter_template_blank',
  'starter_template_blank_description',
  'starter_template_content_workflow',
  'starter_template_content_workflow_description',
  'public_saas_template_legend',
  'public_saas_template_blank',
  'public_saas_template_blank_description',
  'public_saas_template_workflow',
  'public_saas_template_workflow_description',
];

test('all sixteen locale bundles carry the complete starter-template copy', () => {
  const files = fs
    .readdirSync(localesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(localesRoot, entry.name, 'translation.json'))
    .filter(fs.existsSync);

  expect(files).toHaveLength(16);
  for (const file of files) {
    const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const key of requiredKeys) {
      expect(messages[key]).toEqual(expect.any(String));
      expect(messages[key].trim()).not.toBe('');
    }
  }
});

test('English and Russian use explicit blank and workflow labels', () => {
  const en = require('../libraries/react-shared-libraries/src/translation/locales/en/translation.json');
  const ru = require('../libraries/react-shared-libraries/src/translation/locales/ru/translation.json');

  expect(en.starter_template_content_workflow).toBe('Content workflow');
  expect(en.starter_template_blank).toBe('Blank workspace');
  expect(ru.starter_template_content_workflow).toBe('Контент-процесс');
  expect(ru.starter_template_blank).toBe('Пустое пространство');
});
