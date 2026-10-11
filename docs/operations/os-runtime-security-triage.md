# OS runtime security triage — 11 October 2026

Beads `content-factory-next-dbxe.33`; exact serving image `755d19fa731d`, Debian12
Bookworm/amd64, Node22.23.2. The image's116 scanner Critical/High records cover55
CVEs and36 binary packages. No record was suppressed or removed. Debian status,
scanner severity and reachable product behavior are different facts.

## Result and native-path resolution

Official Bookworm metadata covers every record:40 CVEs remain open and15 have
fixed versions. Their available patches concern system OpenSSL, PCRE2 or Perl
features absent from the configured product paths. APT simulation would update
only libssl3/openssl, libpcre2-8-0 and perl-base, without installing/removing other
packages. This stage does not upgrade dormant functions solely to lower counts.

GCC12 `12.2.0-14+deb12u1` still contains the allocator defect. The actual libvips8.18.7 used by
Sharp0.35.5 imports aligned array allocation; the shipped libstdc++ allocator
rounds size before calling aligned_alloc without an overflow check. A bounded
native probe requested `SIZE_MAX-8` bytes and received a non-null pointer. It
wrote no data through that pointer and ran with no network/64MiB memory. This
confirms the allocation primitive, **not an exploit through a customer image**.
The [upstream fix](https://github.com/gcc-mirror/gcc/commit/59d235ffa5a69231eb42e5290d52dc8c90d28b7a)
and [Debian status](https://security-tracker.debian.org/tracker/CVE-2026-95619)
show no fixed Bookworm GCC12 package. GNU PBDS `erase_if`
[CVE-2026-102010](https://security-tracker.debian.org/tracker/CVE-2026-102010)
also has no Bookworm fix. The original audit retained both paths as UNKNOWN;
symbol inspection alone cannot exclude header-inlined code.

Selected follow-up Beads35 resolves these two findings at the actual image path:
the exact native binaries match official npm releases, their version-pinned
sources and machine instructions. The only aligned-new call in the active
libvips binary is UltraHDR's JPEG ICC profile copy. It rejects lengths below146,
requests `icc_size - 14` bytes and uses constant alignment4. Even for every
accepted size_t value, adding3 for alignment cannot overflow. Actual JPEG APP2
limits the payload to65533 bytes, so allocation is at most65519 bytes, rounded
to65520. Image dimensions or claimed profile-size/tag fields cannot enlarge that
allocation. Sharp's pixel check occurs after opening the image and is not the
preallocation proof. [Exact ICC source](https://github.com/google/libultrahdr/blob/e5f5a022fe96fc4dc2ee35c19f733a50df807abe/lib/src/icc.cpp#L640).

GNU PBDS is absent from the inspected source of Sharp and bundled C++ codecs;
the remaining Linux targets are covered by exact build-language/source records.
This excludes the affected header template in this image chain, rather than
assuming an OS library update would fix code already compiled from that header.
The same verified native Sharp instance serves the seven direct product calls
and Next's local image optimizer. Source/ABI proof and12 controlled header/ICC
cases are in `.codex/stages/content-factory-next-dbxe-native-allocation-stage/`.

Beads35's image-path criterion and33's configured OS triage are satisfied. Beads8
and the epic remain open for unselected34 and other original requirements.
No product/runtime patch is needed for these excluded paths; the general GCC12
primitive remains vulnerable and every scanner record is retained. Reevaluate
before any Sharp/libvips/codec/Node/native consumer change, a new allocator call
or an official compatible fix. No allocator preload, compiler replacement,
distro change or broad APT upgrade was introduced. Original criteria stay intact.

## Configured caller exceptions

| Family | Exact current consumer / limit | Reevaluate when |
| --- | --- | --- |
| OpenSSL3.0.20 | nginx/curl/Prisma load libssl3; HTTP ingress/health and PostgreSQL use no DTLS, CMS or CMP. Examined native callers do not import the affected one-shot EVP_Cipher API. Node statically bundles its own OpenSSL3.5.7. | Enable the affected APIs/protocols or change native consumers. APT libssl changes do not patch Node crypto. |
| PCRE2 `10.42-1+deb12u1` | nginx matches request text using fixed trusted configuration patterns; the customer cannot supply a compiled regex. No selected native addon links system PCRE2. | Add dynamic/untrusted regex programs or another JIT consumer. |
| Perl-base `5.36.0-7+deb12u3` |64-bit Perl/Socket2.033 exists but no product Perl runner receives external templates/regex/multicast addresses. Archive::Tar, unzip/compression, GlobMapper, Storable, HTTP::Tiny and Pod::Text modules are absent. | Install/use the missing module or expose Perl data/program templates. |
| curl/libcurl `7.88.1-10+deb12u15` | Two fresh CLI processes fetch explicit loopback HTTP health URLs. No redirect/cookie/auth/SFTP/STARTTLS/shared-handle setup. Product HTTPS uses Node libraries. | Add another curl/libcurl consumer or change URLs/options/auth/proxy/cookies. |
| GnuTLS3.7.9, libtasn1, LDAP, SASL, Kerberos | Loaded transitively by curl, with no configured encrypted/LDAP/SASL/GSSAPI-acceptor transport in that caller. DIGEST-MD5 plugin is absent. | Enable affected transport/certificate/authentication operations. |
| nginx `1.22.1-9+deb12u10` | Plain HTTP5000; all proxy upstreams HTTP1.1. HTTP2 listener is disabled; edge Caddy is a separate image outside33. | Enable HTTP2 here or select a separate edge-image audit. |
| glibc `2.36-9+deb12u14` | Specific formatting/DNS-print/scanf templates are not exposed by examined callers. libstdc++ imports ungetwc, but the configured runtime has no affected overlapping non-Unicode locale/input. | Add affected native APIs, attacker-controlled C formats, unusual locales or new native libraries. |
| zlib `1:1.2.13.dfsg-1` | nginx uses HTTP deflate, without nonblocking gz-file writers. Upstream introduction and Debian affected-range row conflict; retain that conflict rather than declare a version patched. | Add gz-file writers or change native versions; reconcile upstream/Debian range. |
| GNU gzip1.12 | Trusted operational archives, no product LZW-then-LZH command-line decompression of customer data. | Add customer-controlled multi-format gzip decompression. |
| util-linux2.38.1 / libacl2.3.1 | No CAP_SYS_ADMIN, no fstab entries and no customer-facing privileged mount/nsenter/ACL operation. | Grant capabilities or add helpers on untrusted filesystem/cgroup targets. |
| ncurses6.4 | infocmp is present but no product command analyzes user-supplied terminfo. | Expose that terminal-analysis tool/input. |

Each CVE retains its exact installed version, original scanner record, official
Debian source/status, affected precondition, caller exception and reevaluation
trigger in `.codex/stages/content-factory-next-dbxe-os-runtime-stage/triage.actual.json`.
Primary metadata: [Debian Security Tracker](https://security-tracker.debian.org/tracker/data/json)
and Bookworm package pages. Version-description disagreements (glibc, GnuTLS,
zlib) are visible; no exemption relies only on a shorter version string.

## Verification and delivery boundary

Fresh production read: exact platform config digest, native worker health,
API/login/source/version/archive200, zero restarts and the1792MiB cap. Exact
source archive and verified rollback remain intact; the host has enough space.
Native Sharp PNG-to-JPEG conversion passes. Normal conversion is not evidence
that all hostile images are safe. No system/package/runtime/schema/data change,
provider/model request, backup restoration or production switch occurred.

The unchanged runtime retains its exact d724/755d release receipt and measured
695982491-byte image. The follow-up verifies serving native hashes, absence of
preload/module overrides, source archive, health and cap. It adds evidence only;
general image-parser safety and other Node/application paths are not asserted.
A future native
fix must pass the configured exact-source release, weight/capacity, schema,
source and startup/health gates. Global npm/pnpm/PM2 findings remain Beads34.
