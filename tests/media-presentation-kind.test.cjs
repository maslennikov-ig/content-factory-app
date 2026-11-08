const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { mediaPresentationKind } = loadWithMocks('libraries/helpers/src/utils/media-kind.ts');

test.each([
  [{ path: '/uploads/random.mp4', name: 'original.mp4', type: 'image' }, 'video'],
  [{ path: 'https://cdn.example/clip.MP4?signature=x', name: 'video', type: 'image' }, 'video'],
  [{ path: '/uploads/picture.png?filename=clip.mp4', name: 'clip.mp4', type: 'video' }, 'image'],
  [{ path: '/uploads/opaque', name: 'clip.webm', type: 'image' }, 'video'],
  [{ path: '/uploads/opaque', name: 'opaque', type: 'video/mp4' }, 'video'],
  [{ path: '/uploads/picture.jpg', name: 'picture', type: 'image' }, 'image'],
])('presentation uses canonical filename before the inherited default: %j', (media, kind) => {
  expect(mediaPresentationKind(media)).toBe(kind);
});
