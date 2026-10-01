# HTML parser footprint implementation plan

Accepted scope: replace both direct production JSDOM edges, preserve extraction/fetch/failure behavior, and keep dependencies/worker/provider contracts unchanged. Base 5d822447a159f032c9f6527b80a18b7c36827761; separate isolated HTML worktree. Primary source and accepted lead worktree remain outside ownership.

1. Freeze source bodies and saved 22-case corpus from accepted image 438 diagnostic. Execute both real services against the JSDOM oracle with mocked safe fetch; establish RED for both production JSDOM loader edges.
2. Add one pure typed helper using existing parse5 and an isolated adapter clone. Preserve title masks/reverse/depth priority, text normalization, template/noscript/SVG/frameset/foster behavior. Replace only parser logic in both services.
3. Prove both real services and helper match the frozen oracle; verify failure propagation/empty catch, unchanged default adapter and version-bound adapter resolution. Update only affected test loaders to resolve the real helper.
4. Run the focused compatibility/SSRF/autopost generation/research/language/activity checks and backend/orchestrator types; no full suite or live/provider/host calls. Preserve RED/GREEN, exact hashes and limitations in the owned stage return.
5. Commit owned source/docs/tests once focused green. Keep evidence stage-only. Root independently reviews/integrates and owns full release, actual warm-memory threshold and B1 acceptance.
