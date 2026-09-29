'use strict';

/**
 * W4 live walk 29.09.2026, P3-F: a picture the chat put on a post showed no
 * thumbnail — the piece door named it by id only. The door now reads the path
 * from the post's `image` (the shared `adaptationPictureOf`), and the screen's
 * adapter draws what it gets.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { loadTypeScriptModule: loadTsx } = require('./helpers/load-tsx.cjs');

const { adaptationPictureOf } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/pieces/adaptation-picture.ts'
);
const adapter = loadTsx('apps/frontend/src/components/content-intelligence/pieces/pieces.adapter.ts');
const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

const POST_IMAGE = JSON.stringify([{ id: 'm-1', path: 'https://cdn.example/uploads/m-1.png', alt: 'x' }]);

describe('the picture on a post, with its path', () => {
  test('the named picture of the post, whoever set it', () => {
    expect(adaptationPictureOf(POST_IMAGE, 'm-1')).toEqual({ id: 'm-1', path: 'https://cdn.example/uploads/m-1.png' });
  });

  test('no picture, another picture, no path or broken JSON: nothing', () => {
    expect(adaptationPictureOf(POST_IMAGE, null)).toBeNull();
    expect(adaptationPictureOf(POST_IMAGE, 'm-2')).toBeNull();
    expect(adaptationPictureOf(JSON.stringify([{ id: 'm-1' }]), 'm-1')).toBeNull();
    expect(adaptationPictureOf('not json', 'm-1')).toBeNull();
    expect(adaptationPictureOf(null, 'm-1')).toBeNull();
  });

  test('the screen draws the door’s picture with its path', () => {
    const adaptation = adapter.readAdaptation({
      id: 'a1',
      pieceId: 'p1',
      kind: 'post',
      platform: 'telegram',
      mediaId: 'm-1',
      image: { id: 'm-1', path: 'https://cdn.example/uploads/m-1.png' },
      state: 'draft',
      createdAt: '2026-09-29T10:00:00.000Z',
    });
    expect(adaptation.image).toEqual({ id: 'm-1', path: 'https://cdn.example/uploads/m-1.png' });
  });

  test('the door reads the post’s image with the adaptation and sends the picture', () => {
    expect(read('libraries/nestjs-libraries/src/content-intelligence/materials/content-material.repository.ts')).toMatch(
      /deletedAt: true,\s*image: true,/
    );
    expect(read('libraries/nestjs-libraries/src/content-intelligence/pieces/piece.service.ts')).toContain(
      'adaptationPictureOf(row.post?.image, row.mediaId)'
    );
  });
});
