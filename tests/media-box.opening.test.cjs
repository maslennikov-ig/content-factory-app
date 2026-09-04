const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const {
  loadTypeScriptModule,
  repositoryRoot,
} = require('./helpers/load-ts-module.cjs');

/**
 * One way to put the media library on screen.
 *
 * `MediaBox` fills its parent — the grid is absolutely positioned inside a
 * `flex-1` column — so opening it without a height collapses it to a strip.
 * Until 04.09.2026 there were two ways in. The post editor opened a modal
 * sized `calc(100% - 80px)` and worked. The profile picture and the bot
 * picture went through an event emitter into `ShowMediaBoxModal`, rendered
 * straight into the page layout with no modal and no height, and both
 * collapsed into a band above the header: the owner could see the tail of a
 * caption and a Cancel button, and could not reach the list or the upload
 * button (`content-factory-next-fn33.15`).
 *
 * The rule this suite holds is not "the profile works too". It is that there
 * is one function that opens the library and every caller uses it, so the
 * next caller cannot be given a different set of modal options — or none.
 */

const mediaComponentPath = 'apps/frontend/src/components/media/media.component.tsx';
const settingsPath = 'apps/frontend/src/components/layout/settings.component.tsx';
const botPicturePath = 'apps/frontend/src/components/launches/bot.picture.tsx';
const layoutPath = 'apps/frontend/src/components/new-layout/layout.component.tsx';

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const Empty = () => null;
const stub = new Proxy(
  {},
  {
    get: (_target, name) =>
      name === '__esModule' ? false : name === 'default' ? Empty : Empty,
  }
);

const loadMediaComponent = (openModal) =>
  loadTypeScriptModule(mediaComponentPath, {
    react: React,
    swr: { __esModule: true, default: () => ({ data: undefined }) },
    clsx: { __esModule: true, default: () => '' },
    lodash: require('lodash'),
    'react-sortablejs': stub,
    'use-debounce': { useDebounce: (value) => [value] },
    'zustand/react/shallow': { useShallow: (fn) => fn },
    '@prisma/client': {},
    '@uppy/react': stub,
    '@contentfactory/react/form/button': stub,
    '@contentfactory/react/form/input': stub,
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: () => {} }),
    },
    '@contentfactory/react/helpers/video.frame': stub,
    '@contentfactory/react/helpers/use.media.directory': {
      useMediaDirectory: () => ({ set: (value) => value }),
    },
    '@contentfactory/react/helpers/delete.dialog': { deleteDialog: () => {} },
    '@contentfactory/react/helpers/variable.context': {
      // The caption with the upload ceiling in it reads the language, because
      // the unit is «МБ» in Russian (`content-factory-next-fn33.95`).
      useVariables: () => ({ language: 'en' }),
    },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (_key, fallback) => fallback,
    },
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/helpers/utils/has.extension': {
      hasExtension: () => false,
    },
    '@contentfactory/frontend/components/media/new.uploader': {
      useUppyUploader: () => ({ on: () => {}, cancelAll: () => {} }),
    },
    '@contentfactory/frontend/components/layout/user.context': {
      useUser: () => ({}),
    },
    '@contentfactory/frontend/components/layout/drop.files': stub,
    '@contentfactory/frontend/components/layout/loading': stub,
    '@contentfactory/frontend/components/layout/new-modal': {
      useModals: () => ({
        openModal,
        closeAll: () => {},
        closeById: () => {},
        closeCurrent: () => {},
      }),
    },
    '@contentfactory/frontend/components/launches/ai.image': stub,
    '@contentfactory/frontend/components/launches/ai.video': stub,
    '@contentfactory/frontend/components/launches/helpers/use.values': {
      useSettings: () => ({}),
    },
    '@contentfactory/frontend/components/launches/helpers/media.settings.component':
      stub,
    '@contentfactory/frontend/components/third-parties/third-party.media': stub,
    '@contentfactory/frontend/components/third-parties/third-party.media-library':
      stub,
    '@contentfactory/frontend/components/ui/icons': stub,
    '@contentfactory/frontend/components/new-launch/store': {
      useLaunchStore: () => () => {},
    },
    '@contentfactory/frontend/components/media/image-editor/image-editor-modal':
      stub,
    '@contentfactory/frontend/components/media/image-editor/upload-edited-media':
      { uploadEditedMedia: () => {} },
    '@contentfactory/frontend/components/media/image-editor/media-completion': {
      completeEditedMedia: () => {},
      completeMediaBoxEditorSave: () => {},
      replaceEditedAttachment: () => [],
    },
  });

