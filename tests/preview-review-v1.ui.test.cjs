const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://factory.example/p/post-a' });
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] });
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
let review;
class ReviewError extends Error { constructor(status, code) { super('request failed'); this.status = status; this.code = code; } }
const mocks = {
  './preview.review.context': { usePreviewReviewV1: () => review, reviewComposerIdV1: id => `composer-${id}`, ReviewRequestErrorV1: ReviewError },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'ru' },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  './get.transation.service.client': { useT: () => (_key, fallback) => fallback },
  '../translation/translated-label': { TranslatedLabel: ({ label }) => label },
};
const { CommentsComponents } = loadWithMocks('apps/frontend/src/components/preview/comments.components.tsx', mocks);
const { PostReviewContentV1 } = loadWithMocks('apps/frontend/src/components/preview/post.review.content.tsx', mocks);
const { SecurePreviewMediaV1 } = loadWithMocks('apps/frontend/src/components/preview/secure.preview.media.tsx', {
  ...mocks,
  '@contentfactory/react/helpers/variable.context': { useVariables: () => ({ backendUrl: 'https://factory.example/api' }) },
});

beforeEach(() => {
  review = { postId: 'post-a', path: '/preview-review/v1/posts/post-a', guest: false, selected: null, activeAnchor: null, setSelected: jest.fn(), setActiveAnchor: jest.fn(), data: { canManage: true, threads: [], legacyComments: [] }, request: jest.fn(async () => ({ ok: true })), mutate: jest.fn(async () => {}), isLoading: false };
});
afterEach(() => { cleanup(); window.getSelection().removeAllRanges(); });

test('scoped video metadata renders a native credentialed video without exposing its storage path', () => {
  const { container } = render(h(SecurePreviewMediaV1, { media: { path: '/preview-review/v1/posts/post-a/media/clip', name: 'clip.mp4', type: 'video' } }));
  const video = container.querySelector('video');
  expect(video).toBeTruthy();
  expect(video.crossOrigin).toBe('use-credentials');
  expect(video.getAttribute('src')).toBe('https://factory.example/api/preview-review/v1/posts/post-a/media/clip');
  expect(container.querySelector('img')).toBeNull();
});

test('scoped media preserves a decorative empty alt, selected cover and explicit zero timestamp', () => {
  const path = '/preview-review/v1/posts/post-a/media/clip';
  const { container, rerender } = render(h(SecurePreviewMediaV1, { media: { path, name: 'clip.mp4', type: 'video', thumbnailTimestamp: 0 } }));
  expect(container.querySelector('video').getAttribute('src')).toBe(`https://factory.example/api${path}#t=0`);
  rerender(h(SecurePreviewMediaV1, { media: { path, name: 'clip.mp4', type: 'video', thumbnail: `${path}?variant=thumbnail&reference=selected`, thumbnailTimestamp: 3000 } }));
  expect(container.querySelector('video').getAttribute('poster')).toBe(`https://factory.example/api${path}?variant=thumbnail&reference=selected`);
  expect(container.querySelector('video').getAttribute('src')).toBe(`https://factory.example/api${path}`);
  rerender(h(SecurePreviewMediaV1, { media: { path, name: 'image.png', type: 'image', alt: '' } }));
  expect(container.querySelector('img').getAttribute('alt')).toBe('');
});

