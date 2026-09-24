'use strict';

/**
 * No door reads one field of its body without a DTO
 * (`content-factory-next-fn33.90.13`).
 *
 * `@Body('id')` skips the global validation pipe: a missing field reaches the
 * service as `undefined`, and Prisma reads `undefined` in a `where` as «no
 * condition» — the class of defect `fn33.90.3` found. Twenty-seven such
 * parameters were turned into DTOs (`dtos/routes/single-field.dto.ts`); this
 * keeps the next one from arriving quietly.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ROUTE_ROOTS = ['apps/backend/src/api/routes', 'apps/backend/src/public-api/routes'];

const files = (directory) =>
  fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return files(child);
    return entry.name.endsWith('.ts') ? [child] : [];
  });

test('no route reads a single body field with @Body(\'…\')', () => {
  const found = ROUTE_ROOTS.flatMap(files).flatMap((file) =>
    fs
      .readFileSync(path.join(root, file), 'utf8')
      .split('\n')
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /@Body\(\s*['"`]/.test(line))
      .map(({ line, index }) => `${file}:${index + 1} ${line.trim()}`)
  );
  expect({
    found,
    fix: 'declare the body as a DTO with class-validator decorators (see libraries/nestjs-libraries/src/dtos/routes/single-field.dto.ts)',
  }).toEqual({ found: [], fix: expect.any(String) });
});

test('the single-field DTOs refuse a missing field and keep an empty impersonation id', () => {
  require('reflect-metadata');
  const { validateSync } = require('class-validator');
  const { plainToInstance } = require('class-transformer');
  const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
  const dtos = loadTypeScriptModule(
    'libraries/nestjs-libraries/src/dtos/routes/single-field.dto.ts'
  );
  const errors = (Dto, body) => validateSync(plainToInstance(Dto, body)).length;
  expect(errors(dtos.BodyIdDto, {})).toBeGreaterThan(0);
  expect(errors(dtos.BodyIdDto, { id: 'channel-1' })).toBe(0);
  expect(errors(dtos.ImpersonateBodyDto, { id: '' })).toBe(0);
  expect(errors(dtos.StatusBodyDto, { status: 'yes' })).toBeGreaterThan(0);
  expect(errors(dtos.ChangeDateBodyDto, { date: '2030-01-01T10:00:00' })).toBe(0);
  expect(errors(dtos.ChangeDateBodyDto, { date: '2030-01-01', action: 'drop' })).toBeGreaterThan(0);
  expect(errors(dtos.OAuthExistsBodyDto, {})).toBe(0);
});
