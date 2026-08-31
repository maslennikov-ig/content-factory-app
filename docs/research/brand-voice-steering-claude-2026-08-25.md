# Deriving and Reproducing an Author's Voice in Short Social Posts: A Research Report

## TL;DR
- **What moves an LLM toward a specific author is, in order of measured effect: the author's own texts as in-context exemplars or as fine-tuning demonstrations; then natural-language style descriptions; numeric stylometric constraints move the metric they name but not perceived resemblance — exactly the pattern you measured.** The owner's instinct is correct: relative/directional phrasing plus real exemplars beats hard numeric corridors.
- **Your null result (hard constraints obeyed, no resemblance gain; exemplars not helping) is consistent with published findings.** PersonalBench (Sawant, 2026) shows all inference-time methods cluster at LUAR 0.484–0.508 vs. a human cross-author floor of 0.626 — prompting modulates output *within the model's own style space* without crossing into human territory. Your char-5-gram cosine of 0.627–0.652 against a 0.586 author floor is the same phenomenon in a different metric.
- **The single biggest lever you are not pulling is content.** Your author's signature habit — bringing his own measured figures in 54% of posts — is substance, not style; the literature does not cleanly separate the two, and author-level resemblance is not reliably attainable without the author's own material. Nearly all quantitative evidence is English-only; for your 16 locales this is itself the finding.

## Key Findings

1. **Fine-tuning on demonstrations is the only method with large, human-verified resemblance gains.** DITTO (Shaikh et al., ICLR 2025) beats few-shot prompting, SFT and self-play by an average of 19 percentage points in win-rate (reaching an average ~77% win rate) using fewer than 10 demonstrations. But it requires per-user weight updates.
2. **In-context exemplars beat natural-language style descriptions, which beat numeric constraints.** This ordering is consistent across STYLL (Patel et al., 2023), PersonalBench (2026) and your own data.
3. **Numeric constraints are obeyed but buy no resemblance** — your 87%→94% corridor-compliance with flat cosine mirrors the controllable-generation literature: models satisfy nameable constraints without becoming more like the target.
4. **Length is a known, hard failure mode.** GPT-4-Turbo violates length constraints almost 50% of the time (Yuan et al., 2024); your 2,000–2,600 vs. 823 characters is textbook.
5. **Style vs. content is not cleanly separable in the literature**, and the most author-distinctive signals are frequently content-bound.
6. **Instruction-following and style control degrade outside English**, and non-Latin scripts (incl. Russian) are consistently worse; your Russian corpus sits in the degraded regime.
7. **Evaluation should be a panel, not a single metric**: authorship-verification embeddings (LUAR, Wegmann/CISR, StyleDistance/mStyleDistance) + stylometry + carefully-debiased LLM-as-judge + human forced-choice, with explicit awareness that char-n-gram cosine is topic-sensitive and unstable on ~800-character texts.

## Details

### Q1 — What actually moves output toward a specific author's style

**ESTABLISHED**

