# dbxe.33 OS-runtime audit outcome — 11 October2026

Root audit verification PASS for116 original C/H records,55 CVEs and36 Debian
binaries. **Remediation remains open:**33 depends on new35;8 and the epic stay
open. All30 original criteria and33's selected criterion are unchanged. No
runtime/package/schema/data or production deployment change was made.

Serving755d19fa731d/configea54f8c9ee61/private tested d724 is freshly healthy,
zero restarts,1792MiB. Native health, API/login/source/version/archive200 and
ordinary native Sharp PNG-to-JPEG pass. Archive bytes/hash and verified rollback
cae3 are unchanged. Shared host free36056092672B (~33.6GiB); no host cleanup or
restore. Existing exact nine-check release receipt remains bound to d724/755d,
not the new documentation commit.

Official Debian mapping covers all55:40 open,15 resolved with fixed versions.
Patchable OpenSSL/PCRE2/Perl functions are absent from the configured consumers;
retain exceptions/triggers rather than upgrade dormant APIs solely for counters.
Every original baseline record survives in triage.actual.json. APT simulation
requires no package additions/removals. Node's bundled OpenSSL is separate from
system libssl; inherited layers are not proof of inapplicability.

The actual GCC12 aligned allocator rounds a huge request without detecting
wrap. libvips8.18.7, called by Sharp0.35.5 on external images, imports aligned
array new. A no-network/64MiB probe returned non-null for SIZE_MAX-8, with zero
writes through that pointer. This confirms the primitive, not an exploit through
an image request. GCC12 has no official compatible Bookworm fix. PBDS header
reachability is also UNKNOWN; absence of imported symbols cannot exclude inline
code. Beads35 preserves source/bounds investigation or a compatible vendor fix.
No allocator shim, forced distro/compiler change or broad upgrade was added.

One read-only Luna documentation child supplied official metadata while root
checked native/APT consumers. Root verified116 original records byte-for-byte,
all package source/version mappings and the configured production file hashes.
Child delivery/acceptance/safe cleanup is in delegation.actual.json. Verbatim
source/downloads remain local; durable metadata has paraphrases/source digests.
The first ELF reader's version-index parsing defect was corrected before
acceptance; its raw result is retained but superseded by the exact ELF receipt.

Current proof: root-acceptance.actual.json, triage.actual.json and the native
allocation/conversion receipts. Guidance:
[OS security decisions](../../../../docs/operations/os-runtime-security-triage.md).
Focused documentation/process/diff closeout is recorded in the root receipt.
Private audit checkpoint e3fa885832d6 was pushed atomically to its own codex
branch and private main after fresh fast-forward/ownership proof; delivery.actual.json
records it. This documentation checkpoint is separate from the serving d724/755d.
No new public snapshot, image or production switch is needed for this audit.

Next recommended candidate:35, native allocation source/input-bound proof or an
official minimum compatible fix, before34 global tools. Requires owner selection;
no next stage or continuous goal launched. Other original scopes and owner/client
legal/pricing/ChatGPT/research defers remain unchanged.

docs-reviewed: updated - per-CVE OS decisions, native35 continuation and historical dependency/release distinction; handoff/index updated.
graph-reviewed: used - read-only Dockerfile/curl/Workspace queries against existing d724 graph; exact current source confirmed. No durable product graph input changed.
