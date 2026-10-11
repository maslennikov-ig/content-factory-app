# Debian Bookworm advisory metadata

Retrieved from the official Debian Security Tracker bulk JSON on 2026-10-11T06:42:40Z; the file hash is `47a229680e86a846e6daa3b7f22162bed450860197bb424b151508de87f46d73` (82434394 bytes after HTTP decompression). The tracker reported `Last-Modified: Sun, 11 Oct 2026 06:11:44 GMT` in the HEAD check. Official baseline SHA-256: `470fe472626d4d10b98af1884c08f3a5ac728a2404171d5bf937c3d3e6b567ef`.

The metadata covers all 116 baseline records, 55 unique CVEs, and 36 binary packages. Every baseline record is copied into `metadata.actual.json` with its original package, installed version, scanner severity, scanner fix fields, sourcePackage value, and officialSource URL. The Bookworm binary `Source` field was read from official `packages.debian.org` pages for all 36 packages; those raw pages and hashes are retained under this directory.

The Debian tracker bulk file is keyed by source package. For each CVE, the selected tracker source is the unique intersection between tracker source-package keys and the official Bookworm `Source` fields of the baseline binaries. This resolves seven multi-source CVEs without guessing from CVE identity alone. All 55 selected source rows have Bookworm metadata: 40 `open`, 15 `resolved`; all 15 resolved rows record `fixed_version`, and the 40 open rows do not.

`advisoryOverview` in the JSON is a short root paraphrase. The complete verbatim tracker description and bulk snapshot are retained only in local files (`metadata-source.local.json`); the description hash preserves the source binding. `trackerScope`, Debian `urgency`, `nodsa`, and `nodsa_reason` are distinct fields. Baseline `severity` remains scanner-supplied. Runtime applicability is UNKNOWN for all records; the tracker snapshot does not establish actual image consumers, configured features, reachability, or caller paths. No installed-version comparison is asserted here.