- **DITTO — "Show, Don't Tell: Aligning LLMs with Demonstrated Feedback"** (Shaikh, Lam, Hejna, Shao, Bernstein, Yang, Stanford; arXiv:2406.00888; ICLR 2025). Uses **fewer than 10 demonstrations**, treats the user's own texts as preferred over model output and iterates DPO. Verbatim: "win-rates for DITTO outperform few-shot prompting, supervised fine-tuning, and other self-play methods by an average of 19% points" (N=16 user study), reaching an **average win rate of ~77% (CMCC 71.67%, CCAT50 82.50%)**. Cost: DITTO is slower than prompting/SFT — the paper reports **~15 minutes with DITTO vs. ~2 minutes with SFT on 7 demonstrations**. English-only. This is the strongest evidence that *demonstrations* (not descriptions) are what move fine-grained style.
- **LaMP** (Salemi, Mysore, Bendersky, Zamani; ACL 2024; arXiv:2304.11406) and **LongLaMP** (Kumar et al., 2024): retrieval of the user's own items improves personalized generation. **Salemi & Zamani (2025)** find RAG significantly outperforms PEFT on LaMP, and combining them gives **+15.98% over a non-personalized LLM**; gains from PEFT correlate with the number of documents per user. Metrics are ROUGE-1/ROUGE-L (content-overlap, not style embeddings). English-only.
- **OPPU — "One PEFT Per User"** (Tan, Zeng, Tian, Liu, Yin, Jiang; EMNLP 2024; arXiv:2402.04401): a per-user LoRA adapter (<1% of base params) plugged into a frozen base, combinable with RAG/profile. Outperforms prompt-based personalization across the 7 LaMP tasks; ROUGE-scale gains are single-digit to low-double-digit percentage points (e.g., Tweet Paraphrasing R-L ~0.463→~0.517 with PEFT+RAG variants). English-only.
- **STYLL — "Low-Resource Authorship Style Transfer"** (Patel, Andrews, Callison-Burch; arXiv:2212.08986): in-context prompting with ~16 target posts (~500 words). Key negative finding: STYLL moves text *away* from the source author but is "rather unable to adopt, or move toward, the intended target author." Uses LUAR-based Away/Towards/Joint metrics. English (Reddit).
- **Style Vectors / activation steering** (Konen et al., Findings of EACL 2024; arXiv:2402.01618): style vectors computed from recorded activations steer sentiment/emotion/style at inference without prompt engineering. **StyleVector** (Zhang et al., 2503.05213) applies contrastive activation steering to personalization on LaMP/LongLaMP with efficiency gains. **Caveat (CONTESTED below):** steering reliability varies across behaviours.
- **Persona/role prompting is a negative result for factual tasks:** Zheng, Pei, Logeswaran, Lee, Jurgens (Findings of EMNLP 2024; arXiv:2311.10054), "When 'A Helpful Assistant' Is Not Really Helpful": across 162 personas, 4 LLM families, 2,410 factual questions, **adding personas does not improve performance over a no-persona control**; the effect of any given persona is "largely random." Note this paper measures *task accuracy*, not tone — the authors and commentators explicitly concede persona prompting *does* affect tone/style. English-only.

**CONTESTED**

- **Activation-steering reliability.** Tan et al. (NeurIPS 2024) and others show steering effects "vary significantly across behaviors, and are often unreliable or even counterproductive," and are prompt-dependent (some inputs highly steerable, others barely respond). So style vectors are promising but not a dependable production lever yet. English-only.
- **RAG vs. PEFT for personalization.** Salemi & Zamani (2025) find RAG > PEFT; OPPU (2024) finds its PEFT > prompt-based RAG. Reconciliation: depends on how much user data exists (PEFT needs more) and whether retrieval context is relevant.

**FOLKLORE**

- "Give it a detailed persona and it will write like the author." Unsupported for resemblance; supported only weakly for coarse tone. Your own result (two enum directives moving cosine 0.652→0.627, a small move) is consistent with a weak-but-real tone effect.
- "More explicit instruction = more resemblance." Contradicted by PersonalBench: Few-Shot (real examples + explicit instruction) scored no better than abstract profiles.

**Fine-tuning cost/payoff, quantified.** A LoRA/QLoRA fine-tune of a 7–8B model costs on the order of **$3–$12 in GPU time** (a 5,000-sample 7B QLoRA run is ~4–6 hours on an A100 at ~$1.50–2/hr; under $3 on an RTX 4090); a 70B QLoRA run is ~$15–30 (io.net, Tensoria, Spheron, Stratagem, 2025–2026 rate cards). QLoRA (Dettmers et al., 2023) fine-tunes a 65B model on a single 48GB GPU in ~24 hours at ~99.3% of ChatGPT's Vicuna-benchmark quality; LoRA recovers ~90–95% of full-FT quality. Minimum viable data is often cited as ~1,000 high-quality examples (LIMA); DITTO shows <10 demonstrations can beat prompting for *style*. **The hidden costs are not GPU but per-customer hosting** (one adapter per user, adapter-swapping infra) and dataset/eval labour, which push realistic project costs into the $5K–$15K range. For your product with 16 locales and a short-post use case, DITTO-style demonstration DPO is the single method with the strongest *style*-specific evidence, but it breaks the "no per-customer fine-tuning" assumption.

