Target: A web-enabled Deep Research agent.
Audience: Product owner and engineers choosing external video APIs for a multilingual SaaS.

Goal: Select the simplest external API stack that accepts a strong prompt or script and returns a finished, downloadable video. Recommend a small portfolio for economy, balanced value and premium quality, based on current evidence.

Success criteria:
- Cover BOTH general generated videos and videos with an AI presenter.
- Identify what each API actually returns: a short clip, an avatar video, or a complete composed video with speech/captions/music.
- Recommend one primary general-video platform, one presenter or end-to-end video platform if needed, and at most one meaningful alternative. Do not force separate vendors if one can do both well.

Context:
- Planning baseline: 22 October 2026. State your actual research date and newer changes explicitly.
- Content Factory is a commercial multi-tenant multilingual SaaS, not a personal creator workflow. Users already turn source-backed content briefs into text posts.
- Desired flow: content brief -> strong provider-specific prompt/script -> external API -> job status -> finished video shown and downloaded inside Content Factory.
- All generation, voice synchronization, subtitles, music, compositing and editing, if offered, happen on the provider's side. We will NOT build a timeline editor, FFmpeg/Remotion renderer, scene-assembly engine or separate TTS-plus-video production chain in V1.
- Provider-side editing or an agent-managed sequence of documented API calls is a useful optional extension, not a requirement for launching V1. Browser automation of a consumer UI is not the production integration strategy.
- Users select output language and quality/budget preference. Russian is one language among many. Keep spoken language independent of UI and visual-prompt language. No fixed personal budget, subscription or customer country is assumed.
- Downloadable output is sufficient. No social-account connection or publishing integrations. Duration and output settings must match the selected API; do not solve an unsupported long video by inventing a local montage stage.
- Existing app: TypeScript, Next.js, NestJS, Prisma/PostgreSQL, Mastra agents, Temporal, owned media storage. Reuse it; this research is not a platform rewrite.

Research:
1. Prioritize Higgsfield, fal.ai, Runway and current Google video APIs for general video, plus HeyGen Video Agent/Studio and relevant alternatives such as Synthesia or D-ID for presenters or complete prompt-to-video workflows. Add a materially stronger alternative. Verify current model/API lifecycle; do not assume an old Sora, Veo or avatar endpoint is still available.
2. Distinguish a model clip API, an API for complete composed videos, and consumer-only features. For Higgsfield, explicitly verify which advertised studio/editing/agent features have supported API endpoints. For HeyGen and similar services verify one-prompt video generation and revision APIs. A playground, MCP logo or agent marketing claim does not establish the capability.
3. For finalists document exact endpoint/model/version, inputs and references, returned video/audio, duration choices, ratio/resolution, native versus upscaled output, speech/voice languages, captions/music/branding, provider-side revisions, watermark, account/region constraints and commercial SaaS terms. Label unknowns and feature combinations that cannot coexist.
4. Show a minimal integration sequence: submit -> retain provider job/session ID -> poll or verify webhook -> retrieve file -> save to our media library. Record cancellation, timeouts, duplicate-submit protection, retention/URL expiry and per-workspace usage attribution. Do not design unnecessary services.
5. Compare actual API prices, not web subscriptions. Include minimum/rounded duration, audio, references, attempts/revisions and refunds. Give reproducible costs for a supported short clip and, ONLY where supported as a complete provider output, a 30/60-second video. Show cost per accepted video under declared retry scenarios. Unsupported duration is N/A, not a fabricated extrapolation.
6. Assess quality evidence separately for visual adherence, source fidelity, speech/language, presenter lip-sync and final usability. Rank price/value/quality only with adequate evidence; vendor language counts and popularity are not quality measurements. Propose a small bounded test where public evidence is insufficient.

Constraints:
- Public read-only research: no accounts, credentials, paid calls or vendor contact.
- Prefer current official API docs, pricing, changelogs and terms; open the pages and cite them inline. Independent evaluations may support quality only with their method disclosed.
- Preserve contradictions and unknowns. Do not infer API parity with the consumer product or resell rights from a generic commercial-use label.
- No local editing/rendering infrastructure or separate voice-generation stack recommendations. If a platform cannot deliver the required result itself, state the limit and compare a better-fitting API.

Output:
1. Recommendation in plain terms: what to integrate first and why.
2. Compact comparison matrix, including output type and supported languages/durations.
3. Verified API capability/access table and minimal integration flow for finalists.
4. API cost examples and price/value/quality evidence gaps.
5. Optional provider-side editing/agent-control opportunities, clearly separate from V1 requirements.
6. Small validation proposal and an evidence ledger with URL, source/access dates and confidence.
Return a self-contained English Markdown report. Keep the architecture minimal and the shortlist actionable.

Stop: Finish with supported recommendations and explicit unknowns. Do not implement or run paid generation.