| CVE | Debian source | Baseline binary@installed version | Bookworm status | Fixed version | Debian urgency | Debian `nodsa` note |
|---|---|---|---|---|---|---|
| [CVE-2023-2953](https://security-tracker.debian.org/tracker/CVE-2023-2953) | `openldap` | `libldap-2.5-0@2.5.13+dfsg-5` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2023-44487](https://security-tracker.debian.org/tracker/CVE-2023-44487) | `nginx` | `nginx@1.22.1-9+deb12u10`, `nginx-common@1.22.1-9+deb12u10` | `open` | `—` | `unimportant` | — |
| [CVE-2025-13151](https://security-tracker.debian.org/tracker/CVE-2025-13151) | `libtasn1-6` | `libtasn1-6@4.19.0-2+deb12u1` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2025-69720](https://security-tracker.debian.org/tracker/CVE-2025-69720) | `ncurses` | `libtinfo6@6.4-4`, `ncurses-base@6.4-4`, `ncurses-bin@6.4-4` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-102010](https://security-tracker.debian.org/tracker/CVE-2026-102010) | `gcc-12` | `gcc-12-base@12.2.0-14+deb12u1`, `libgcc-s1@12.2.0-14+deb12u1`, `libstdc++6@12.2.0-14+deb12u1` | `open` | `—` | `not yet assigned` | Minor issue, not fixed in upstream 12 branch |
| [CVE-2026-103111](https://security-tracker.debian.org/tracker/CVE-2026-103111) | `pcre2` | `libpcre2-8-0@10.42-1+deb12u1` | `resolved` | `10.42-1+deb12u2` | `not yet assigned` | — |
| [CVE-2026-10536](https://security-tracker.debian.org/tracker/CVE-2026-10536) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; needs rare CURLOPT_STREAM_DEPENDS + reset/cleanup |
| [CVE-2026-107161](https://security-tracker.debian.org/tracker/CVE-2026-107161) | `cyrus-sasl2` | `libsasl2-2@2.1.28+dfsg-10`, `libsasl2-modules-db@2.1.28+dfsg-10` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-107778](https://security-tracker.debian.org/tracker/CVE-2026-107778) | `krb5` | `libgssapi-krb5-2@1.20.1-2+deb12u5`, `libk5crypto3@1.20.1-2+deb12u5`, `libkrb5-3@1.20.1-2+deb12u5`, `libkrb5support0@1.20.1-2+deb12u5` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-11856](https://security-tracker.debian.org/tracker/CVE-2026-11856) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; needs Digest auth + libcurl handle reuse across origins |
| [CVE-2026-12064](https://security-tracker.debian.org/tracker/CVE-2026-12064) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; needs schemeless URL with --proto-default sftp/scp |
| [CVE-2026-12087](https://security-tracker.debian.org/tracker/CVE-2026-12087) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-13221](https://security-tracker.debian.org/tracker/CVE-2026-13221) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-13608](https://security-tracker.debian.org/tracker/CVE-2026-13608) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-18924](https://security-tracker.debian.org/tracker/CVE-2026-18924) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-19499](https://security-tracker.debian.org/tracker/CVE-2026-19499) | `glibc` | `libc-bin@2.36-9+deb12u14`, `libc6@2.36-9+deb12u14` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-19931](https://security-tracker.debian.org/tracker/CVE-2026-19931) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-41992](https://security-tracker.debian.org/tracker/CVE-2026-41992) | `gzip` | `gzip@1.12-1` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-42496](https://security-tracker.debian.org/tracker/CVE-2026-42496) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-42497](https://security-tracker.debian.org/tracker/CVE-2026-42497) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-48959](https://security-tracker.debian.org/tracker/CVE-2026-48959) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-48962](https://security-tracker.debian.org/tracker/CVE-2026-48962) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-5435](https://security-tracker.debian.org/tracker/CVE-2026-5435) | `glibc` | `libc-bin@2.36-9+deb12u14`, `libc6@2.36-9+deb12u14` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-54369](https://security-tracker.debian.org/tracker/CVE-2026-54369) | `acl` | `libacl1@2.3.1-3` | `open` | `—` | `not yet assigned` | Minor issue; libacl acl_*_file() follow symlinks; fix adds new acl_*_at() ABI, not individually backportable |
| [CVE-2026-54370](https://security-tracker.debian.org/tracker/CVE-2026-54370) | `acl` | `libacl1@2.3.1-3` | `open` | `—` | `not yet assigned` | Minor issue; local TOCTOU in recursive setfacl/chacl; fix needs 2.4.0 acl_*_at() ABI + walk_tree rewrite, not individually backportable |
| [CVE-2026-5450](https://security-tracker.debian.org/tracker/CVE-2026-5450) | `glibc` | `libc-bin@2.36-9+deb12u14`, `libc6@2.36-9+deb12u14` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-54874](https://security-tracker.debian.org/tracker/CVE-2026-54874) | `openssl` | `libssl3@3.0.20-1~deb12u2`, `openssl@3.0.20-1~deb12u2` | `resolved` | `3.0.22-1~deb12u1` | `not yet assigned` | — |
| [CVE-2026-57432](https://security-tracker.debian.org/tracker/CVE-2026-57432) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-57433](https://security-tracker.debian.org/tracker/CVE-2026-57433) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-5928](https://security-tracker.debian.org/tracker/CVE-2026-5928) | `glibc` | `libc-bin@2.36-9+deb12u14`, `libc6@2.36-9+deb12u14` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-6276](https://security-tracker.debian.org/tracker/CVE-2026-6276) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-63072](https://security-tracker.debian.org/tracker/CVE-2026-63072) | `openssl` | `libssl3@3.0.20-1~deb12u2`, `openssl@3.0.20-1~deb12u2` | `resolved` | `3.0.22-1~deb12u1` | `not yet assigned` | — |
| [CVE-2026-63076](https://security-tracker.debian.org/tracker/CVE-2026-63076) | `openssl` | `libssl3@3.0.20-1~deb12u2`, `openssl@3.0.20-1~deb12u2` | `resolved` | `3.0.22-1~deb12u1` | `not yet assigned` | — |
| [CVE-2026-67693](https://security-tracker.debian.org/tracker/CVE-2026-67693) | `gnutls28` | `libgnutls30@3.7.9-2+deb12u7` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-7017](https://security-tracker.debian.org/tracker/CVE-2026-7017) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-75803](https://security-tracker.debian.org/tracker/CVE-2026-75803) | `openssl` | `libssl3@3.0.20-1~deb12u2`, `openssl@3.0.20-1~deb12u2` | `resolved` | `3.0.22-1~deb12u1` | `not yet assigned` | — |
| [CVE-2026-76642](https://security-tracker.debian.org/tracker/CVE-2026-76642) | `util-linux` | `bsdutils@1:2.38.1-5+deb12u3`, `libblkid1@2.38.1-5+deb12u3`, `libmount1@2.38.1-5+deb12u3`, `libsmartcols1@2.38.1-5+deb12u3`, `libuuid1@2.38.1-5+deb12u3`, `mount@2.38.1-5+deb12u3`, `util-linux@2.38.1-5+deb12u3`, `util-linux-extra@2.38.1-5+deb12u3` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-78408](https://security-tracker.debian.org/tracker/CVE-2026-78408) | `util-linux` | `bsdutils@1:2.38.1-5+deb12u3`, `libblkid1@2.38.1-5+deb12u3`, `libmount1@2.38.1-5+deb12u3`, `libsmartcols1@2.38.1-5+deb12u3`, `libuuid1@2.38.1-5+deb12u3`, `mount@2.38.1-5+deb12u3`, `util-linux@2.38.1-5+deb12u3`, `util-linux-extra@2.38.1-5+deb12u3` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-78409](https://security-tracker.debian.org/tracker/CVE-2026-78409) | `util-linux` | `bsdutils@1:2.38.1-5+deb12u3`, `libblkid1@2.38.1-5+deb12u3`, `libmount1@2.38.1-5+deb12u3`, `libsmartcols1@2.38.1-5+deb12u3`, `libuuid1@2.38.1-5+deb12u3`, `mount@2.38.1-5+deb12u3`, `util-linux@2.38.1-5+deb12u3`, `util-linux-extra@2.38.1-5+deb12u3` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-78410](https://security-tracker.debian.org/tracker/CVE-2026-78410) | `util-linux` | `bsdutils@1:2.38.1-5+deb12u3`, `libblkid1@2.38.1-5+deb12u3`, `libmount1@2.38.1-5+deb12u3`, `libsmartcols1@2.38.1-5+deb12u3`, `libuuid1@2.38.1-5+deb12u3`, `mount@2.38.1-5+deb12u3`, `util-linux@2.38.1-5+deb12u3`, `util-linux-extra@2.38.1-5+deb12u3` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-80230](https://security-tracker.debian.org/tracker/CVE-2026-80230) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-82209](https://security-tracker.debian.org/tracker/CVE-2026-82209) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue |
| [CVE-2026-82560](https://security-tracker.debian.org/tracker/CVE-2026-82560) | `perl` | `perl-base@5.36.0-7+deb12u3` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-8286](https://security-tracker.debian.org/tracker/CVE-2026-8286) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; STARTTLS connection reuse config mismatch |
| [CVE-2026-8376](https://security-tracker.debian.org/tracker/CVE-2026-8376) | `perl` | `perl-base@5.36.0-7+deb12u3` | `resolved` | `5.36.0-7+deb12u4` | `not yet assigned` | — |
| [CVE-2026-84782](https://security-tracker.debian.org/tracker/CVE-2026-84782) | `openssl` | `libssl3@3.0.20-1~deb12u2`, `openssl@3.0.20-1~deb12u2` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-85091](https://security-tracker.debian.org/tracker/CVE-2026-85091) | `zlib` | `zlib1g@1:1.2.13.dfsg-1` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-8924](https://security-tracker.debian.org/tracker/CVE-2026-8924) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; trailing-dot super cookie; PSL-enabled build mitigates |
| [CVE-2026-8927](https://security-tracker.debian.org/tracker/CVE-2026-8927) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; libcurl env-proxy Digest auth handle reuse |
| [CVE-2026-8932](https://security-tracker.debian.org/tracker/CVE-2026-8932) | `curl` | `curl@7.88.1-10+deb12u15`, `libcurl4@7.88.1-10+deb12u15` | `open` | `—` | `not yet assigned` | Minor issue; libcurl mTLS handle-reuse config mismatch |
| [CVE-2026-95184](https://security-tracker.debian.org/tracker/CVE-2026-95184) | `gnutls28` | `libgnutls30@3.7.9-2+deb12u7` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-95209](https://security-tracker.debian.org/tracker/CVE-2026-95209) | `gnutls28` | `libgnutls30@3.7.9-2+deb12u7` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-95210](https://security-tracker.debian.org/tracker/CVE-2026-95210) | `gnutls28` | `libgnutls30@3.7.9-2+deb12u7` | `open` | `—` | `not yet assigned` | — |
| [CVE-2026-9538](https://security-tracker.debian.org/tracker/CVE-2026-9538) | `perl` | `perl-base@5.36.0-7+deb12u3` | `open` | `—` | `not yet assigned` | Minor issue; wait for regressions upstream sorted out |
| [CVE-2026-95619](https://security-tracker.debian.org/tracker/CVE-2026-95619) | `gcc-12` | `gcc-12-base@12.2.0-14+deb12u1`, `libgcc-s1@12.2.0-14+deb12u1`, `libstdc++6@12.2.0-14+deb12u1` | `open` | `—` | `not yet assigned` | Minor issue |

Official source links:

- [Debian Security Tracker bulk JSON](https://security-tracker.debian.org/tracker/data/json)
- [Debian Bookworm binary package source pages](https://packages.debian.org/bookworm/)
- Per-CVE tracker pages are linked in the table and repeated in `metadata.actual.json`.
