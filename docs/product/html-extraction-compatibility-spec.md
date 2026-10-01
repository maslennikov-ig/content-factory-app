# HTML extraction compatibility

The backend and orchestrator's two HTML extraction paths use the existing parse5 6.0.1 dependency through one stateless shared helper. They return text and do not retain a DOM or load JSDOM. JSDOM remains available for development tooling and regression oracles.

`ExtractContentService.extractContent` continues to fetch through `fetchSafePublicHttpsUrl`, propagate fetch/text failures, and return undefined when no element contains a heading descendant. It preserves the old distinct h1–h6 count, reverse document-order reduction and independent depth priority, even when depth selects an element with fewer heading types. Normalization replaces newlines with spaces and collapses runs of ordinary spaces; no extra trimming/entity policy is added.

`AutopostService.loadUrl` uses the same safe fetch, removes visible script/style elements, serializes body contents and applies existing striptags. It returns an empty string on failures, including a frameset with no body. Template contents remain outside DOM query traversal; noscript is parsed with scripting disabled. SVG and malformed-table behavior are part of compatibility, not a normalization opportunity.

The helper clones parse5's default tree adapter without changing its singleton. The installed version exposes this adapter through `parse5/lib/tree-adapters/default`; that version-bound internal path is covered by regression. Its text-before insertion preserves JSDOM22's observed table-foster ordering: merge an existing preceding text node, otherwise append. Other parse5 callers retain the standard adapter.

The frozen image 438 oracle and 22 saved synthetic HTML fixtures determine equivalence; they are not live page evidence or proof for every possible HTML document. A future parser/JSDOM upgrade must recheck this oracle and adapter boundary. The accepted isolated diagnostic measured about 14.64 MiB heapUsed and 110.90 MiB RSS difference after repeat warm-up, with symmetric forced GC. It does not establish whole-application memory savings, production threshold acceptance or B1 root cause. Root owns release/runtime verification.
