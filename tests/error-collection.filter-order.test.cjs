/**
 * Global exception filters are dispatched in the order they were registered.
 * `ApplicationConfig.getGlobalFilters()` hands the array back unreversed, and
 * `selectExceptionFilterMetadata` takes the first filter whose `@Catch()` list
 * matches — a filter declared `@Catch()` with no types matches everything and
 * nothing is tried after it.
 *
 * The error collector's `SentryGlobalFilter` is exactly that filter. Registered
 * before the product's three, it answers for all of them, and three responses
 * change without a single error being logged: the 401 that clears the auth
 * cookie becomes a bare 403, the upgrade dialog loses the text it renders, and
 * a post validation failure loses its message. All of it switches on the day
 * the two collector variables are set, which is why it is guarded here rather
 * than left to be noticed in production.
 *
 * This runs Nest's own selection over the real filter instances, in the order
 * read out of `apps/backend/src/main.ts`.
 */
require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { ApplicationConfig } = require('@nestjs/core');
const { FILTER_CATCH_EXCEPTIONS } = require('@nestjs/common/constants');
const {
  selectExceptionFilterMetadata,
} = require('@nestjs/common/utils/select-exception-filter-metadata.util');
const { SentryGlobalFilter } = require('@sentry/nestjs/setup');
const { HttpStatus } = require('@nestjs/common');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

const removedAuthFor = [];

// One instance per file. Loading a module twice would give two classes of the
// same name, and `exception instanceof Metatype` — which is the whole
// mechanism under test — would answer false for reasons that have nothing to
// do with the product.
const moduleCache = new Map();

