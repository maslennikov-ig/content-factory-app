# dbxe.34 global runtime advisory decisions

The evidence matrix covers all **51 input records / 40 unique advisories**.
Official GitHub advisory REST snapshots, advisory pages and bounded official
npm tarball inspections were checked on 11 October 2026. Exact ranges, first
patched versions, trigger/input conditions, manifest paths, source hashes and
primary links are in `global-advisories.actual.json`.

The root's native probe removes 47 records with unused runtime package managers,
fixes two with PM2's explicit js-yaml 4.3.2 resolution, and retains two High
records with bounded caller exceptions. Final serving-image and deployed
acceptance remain root-owned; this is not a whole-system zero-vulnerability
claim.

| Records | Decision | Evidence and remaining condition |
| --- | --- | --- |
| npm: 14 | Remove final-runtime npm/npx | No application/startup consumer in `consumer-map.actual.json`; native probe verifies removal. |
| pnpm: 33 | Remove final-runtime pnpm/pnpx and other package-manager shims | Bootstrap/update operator wrappers become the existing direct Prisma 6.5 Node CLI. Real offline diff and unchanged SQL guard pass after matching schema engine is present. |
| js-yaml: 2 | Keep PM2 7.0.3; explicitly resolve js-yaml 4.3.2 in its prefix | Same 4.x API and argparse 2.x dependency. Native three-role startup, jlist, automatic/operator restart and shutdown pass. |
| braces: 1 | Retain exact disabled-watch exception | Package remains 3.0.3 and scanner High; all three watch flags false, trusted repository supervisor config. |
| basic-ftp: 1 | Retain exact inactive-agent/PAC FTP exception | Package remains 5.3.1 and scanner High; no monitoring keys, proxy variables or modules in root caller evidence. |

`probe-scan.actual.json` reports precisely the two expected retained global High
records. Its OS findings are outside this research boundary. The native probe
is a disposable local image with synthetic processes, not the released
application or deployed release.

The [js-yaml merge-budget advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh)
requires 4.3.2; the [ordered-map advisory](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj)
requires 4.3.1. Published PM2 7.0.3 pins 4.3.0, and published 7.0.4 pins 4.3.1.
Thus a PM2 patch upgrade alone leaves one finding; the explicit 4.3.2 resolution
is the smaller sufficient change.

The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no
patched version, and registry latest remains 3.0.3. PM2 reaches it through
chokidar 3.6.0. Published `God.js` calls `watch.enable` only when `watch` is true;
`Watcher.js` then sends watch/ignored patterns to chokidar. Reevaluate before
enabling watch, accepting external supervisor patterns, changing those config
paths, or updating the dependency graph.

The [basic-ftp advisory](https://github.com/advisories/GHSA-c475-qrg2-pj4r)
requires 6.2.1, whereas get-uri 6.0.5 declares basic-ftp `^5.0.2`. Forcing that
major into the existing graph would cross its caller contract. The relevant
path is PM2 IO agent → proxy-agent → pac-proxy-agent → get-uri FTP fetch; the
FTP handler falls back from `lastMod` to `Client.list`. PM2's `serve --ftp`
option means HTTP directory listing and is unrelated. Reevaluate before
enabling monitoring/modules, `PM2_PROXY`, other proxy/PAC settings, or FTP
retrieval. Module installation alone does not prove hostile input reaches the
parser.

Inspected alternative upgrade graphs demonstrate why runtime removal was
chosen:

| Published candidate | Remaining unique baseline advisory matches in its tarball |
| --- | --- |
| npm 10.9.9 | 10: old pacote/sigstore, brace-expansion, picomatch, ip-address, http-cache-semantics. |
| npm 11.17.0 | 10: pacote/sigstore fixed, but old tar/brace-expansion/ip-address/cache remain. |
| npm 11.19.1 / 11.20.0 | 3: brace-expansion 5.0.9 misses two later fixes; cache 4.2.0 remains. |
| pnpm 10.34.5 | 7: direct pnpm findings fixed; bundled tar/brace-expansion/ip-address/cache remain. |
| pnpm 10.34.6 | 1: bundled patched packages refreshed, cache 4.2.0 remains. |

Tarball SHA-1 checks match published registry shasums. These alternatives were
inspected without installing or executing them. PM2 tarballs do not bundle
their dependencies, so an empty tarball-only match list is not an installed
graph safety result.

[GHSA-ch52](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) remains reviewed
High, affected through 4.2.0, with no recorded first patched version. The
[maintainer's issue](https://github.com/kornelski/http-cache-semantics/issues/56)
was closed as not planned on 4 October: the owner disputes the report and
distinguishes `Cache-Control: private` from freshness/Set-Cookie behavior.
Published 4.3.0 is outside the database range; that fact does not establish an
acknowledged security fix. Both positions remain in the matrix.

Builder/developer tooling stays separately pinned to Node 22.23.2 and pnpm
10.6.1, with unchanged product package/lock inputs. This runtime stage does not
patch or close that toolchain's advisory matches. Its existing trust boundary
is reviewed repository configuration and frozen dependency inputs; untrusted
repositories, configuration, lockfiles, patches or dependency content require
separate applicability and remediation before expanding that boundary. No
paid calls, global installs or production actions were performed by this
research stream.