test('a guest sees its unverified identity and a name field; team management actions are absent', () => {
  review.guest = true; review.data.canManage = false;
  review.data.threads = [{ id: 'thread', resolvedAt: null, anchor: null, comments: [{ id: 'comment', content: 'Guest text', authorName: 'Reviewer', unverified: true, createdAt: '2035-01-01T00:00:00Z' }] }];
  render(h(CommentsComponents, { postId: 'post-a' }));
  expect(screen.getByLabelText('Ваше имя')).toBeTruthy();
  expect(screen.getByText('Гость · имя не проверено')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Закрыть обсуждение' })).toBeNull();
  expect(screen.getByText('Комментарии и закрытые обсуждения не означают согласование публикации.')).toBeTruthy();
});

test('failed comment preserves typed content and the selected quote; a successful retry clears only after acceptance', async () => {
  review.selected = { postId: 'post-a', quote: 'Exact quote', start: 0, end: 11, revision: 'a'.repeat(64) };
  review.request.mockRejectedValueOnce(new ReviewError(429));
  render(h(CommentsComponents, { postId: 'post-a' }));
  const field = screen.getByRole('textbox', { name: 'Добавить комментарий' });
  fireEvent.change(field, { target: { value: 'Keep my feedback' } });
  await act(async () => fireEvent.submit(field.closest('form')));
  expect(field.value).toBe('Keep my feedback');
  expect(screen.getByRole('alert').textContent).toContain('Подождите минуту');
  expect(review.setSelected).not.toHaveBeenCalled();
  await act(async () => fireEvent.submit(field.closest('form')));
  expect(field.value).toBe('');
  expect(review.setSelected).toHaveBeenCalledWith(null);
  expect(JSON.parse(review.request.mock.calls[1][1].body)).toEqual({ content: 'Keep my feedback', anchor: review.selected });
});

test('stale quotes remain explicit and cannot focus a different passage; legacy comments are unanchored', () => {
  review.data.threads = [{ id: 'thread', resolvedAt: null, anchor: { postId: 'post-a', quote: 'Old text', start: 0, end: 8, revision: 'a'.repeat(64), stale: true }, comments: [] }];
  review.data.legacyComments = [{ id: 'legacy', content: 'Old comment', authorName: 'Author' }];
  render(h(CommentsComponents, { postId: 'post-a' }));
  expect(screen.getByText('Текст изменился. Эта цитата относится к прежней версии.')).toBeTruthy();
  expect(screen.getByText('Прежний комментарий · без выделенного фрагмента')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Выделенный фрагмент' })).toBeNull();
});

test('team replies, resolves and reopens through separate discussion operations', async () => {
  review.data.threads = [{ id: 'thread', resolvedAt: null, anchor: null, comments: [] }];
  const view = render(h(CommentsComponents, { postId: 'post-a' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Закрыть обсуждение' })));
  expect(review.request).toHaveBeenLastCalledWith('/preview-review/v1/posts/post-a/discussions/thread/resolution', { method: 'PUT', body: '{"resolved":true}' });
  review.data.threads[0].resolvedAt = '2035-01-01T00:00:00Z';
  view.rerender(h(CommentsComponents, { postId: 'post-a' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Открыть снова' })));
  expect(JSON.parse(review.request.mock.calls[1][1].body)).toEqual({ resolved: false });
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }));
  const reply = screen.getByRole('textbox', { name: 'Ответить' });
  fireEvent.change(reply, { target: { value: 'Reply text' } });
  await act(async () => fireEvent.submit(reply.closest('form')));
  expect(review.request.mock.calls[2][0]).toBe('/preview-review/v1/posts/post-a/discussions/thread/replies');
});

test('pointer and keyboard selection retain exact offsets and revision, including repeated quotes', () => {
  render(h(PostReviewContentV1, { postId: 'post-a', text: 'same then same', revision: 'a'.repeat(64) }));
  const content = screen.getByLabelText('Выделите фрагмент мышью или с клавиатуры, чтобы обсудить его.');
  const range = document.createRange(); range.setStart(content.firstChild, 10); range.setEnd(content.firstChild, 14);
  window.getSelection().addRange(range);
  fireEvent.mouseUp(content);
  expect(review.setSelected).toHaveBeenLastCalledWith({ postId: 'post-a', quote: 'same', start: 10, end: 14, revision: 'a'.repeat(64) });
  fireEvent.keyUp(content, { key: 'ArrowRight', shiftKey: true });
  expect(review.setSelected).toHaveBeenCalledTimes(2);
  expect(content.tabIndex).toBe(0);
});