### Q2 — Relative/directional vs. absolute/numeric instructions

**ESTABLISHED**

- **Models cannot reliably follow numeric stylometric or length targets.** Yuan et al. (2024, "Following Length Constraints in Instructions," arXiv:2406.17744): "GPT4-Turbo violates length constraints almost 50% of the time" (GPT-4 0409: 49.3% violation on AlpacaEval-LI, 44.2% on MT-Bench-LI). Word/token counting is a known weak spot (tokenizers operate on subwords, not words). This directly supports the owner's position that hard numeric corridors are the wrong instrument: they are either violated or, when satisfied, they don't buy resemblance.
- **Attribute-intensity / fine-grained control is an active field, but existing methods are mostly training-time or decoding-time, not prompt-numeric.** LiFi (arXiv:2402.06930) uses *continuous, relative, non-exclusive* control codes rather than discrete categorical ones, explicitly because "very positive vs. moderately positive" is lost by hard labels. UltraGen (2502.12375) shows constraint-satisfaction rate *degrades* as the number of simultaneous attributes rises from ~3–5 to ~45 — a warning against your "every measured number as a hard constraint" variant. PPLM (Dathathri et al., 2019) uses a continuous strength knob. These support directional/scalar control over hard numerics.

**CONTESTED / thin**

- There is **no clean head-to-head paper proving "warmer than usual" beats "average sentence length 12 words" for authorial resemblance specifically.** The supporting evidence is indirect (length-control failures + intensity-control literature + your own data). This is a genuine gap; flag it.
- **Overshoot / caricature ("jokes sometimes"→a joke per paragraph).** No dedicated measurement paper found. The closest evidence: RLHF-induced verbosity/mode collapse, sycophancy, and persona-driven stereotype amplification (Zheng et al. 2024 note gendered personas shift outputs). The practical mitigation from the intensity literature is to specify *direction and comparative reference* ("more X than most people, but still rarely") and to test with an intensity metric, rather than a binary attribute.

**Recommendation on phrasing:** use comparative, reference-anchored language ("leans more concrete and data-driven than most writers; uses humour sparingly — less than one aside per post") over absolute numbers. Keep numerics only as *soft targets in a post-hoc check*, not as generation constraints.

### Q3 — Exemplars: how many, how chosen, when they hurt

**ESTABLISHED**

- **A few exemplars go a long way; returns diminish.** DITTO shows increasing demonstrations helps with diminishing returns. STYLL and TinyStyler operate on **16 exemplars**; TinyStyler (Horvitz et al., EMNLP 2024) does few-shot style transfer with as few as 16 samples via authorship embeddings.
- **Example selection matters.** Patel et al.'s STYLL splits (Random / Single / Diverse) show that topic control of exemplars changes results. Similarity-based kNN retrieval vs. diversity/MMR is an established ICL trade-off. For style, choosing exemplars *nearest the current brief* risks importing the brief's content; choosing *most characteristic / near-centroid* better isolates manner.
- **Content leakage is real and measurable.** Style-embedding work (Wegmann et al. 2022; StyleDistance, Patel et al. NAACL 2025) is explicitly motivated by "content leakage": models trained on same-author pairs pick up topic, not just style. The same leakage applies to exemplars in a prompt — the model imitates *what* the examples say, not just *how*. Measure with n-gram/ROUGE-L overlap and near-duplicate detection between output and exemplars.
- **Long-context degradation ("lost in the middle")** means stuffing many exemplars is counterproductive beyond a point, independent of style saturation.

**CONTESTED / gap**

- **The exact k at which exemplars start to hurt resemblance is not established for short social posts.** Practical guidance: 3–8 diverse, near-centroid exemplars; dedup against the brief; monitor verbatim overlap.

