const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('content intelligence module registration', () => {
  test('exports the accepted backend services from the global database module', () => {
    const moduleSource = read(
      'libraries/nestjs-libraries/src/database/prisma/database.module.ts'
    );

    for (const provider of [
      'BrandProfileRepository',
      'BrandProfileContextService',
      'BrandProfileService',
      'ContentSourceRegistryRepository',
      'SourceFetchGateway',
      'ContentSourceRegistryService',
      'ContentContextRepository',
      'ContentContextBuilderV1',
      'ContentContextService',
      'ContentFactRepository',
      'ContentFactService',
    ]) {
      expect(moduleSource).toMatch(
        new RegExp(`import \\{ ${provider} \\} from`)
      );
      expect(moduleSource).toMatch(new RegExp(`\\n    ${provider},`));
    }
  });

  test('puts both controllers behind the authenticated API middleware', () => {
    const moduleSource = read('apps/backend/src/api/api.module.ts');
    const authenticatedBlock = moduleSource.slice(
      moduleSource.indexOf('const authenticatedController = ['),
      moduleSource.indexOf(
        '];',
        moduleSource.indexOf('const authenticatedController = [')
      )
    );

    for (const controller of [
      'BrandProfileController',
      'ContentSourceController',
      'ContentContextController',
    ]) {
      expect(moduleSource).toMatch(
        new RegExp(`import \\{ ${controller} \\} from`)
      );
      expect(authenticatedBlock).toContain(`  ${controller},`);
    }

    expect(moduleSource).toContain(
      'consumer.apply(AuthMiddleware).forRoutes(...authenticatedController)'
    );
  });
});
