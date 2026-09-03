const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontendSource = path.join(root, 'apps/frontend/src');
const clientRoot = path.join(frontendSource, 'instrumentation-client.ts');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

describe('client DTO metadata bootstrap', () => {
  test('a root client entry initializes metadata for every client DTO import', () => {
    const dtoImporters = sourceFiles(frontendSource).filter((file) =>
      /from ['"]@contentfactory\/nestjs-libraries\/dtos\//.test(
        fs.readFileSync(file, 'utf8')
      )
    );

    expect(dtoImporters).toEqual(
      expect.arrayContaining([
        path.join(frontendSource, 'components/settings/teams.component.tsx'),
      ])
    );
    expect(fs.readFileSync(clientRoot, 'utf8')).toMatch(
      /^import ['"]reflect-metadata['"];$/m
    );
  });
});