/** Renders a component that does nothing but open the library once. */
const openedModal = (options) => {
  const opened = [];
  const { useOpenMediaBox } = loadMediaComponent((params) =>
    opened.push(params)
  );

  const selected = [];
  const Probe = () => {
    const open = useOpenMediaBox();
    open((media) => selected.push(media), options);
    return null;
  };
  renderToStaticMarkup(React.createElement(Probe));

  expect(opened).toHaveLength(1);
  return { params: opened[0], selected };
};

describe('the library opens as a modal, whoever asks for it', () => {
  test('it is opened full screen with a height, not rendered into the page', () => {
    const { params } = openedModal();

    expect(params.fullScreen).toBe(true);
    // The collapse: `MediaBox` has no height of its own, so a parent without
    // one leaves it a strip.
    expect(params.size).toBe('calc(100% - 80px)');
    expect(params.height).toBe('calc(100% - 80px)');
    expect(params.closeOnEscape).toBe(true);
    expect(params.askClose).toBe(false);
    expect(params.title).toBe('Media Library');
  });

  test('a picture field asks for images and gets the same modal', () => {
    const wide = openedModal().params;
    const images = openedModal({ type: 'image' }).params;

    // Everything but the children — the options are one description, not a
    // copy per caller.
    const { children: _wideChildren, ...wideOptions } = wide;
    const { children: _imageChildren, ...imageOptions } = images;
    expect(imageOptions).toEqual(wideOptions);
  });

  test('the modal body is the library itself, told how to close', () => {
    const { params } = openedModal();
    const close = () => {};
    const body = params.children(close);

    expect(typeof body.type).toBe('function');
    expect(body.props.closeModal).toBe(close);
    expect(typeof body.props.setMedia).toBe('function');
  });

  test('what the person picked reaches the caller', () => {
    const { params, selected } = openedModal();
    const chosen = [{ id: 'media-1', path: '/uploads/one.png' }];

    params.children(() => {}).props.setMedia(chosen);

    expect(selected).toEqual([chosen]);
  });
});

describe('every door into the library is the same door', () => {
  test('the modal options are written once', () => {
    const source = read(mediaComponentPath);

    // One place says how tall the library is.
    expect(source.match(/calc\(100% - 80px\)/g)).toHaveLength(2); // size, height
    // One place mounts it.
    expect(source.match(/<MediaBox\b/g)).toHaveLength(1);
    expect(source).toContain('MEDIA_BOX_MODAL_LAYOUT');
  });

  test('the emitter that rendered it into the layout is gone', () => {
    const source = read(mediaComponentPath);

    expect(source).not.toContain('ShowMediaBoxModal');
    expect(source).not.toContain('showModalEmitter');
    expect(read(layoutPath)).not.toContain('ShowMediaBoxModal');
  });

  test('the profile picture and the bot picture go through the hook', () => {
    for (const relativePath of [settingsPath, botPicturePath]) {
      const source = read(relativePath);

      expect(source).toContain(
        "import { useOpenMediaBox } from '@contentfactory/frontend/components/media/media.component'"
      );
      expect(source).toContain('const openMediaBox = useOpenMediaBox();');
      expect(source).not.toContain('showMediaBox');
    }
  });

  test('a single picture is read out of what the library answers with', () => {
    // The library always answers with a list. Both of these fields hold one
    // image, and both used to store the list itself — which is why the
    // avatar stayed empty even when the modal did open.
    expect(read(settingsPath)).toMatch(/form\.setValue\('picture', values\[0\]\)/);
    expect(read(botPicturePath)).toMatch(/setPicture\(values\[0\]\.path\)/);
  });
});
