# dbxe.35 — exact native allocation / GNU PBDS source evidence

Outcome: the selected GCC aligned-new overflow and GNU PBDS binary-heap
`erase_if` defect are excluded in the inspected Sharp image-consumer chain.
The installed GCC12 allocator remains vulnerable as a general primitive; this
report does not claim a fixed OS package, general image-parser safety, deployed
acceptance, or acceptance of unreviewed/native-library replacements.

## Exact artifacts and provenance

The installed Linux x64 binaries byte-match the official npm release tarballs;
both SHA-512 integrity values match npm metadata:

| Artifact | Version | SHA-256 |
| --- | --- | --- |
| Sharp addon | 0.35.5 | cf896cc1b7f3ae9c3e8eb3d7b2b198b8de2824ff7d0681d684bab5a825def335 |
| libvips-cpp | 8.18.7, npm package 1.3.4 | 4aa73553408c3964071728f4a231a8e86918e39bc49f1fbae75355f7ea933ea9 |

These match the serving-image hashes in the prior stage's
`elf-consumers.local.json`. Official npm `gitHead`, tag resolution, and published
provenance statements bind the vendor build to
`lovell/sharp-libvips@ebb95f8add54eee8bed840e3fb587e4cbec857d7`
and the addon source to `lovell/sharp@51a990faa26ade5586a4934ac9673c98d8893326`.
All 14 installed addon source files also byte-match npm Sharp 0.35.5 source.
Provenance statements were inspected; their signatures were not independently
cryptographically verified. Raw metadata/SRI comparisons remain local.

## Aligned-new: exact source, ABI and bounds

There is one real direct call to the aligned-new import in libvips-cpp, at
`0x403ab3`, through PLT `0x1f20`, symbol
`_ZnamSt11align_val_t@CXXABI_1.3.11`. The import stub is not counted as a caller.
It corresponds to [UltraHDR 2.0.2 `icc.cpp`:640–657](https://github.com/google/libultrahdr/blob/e5f5a022fe96fc4dc2ee35c19f733a50df807abe/lib/src/icc.cpp#L640),
`IccHelper::readIccColorGamut`. This is bundled static UltraHDR, rather than
libvips's own pixel allocator. That exact source has SHA-256
`c9d009952d79ba9d61e2afd5b0205221f3b1cd843ab5da69d142d8f87895e8c5`;
pinned raw source byte-matches the release archive. The vendor's UltraHDR patch
changes CMake/platform settings, with no ICC-code change.

Source and machine instructions agree:

- Before allocation, reject null data, length below 146, or a wrong ICC identifier
  (machine comparison against 145 at `0x403793`, unsigned rejection at `0x40379a`).
- Only a misaligned profile pointer is copied. Requested size is
  `sz = icc_size - 14` (`lea -0xe(%rsi),%r12` at `0x4037eb`).
- Alignment is a constant 4 (`mov $0x4,%esi` at `0x403aa6`), matching
  `alignof(ICCHeader)`; the input's dimensions, profile-size field, tag counts and
  offsets cannot set alignment or requested size.

For every size_t value passing the lower guard,
`132 <= sz <= SIZE_MAX - 14`. The vulnerable GCC rounding adds at most 3:
`sz + 3 <= SIZE_MAX - 11`. Therefore its addition cannot overflow. This is a
bound on all accepted length values, independent of Sharp's pixel cap.
The explicit function call to array-new has no compiler-inserted array cookie;
[GCC12.2 `new_opva.cc`:30–33](https://github.com/gcc-mirror/gcc/blob/releases/gcc-12.2.0/libstdc%2B%2B-v3/libsupc%2B%2B/new_opva.cc#L30)
forwards unchanged size/alignment to scalar-new. The prior exact-system
allocator disassembly confirms the unchecked C11 rounding branch; it remains
vulnerable when called with other unbounded values.

All three UltraHDR call sites (`jpegr.cpp`:338,1493,1521) pass
`JpegDecoderHelper::getICCSize()`, the size of its ICC vector. The helper copies
only the first matching JPEG APP2 marker (`jpegdecoderhelper.cpp`:119–135,
219–239), without summing markers. Exact mozjpeg `0826579` `jdmarker.c`:769–787
reads a16-bit marker length, subtracts 2 and bounds saved bytes accordingly.
Thus actual ICC length is at most 65533; aligned request at most 65519, rounded
at most 65520. The ICC minimum guard also prevents subtraction underflow before
any profile allocation. Tag-table validation occurs after this bounded copy.

Sharp's own pixel check is after opening the image (`common.cc`:613–616), so it
is not used as proof of protection before decoder/header allocations. SVG,
PNG, TIFF, WebP and HEIF/AVIF cannot create a different alignment through this
sole bound call. The vendor build disables libvips modules and JPEG XL, and
ELF NEEDED entries contain system support libraries, with no dynamic codec
library. Unknown external preload/module changes are outside this binding.

## GNU PBDS

The [GCC upstream fix](https://github.com/gcc-mirror/gcc/commit/aaa8351f4d2e636f9680a1f0a8ebc2f0a60611e6)
changes the header template in `ext/pb_ds/detail/binary_heap_/erase_fn_imps.hpp`:
it updates the entry pointer after reallocating the binary heap. This is a
compile-time consumer issue; absence of ELF imports is insufficient, and
replacing runtime libstdc++ alone would not fix an already-instantiated consumer.

Complete release-source scans cover Sharp's addon, libvips 8.18.7,
Highway 1.4.0, libheif 1.23.5, UltraHDR 2.0.2, aom 3.15.1, mozjpeg 0826579 and
libtiff 4.7.2. HarfBuzz 14.5.0's entire `src` subtree plus root build files was
scanned; all files and their Git blob hashes match its exact commit tree, with
no missing source file. No GNU PBDS include, namespace, binary-heap tag or
implementation use was found. Libheif's two `std::erase_if` calls operate on
vectors (`tiled.cc`:668,695); they are not GNU PBDS heap calls.

Version-specific build-language receipts cover the remaining bundled targets:
Linux C/C-or-Rust libraries, with Cairo/Pango C++ limited to disabled Windows
branches, TIFF C++ streams disabled, and librsvg C/Rust. Their native dependencies
resolve to the enumerated vendor libraries. The vendor uses GCC toolset 15 for
C++ build, so the shipped GCC12 runtime version was not treated as a source
compiler-version proof. Source membership establishes the selected PBDS
exclusion; general application/Node/source paths beyond this image chain remain
outside the finding.

## Delivery and retained evidence

`child-native-aligned-calls.local.json` and `child-native-callsite.local.txt`
retain the machine path; `child-native-source-manifest.local.json` holds focused
source hashes/line ranges; `child-native-pbds-scan.local.json` holds consumer
coverage. `child-native-source.local/` retains source archives, file hashes,
exact commit bindings, language receipts and npm provenance. All downloaded
verbatim material remains local; this report is paraphrased.

Completion event: source/ABI research delivered for root acceptance. No product,
test, tracker, handoff, Git, Docker, production or provider state was changed.
No dynamic image-exploit proof or runtime patch is claimed by this child.