### Q4 — Length and structure control

**ESTABLISHED**

- **Length instructions are poorly followed.** Yuan et al. (2024, arXiv:2406.17744): GPT-4-Turbo violates length constraints almost 50% of the time; the training-time fix **LIFT-DPO** cuts the violation rate to ~7.1% (and stays below 10% even as length constraints are made progressively stricter, where standard DPO climbs toward 100%). So the durable fix is training-time, not prompt-time.
- **Why:** (1) tokenizers operate on subwords, so models cannot count words/characters reliably; (2) RLHF/instruction-tuning induces a verbosity bias (longer = preferred), documented in length-controlled AlpacaEval (Dubois et al., 2024). Your 2,000–2,600 vs. 823 characters, *even when given the corridor*, is exactly this.
- **What works, in order of reliability:** (a) hard token budgets / max_tokens caps + truncation (blunt, can cut mid-sentence); (b) structured output / constrained decoding (grammars, JSON schema); (c) iterative shortening / self-refine loops; (d) training-time fixes (LIFT-DPO, Ruler, LCPO). Black-box prompt methods (e.g., "Length Controlled Generation for Black-box LLMs," 2412.14656) reach ~99% accuracy via iterative sampling but cost multiple inference passes.
- **Tokenisation varies by language** (Petrov, La Malfa, Torr & Bibi, NeurIPS 2023, arXiv:2305.15425, "Language Model Tokenizers Introduce Unfairness Between Languages"): verbatim, "the same text translated into different languages can have drastically different tokenization lengths, with differences up to 15 times in some cases" (across 17 tokenizers; byte-level encodings differ over 4×). Cyrillic/CJK/Indic have much higher fertility than English. So a character/word-count instruction transfers *worse* across your 16 locales, and a token budget tuned on English will produce systematically different lengths in Russian.

**Recommendation:** don't ask the model to hit 823 characters. Set a hard token cap calibrated *per language*, generate slightly long, then run a deterministic shortening/truncation-with-repair pass. Treat length as a post-processing problem, not a prompt problem.

### Q5 — Style vs. substance (the decisive product question)

**ESTABLISHED**

- **Style and content are entangled and the literature does not cleanly separate them.** "Same Author or Just Same Topic?" (Wegmann, Schraagen, Nguyen; RepL4NLP 2022) shows authorship-verification models encode topic, not just style, and must be *forced* to control for content. LUAR is known to be topic-sensitive (Rivera-Soto et al. 2021; Wang et al. 2023 "Can Authorship Representation Learning Capture Stylistic Features?"). StyleDistance (2025) exists specifically because prior methods suffer content leakage.
- **The most distinctive authorial signals are often content-bound.** Your author's habit — "ran six releases through my own rig," "89 points both times," measured figures in 54% of posts — is *substance the model cannot invent*. This is not a stylistic knob; it is proprietary information. Cross-topic/cross-genre authorship attribution is measurably harder precisely because removing topic removes signal.

**The honest verdict:** **Author-level resemblance is not reliably attainable without the author's own material/facts.** PersonalBench (Sawant, arXiv:2608.19746, 20 Aug 2026, single-author preprint) is the strongest direct evidence. Across **50 authors and 1,000 generations** (Blog Authorship Corpus; generator Qwen 3 32B; judge GLM-4 32B), four inference-time methods score, verbatim, "in the range 0.484–0.508, below the cross-author human floor of 0.626 (ceiling 0.756)" on LUAR similarity to real authors:
  - Non-Personalized (control): **0.484**
  - Few-Shot (real examples + explicit style instruction): **0.508** (best)
  - Profile Extraction (abstract style profile): **0.502**
  - Contrastive-with-Features (samples + avoid-these + stylometric features): **0.494**

  Within generated text LUAR still discriminates target authors at **AUC 0.918** — "personalization *is* doing something" — but "generated text is more distant from any human author than random humans are from each other." Their diagnosis, verbatim: "The bottleneck is not instruction quality but the model's capacity to shift its deep generative distribution at inference time," and "the model's authorship signal is architecturally embedded, not contextually malleable." **This is the published twin of your result.** English-only; two 32B generators; not peer-reviewed; authors flag LUAR domain gap, no human validation of the judge, and near-zero cross-metric correlation — so treat as directionally strong, not definitive.

