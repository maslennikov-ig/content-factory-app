'use strict';

/**
 * `content-factory-next-fn33.148` — пустая ячейка календаря в пространстве,
 * где нет ни одного канала.
 *
 * На боевом прогоне 05.09.2026 одна и та же ячейка отвечала двум ролям
 * по-разному и ни одной — понятно: редактор получал всплывашку «Канал
 * подключает администратор», администратор — сразу каталог «Добавить канал».
 * Окно поста не открывалось никому, хотя календарь рисует этапы «План /
 * Пишется / Проверка» и тем самым обещает работу с черновиками до всякой
 * публикации.
 *
 * Черновик без канала сегодня невозможен на уровне данных, и это здесь
 * закреплено: `Post.integrationId` в `schema.prisma` обязателен, а
 * `Post.integration` в `create.post.dto.ts` несёт `@IsDefined()`. Пока это
 * так, честный ответ — карточка, а не открытое окно и не всплывашка. Вопрос
 * «нужен ли черновик без канала вовсе» отдан владельцу отдельной задачей.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, screen } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const NOTICE = 'apps/frontend/src/components/launches/no-channel.notice.tsx';
const CALENDAR = 'apps/frontend/src/components/launches/calendar.tsx';
const SCHEMA = 'libraries/nestjs-libraries/src/database/prisma/schema.prisma';
const POST_DTO = 'libraries/nestjs-libraries/src/dtos/posts/create.post.dto.ts';

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const notice = loadTypeScriptModule(NOTICE);
const variables = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/helpers/variable.context.tsx'
);
const i18next = loadTypeScriptModule(
  'libraries/react-shared-libraries/src/translation/i18next.ts'
).default;

const russian = JSON.parse(
  read(
    'libraries/react-shared-libraries/src/translation/locales/ru/translation.json'
  )
);
const english = JSON.parse(
  read(
    'libraries/react-shared-libraries/src/translation/locales/en/translation.json'
  )
);

const renderNotice = async (props, language = 'ru') => {
  await act(async () => {
    await i18next.changeLanguage(language);
  });
  await act(async () => {
    render(
      React.createElement(
        variables.VariableContextComponent,
        { language },
        React.createElement(notice.NoChannelNotice, {
          canAddChannel: false,
          canWritePosts: true,
          onAddChannel: () => {},
          ...props,
        })
      )
    );
  });
};

beforeAll(async () => {
  await i18next.loadNamespaces('translation');
  i18next.addResourceBundle('ru', 'translation', russian, true, true);
  i18next.addResourceBundle('en', 'translation', english, true, true);
});

afterEach(cleanup);

describe('ячейка без каналов отвечает карточкой, одинаково всем ролям', () => {
  test('администратор читает то же объяснение и получает кнопку в каталог', async () => {
    let opened = 0;
    await renderNotice({
      canAddChannel: true,
      onAddChannel: () => {
        opened += 1;
      },
    });

    expect(document.body.textContent).toContain(
      russian['compose_needs_channel_reason']
    );
    // Администратору не рассказывают, что канал подключает администратор.
    expect(document.body.textContent).not.toContain(
      russian['add_channel_admin_only']
    );

    const button = screen.getByRole('button', {
      name: russian['add_channel'],
    });
    fireEvent.click(button);
    expect(opened).toBe(1);
  });

  test('редактор читает то же объяснение и узнаёт, кто подключает канал', async () => {
    await renderNotice({ canAddChannel: false, canWritePosts: true });

    expect(document.body.textContent).toContain(
      russian['compose_needs_channel_reason']
    );
    expect(document.body.textContent).toContain(
      russian['add_channel_admin_only']
    );
    // Каталог за администраторской дверью ему не предлагают.
    expect(screen.queryByRole('button', { name: russian['add_channel'] })).toBeNull();
  });

  test('участнику дополнительно сказано, что посты пишет редактор', async () => {
    await renderNotice({ canAddChannel: false, canWritePosts: false });

    expect(document.body.textContent).toContain(
      russian['add_channel_admin_only']
    );
    expect(document.body.textContent).toContain(
      russian['compose_needs_channel_not_editor']
    );
  });

  test('то же самое по-английски', async () => {
    await renderNotice({ canAddChannel: false, canWritePosts: true }, 'en');

    expect(document.body.textContent).toContain(
      english['compose_needs_channel_reason']
    );
    expect(document.body.textContent).toContain(
      english['add_channel_admin_only']
    );
  });
});

describe('ячейка ведёт в карточку, а не во всплывашку и не в каталог', () => {
  const source = read(CALENDAR);

  test('пустое пространство разбирается раньше роли и ведёт в одно место', () => {
    expect(source).toMatch(
      /!integrations\.length\s*\?\s*explainNoChannel[\s\S]{0,120}addModal/u
    );
    // Прежней развилки «администратору каталог, остальным всплывашка» нет.
    expect(source).not.toContain('refuseAddChannel');
  });

  test('карточка открывается окном, а каталог — кнопкой внутри неё', () => {
    expect(source).toMatch(/modal\.openModal\(\{[\s\S]{0,400}<NoChannelNotice/u);
    expect(source).toMatch(/onAddChannel=\{\(\) => \{[\s\S]{0,80}addProvider\(\)/u);
  });

  test('заголовок держит шапка окна, а не второй заголовок внутри карточки', () => {
    expect(source).toMatch(
      /title: t\(\s*'compose_needs_channel_title'/u
    );
    const notice = read(NOTICE);
    expect(notice).not.toContain('compose_needs_channel_title');
  });
});

describe('черновик без канала невозможен на уровне данных', () => {
  test('Post.integrationId обязателен в схеме', () => {
    const model = read(SCHEMA).match(/model Post \{[\s\S]*?\n\}/u)[0];
    expect(model).toMatch(/^\s*integrationId\s+String\s*$/mu);
    expect(model).toMatch(/integration\s+Integration\s+@relation/u);
  });

  test('дверь поста требует канал', () => {
    expect(read(POST_DTO)).toMatch(
      /@IsDefined\(\)\s*@Type\(\(\) => Integration\)\s*@ValidateNested\(\)\s*integration: Integration;/u
    );
  });
});