function loadModule(relativePath) {
  const cached = moduleCache.get(relativePath);
  if (cached) return cached;

  const filename = path.join(root, relativePath);
  const compiled = ts.transpileModule(read(relativePath), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      // `@Catch()` writes the metadata this whole file reads back.
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText;

  const loaded = { exports: {} };
  moduleCache.set(relativePath, loaded.exports);
  const localRequire = (request) => {
    if (request === '@contentfactory/backend/services/auth/auth.middleware') {
      // The only reason exception.filter.ts pulls in the middleware, and the
      // effect the 403 answer silently drops.
      return { removeAuth: (response) => removedAuthFor.push(response) };
    }
    if (request.startsWith('@contentfactory/backend/')) {
      return loadModule(
        `apps/backend/src/${request.slice(
          '@contentfactory/backend/'.length
        )}.ts`
      );
    }
    return require(request);
  };

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

const { SubscriptionExceptionFilter } = loadModule(
  'apps/backend/src/services/auth/permissions/subscription.exception.ts'
);
const { SubscriptionException, Sections, AuthorizationActions } = loadModule(
  'apps/backend/src/services/auth/permissions/permission.exception.class.ts'
);
const { PostValidationExceptionFilter, PostValidationException } = loadModule(
  'apps/backend/src/api/routes/posts.validation.exception.ts'
);
const { HttpExceptionFilter, HttpForbiddenException } = loadModule(
  'libraries/nestjs-libraries/src/services/exception.filter.ts'
);

const httpAdapter = {
  reply: () => undefined,
  isHeadersSent: () => false,
  end: () => undefined,
};

const filterByName = () => ({
  SubscriptionExceptionFilter: new SubscriptionExceptionFilter(),
  PostValidationExceptionFilter: new PostValidationExceptionFilter(),
  HttpExceptionFilter: new HttpExceptionFilter(),
  SentryGlobalFilter: new SentryGlobalFilter(httpAdapter),
});

/**
 * The registration order as `main.ts` actually writes it, comments stripped so
 * prose about the order cannot be mistaken for the order.
 */
function registrationOrderFromMain() {
  const source = read('apps/backend/src/main.ts').replace(/^\s*\/\/.*$/gm, '');
  const pattern =
    /app\.useGlobalFilters\(new (\w+)\(\)\)|setupSentryErrorHandler\(app\)/g;
  const order = [];
  for (const match of source.matchAll(pattern)) {
    order.push(match[1] ?? 'SentryGlobalFilter');
  }
  return order;
}

/** What Nest builds internally out of a list of global filter instances. */
function dispatchTable(order, instances) {
  const config = new ApplicationConfig();
  for (const name of order) config.useGlobalFilters(instances[name]);

  return config.getGlobalFilters().map((instance) => ({
    name: instance.constructor.name,
    instance,
    exceptionMetatypes:
      Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, instance.constructor) || [],
  }));
}

function makeResponse() {
  const recorded = { status: undefined, body: undefined, sent: false };
  const response = {
    status(code) {
      recorded.status = code;
      return response;
    },
    json(body) {
      recorded.body = body;
      return response;
    },
    send(body) {
      recorded.sent = true;
      recorded.body = body;
      return response;
    },
  };
  return { response, recorded };
}

const hostFor = (response) => ({
  getType: () => 'http',
  switchToHttp: () => ({
    getResponse: () => response,
    getRequest: () => ({ url: '/posts', headers: {} }),
    getNext: () => () => undefined,
  }),
});

function answerFor(order, exception) {
  const table = dispatchTable(order, filterByName());
  const selected = selectExceptionFilterMetadata(table, exception);
  const { response, recorded } = makeResponse();
  return { selected, response, recorded };
}

const subscriptionLimit = () =>
  new SubscriptionException({
    section: Sections.POSTS_PER_MONTH,
    action: AuthorizationActions.Create,
  });
const postValidation = () =>
  new PostValidationException({
    provider: 'x',
    name: 'X',
    error: 'A post on X cannot be longer than 280 characters.',
  });

describe('the collector filter is registered last and answers only what nothing else claims', () => {
  test('main.ts registers the three product filters before the collector', () => {
    expect(registrationOrderFromMain()).toEqual([
      'SubscriptionExceptionFilter',
      'PostValidationExceptionFilter',
      'HttpExceptionFilter',
      'SentryGlobalFilter',
    ]);
  });

  test('SentryGlobalFilter declares no exception types, so its position decides everything', () => {
    const table = dispatchTable(['SentryGlobalFilter'], filterByName());
    expect(table[0].exceptionMetatypes).toEqual([]);
  });

  test.each([
    [
      'HttpForbiddenException',
      () => new HttpForbiddenException(),
      'HttpExceptionFilter',
    ],
    ['SubscriptionException', subscriptionLimit, 'SubscriptionExceptionFilter'],
    [
      'PostValidationException',
      postValidation,
      'PostValidationExceptionFilter',
    ],
  ])('Nest selects the product filter for %s', (_name, make, expected) => {
    const { selected } = answerFor(registrationOrderFromMain(), make());
    expect(selected.name).toBe(expected);
  });

  test('anything the product does not claim still reaches the collector', () => {
    const { selected } = answerFor(
      registrationOrderFromMain(),
      new Error('unclaimed')
    );
    expect(selected.name).toBe('SentryGlobalFilter');
  });

  test('a forbidden request answers 401 and clears the auth cookie', () => {
    removedAuthFor.length = 0;
    const { selected, response, recorded } = answerFor(
      registrationOrderFromMain(),
      new HttpForbiddenException()
    );
    selected.instance.catch(new HttpForbiddenException(), hostFor(response));

    expect(recorded.status).toBe(401);
    expect(recorded.sent).toBe(true);
    expect(removedAuthFor).toEqual([response]);
  });

  test('a plan limit answers 402 with the text the upgrade dialog renders', () => {
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://app.invalid';
    try {
      const { selected, response, recorded } = answerFor(
        registrationOrderFromMain(),
        subscriptionLimit()
      );
      selected.instance.catch(subscriptionLimit(), hostFor(response));

      expect(recorded.status).toBe(HttpStatus.PAYMENT_REQUIRED);
      expect(recorded.body).toEqual({
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: expect.stringContaining('maximum number of posts'),
        url: 'https://app.invalid/billing',
      });
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });

  test('a rejected post answers 400 carrying the validation message', () => {
    const { selected, response, recorded } = answerFor(
      registrationOrderFromMain(),
      postValidation()
    );
    selected.instance.catch(postValidation(), hostFor(response));

    expect(recorded.status).toBe(HttpStatus.BAD_REQUEST);
    expect(recorded.body).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      provider: 'x',
      name: 'X',
      message: 'A post on X cannot be longer than 280 characters.',
    });
  });

  /**
   * The control. Without it the four tests above would keep passing if the
   * dispatch model here were wrong, and would prove nothing about the order.
   */
  test('registering the collector first would swallow all three', () => {
    const swallowed = [
      'SentryGlobalFilter',
      'SubscriptionExceptionFilter',
      'PostValidationExceptionFilter',
      'HttpExceptionFilter',
    ];
    for (const exception of [
      new HttpForbiddenException(),
      subscriptionLimit(),
      postValidation(),
    ]) {
      const { selected } = answerFor(swallowed, exception);
      expect(selected.name).toBe('SentryGlobalFilter');
    }
  });
});
