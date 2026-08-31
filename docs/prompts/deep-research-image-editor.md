Target: Deep research agent (ChatGPT / Gemini / Claude Deep Research)
Audience: Manual handoff — a person will paste this into a deep-research tool and read the result.

Goal: Recommend one embedded image editor, plus one fallback, to replace Polotno in a self-hosted AGPL-3.0 social-publishing product. Deliver a decision with evidence, not a vendor survey. The incumbent is being dropped for cost, so a recommendation that merely trades one subscription for another has not answered the question.

Success criteria:
- A single primary recommendation and a single fallback, each with the reason it won and the condition under which it loses.
- Every candidate scored on the criteria below. **Licence compatibility is a gate, not a score**: a candidate that cannot legally be distributed inside an AGPL-3.0 application is disqualified regardless of how good it is, and must be reported as disqualified rather than ranked low.
- Each factual claim carries a source URL and the date the page states. Vendor marketing claims are labelled as such; claims you could not verify are listed separately as unverified rather than smoothed over.
- Cost expressed as total cost of ownership for one self-hosted instance with a handful of users — not per seat, not per MAU, unless the vendor only prices that way, in which case say so and compute it for 5 and for 50 users.
- An honest build-versus-buy answer: for each candidate that is a canvas *library* rather than a finished editor, an estimate of the work to reach the feature floor below, in engineer-days, with the reasoning for the estimate.
- An explicit statement of what evidence would flip the recommendation.

Context:
- The product is Content Factory, a self-hosted social-publishing tool licensed **AGPL-3.0**. Its source is published. Any library bundled into the frontend is therefore distributed as part of an AGPL work and must be licence-compatible with that: permissive licences (MIT, Apache-2.0, BSD, ISC) and GPL-family licences are workable; a proprietary or source-available library linked into the bundle is not, and neither is a "free for open source, paid for commercial" library whose commercial terms forbid redistribution of the source.
- The incumbent is Polotno. It was removed, not merely disabled, for two reasons. Cost: the owner reports roughly **$900/month**, which is not recoverable for this product. Privacy: the library POSTs to `api.polotno.com/api/validate-key` on initialisation — with the host site's own hostname, and even when the key is empty — and its stock-photo and stock-video panels forward the user's search terms to the vendor. This product has just removed every third-party call it had; a replacement that phones home at all is a much weaker candidate, and one that cannot be stopped from phoning home is disqualified.
- The editor is embedded in a Next.js 16 / React 19 frontend, TypeScript, Tailwind. It runs in the browser. There is no separate media-processing service and adding one is a cost to be counted, not a free assumption.
- The result must return to the product's own media library: the editor produces a raster image which is uploaded through the existing upload endpoint and then attached to a scheduled post. Any candidate that assumes its own asset hosting has to be assessed on whether that can be turned off.
- The instance is small: one organisation, a handful of users, a few hundred images. Throughput is not a constraint. Predictable zero or near-zero recurring cost is the point.
- There is currently **no image editor at all** in the product. That is a known gap, not an emergency, so a recommendation of "build a minimal one on library X" is acceptable if the evidence supports it.

Feature floor — what the replacement has to do. Score each candidate against this list explicitly, item by item:
1. Open an existing image from the product's media library and save the edited result back as PNG or JPEG.
2. Crop, resize, rotate, flip.
3. Text layers: add, edit, choose from a small set of bundled fonts, set colour, size and alignment. Must render Cyrillic correctly — the product ships in Russian and English as equal languages, and a text tool that mangles Cyrillic is not usable.
4. Shapes and simple drawing.
5. Layers: stacking order, move, delete.
6. Templates or presets sized for social platforms (square, portrait, story), or the ability to define them ourselves.
7. Undo and redo.
8. Runs entirely client-side with no network call to any third party.
State clearly which items each candidate gives out of the box, which need work, and which it cannot do.

Candidates to cover:
- Polotno, for the baseline only — confirm the current published price and terms so the comparison is anchored to a checked number rather than the owner's recollection.
- Fabric.js
- Konva / react-konva
- tui.image-editor (NHN Toast UI) — establish its current maintenance status; report the date of the last release and last commit.
- Filerobot Image Editor (Scaleflex)
- Pintura (PQINA) — establish its licence terms precisely, including whether its commercial licence permits redistribution inside an AGPL source tree.
- tldraw — establish its current licence and any watermark or licence-key requirement.
- Excalidraw
- miniPaint
- Photopea, embedded by iframe — assess the privacy and licence position honestly rather than dismissing it.
- Penpot, self-hosted — assess whether it can be embedded at all, or only linked to as a separate application.
Add any candidate that materially beats these, including ones that English-language roundups omit. Do not pad the list with abandoned projects; report abandonment as a finding.

Criteria, in priority order:
1. **Licence compatibility with AGPL-3.0 distribution** — a gate, as described above. State the exact licence, its version, and where you read it.
2. **No third-party network calls**, and whether any can be disabled by configuration rather than by patching. Report anything that contacts a vendor for licence validation, telemetry, fonts, or stock assets.
3. Coverage of the feature floor, item by item.
4. Total cost of ownership: licence fee, subscription, or none; whether the price is one-time or recurring; whether it scales with users or instances.
5. Build cost if it is a library rather than a finished editor, in engineer-days, with reasoning.
6. Maintenance health: last release date, commit cadence, open-issue trend, bus factor, whether a company or an individual maintains it.
7. Integration fit: React 19 and Next.js 16 compatibility, TypeScript types, bundle size added to the client, SSR behaviour.
8. Cyrillic and font handling, including whether fonts must be fetched from a third party.
9. Accessibility and keyboard operation, at least well enough not to be a regression.

Constraints:
- Read-only research. Do not sign up for accounts, create API keys, download packages, or make paid calls.
- Prefer the project's own repository, licence file and changelog over aggregator pages and blog roundups. Where only a vendor states something, say so beside it.
- Licences and prices change. Quote each with the date you read it, and link the exact file or page.
- Do not assume open source means AGPL-compatible; several editors in this space use source-available or dual licences that are not. Check the actual licence text, not the badge.
- Do not assume the answer is "build it on Fabric.js" and do not assume it is "buy something"; argue both.
- If a criterion cannot be answered from public sources, report the gap. Do not fill it with a plausible guess.
- Where a reasonable reading of the task could change the outcome, state the assumption in one line and continue; do not stop to ask.

Output:
1. Recommendation: primary and fallback, three sentences each, plus the one-line reason the incumbent is not simply retained at a lower tier.
2. Disqualified candidates and the licence or privacy fact that disqualified each — this section comes before the comparison table, because a disqualified candidate should not be argued about on features.
3. Comparison table: surviving candidates as rows, the nine criteria as columns, each cell a short verdict.
4. Feature-floor matrix: the eight floor items as rows, surviving candidates as columns, each cell one of out-of-the-box / needs work / cannot.
5. Cost model: total cost of ownership at 5 users and at 50, over one year, per candidate, with the build cost in engineer-days converted at a stated day rate.
6. Maintenance health findings, with dates.
7. Unverified claims and evidence gaps, as a list.
8. What would change the recommendation.
Cite sources inline as links.

Stop: Stop and report when the eight output sections are written, even if some cells are marked unverified. Report gaps rather than filling them.
