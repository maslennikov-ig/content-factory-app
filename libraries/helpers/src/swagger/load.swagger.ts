import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

/**
 * Whether this instance publishes its API documentation.
 *
 * Off unless asked for. The document is a complete inventory of every route the
 * backend answers — admin, oauth and enterprise included — and an instance with
 * one user and no external API consumers gains nothing from publishing it.
 *
 * A dedicated variable on purpose. Hanging this off `NODE_ENV`, or off any
 * switch that already means something else, is how two unrelated behaviours end
 * up sharing one decision and one of them turns on by surprise.
 *
 * The comparison is strict for the same reason as
 * `CONTENT_FACTORY_REQUIRE_APPROVAL`: `"false"` is a value, not an absence.
 */
export function swaggerEnabled() {
  return process.env.CONTENT_FACTORY_SWAGGER_ENABLED === 'true';
}

/**
 * Registers the Swagger UI at `/docs` and the raw specification at
 * `/docs-json` and `/docs-yaml` — three paths from one call. Behind nginx these
 * are reachable as `/api/docs`, not at the domain root.
 */
export const loadSwagger = (app: INestApplication) => {
  if (!swaggerEnabled()) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('Content Factory API')
    .setDescription('API description')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
};