**Product implication:** to reproduce this author you must feed the model his *facts* (a personal knowledge base / grounding), not just his style. Without that, you can move tone but you will hit the same ceiling you measured.

### Q6 — Generation quality across languages

**ESTABLISHED**

- **Instruction-following degrades outside English, worst in non-Latin scripts.** Multi-IF (He et al., Meta GenAI; arXiv:2410.15553; 8 languages, 4,501 three-turn dialogues), verbatim: "o1-preview drops from 0.877 at the first turn to 0.707 at the third turn in terms of average accuracy over all languages. Moreover, languages with non-Latin scripts (Hindi, Russian, and Chinese) generally exhibit higher error rates." M-IFEval and Marco-Bench-MIF confirm large cross-lingual gaps (25–35% gap in low-resource languages for open models). **Your Russian corpus sits in this degraded regime.**
- **Style resources for non-English are new and scarce.** mStyleDistance (Qiu, Zhu, Patel, Apidianaki, Callison-Burch; Findings of ACL 2025; arXiv:2502.15168) is the first multilingual style-embedding model, covering **nine languages including Russian and Chinese**, publicly available (HF: StyleDistance/mstyledistance). MSR (Kim et al., 2025) adds multilingual authorship embeddings with content masking.
- **Tokeniser fertility** (Petrov et al. 2023) means Russian/CJK cost more tokens and lose effective context vs. English.

**CONTESTED / thin**

- **What compensates** (English instructions + target-language output vs. target-language exemplars) is not settled for style specifically. General cross-lingual work (XLT cross-lingual-thought prompting; Wendler et al. 2024 "Do LLMs think in English?") suggests models partly reason in a latent English-centric space, which is why English *instructions* with target-language *output* often works — but exemplars should be in the target language to carry native style. This is an inference, not a proven result for authorial style. Flag as gap.
- **Russian-specific:** MERA (Fenogenova et al., ACL 2024) and DaruMERA are the evaluation benchmarks; Saiga (Gusev) and Vikhr (Nikolich et al., 2024) are the leading open Russian models. Note DaruMERA analysis flags likely benchmark contamination for some Russian-tuned models — so lean on generation-robustness sub-tests, not leaderboard totals.

### Q7 — Evaluation

**ESTABLISHED — authorship-verification / style models usable as judges**

- **LUAR** (Rivera-Soto et al., EMNLP 2021): contrastive authorship embeddings, trained on the Reddit Million User Dataset (300M+ comments, ~1M users). **Apache-2.0 licence** (commercially usable). Topic-sensitive. A **Russian version exists** (trained on Pikabu; used in residualized-similarity work) — important for you. Reported strong cross-domain transfer; on blog corpus PersonalBench reports single-post AUC 0.76, multi-post 0.96.
- **Wegmann/CISR Style Embedding** (Wegmann et al. 2022): RoBERTa-based, content-controlled, on HF (AnnaWegmann/Style-Embedding). English.
- **StyleDistance** (Patel et al., NAACL 2025) and **mStyleDistance** (Qiu et al., Findings of ACL 2025): synthetic-parallel contrastive style embeddings; mStyleDistance covers **9 languages incl. Russian/Chinese**, publicly available. Best current option for your multilingual eval.
- **STAR** (Huertas-Tato et al. 2024), **MSR/multilingual authorship** (Kim et al. 2025), **PART, Contra-X** — additional authorship representations; check individual licences.
- **Stylometry:** Burrows's Delta / Cosine Delta / character n-gram cosine (stylo R package, Eder/Rybicki/Kestemont). **Sample-size sensitivity is the critical caveat for you:** Eder (2015, "Does size matter?", Digital Scholarship in the Humanities 30(2):167–182), verbatim: "the minimal sample length varied from 2,500 words (Latin prose) to 5,000 or so words (in most cases, including English, German, Polish, and Hungarian novels)"; his 2017 follow-up lowers this to ~2,000 words only where the authorial fingerprint is strong. **Your 800-character (~120-word) texts are far below any stability threshold for Delta**, and char-5-gram cosine on 800 characters is inherently high-variance and topic-sensitive. (A commonly repeated ">60% false-attribution under 3,000 words" figure could not be verified to a primary source — treat as unverified.)

