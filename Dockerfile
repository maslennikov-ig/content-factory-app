# Production image for Content Factory.
#
# The shape follows the upstream packaged image: one container holds the three
# applications, nginx listens on 5000, serves the frontend from 4200 and proxies
# /api to the backend on 3000. The orchestrator has no public surface and talks
# to Temporal directly.
#
# The build stage exists so the compiler toolchain and the pnpm content store —
# together larger than the application itself — never reach the shipped image.

FROM node:22.23.2-bookworm-slim AS build

ARG NEXT_PUBLIC_VERSION
ENV NEXT_PUBLIC_VERSION=$NEXT_PUBLIC_VERSION

# `next build` reports anonymous usage to Vercel unless this is set. The
# `telemetry: false` in next.config.js belongs to the Sentry plugin and does
# nothing for Next itself, so the build was announcing "Next.js now collects
# completely anonymous telemetry" on every run.
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    g++ \
    make \
    python3 \
&& rm -rf /var/lib/apt/lists/*

RUN npm --no-update-notifier --no-fund --global install pnpm@10.6.1

WORKDIR /app
COPY . /app

RUN pnpm install --frozen-lockfile
RUN NODE_OPTIONS="--max-old-space-size=4096" pnpm run build


FROM node:22.23.2-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    nginx \
&& rm -rf /var/lib/apt/lists/*

RUN addgroup --system www \
 && adduser --system --ingroup www --home /www --shell /usr/sbin/nologin www \
 && mkdir -p /www /uploads \
 && chown -R www:www /www /var/lib/nginx

RUN npm --no-update-notifier --no-fund --global install pnpm@10.6.1 pm2@7.0.3

WORKDIR /app
COPY --from=build /app /app

# The Corresponding Source this deployment owes every network user under
# AGPL-3.0 section 13, served by /api/public/source.
#
# It is produced outside the build, by scripts/release/make-source-archive.sh,
# and not here — `.dockerignore` keeps `.git` out of the build context, and the
# slim Node image has no git, so `git archive` cannot run in the build stage.
# That is also the safer arrangement: no stage of this image ever holds the
# commit history, which carries a personal e-mail address.
#
# Naming both files explicitly is the point. If the archive was not built, this
# COPY fails and the image is never produced, instead of shipping an
# application whose Source page has nothing to offer.
COPY var/source/content-factory-source.tar.gz var/source/source.json /app/var/source/

COPY var/docker/nginx.conf /etc/nginx/nginx.conf
COPY var/docker/entrypoint.sh /usr/local/bin/content-factory-entrypoint
RUN chmod +x /usr/local/bin/content-factory-entrypoint

ENV NODE_ENV=production
# CopilotKit reports to a Segment endpoint of its own the moment its runtime is
# built, which happens as soon as an organization has a model key. Setting this
# in the image as well as in .env means the switch cannot be lost by editing a
# file on the server. `DO_NOT_TRACK` is the same request in the form several
# other libraries understand.
ENV COPILOTKIT_TELEMETRY_DISABLED=true
ENV DO_NOT_TRACK=1
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=5 \
  CMD curl -fsS http://127.0.0.1:5000/api/ >/dev/null || exit 1

CMD ["/usr/local/bin/content-factory-entrypoint"]
