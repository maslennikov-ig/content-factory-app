'use strict';

/**
 * `content-factory-next-fn33.49`: сохранение поста, которое сервер отклонил.
 *
 * Две половины одной поломки. На сервере отказ хранилища (`{code, message,
 * status}`) уходил наружу как «Internal server error» 500, потому что Nest
 * знает только `HttpException`. На экране окно закрывалось одинаково после
 * успеха и после отказа, так что человек видел «сохранено», а черновика не
 * было нигде.
 *
 * Сам отказ по чужому посту проверяет `post.content-context.test.cjs` (там же
 * доказано, что новый пост с клиентским id теперь создаётся). Здесь — только
 * дорога отказа до человека.
 */

require('reflect-metadata');

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const modalPath = path.join(
  root,
  'apps/frontend/src/components/new-launch/manage.modal.tsx'
);
const modalSource = fs.readFileSync(modalPath, 'utf8');
const helperSource = fs.readFileSync(
  path.join(root, 'apps/frontend/src/components/new-launch/post-save-error.ts'),
  'utf8'
);

const loadController = () =>
  loadTypeScriptModule(
    'apps/backend/src/api/routes/posts.controller.ts',
    {
      '@prisma/client': {},
      express: {},
      '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
        PostsService: class {},
      },
      '@contentfactory/nestjs-libraries/agent/agent.graph.service': {
        AgentGraphService: class {},
      },
      '@contentfactory/nestjs-libraries/short-linking/short.link.service': {
        ShortLinkService: class {},
      },
      '@contentfactory/nestjs-libraries/user/org.from.request': {
        GetOrgFromRequest: () => () => undefined,
      },
      '@contentfactory/nestjs-libraries/user/user.from.request': {
        GetUserFromRequest: () => () => undefined,
      },
      '@contentfactory/backend/services/auth/permissions/permissions.ability': {
        CheckPolicies: () => () => undefined,
      },
      '@contentfactory/backend/services/auth/permissions/permission.exception.class':
        {
          AuthorizationActions: { Create: 'create', Read: 'read' },
          Sections: { POSTS_PER_MONTH: 'posts_per_month' },
        },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto': {
        GetPostsDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/get.posts.list.dto': {
        GetPostsListDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/posts/create.tag.dto': {
        CreateTagDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/generator/generator.dto': {
        GeneratorDto: class {},
      },
      '@contentfactory/nestjs-libraries/dtos/generator/create.generated.posts.dto':
        { CreateGeneratedPostsDto: class {} },
      '@contentfactory/backend/api/routes/posts.validation.exception': {
        PostValidationException: class PostValidationException extends Error {},
      },
    }
  ).PostsController;

const controllerWith = (failure) => {
  const { PostsController } = { PostsController: loadController() };
  const service = {
    validatePosts: async () => [
      {
        id: 'channel-a',
        identifier: 'telegram',
        name: 'Telegram',
        valid: true,
        errors: true,
        emptyContent: false,
        tooLong: false,
      },
    ],
    mapTypeToPost: async (raw) => raw,
    createPost: async () => {
      throw failure;
    },
  };
  return new PostsController(service, {}, {});
};

const draft = {
  type: 'draft',
  posts: [
    {
      integration: { id: 'channel-a' },
      group: 'utVLUeBV7d',
      settings: {},
      value: [{ id: 'xumBniSw3J', content: 'Черновик', delay: 0, image: [] }],
    },
  ],
};

describe('a refused save answers with its own status, not 500', () => {
  test('a 404 refusal reaches the client as 404 with its code and message', async () => {
    const refusal = Object.assign(new Error('Post was not found'), {
      code: 'POST_NOT_FOUND',
      status: 404,
    });
    const controller = controllerWith(refusal);

    const thrown = await controller
      .createPost({ id: 'org-a' }, draft)
      .then(() => null)
      .catch((error) => error);

    expect(thrown).toBeTruthy();
    expect(typeof thrown.getStatus).toBe('function');
    expect(thrown.getStatus()).toBe(404);
    expect(thrown.getResponse()).toEqual({
      code: 'POST_NOT_FOUND',
      message: 'Post was not found',
    });
  });

  test('a 409 refusal keeps its own status too', async () => {
    const refusal = Object.assign(
      new Error('Content intelligence output can only update a draft'),
      { code: 'CONTENT_CONTEXT_DRAFT_ONLY', status: 409 }
    );

    const thrown = await controllerWith(refusal)
      .createPost({ id: 'org-a' }, draft)
      .then(() => null)
      .catch((error) => error);

    expect(thrown.getStatus()).toBe(409);
  });

  test('a real fault is rethrown untouched, so it is still a logged 500', async () => {
    const fault = new Error('connection terminated unexpectedly');

    const thrown = await controllerWith(fault)
      .createPost({ id: 'org-a' }, draft)
      .then(() => null)
      .catch((error) => error);

    expect(thrown).toBe(fault);
    expect(thrown.getStatus).toBeUndefined();
  });
});