**ESTABLISHED — LLM-as-judge biases**

- **Self-preference:** Panickssery, Bowman, Feng (NeurIPS 2024): LLM evaluators recognize and favour their own generations; self-recognition linearly correlates with self-preference. Don't judge a model's output with the same model.
- **Position bias, verbosity/length bias, self-enhancement** (Zheng et al. 2023; Wang et al. 2024 "LLMs are not fair evaluators"): mitigate with pairwise + position swaps, length control, rubric anchoring, reference-based judging, multi-judge ensembles.
- **Multilingual judge degradation:** MM-Eval (Son et al., arXiv:2410.17578, 18 languages) and M-RewardBench (23 languages) show judges are weaker and assign "middle-ground scores to low-resource languages"; BabelJudge shows large reliability gaps across languages. **So an LLM judge for your Russian/non-English locales is itself unreliable** and must be validated per language.

**Human evaluation**

- Forced-choice / Turing-style discrimination ("which of these was written by the author?") is the standard for authorship resemblance; STYLL notes authorship style is hard for humans to evaluate directly.
- Inter-rater agreement: report Krippendorff's α or Fleiss'/Cohen's κ; conventional thresholds (Artstein & Poesio 2008) treat α ≥ 0.8 as reliable and 0.67–0.8 as tentative, though these thresholds are themselves criticized.

**Consistency of your result with the literature.** Your finding — hard numeric constraints obeyed (corridor share 87%→94%) but no char-5-gram cosine gain, and exemplars not helping — is **consistent** with: (1) PersonalBench's inference-time ceiling; (2) the length-control literature (constraints obeyed ≠ resemblance); (3) UltraGen's constraint-satisfaction-vs-quality tension. **Alternative explanations you should rule out before concluding "nothing works":**
- **800-character truncation** destroys the very length/structure signal that most separates this author (his 823-char median is itself a stylistic feature you truncate away).
- **char-5-gram cosine is topic-sensitive** (Wegmann 2022; LUAR topic sensitivity) — with neutral briefs stripping content, you removed the author's most distinctive content-bound habit (his own figures), so the metric had little true-style signal to detect.
- **n=24, single author is underpowered** — Eder's sample-size work says ~120-word texts and tiny N give unstable stylometric distances; your 0.586 floor vs. 0.627–0.652 band is a narrow, noisy range.
- **The 0.586 author self-distance floor** compresses the achievable range: the gap between "no voice" (0.652) and "the author himself" (0.586) is only 0.066, so a 0.025 move from directives is ~38% of the total available range — arguably *not* a null result at all, just a small absolute one on a compressed scale.

## Recommendations

**Staged plan.**

**Stage 0 — Fix the measurement before changing the product.** Your current metric may be under-powered and topic-confounded. Before concluding anything: (a) stop truncating to 800 characters for scoring, or score length separately as its own feature; (b) add **LUAR (Russian variant)** and **mStyleDistance** cosine as primary resemblance metrics alongside char-5-gram; (c) enlarge to ≥10 authors × ≥30 generations for power; (d) report a human forced-choice discrimination test with Krippendorff's α. **Threshold to proceed:** if directives already recover ~38% of the author-floor gap on LUAR too, the current prompt is doing more than the char-cosine suggests.

