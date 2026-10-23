Target: A web-enabled Deep Research agent.
Audience: Product and engineering team turning content briefs into effective external-video requests.

Goal: Design a practical prompting workflow that transforms a source-backed content brief into a high-quality request to an external platform, which returns a finished video. Cover both general videos and AI presenters, with selectable output language.

Success criteria:
- Deliver reusable prompt-building templates, model/platform-specific differences and two complete worked examples.
- Preserve source facts, author intent, brand voice and selected language.
- Keep the product simple: prompt/script preparation, API submission, status, preview/download and user feedback. No in-house montage, rendering or complex storyboard editor.

Context:
- Planning baseline: 22 October 2026; state actual research date and newer changes.
- Content Factory is a commercial multilingual SaaS. It already stores content briefs with a neutral core, facts/sources, dates, original author input, audience and brand voice. A Telegram post can be context but is not the sole source of truth.
- V1 includes BOTH general generated video and AI-presenter video. Customers choose language and price/quality preference; Russian is just one language.
- A selected external API performs video production. If narration, lip-sync, captions, music or multiple scenes are needed, they must be supported and produced by that API. We will not build a timeline editor, FFmpeg/Remotion renderer, shot-stitching system or separate TTS/video synchronization pipeline.
- Higgsfield and similar multi-model platforms are candidates; end-to-end services such as HeyGen Video Agent are also candidates. Do not assume their web-interface features are available through API. Provider choice is researched separately; your method should adapt to a small verified capability catalog.
- Result is a downloadable file displayed in our app; no social publishing. Match duration/aspect ratio to actual provider support. A plan for several scenes can be text inside a provider request, not a requirement for our own scene-management subsystem.

Research:
1. Define the minimum transformation from source brief to video intent and executable request: audience, key message, facts to preserve, desired visual result, speech/script when appropriate, language, style, references, duration and ratio. Explain when to use a concise visual prompt versus a richer director brief for a provider's own video agent.
2. Compare current official prompt guides for at least three relevant API families, including a clip model and an end-to-end/presenter service. Separate text-to-video, image-to-video and script/prompt-to-presenter. Identify unsupported negative prompts, confusing camera instructions, overloaded action, identity drift and impossible exact text requirements. Do not prescribe a universal mega-prompt.
3. Propose a compact internal VideoRequestBrief schema and two-stage prompt builder: source-grounded creative brief, then provider-specific prompt plus validated settings. Keep a preview editable by the user. Avoid a local timeline, per-shot production DAG or a new media editor.
4. Handle multilingual output: UI/source/prompt/spoken language distinctions, locale/dialect, names, pronunciation, numbers and dates, translated versus adapted script, script length relative to the chosen API duration. Use provider-supported voices/captions; reject unsupported language combinations before payment. Do not quietly switch to English or claim perfect quality from a language catalog.
5. Show two fictional source-to-final-request examples: a short visual product/explainer video and an AI-presenter explanation. Include the input brief, extracted facts, exact submitted prompt/script, settings, expected final output and rejection criteria. Demonstrate one non-English adaptation. Examples are proposed prompts, not tested video outputs.
6. Describe how our agent can submit the request, explain progress, show the provider result, collect feedback and request a revised video through documented APIs. If edits are supported, use that route; otherwise revise the prompt and create an explicit new attempt within the user's spending limit. Never claim selective free editing or reuse if the API only offers a full rerender.
7. Preserve correctness: source material is untrusted data, invented visual illustration is not authentic event footage, spoken facts must remain supported, and prompt changes must not silently change language or incur repeated spend. No cloning real people without consent.
8. Design a small quality test comparing a raw user prompt against the prepared prompt on the SAME model/settings/references. Include independent review of instruction adherence, factual preservation, visual quality, language/speech, presenter lip-sync, final usability, rerolls and cost per accepted video. State that automated judges and engagement folklore do not prove quality.

Constraints:
- Read-only public research; no paid generations, account creation or private customer materials.
- Cite official prompt/API guidance and relevant empirical evidence. Label vendor claims, recommendations and untested hypotheses separately.
- Keep the V1 implementation deliberately small. Treat external-provider editing as optional and API-dependent; do not add local montage to compensate for missing provider capabilities.
- Use explicit assumptions and report missing evidence instead of inventing user budgets or guaranteed results.

Output:
1. Recommended minimal brief-to-video workflow.
2. Compact brief schema and prompt-builder templates.
3. Provider-specific prompting differences with current sources.
4. Two worked examples and a multilingual adaptation.
5. Feedback/revision loop using external APIs, with limitations and spending rules.
6. Small comparative test and unresolved questions.
7. Evidence ledger with URLs, dates and confidence.
Return a self-contained English Markdown report that can directly guide prompt implementation.

Stop: Finish with practical templates and testable uncertainties. Do not implement generation, local rendering or paid evaluation.