describe('the compose window survives a refused save', () => {
  // The component itself pulls in half the editor; only the message helper is
  // needed here, so it is compiled out of the same file rather than mocked
  // into existence.
  // Файл намеренно без единого импорта (см. его шапку), поэтому он
  // компилируется целиком, а не вырезается по одной функции: с
  // `content-factory-next-fn33.28.8` помощник читает соседнюю таблицу кодов, и
  // вырезанная в одиночку функция про неё бы не знала.
  const helper = (() => {
    expect(helperSource).not.toMatch(/^\s*import\s/m);
    const compiled = require('typescript').transpileModule(helperSource, {
      compilerOptions: { module: 1, target: 7 },
    }).outputText;
    const module = { exports: {} };
    new Function('exports', 'module', compiled)(module.exports, module);
    return module.exports;
  })();
  const postSaveErrorMessage = (...args) =>
    helper.postSaveErrorMessage(...args);

  const t = (key, fallback, values) =>
    Object.entries(values || {}).reduce(
      (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
      fallback
    );

  test('a code the window knows is told in the window language, not the server one', async () => {
    // `content-factory-next-fn33.28.8`: сервер прислал английский `message`, а
    // на экране должен оказаться текст по ключу — язык знает только клиент.
    const message = await postSaveErrorMessage(
      { json: async () => ({ code: 'POST_NOT_FOUND', message: 'Post was not found' }) },
      t
    );
    expect(message).toBe(
      'The post was not saved: This post was not found. It may have already been deleted.'
    );
  });

  test('a code the window does not know still says what the server said', async () => {
    const message = await postSaveErrorMessage(
      {
        json: async () => ({
          code: 'SOMETHING_NEW_ON_THE_SERVER',
          message: 'A refusal nobody has translated yet',
        }),
      },
      t
    );
    expect(message).toBe(
      'The post was not saved: A refusal nobody has translated yet'
    );
  });

  test('a body with nothing readable in it falls back to a plain sentence', async () => {
    for (const response of [
      { json: async () => ({ statusCode: 500, message: 'Internal server error' }) },
      { json: async () => ({}) },
      {
        json: async () => {
          throw new Error('not json');
        },
      },
    ]) {
      expect(await postSaveErrorMessage(response, t)).toBe(
        'The post was not saved, please try again'
      );
    }
  });

  test('a 402 without a code stays silent: the plan refusal is already on screen', async () => {
    const response = {
      status: 402,
      json: async () => ({ section: 'ai', action: 'create', message: 'x' }),
    };
    expect(await postSaveErrorMessage(response, t)).toBe('');
  });

  test('a 402 with a named code is still spoken here: the shared modal skips coded bodies', async () => {
    const response = {
      status: 402,
      json: async () => ({ code: 'SOME_NAMED_REFUSAL', message: 'Named refusal' }),
    };
    expect(await postSaveErrorMessage(response, t)).toBe(
      'The post was not saved: Named refusal'
    );
  });

  test('an unsuccessful answer shows the message and returns before closing', () => {
    const save = modalSource.slice(modalSource.indexOf("await fetch('/posts'"));
    const refusal = save.indexOf('if (!response.ok)');
    const closing = save.indexOf('modal.closeAll()');

    expect(refusal).toBeGreaterThan(-1);
    expect(closing).toBeGreaterThan(refusal);

    // Ветка отказа кончается своим `return;` — внутри неё теперь есть
    // вложенный блок, и первая закрывающая скобка уже не её.
    const branch = save.slice(
      refusal,
      save.indexOf('return;', refusal) + 'return;'.length
    );
    // Отказ проходит через postSaveErrorMessage и показывается тостом, когда
    // есть что показать: на 402 помощник молчит, предел тарифа уже назвала
    // общая модалка (content-factory-next-nkei).
    expect(branch).toMatch(/await postSaveErrorMessage\(response, t\)/);
    expect(branch).toMatch(/if \(refusal\) \{\s*toaster\.show\(refusal, 'warning'\)/);
    expect(branch).toMatch(/setLoading\(false\)/);
    expect(branch).toMatch(/return;/);
  });

  test('the success toast is inside the branch the refusal returns from', () => {
    const save = modalSource.slice(modalSource.indexOf("await fetch('/posts'"));
    expect(save.indexOf('if (!response.ok)')).toBeLessThan(
      save.indexOf('added_successfully')
    );
  });
});
