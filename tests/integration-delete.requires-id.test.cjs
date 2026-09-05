/**
 * `DELETE /integrations` must name the channel it removes.
 *
 * `content-factory-next-fn33.90.3`: the door read `@Body('id')` unparsed. An
 * empty body made `id === undefined`; Prisma treats `integrationId: undefined`
 * as «no condition», so `getPostsForChannel(org, undefined)` grouped every post
 * of the workspace and the controller marked each of them deleted before the
 * channel update itself failed with 500. One request without an id erased the
 * whole feed of a workspace. Three fences, each checked here on its own: the
 * DTO refuses an empty id, the controller looks the channel up before touching
 * a post, and the repository refuses to group posts for a missing id.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const read = (relative) =>
  fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');

const { DeleteIntegrationDto } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/integrations/delete.integration.dto.ts',
  {}
);
const { validateSync } = require('class-validator');
const { plainToInstance } = require('class-transformer');

describe('removing a channel names the channel', () => {
  test('the body without an id is refused by the DTO', () => {
    const empty = plainToInstance(DeleteIntegrationDto, {});
    expect(validateSync(empty).length).toBeGreaterThan(0);
    const blank = plainToInstance(DeleteIntegrationDto, { id: '' });
    expect(validateSync(blank).length).toBeGreaterThan(0);
    const named = plainToInstance(DeleteIntegrationDto, { id: 'itg-1' });
    expect(validateSync(named)).toEqual([]);
  });

  test('the controller reads the DTO and looks the channel up before any post', () => {
    const source = read('apps/backend/src/api/routes/integrations.controller.ts');
    const door = source.slice(
      source.indexOf("@Delete('/')"),
      source.indexOf("@Get('/plug/list')")
    );
    expect(door).toContain('@Body() body: DeleteIntegrationDto');
    expect(door).not.toContain("@Body('id')");
    const lookup = door.indexOf('getIntegrationById');
    const posts = door.indexOf('getPostsForChannel');
    expect(lookup).toBeGreaterThan(-1);
    expect(lookup).toBeLessThan(posts);
    expect(door).toContain('HttpStatus.NOT_FOUND');
  });

  test('the repository refuses to group posts for a missing channel id', () => {
    const groupBy = jest.fn();
    const { IntegrationRepository } = loadTypeScriptModule(
      'libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository.ts',
      {}
    );
    const repository = Object.create(IntegrationRepository.prototype);
    repository._posts = { model: { post: { groupBy } } };
    expect(() => repository.getPostsForChannel('org-1', undefined)).toThrow(
      /channel id/
    );
    expect(() => repository.getPostsForChannel('org-1', '')).toThrow(
      /channel id/
    );
    expect(groupBy).not.toHaveBeenCalled();
    repository.getPostsForChannel('org-1', 'itg-1');
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', integrationId: 'itg-1' }),
      })
    );
  });
});