**Stage 1 — Rebuild the voice prompt (no fine-tuning).** Recommended architecture, in order, with rationale:
1. **Role/task framing (1 line).** Minimal — persona prompting does little for resemblance (Zheng 2024); keep it short.
2. **Directional, reference-anchored style statement**, not numeric corridors — "more concrete and data-driven than most writers; conversational; first-person; humour used sparingly, less than one aside per post." Rationale: length/numeric constraints are violated or empty (Yuan 2024); relative/continuous control is the supported lever (LiFi, PPLM). This is the owner's position, and the evidence backs it.
3. **3–8 of the author's own posts as exemplars**, chosen *near the author's centroid / most characteristic*, deduplicated against the brief's topic to avoid content leakage (Wegmann 2022), and *in the target language*. Rationale: demonstrations beat descriptions (DITTO, STYLL).
4. **The author's own facts/figures for this topic** pulled from a per-author knowledge base (RAG). Rationale: this is the decisive lever (Q5) — his 54%-of-posts data habit is substance the model cannot invent. Without it you hit the PersonalBench ceiling.
5. **A soft length hint + hard per-language token cap + post-hoc shortening pass.** Rationale: length is a post-processing problem (Yuan 2024; Petrov 2023 tokeniser fertility).
6. **Output-language = target locale; instructions may stay in English.** Rationale: cross-lingual latent-English reasoning (Wendler 2024) — but exemplars must be native (flagged as inference, verify per locale).

**Stage 2 — Quantify fine-tuning as an option, don't adopt by default.** Run a **DITTO-style demonstration-DPO** pilot on 1–2 heavy users (<10–50 of their posts; ~$5–15 GPU each) and measure LUAR/mStyleDistance gain vs. the Stage-1 prompt. **Threshold to adopt per-customer adapters:** only if fine-tuning crosses the human cross-author floor (the gap prompting cannot close per PersonalBench) *and* per-customer hosting economics work. Given your "not the assumed path" stance, expect this to confirm prompting-plus-RAG as the right default, with fine-tuning reserved for premium/high-volume authors.

**Evaluation protocol to run.**
- **Metrics (panel):** LUAR-Russian + mStyleDistance cosine (primary); char-n-gram Cosine Delta (secondary, with sample-size caveat); length/structure compliance measured separately; verbatim-overlap (ROUGE-L/n-gram) vs. exemplars to catch copying.
- **LLM-as-judge:** pairwise "which is more likely by the same author," position-swapped, reference-anchored rubric, **a different model family than the generator** (Panickssery 2024); validate the judge per language against human labels before trusting non-English scores (MM-Eval caution).
- **Human:** forced-choice discrimination, ≥3 native-speaker raters per locale, ≥50 items; report Krippendorff's α (target ≥0.67 tentative, ≥0.8 reliable).
- **Sample size:** ≥10 authors, ≥30 generations/condition; never draw conclusions from n=24 single-author again.

## Caveats
- **Almost all quantitative evidence is English-only.** DITTO, LaMP/OPPU, STYLL, PersonalBench, length-control, persona, self-preference — all English. mStyleDistance, Multi-IF, MM-Eval, MERA/Vikhr/Saiga are the multilingual/Russian exceptions. For 15 of your 16 locales the honest answer is "no direct evidence; extrapolate with per-locale validation."
- **PersonalBench is a 2026 single-author arXiv preprint**, not peer-reviewed, two 32B generators, single English blog domain, with the author's own flagged caveats (LUAR domain gap, no human validation of the judge, near-zero cross-metric correlation). Treat its numbers as directionally strong, not definitive.
- **No paper directly proves "relative beats absolute phrasing" for authorial resemblance**, and **no paper directly measures style overshoot/caricature.** These are inferences from adjacent literatures; they are the two clearest research gaps for your product.
- **char-5-gram cosine on 800-character texts is near the floor of stylometric reliability** (Eder 2015). Your headline null result may partly be a measurement artifact.
- **The style/content boundary is unresolved in the literature itself** — treat any claim that a method captures "pure style" with suspicion.