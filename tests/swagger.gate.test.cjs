const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(relativePath, mocks = {}) {
  const filename = path.join(repositoryRoot, relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);

  new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  )(loaded.exports, localRequire, loaded, filename, path.dirname(filename));
  return loaded.exports;
}

const SWAGGER_MODULE = 'libraries/helpers/src/swagger/load.swagger.ts';

const enableSwagger = (on) => {
  if (on) {
    process.env.CONTENT_FACTORY_SWAGGER_ENABLED = 'true';
  } else {
    delete process.env.CONTENT_FACTORY_SWAGGER_ENABLED;
  }
};

beforeEach(() => {
  enableSwagger(false);
});

afterAll(() => {
  enableSwagger(false);
});

describe('the swagger switch', () => {
  test('an unset variable publishes nothing', () => {
    const setup = jest.fn();
    const createDocument = jest.fn(() => ({}));
    const { loadSwagger } = loadTypeScriptModule(SWAGGER_MODULE, {
      '@nestjs/swagger': {
        SwaggerModule: { setup, createDocument },
        DocumentBuilder: class {
          setTitle() {
            return this;
          }
          setDescription() {
            return this;
          }
          setVersion() {
            return this;
          }
          build() {
            return {};
          }
        },
      },
    });

    loadSwagger({});

    expect(setup).not.toHaveBeenCalled();
    // Building the document walks every controller in the application. An
    // instance that does not publish the routes should not pay for describing
    // them either.
    expect(createDocument).not.toHaveBeenCalled();
  });

  test('the explicit variable publishes it', () => {
    enableSwagger(true);
    const setup = jest.fn();
    const createDocument = jest.fn(() => ({ openapi: '3.0.0' }));
    const { loadSwagger } = loadTypeScriptModule(SWAGGER_MODULE, {
      '@nestjs/swagger': {
        SwaggerModule: { setup, createDocument },
        DocumentBuilder: class {
          setTitle() {
            return this;
          }
          setDescription() {
            return this;
          }
          setVersion() {
            return this;
          }
          build() {
            return {};
          }
        },
      },
    });

    const app = {};
    loadSwagger(app);

    expect(createDocument).toHaveBeenCalledWith(app, expect.any(Object));
    expect(setup).toHaveBeenCalledWith('docs', app, { openapi: '3.0.0' });
  });

  test('only the exact string turns it on', () => {
    const { swaggerEnabled } = loadTypeScriptModule(SWAGGER_MODULE, {
      '@nestjs/swagger': { SwaggerModule: {}, DocumentBuilder: class {} },
    });

    for (const value of ['false', 'FALSE', '1', 'yes', 'True', 'on', '']) {
      process.env.CONTENT_FACTORY_SWAGGER_ENABLED = value;
      expect(swaggerEnabled()).toBe(false);
    }

    process.env.CONTENT_FACTORY_SWAGGER_ENABLED = 'true';
    expect(swaggerEnabled()).toBe(true);
  });

  test('no neighbouring variable switches it on', () => {
    const { swaggerEnabled } = loadTypeScriptModule(SWAGGER_MODULE, {
      '@nestjs/swagger': { SwaggerModule: {}, DocumentBuilder: class {} },
    });

    // A shared switch is how the Dub and billing trackers came up together off
    // one Stripe key. This one answers to its own variable and nothing else.
    const neighbours = {
      NODE_ENV: 'development',
      SWAGGER_ENABLED: 'true',
      CONTENT_FACTORY_REQUIRE_APPROVAL: 'true',
      IS_GENERAL: 'true',
    };
    const saved = {};
    for (const [name, value] of Object.entries(neighbours)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }

    expect(swaggerEnabled()).toBe(false);

    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
});

// `SwaggerModule.setup('docs', ...)` serves three paths, not one. Asserting on
// the mock only proves the call was skipped; these boot a real Nest express
// application and ask the server itself.
describe('what the running server answers', () => {
  const paths = ['/docs', '/docs-json', '/docs-yaml'];

  const bootWithSwagger = async () => {
    const { NestFactory } = require('@nestjs/core');
    const { Module } = require('@nestjs/common');
    // No mocks: the real @nestjs/swagger registers the real routes.
    const { loadSwagger } = loadTypeScriptModule(SWAGGER_MODULE);

    class AppModule {}
    Module({ imports: [], controllers: [], providers: [] })(AppModule);

    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    loadSwagger(app);
    await app.listen(0);
    const port = app.getHttpServer().address().port;

    const statuses = {};
    for (const route of paths) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        redirect: 'manual',
      });
      statuses[route] = response.status;
    }

    await app.close();
    return statuses;
  };

  test('all three documentation paths are absent while the variable is unset', async () => {
    const statuses = await bootWithSwagger();

    for (const route of paths) {
      expect({ route, status: statuses[route] }).toEqual({
        route,
        status: 404,
      });
    }
  }, 30000);

  test('all three answer once the variable is set', async () => {
    enableSwagger(true);
    const statuses = await bootWithSwagger();

    for (const route of paths) {
      expect({ route, status: statuses[route] }).toEqual({
        route,
        status: 200,
      });
    }
  }, 30000);
});
