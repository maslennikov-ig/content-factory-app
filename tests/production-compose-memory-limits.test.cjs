const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const composePath = path.join(root, 'deploy/production/docker-compose.yaml');
const envExamplePath = path.join(root, 'deploy/production/env.example');
const ecosystemPath = path.join(root, 'var/docker/ecosystem.config.js');
const entrypointPath = path.join(root, 'var/docker/entrypoint.sh');
const dockerfilePath = path.join(root, 'Dockerfile');

const read = (file) => fs.readFileSync(file, 'utf8');

// Cut the block by indentation rather than by the next `cf-` key. Service names
// are prefixed by convention, not by anything that enforces it, and a service
// called `glitchtip:` or `app:` would silently stretch this block to the end of
// the file — handing the assertions below somebody else's configuration.
const serviceBlock = (compose, service) => {
  const match = compose.match(
    new RegExp(
      `^ {2}${service}:\\n([\\s\\S]*?)(?=^ {0,2}\\S|(?![\\s\\S]))`,
      'm'
    )
  );
  expect(match).not.toBeNull();
  return match[1];
};

// A container-wide heap flag reaches this deployment through two doors: the
// compose service block, and the `.env` that block loads wholesale.
const CONTAINER_WIDE_HEAP_FLAG = /^\s*(?:-\s*)?#?\s*NODE_OPTIONS\s*[=:]/m;

describe('production application memory budget', () => {
  test('the block reader stops at the next service whatever it is called', () => {
    const compose = read(composePath);

    expect(serviceBlock(compose, 'cf-app')).not.toMatch(
      /^ {4}image: postgres/m
    );
    expect(serviceBlock(compose, 'cf-temporal')).not.toMatch(/^ {4}volumes:/m);

    const unprefixed = compose.replace(/^ {2}cf-postgres:$/m, '  postgres:');
    expect(serviceBlock(unprefixed, 'cf-app')).not.toMatch(
      /^ {4}image: postgres/m
    );
  });

  test('keeps unequal Node heaps inside the 1792 MiB application cgroup cap', () => {
    const appCompose = serviceBlock(read(composePath), 'cf-app');
    const capMatch = appCompose.match(/^ {4}mem_limit: (\d+)m$/m);
    const swapCapMatch = appCompose.match(/^ {4}memswap_limit: (\d+)m$/m);

    expect(capMatch).not.toBeNull();
    // NODE_OPTIONS here would affect every process in the container, including
    // operator commands. Application heap limits belong to PM2 entries below.
    // Compose accepts both list (`- NODE_OPTIONS=...`) and mapping
    // (`NODE_OPTIONS: ...`) environment syntax. Neither may cap every
    // process, including operator commands, at the container level.
    expect(appCompose).not.toMatch(CONTAINER_WIDE_HEAP_FLAG);

    // The same value arriving through `env_file` does the same damage and used
    // to pass this test. A commented-out line counts too: in this template a
    // leading `#` reads as an invitation to uncomment, not as a prohibition.
    expect(read(envExamplePath)).not.toMatch(CONTAINER_WIDE_HEAP_FLAG);

    delete require.cache[require.resolve(ecosystemPath)];
    const ecosystem = require(ecosystemPath);
    const appHeaps = Object.fromEntries(
      ecosystem.apps.map((app) => [
        app.name,
        Number(
          app.node_args
            .find((argument) => argument.startsWith('--max-old-space-size='))
            .split('=')[1]
        ),
      ])
    );

    expect(appHeaps).toEqual({
      backend: 512,
      orchestrator: 512,
      frontend: 256,
    });

    const containerCapMiB = Number(capMatch[1]);
    const totalOldSpaceMiB = Object.values(appHeaps).reduce(
      (total, heap) => total + heap,
      0
    );

    expect(containerCapMiB).toBe(1792);
    expect(totalOldSpaceMiB).toBe(1280);

    // Without this the swap ceiling defaults to twice the memory limit, and a
    // runaway that reaches 1792 MiB takes another 1792 MiB of the host's swap
    // on its way out — evicting the neighbours the cap exists to protect. Equal
    // values are what make "the runaway is killed here" true.
    expect(swapCapMatch).not.toBeNull();
    expect(Number(swapCapMatch[1])).toBe(containerCapMiB);

    // The gap above 1280 MiB is not headroom. Only old space is capped; the
    // measured non-heap sits in that gap and most of it is already spoken for.
    // Resident minus JS heap, measured idle 2026-08-17, provenance in
    // var/docker/ecosystem.config.js: orchestrator 474 - 255, frontend
    // 110 - 44. The backend's own native memory, nginx and pm2 are on top and
    // were never separated out, which is why raising any cap here means
    // redoing this sum rather than reading 512 off the difference.
    const measuredNonHeapMiB = 474 - 255 + (110 - 44);

    expect(totalOldSpaceMiB + measuredNonHeapMiB).toBeLessThan(containerCapMiB);

    const entrypoint = read(entrypointPath);
    const dockerfile = read(dockerfilePath);

    // These caps are useful only if the production image actually starts this
    // ecosystem file, rather than an uncapped PM2/default command.
    expect(entrypoint).toContain(
      'exec pm2-runtime --raw /app/var/docker/ecosystem.config.js'
    );
    expect(dockerfile).toContain(
      'COPY var/docker/entrypoint.sh /usr/local/bin/content-factory-entrypoint'
    );
    // Copied but not executable is a container that never starts.
    expect(dockerfile).toContain(
      'RUN chmod +x /usr/local/bin/content-factory-entrypoint'
    );
    expect(dockerfile).toContain(
      'CMD ["/usr/local/bin/content-factory-entrypoint"]'
    );
  });
});
