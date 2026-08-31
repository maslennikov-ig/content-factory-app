# Author-Voice Generation from Short Social Posts: What the Evidence Actually Supports

Your Russian experiment is already informative enough to reject one simple story.

Using the author's real-post distance, 0.586, as an empirical positive control and the zero-voice generation, 0.652, as the negative baseline, the current two-directive prompt closes about **38% of the measured human–generic gap**: \((0.652-0.627)/(0.652-0.586)=37.9\%\). The hard-numeric-plus-three-exemplar condition closes only **20%**: \((0.652-0.639)/0.066=19.7\%\). Meanwhile corridor compliance improves by seven percentage points, from 87% to 94%. On this author and this metric, then, **better conformance to measured stylistic features is demonstrably not the same thing as better authorship resemblance**.

That does **not** prove that the numeric constraints caused the regression, because the condition also added three exemplars and there is no numeric-only ablation. But it does show that the controlled features are not sufficient statistics for voice. It also makes the length failure unusually important: 2,000–2,600 characters is **2.43–3.16×** the author's 823-character median. Because you trim everything to 800 characters before the style metric, your current distance measure largely hides this large whole-output mismatch.

Across the literature, the strongest product-level conclusion is:

> **For ordinary chat APIs, the most defensible default is a compact, inferred natural-language voice model plus a small, deliberately diverse set of real examples, with facts retrieved separately and hard measurable requirements verified outside the LLM.**

The evidence is much weaker for putting a large vector of exact stylometric targets into the generation prompt. Conversely, per-user adaptation can improve style substantially, but the best evidence comes from English experiments on open-weight models and imposes a qualitatively different serving architecture.

A second important conclusion is linguistic: **almost all strong evidence on arbitrary individual-author imitation is English-only**. Multilingual research is now good enough to show that instruction following and style measurement vary significantly across languages, but not good enough to claim that a personalization recipe validated in English transfers unchanged to sixteen locales. citeturn15view1turn20search0turn22search1

## What actually moves generation toward an author's style

**ESTABLISHED.** There are three different phenomena that are often conflated: controlling an explicit attribute such as formality, reproducing a set of measurable stylometric statistics, and making a text look as if it came from the same individual. They are not interchangeable. The low-resource authorship-transfer literature explicitly notes that style and content are deeply intertwined and cites the more cautious formulation that style-transfer work should prefer “**scenarios where the attribute and semantics can be approximately separated**.” citeturn2view0

The best direct comparison for your use case is the 2025 “everyday authors” study: more than 400 authors, four domains, and more than 40,000 generations per evaluated model. With only content summaries, models were worse than when given five same-author examples; five-shot prompting consistently improved authorship-verification accuracy over zero-shot. But the authors also found that current models remained poor at reproducing nuanced informal blog/forum voices, tending toward a generic average style, and that increasing examples from **2 to 4, 6, 8, and 10** changed the evaluation metrics surprisingly little. Crucially for you, all four datasets were **English-only**. citeturn15view1turn16view3

No cross-paper numerical ranking is scientifically valid because the papers use different models, authors, domains, evaluators and outcome scales. The table therefore reports **within-study deltas**, not a synthetic leaderboard.

| Intervention | Best directly relevant evidence | Marginal product cost | Ordinary chat API? | Language evidence |
|---|---|---|---|---|
| **Natural-language style description inferred from the author's writing** | HyPerAlign generates hypotheses about personality/writing style from a few examples. With 4 examples it reports 100% win rates on its CUSTOM informal-email set for several models; with 7 examples, GPT-4 averaged 97.33% on CMCC. However, its principal judge was given the same inferred hypotheses used for generation, creating evaluation circularity. citeturn15view0 | One or a few offline profile-extraction calls; then a short profile in every generation | **Yes** | **English-only in the cited author-personalization experiments** |
| **Raw few-shot exemplars** | Five-shot consistently beat zero-shot on authorship verification in the 400-author study. In DITTO's benchmarks, ordinary GPT few-shot improved strongly over zero-shot; nevertheless, few-shot remained below learned personalization. citeturn15view1turn7view2 | Adds prompt tokens every request | **Yes** | **English-only** |
| **Exact numeric style constraints** | I found no published individual-author study showing that constraining measured sentence length, punctuation rates, pronoun shares, etc. improves authorship resemblance. Your Russian experiment instead shows +7 pp constraint compliance with no resemblance gain. Length-control research independently shows that exact numerical instructions are often badly followed unless special mechanisms are used. citeturn19view0 | Cheap to add, but consumes instruction bandwidth; potentially large verification/retry cost | **Yes** | Your evidence: **Russian**; published length evidence mainly **English** |
| **Persona / “write as this kind of person” role prompting** | Broad persona descriptions can condition models, but a role label contains no information about a previously unseen private author's idiolect. Low-resource author-transfer work exists precisely because famous-author imitation can exploit large amounts of pretraining whereas ordinary authors cannot. citeturn2view0 | Tiny | **Yes** | Direct arbitrary-private-author evidence is **weak and overwhelmingly English** |
| **Retrieving topic-similar author examples** | Surprisingly, choosing the five examples from the same semantic cluster **reduced** authorship scores in Enron, Reddit and Blog. For example, Enron AV fell 95.44→81.28 and top-5 AA 69.33→36.00; Reddit AV fell 68.07→53.10. The authors attribute this to loss of stylistic diversity. citeturn16view3 | Embedding/retrieval lookup plus exemplar tokens | **Yes** | **English-only** |
| **Retrieval optimized for downstream personalized generation rather than raw similarity** | PEARL treats exemplar retrieval itself as a learned/calibrated component, rather than assuming nearest semantic examples are optimal. This supports *task-calibrated* retrieval, not naïve nearest-neighbor RAG. citeturn5search0 | Offline indexing + lookup; potentially another scoring call/model | **Yes** | Cited work is **English-focused** |
| **LoRA style tuning** | StyleTunedLM, on ten authors, improved average lexical MSE to 1.39 versus 3.80 for 5-shot and 3.31 for 10-shot; surface MSE to 2.04 versus 5.43/4.68; author-classifier accuracy reached .879 versus .693/.680. Training sets ranged roughly 1k–50k tokens per author. citeturn3view5turn3view6 | Per-user adapter training, storage and model-serving complexity | Only if vendor exposes compatible tuning; otherwise **no** | **English-only** |
| **SFT on a handful of demonstrations** | On DITTO's CMCC/CCAT experiments, SFT scored 56.78%/73.89% GPT-4-evaluated win rate versus DITTO's 71.67%/82.50%. The reported implementations used LoRA-style parameter-efficient adaptation rather than quantifying full-parameter per-user SFT. citeturn7view0turn7view2 | In the reported setup about **2 min** for the SFT baseline on one A100 80GB; still per-user training/deployment | Generally **no** for a generic chat endpoint | **English-only** |
| **DITTO** | With seven training demonstrations per author, DITTO averaged 77.09% across CMCC/CCAT, about **11.7 percentage points above SFT**. A 16-person user study found DITTO ahead of few-shot by 23.9 points, user-written prompts by 27.9, and SFT by 12 points. Gains from additional demonstrations flattened after roughly four examples. citeturn3view3turn3view4 | About **15 min/user** in the reported LoRA-rank-16 setup on one A100 80GB, versus about 2 min for SFT; synthetic comparisons also have generation cost. citeturn7view0turn7view2 | **No**, unless you own/adapt the model or have a suitable tuning service | **English-only** |
| **Plain DPO from user preference pairs** | DITTO reports that a conventional preference-learning route needed **more than 500 preference pairs** to reach performance attainable from four demonstrations through its demonstration-expansion procedure. citeturn7view2 | Much higher user-label or synthetic-pair burden than demonstration learning | Usually **no** | **English-only** |
| **Activation steering / style vectors** | Contrastive activation-steering work reports roughly **8% relative improvement** on personalized generation and about **1,700× less per-user storage than PEFT**; earlier Style Vector work shows parameterizable control through activation directions. But steering quality varies by attribute and transferred vectors can degrade generation. citeturn8search5turn8search6turn8search7turn8search9 | Very small per-user parameter/storage footprint; requires hidden-state access and custom inference | **No** for ordinary closed chat APIs | Cited personalization experiments are effectively **English-only** |
| **Decoding-time style control / candidate reranking** | Methods that score multiple candidates with authorship/style representations can improve style without retraining the generator; this turns personalization into inference-time optimization. citeturn2view5 | Approximately \(k\) generations for \(k\) candidates plus scorer cost; easy to amortize only for high-value outputs | **Yes** as generate-then-rerank; logit-level methods are not | Evidence is predominantly **English** |

The striking comparison is not “fine-tuning always wins.” It is **the right representation of the user's behavior can matter more than the raw adaptation mechanism**. HyPerAlign is tuning-free and claims to beat DITTO by extracting an interpretable hypothesis set from a few user examples, while DITTO convincingly beats raw few-shot/SFT in its own experiments. Those results jointly suggest that “infer what this author characteristically does, then condition generation on that” is a serious alternative to simply dumping examples or stylometric numbers into context. citeturn15view0turn7view2

There is also solid evidence that natural-language descriptions can steer *arbitrary style dimensions*: Reif et al.'s 2022 augmented zero-shot method performs transformations such as formality, melodrama and metaphor insertion using a natural-language instruction without target-style exemplars or fine-tuning. That is evidence for the controllability of **described stylistic direction**, but not evidence that a hand-written adjective list by itself reconstructs a private person's full voice. citeturn13search1

**CONTESTED.** HyPerAlign's spectacular numbers deserve particular caution. Its main evaluation asks an LLM judge to evaluate generations using the inferred user hypotheses that were also used to produce those generations. The authors themselves identify that circularity and provide an alternative exemplar-based judge. Thus HyPerAlign is strong evidence that an explicit *interpretable profile* is useful; it is not yet proof that it yields 97–100% true human-level authorship resemblance. citeturn15view0

Fine-tuning also does not have a clean universal advantage. StyleTunedLM shows a large LoRA advantage over prompting on its ten authors, while newer inference-time profile methods claim comparable or better personalization without training. The tasks and judges differ enough that this remains unresolved. citeturn3view5turn15view0

**FOLKLORE.** “Give the model every statistic you measured,” “put ten examples in because more context is better,” “retrieve the example nearest to today's topic,” and “tell it to role-play as the user” are not evidence-backed defaults for an ordinary private author. In fact, the largest directly relevant exemplar study contradicts two of those intuitions: more examples had little effect, and topic-nearest examples frequently hurt authorship metrics. citeturn16view3

For your product, the current Russian result is therefore **directionally consistent with the literature**: two coarse behavioral directions can outperform an over-specified bundle. But it does not yet establish that all numeric measurements should be discarded. Their best use may be **behind the prompt**: to discover relative tendencies, select exemplars, monitor output, and evaluate drift.

## Relative directions versus absolute corridors

**ESTABLISHED.** I found no clean published A/B test asking exactly your proposed question—something like “write warmer and more direct than a typical post” versus “mean sentence length 12 words, first-person rate 17–23%, punctuation rate X” on individual-author imitation. That absence is important. The owner's hypothesis is plausible and partially supported, but the literature does **not** yet establish a universal superiority of relative natural-language instructions over exact stylometric targets.

The closest direct evidence comes from 2025 work on **register-guided** style transfer. It compares ordinary target-style descriptions with **contrastive descriptions** that explicitly state how the desired target differs from the source. On informal→formal GYAFC transfer, the contrastive formulation substantially strengthened the desired transfer because an utterance can be “informal” in an absolute sense yet still need to move *more formal relative to the input*. On author imitation, however, ordinary register guidance was on the Pareto frontier and contrastive guidance was slightly behind. On another task where the desired register lay between two extremes, contrastive steering could push too far; the paper explicitly says the result “**may be an overshoot**.” citeturn4view1turn4view2

That gives a more nuanced answer than “relative is always better”:

**Relative descriptions are especially useful when the target is a direction from a context-dependent baseline. Absolute descriptions remain useful when an attribute itself is stable and interpretable. Neither solves intensity calibration automatically.** citeturn4view1

Length-control research provides a complementary warning about exact numbers. GPT-4-Turbo violated maximum-length instructions on almost half the length-controlled AlpacaEval/MT-Bench items in one 2024 study. The problem is not merely that models ignore numbers: post-training itself contains a documented bias toward longer answers because human and model preferences often reward length. citeturn18view0turn19view0

Your result is an even cleaner product warning. The numeric corridors moved their own compliance metric from 87% to 94%, yet author distance did not improve. That is what one expects when controllable surface features are **correlates** of voice rather than the causal/complete representation of it.

A good author-level profile should therefore distinguish at least three intensity classes rather than converting everything into quotas:

> **Defining:** noticeably more common than in generic posts and should usually be perceptible.  
> **Supporting:** a recurring tendency; use when the topic naturally invites it.  
> **Occasional:** part of the repertoire, not a requirement for an individual post.

For example:

> *Compared with a generic Russian social post, the author is noticeably more direct and more willing to speak in the first person; moderately more conversational; only occasionally playful. These are tendencies, not quotas. Do not force every trait into every post.*

That wording is a recommendation rather than a published optimum, but it directly operationalizes the strongest register-guidance finding: specify **direction and degree relative to a useful baseline**, not merely a label. citeturn4view1

**CONTESTED.** Relative prompting itself can caricature. The register study's overshoot result is exactly the failure you are worried about: stronger directional information can push a model through the desired point and toward an extreme. citeturn4view1

Demonstrations do not eliminate that problem either. DITTO's qualitative analysis reports cases where ordinary few-shot imitation over-amplifies salient traits rather than reproducing their natural frequency; learned preference alignment can soften that behavior. citeturn7view2

There is no established calibration function such as:

`"sometimes jokes" → 0.18 jokes/paragraph`

nor good evidence that replacing “sometimes” with a percentage would solve it. A percentage may simply turn an authorial tendency into a generation objective, which is precisely what your experiment suggests can improve feature compliance without improving voice.

The practical anti-overshoot formulation I would use is:

> *Treat all voice traits as probabilistic tendencies. A trait should appear only when the current content gives it a natural opportunity. Do not add material merely to display a style trait. Do not repeat a conspicuous device just because it appears in the examples.*

And, for particularly dangerous habits:

> *Personal measurements, experiences, quotations, dates and numerical results are not style decorations. Use them only when supplied in the factual context; never invent them to imitate the author.*

That last distinction is central to your 54%-with-own-measurements observation.

**FOLKLORE.** Adverbs such as “occasionally,” “subtly,” “lightly,” and “naturally” are widely used in prompt craft, but there is no general evidence that a particular English frequency word maps consistently onto a particular realized frequency—still less across sixteen languages. “Do not overdo it” is sensible but not an evaluation method.

The stronger product pattern is therefore **generate → measure → selectively revise**, rather than trying to encode every desired probability in prose. Exact metrics remain valuable as external monitors. They just should not automatically become generation constraints.

## Exemplars: quantity, selection, copying and content leakage

**ESTABLISHED.** The best current evidence argues against large exemplar piles.

The 2025 everyday-author study explicitly tested **2, 4, 6, 8 and 10** examples, nesting the smaller sets inside the larger sets. Across authorship attribution, authorship verification, stylometric modeling and AI-detection metrics, increasing the number had little effect. The authors' default was five examples; they found no general evidence that ten was better. Again, all four datasets were English. citeturn16view3

DITTO finds a related saturation curve in a different setting. From one through three user demonstrations, personalization improves quickly; gains continue through roughly four examples and flatten as the set reaches seven. The authors explicitly leave better demonstration selection as future work. citeturn3view3

HyPerAlign also obtains most of its headline personalization with **four demonstrations** on CUSTOM and seven on CMCC/CCAT. citeturn15view0

Put together, **four to six short examples is a defensible API default**. That is not a magic number; it is the region where three independent bodies of work indicate useful signal without evidence that doubling context buys much more. All of those individual-author generation experiments are English-only. citeturn15view0turn16view3turn3view3

Selection matters at least as much as quantity. The most important result for a retrieval architecture is counterintuitive: retrieving the five examples **most topically related** to the current brief often hurt author resemblance. On the follow-up subsets:

| Dataset | Random five-shot AV | Topic-similar AV | Random top-5 AA | Topic-similar top-5 AA |
|---|---:|---:|---:|---:|
| Enron | 95.44 | **81.28** | 69.33 | **36.00** |
| Reddit | 68.07 | **53.10** | 35.43 | **16.63** |
| Blog | 19.40 | **10.33** | 43.93 | **22.13** |

The study's interpretation is that semantic clustering narrows the range of demonstrated behavior, depriving the model of stylistic diversity. Selecting exemplars closest in **length** had another trade-off: it sometimes helped authorship attribution while substantially reducing their explicit style-model score—for example, Reddit style accuracy 71.80→56.60 and Enron 72.11→61.22. citeturn16view3

That makes “retrieve the author's most similar post to today's topic” a poor default.

A better selection objective is multi-objective:

**First**, cover the author's recurrent stylistic repertoire. **Second**, avoid five near-duplicates of one content cluster. **Third**, optionally include one brief-similar example when it demonstrates a genuinely relevant rhetorical pattern. This is closer to *representative-set selection plus one dynamic retrieval* than ordinary nearest-neighbor RAG.

There is also direct evidence that simplistic exemplar imitation increases exemplar-content overlap. In register-guided author imitation, a direct “mimic this target” setup showed substantially higher ROUGE-1 overlap with target examples—roughly .34–.43 on the MUD splits—whereas methods that first represented style separately had overlaps closer to roughly .07–.15. The same paper therefore provides empirical evidence for exactly the leakage mechanism you are worried about: an exemplar can teach **what the sample says** as well as **how it says it**. citeturn4view1

**CONTESTED.** “Characteristic,” “central,” “diverse,” and “similar to the task” have not been cleanly compared in an individual-author benchmark at enough scale to declare a winner. In particular, I found no convincing author-generation study comparing:

`nearest to author centroid` vs `highest distinctiveness` vs `cluster medoids` vs `maximal diversity` vs `current-brief nearest`

under the same model, authors and evaluation. The everyday-author study gives us one strong negative result—**topic similarity alone is inadequate**—but not the complete selector. citeturn16view3

Likewise, there is no universal “copying begins at N examples” threshold. Copying depends on example length, lexical distinctiveness, how directly the prompt says “imitate,” model behavior, and semantic overlap with the requested output.

**FOLKLORE.** “Three examples is few-shot best practice,” “always retrieve the nearest example,” and “more demonstrations make copying less likely because the model averages them” are unsupported as general rules.

For this product I would keep **two separate stores**:

**Voice exemplars** are chosen primarily for author-representativeness and stylistic coverage.

**Evidence/source material** is retrieved primarily for relevance to the current brief.

This separation prevents a deeply consequential architectural error: using a topic-retrieved post simultaneously as a source of truth and as the sole definition of voice.

Copying should be measured explicitly with exemplar-to-output character n-gram overlap, longest common substring, ROUGE or similar extractive-overlap measures, repeated rare phrases, and named-entity/fact carryover. The voice evaluation should be run both **with and without content-sensitive authorship models** so that a system cannot “win” by borrowing the exemplar's topic.

## Length and structure

**ESTABLISHED.** Your 2,000–2,600-character outputs are not an exotic failure. Current instruction-tuned models can be surprisingly poor at explicit output-length constraints.

Yuan et al. constructed length-controlled versions of AlpacaEval and MT-Bench. GPT-4's evaluated version violated the added length limits **49.3%** of the time on AlpacaEval-LI and **44.2%** on MT-Bench-LI. The paper links this partly to post-training incentives: RLHF/RLAIF-style preferences frequently reward longer responses, and both human and model evaluators tend to prefer greater verbosity independently of whether it improves the answer. citeturn18view0turn19view0

The other problem is global counting. Autoregressive generation is locally token-by-token; ordinary prompting does not give the system a reliable explicit state variable saying “447 of 823 characters used.” A 2025 exact-length study reports that adding **countdown markers plus explicit counting rules** can bring compliance close to 99% in experiments using English word counts and Chinese character counts, far above naïve prompting. This demonstrates that the underlying model *can* produce precise lengths if positional/counting state is externalized, but ordinary prose instructions are not enough. citeturn18view1

For black-box APIs, an even more relevant result is iterative sampling and length verification. On CNN/DailyMail exact-length generation, instruction-only GPT-4 achieved only **15.7%** exact-length accuracy, while the iterative black-box method reached **99.2%**, with essentially unchanged reported ROUGE. GPT-3.5 went from 5.1% to 95.0%. The cost is important: their GPT API experiments allowed as many as **15 iterations**, which is unacceptable for many interactive products even if it proves that external control works. citeturn19view3

Training can fix much of the failure if you own the model. LIFT-DPO augments training data with varying length instructions. On Llama-3-8B-Instruct, AlpacaEval-LI violations dropped from **7.0% to 3.1%** and MT-Bench-LI from **20.0% to 10.8%**. On a Llama-2-70B chat model, standard DPO gave 15.1% violations on AlpacaEval-LI versus **2.7%** with LIFT-DPO. citeturn19view0turn19view1

External verification generalizes beyond length. Divide-Verify-Refine decomposes multi-constraint instructions, evaluates verifiable conditions with deterministic tools such as regex/Python/NLTK, and sends exact corrective feedback to a refinement step. It **doubled** Llama-3.1-8B's overall constraint adherence and **tripled** Mistral-7B's in its complex-instruction experiment. citeturn18view2

For your 823-character target, that evidence strongly favors this pipeline:

`draft → deterministic character/paragraph/list checker → at most one targeted rewrite`

rather than:

`put increasingly severe numeric corridors into the original voice prompt`.

A hard API **maximum-output-token ceiling** is still valuable because it prevents 2,600-character excursions and saves latency/cost. But it is a safety rail, not an exact 823-character controller. Token counts are not character counts, and the relationship changes by language and tokenizer; exact-length work itself therefore uses different control units in English and Chinese. citeturn18view1

For your product, target **characters** at the application layer if character length is the observable product requirement. Let tokens remain an internal conservative cap.

Paragraph and list structure should be treated the same way. “One or two paragraphs; normally no list” can be a **style tendency**. “Exactly two paragraphs and no bullets” is mechanically verifiable and should be checked mechanically. Structured decoding is excellent for guaranteeing an envelope such as a JSON field called `post`; it does not by itself make the prose inside `post` rhetorically resemble the author.

**CONTESTED.** Exact length and authentic voice can conflict. The 99%-compliance countdown approaches are optimized for exact counting, not subtle short-form authorship. For a consumer post generator, the last 3% of length precision may be worth much less than natural rhythm.

Likewise, one rewrite can alter style. An especially bad architecture would generate a good 950-character authorial post and then ask a generic shortening prompt to reduce it to 823, thereby “washing out” the personalization in the final stage. The revision prompt must explicitly preserve the voice and should delete low-information material rather than globally paraphrasing.

A better product objective is probably a **soft preferred band plus a hard maximum**, for example:

> *Aim for the author's normal compact length. Most posts should fit roughly 700–950 characters. Never exceed the product hard maximum.*

Then enforce the actual hard maximum externally. The exact band needs to come from your author's distribution, not the example numbers above.

**FOLKLORE.** Asking a model to “count carefully,” repeating the character limit three times, writing it in capitals, or adding “IMPORTANT” is not a reliable length-control architecture. Nor is `max_tokens = desired_characters / 4` a language-independent conversion.

The multilingual concern is real beyond tokenization. Marco-Bench-MIF, with 30 languages and more than 20 evaluated LLMs, found **25–35 percentage-point instruction-following gaps between high- and low-resource languages**. It also found machine-translated benchmark material could underestimate performance by **7–22 points** relative to properly localized instructions. So length/structure compliance should be measured separately in every output locale rather than assumed from English. citeturn20search0

## Style versus substance

**ESTABLISHED.** This is probably the most important product-design issue in the entire question.

The literature does **not** give a clean universal boundary between “style” and “content.” Low-resource authorship-transfer work says they are deeply interwoven. Researchers often construct artificial transfer settings in which semantics are deliberately held approximately constant precisely because natural authorship does not offer that separation. citeturn2view0

The evaluation literature has reached the same problem from the opposite direction. StyleDistance was developed because authorship-style representations often leak topical/content information; it creates near-paraphrases whose content stays nearly fixed while roughly forty style features vary, explicitly training a more content-independent representation. citeturn13search12

The 2026 STEB benchmark makes the trade-off especially clear. Across **96 datasets, seven languages and five evaluation-task families**, there is no universally best style embedding. Content-disentangled representations are attractive when the task definition says content should be irrelevant; representations retaining semantic signal can perform better on authorship applications where particular authors and topics genuinely correlate. citeturn21search3turn21search11

That is exactly what your “54% of posts contain the author's own measurements” example exposes.

“Uses concrete numerical evidence unusually often” can be modeled as a rhetorical tendency.

But:

> “ran six releases through my own rig”  
> “89 points both times”

contains **epistemic substance**: an experiment occurred, the author performed it, particular objects were tested, and particular results were observed.

A model given only a topic has no truthful source from which to recover those facts. It can do one of only two things:

1. omit the author's most distinctive evidence habit, reducing author resemblance; or
2. reproduce the *shape* of that habit by inventing measurements and personal experience.

The second may score **better** on an authorship classifier while making the product objectively worse.

That is an inference from the style/content literature rather than a result of a paper specifically studying “authors who report benchmark rigs,” but it is a very strong one: style models cannot create user-specific evidence that was never supplied. citeturn2view0turn13search12turn21search11

This suggests a better product ontology than a single “voice” vector:

**Voice style** covers linguistic realization: directness, first-person tendency, formality/register, rhythm, paragraphing, hedging, parentheticals, punctuation, rhetorical questions, humor style.

**Discourse habits** cover choices about what kinds of support the author tends to deploy: measurements, anecdotes, references, counterarguments, caveats, examples.

**Author knowledge/evidence** contains actual measurements, projects, observations, opinions and experiences with provenance.

Only the first two can safely be inferred from style samples. The third must come from user-provided material, retrieval, tools, or explicit brief facts.

For your author, therefore, the product rule should **not** be:

> *Include personal measured figures frequently.*

It should be:

> *When relevant first-hand measurements or concrete results are available in the supplied author material, this author tends to use them rather than making generic claims. Prefer such evidence when available. Never invent a measurement or personal test to satisfy the voice.*

That is one of the few places where an explicit negative constraint is worth the prompt space.

**CONTESTED.** There are two legitimate definitions of “sounds like this author.”

A forensic/stylometric definition tries to isolate content-independent linguistic habit.

A reader-facing definition includes habitual subject choice, references, preferred evidence, recurring beliefs and the kinds of personal experiences the author chooses to mention.

Neither is inherently wrong. The mistake is to use one evaluator while claiming success under the other definition. STEB's finding that no single embedding dominates precisely reflects these competing notions. citeturn21search3turn21search11

For a writing product, I would measure both and name them separately:

**Style fidelity:** resemblance after aggressively controlling for topic/content.

**Author fidelity:** overall likelihood that a reader would attribute the post to the author, including legitimate recurring discourse habits and retrieved personal material.

This also explains why one character 5-gram distance should not be your sole target. Character n-grams can contain morphology, punctuation and function-word habits, but also favorite lexical material, topics and named entities.

**FOLKLORE.** “Style is everything except the factual nouns,” “you can strip content and be left with pure voice,” and the converse “an authorship classifier measures style” are all too simplistic.

The honest answer to the product question is: **full author-level resemblance is not attainable from a neutral topic alone when a material part of that author's identity consists of source-dependent experiences or evidence.** The literature does not offer a method for avoiding that information constraint. Retrieval of the author's actual material is not an optional personalization trick in this case; it is part of the information required to reproduce the relevant author behavior truthfully.

## Generation quality across languages

**ESTABLISHED.** Direct evidence on **individual-author style generation across many languages is sparse**. The strongest author-imitation studies discussed above—STYLL, DITTO, HyPerAlign, StyleTunedLM, and the 400-author everyday-author study—are English experiments. citeturn2view0turn7view2turn15view0turn3view5turn15view1

So there is no sound basis for saying that an English-validated voice prompt will preserve its effect size in all sixteen of your locales.

The broader multilingual instruction-following evidence is much stronger and gives reason to expect degradation. Marco-Bench-MIF covers **30 languages** and reports 25–35-point gaps between high- and low-resource languages even for modern models, with persistent script-specific and compositional-constraint problems. citeturn20search0

XIFBench is even closer to your problem conceptually because its multilingual constraints include **Style** and **Numerical** categories, not merely formatting. It evaluates six languages at different resource levels, including English, Chinese, Russian, Arabic, Hindi and Swahili, and reports systematic dependence on language resources, constraint type and instruction complexity. citeturn20search1turn20search12

Style evaluation is finally becoming multilingual too. mStyleDistance was trained from synthetic style contrasts in **nine languages** and was explicitly evaluated on multilingual and cross-lingual style/authorship tasks. Its existence is significant because earlier style embeddings were overwhelmingly English-only. citeturn22search1turn22search5

MSR goes considerably further on authorship representations: it was trained over **4.5 million authors, 36 languages and 13 domains**. Compared with monolingual models, multilingual training improved Recall@8 in **21 of 22 evaluated non-English languages**, averaging +4.85% and reaching +15.91% in a low-resource language. This is evaluation/representation evidence, not a style-generation experiment, but it strongly argues for multilingual rather than English-only author judges. citeturn21search6turn22search9turn22search17

Localization matters independently of model ability. Marco-Bench-MIF found that simply translated benchmark material underestimated performance by 7–22 percentage points compared with culturally/linguistically localized variants. A mechanically translated English voice profile is therefore not a neutral experimental condition. citeturn20search0

**CONTESTED.** I did not find convincing multi-author, multi-language evidence deciding among these three production strategies:

1. English style instructions + target-language output;
2. target-language style instructions + target-language output;
3. English meta-instructions + target-language exemplars and target-language output.

The idea that “models reason/follow instructions best in English, so always put the control plane in English” is plausible for some English-centric models but is **not established as the optimal strategy for individual-author style reproduction**.

There is a stronger argument for target-language **exemplars** than for target-language meta-instructions. Exemplars directly encode punctuation, morphology, discourse particles, sentence boundaries, address conventions, slang and register in the language in which you need to generate. Translating those examples would destroy part of the signal you are trying to imitate. The current individual-author literature, however, has not benchmarked that hypothesis across sixteen locales.

My recommended multilingual representation is therefore dual:

**Canonical internal profile:** language-neutral/English analytic descriptors so your product has a common schema across locales.

**Generation-facing profile:** localized natural-language realization of those descriptors, accompanied by original-language exemplars.

For a Russian author, never translate the author's examples to English and then ask the model to translate its “style” back. You would be throwing away exactly the Russian-specific surface and discourse signals your 5-gram metric is measuring.

**FOLKLORE.** “A multilingual frontier model is equally good at all supported languages,” “Russian is close enough to English for prompt behavior to transfer,” and “just translate the system prompt” are contradicted by modern multilingual instruction-following benchmarks. citeturn20search0turn20search12

For your sixteen locales I would therefore treat **locale as an experimental factor, not a UI setting**. Each major prompt or retrieval change should report effects by locale, and a global win should not ship if it is driven by English while several smaller locales regress.

## Evaluating “sounds like this author”

**ESTABLISHED.** There is no single trustworthy authorship/style metric. The strongest recent evaluation work increasingly uses an ensemble for exactly that reason. The 400-author study combines authorship verification, authorship attribution, a stylometric model and AI-generation detection; it validates its AV classifiers on real held-out human writing before using them on generated text. Human AV accuracy ranged about **87.7–91.4%** on those English datasets, establishing an empirical positive-control ceiling rather than assuming the judge is perfect. citeturn15view1

Your own design should do the same: every automatic metric needs **human-written same-author**, **human-written different-author**, and **generic-model** controls before generated systems are compared.

The relevant representation families differ materially:

| Evaluator | What it is measuring | Language coverage relevant to your product | Important caveat | Licence status from the primary material reviewed |
|---|---|---|---|---|
| **LUAR** — Learning Universal Authorship Representations | Contrastive authorship representation designed to transfer across domains | Original work is effectively **English-only**, using Amazon reviews, fanfiction and Reddit | “Universal” means cross-domain authorship transfer, not multilingual universality. Official LLNL code exists. citeturn22search0turn22search3 | The paper is distributed by ACL under its publication terms, but the indexed primary sources I could verify here did **not expose a model-weight/software licence identifier**. Do not infer commercial weight rights from the paper's CC licence. |
| **Style Embeddings / content-independent style representations** | Tries to reduce topic/content leakage and represent stylistic similarity | Original line of work is **English** | Useful for “style-only” evaluation, but may deliberately remove author-associated semantic signal that readers perceive as part of identity. StyleDistance was later built to strengthen this disentanglement. citeturn13search12 | Model/checkpoint licence should be checked separately before production; I did not find sufficiently explicit primary licence metadata to certify it here. |
| **STAR — Style Transformer for Authorship Representations** | Large-scale supervised contrastive authorship representation | Its published/model description reports about **4.5M authored texts and 70k authors**; I did not find a multilingual coverage claim strong enough to treat it as a 16-locale judge. citeturn22search27 | Do not assume multilingual robustness merely from dataset scale. | Licence was not sufficiently explicit in the primary/indexed material available in this review; verify separately. |
| **mStyleDistance** | Explicitly style-oriented multilingual embedding using synthetic contrasts | **Nine languages**, plus multilingual/cross-lingual evaluation. citeturn22search1turn22search5 | Better fit than an English-only style model, but nine languages does not imply all sixteen of yours; each actual locale must be checked. | Public model/checkpoint exists; the cited paper/model result did not give me enough licence metadata to certify commercial terms. citeturn22search8 |
| **MSR multilingual authorship representation** | Multilingual author identity representation with content masking and language-aware training | **36 training languages**, 22 non-English evaluation languages; 4.5M+ authors, 13 domains. citeturn22search9turn22search17 | An authorship model, not a pure-style metric; it may appropriately retain some author signal you would exclude from “style-only.” | I could verify the publication and coverage but not a commercial checkpoint licence in the primary material reviewed. Treat licence as unresolved until the actual release terms are inspected. |
| **STEB** | A benchmark for comparing style embeddings, rather than a judge itself | **96 datasets, seven languages**, five task families. citeturn21search3turn21search11 | Key finding: **no style embedding is universally best**; evaluation protocol and application definition matter. | Benchmark is described as open-source; dependency/model licences still need separate audit. |

The licence uncertainty is deliberate rather than evasive. A paper licence, a GitHub source-code licence, a model-weight licence and upstream base-model terms are four different things. For a commercial product, “the model is on Hugging Face” is not a licensing answer. The cited ACL page, for example, describes the publication licence; that does not automatically relicense an independently released checkpoint. citeturn22search3

For multilingual production today, **MSR plus mStyleDistance** are the most interesting pair conceptually: MSR asks “same author?” with very broad multilingual training, while mStyleDistance tries harder to ask “same style independent of content?” They measure intentionally different things. STEB's results argue strongly against choosing either as the only production KPI. citeturn22search1turn22search9turn21search11

Classic stylometry should remain in the stack. Your character 5-gram metric is useful precisely because it is transparent, cheap, reasonably language-agnostic at the feature-extraction level, and sensitive to punctuation/morphological/lexical habits. But it needs several fixes:

**Measure full-length and length-matched text separately.** Your current 800-character trim masks the gross length failure.

**Build profiles exclusively from training posts.** Evaluation posts must be held out.

**Use topic-separated tests.** Otherwise favorite words and topic become easy shortcuts.

**Normalize against each author's human-human distribution.** An absolute cosine of .62 means little if one author is naturally consistent and another is stylistically variable.

Your current numbers motivate a useful normalized measure:

\[
\text{human-gap closure}
=
\frac{d_{\text{generic}}-d_{\text{system}}}
{d_{\text{generic}}-d_{\text{human}}}
\]

On your reported means, current voice prompting closes **37.9%** of the measured gap; hard constraints + exemplars close **19.7%**. This is easier to aggregate across authors than raw distance, although it should still be reported alongside raw distributions because the denominator can become unstable for authors with little separation.

LLM-as-judge is useful, but should be secondary. Position bias is not hypothetical: a 2024 study ran **12 LLM judges over more than 100,000 evaluation instances** and found stable model/task-dependent position effects rather than mere sampling noise. citeturn21academia19

Self-preference is also documented. A dedicated 2024 study found significant GPT-4 self-preference and evidence that LLM evaluators systematically favor lower-perplexity, more familiar-looking responses more than human judges do. citeturn21search4

Verbosity is an especially serious confound for your experiment because the competing outputs differ so dramatically in length. Preference research underlying length-control work finds both model and human evaluators can reward longer answers, which is why modern evaluation systems have introduced length-controlled scoring. citeturn18view0

And LLM judging is not language invariant. BabelJudge's 2026 audit explicitly measures position, verbosity, order consistency and cross-lingual degradation. In one evaluation of Qwen2.5-7B-Instruct, its composite reliability was .714 in Hindi versus .550 in Swahili; Swahili order consistency fell to .480. That is one judge and should not be generalized into a universal language ranking, but it is clear evidence that an English-calibrated LLM judge cannot simply be presumed valid elsewhere. citeturn21academia20

**CONTESTED.** There is no accepted universal answer to “how many texts are enough?” because outputs are clustered within authors and briefs. Twenty-four outputs from one author do **not** give 24 independent pieces of evidence about population-level author personalization. The number of **authors** is the critical generalization dimension.

The large 2025 study's focused prompt ablations used ten test items per author and **30, 30, 50 and 50 authors** across its four domains, and used paired statistical tests where appropriate. That is a useful scale reference, not a universal power calculation. citeturn15view1

There is likewise no magic inter-rater-agreement value that transforms subjective voice judgment into ground truth. For your product I would pre-register **Krippendorff's α ≥ .80** as the target for a primary human voice question; results in roughly .67–.80 should be treated as exploratory and investigated by locale/author rather than quietly averaged. That is a proposed product gate, not a claim that the style-generation literature has standardized on that threshold.

Pairwise human comparison is preferable to asking raters for an abstract “7.3/10 voice match” whenever you have competing systems. Pairwise comparison makes the question concrete and lets you randomize order; the self-preference study likewise notes the consistency advantages of directly comparing alternatives over assigning absolute scores. citeturn21search4

**FOLKLORE.** A single LUAR cosine, a single LLM judge, a single stylometric distance, or three coworkers saying “this sounds right” is not a sufficient voice evaluation. Nor should you optimize prompts directly on the one evaluator used for release gating; HyPerAlign illustrates how easily generator and judge can end up sharing the same explicit criteria. citeturn15view0

## Recommended architecture, evaluation protocol and remaining gaps

The evidence supports a voice system with **two separate retrieval channels, a compact relative style profile, few exemplars, and deterministic post-generation enforcement**.

### Recommended voice architecture

The logical order below is deliberate.

**Author evidence and factual context come first conceptually.** Build a separate per-user **evidence store** containing actual projects, experiments, measurements, experiences, recurring opinions and other material that may legitimately be cited. Retrieval is driven by the current brief. Every retrieved claim should preserve provenance. This solves the “54% own figures” problem without teaching the generator to hallucinate personal measurements. The need for this separation follows from the documented style/content entanglement and from content-independent representation research. citeturn2view0turn13search12

**Maintain the quantitative style model backstage.** Keep your existing measurements—sentence-length distributions, paragraph counts, character n-grams, pronoun rates, punctuation, register classifiers, humor frequency, evidence-use frequency, and so on. But use them primarily to infer the profile, choose examples, detect overshoot and evaluate generations. Your own 87→94% compliance result is evidence against automatically exposing every measurement as a generation constraint.

Turn statistically unusual features into **relative linguistic descriptions**. For example:

> **Defining tendencies**  
> More direct and more first-person than a generic post in this locale.  
> Conversational without becoming chatty or performatively casual.  
> Prefers concrete evidence over generic claims when real evidence is available.
>
> **Supporting tendencies**  
> Sentences are generally compact, with some rhythm variation.  
> Usually develops one idea rather than giving a comprehensive explainer.
>
> **Occasional tendencies**  
> Dry humor appears when the topic supplies an opening; it is not a recurring punchline.
>
> **Do not caricature**  
> These are tendencies, not quotas. Do not insert material solely to demonstrate a trait. Do not repeat a conspicuous mannerism several times merely because it appears in an example.

This design is most directly supported by register-guided/contrastive prompting and by HyPerAlign's finding that an explicit inferred profile can be an efficient personalization representation. The exact wording is a product hypothesis and needs your own A/B. citeturn4view1turn15view0

**Add a factual-integrity rule immediately beside the relevant style habit:**

> *Never invent personal experience, tests, measurements, quotes, outcomes or first-hand observations. When relevant author-supplied evidence is present in the factual context, prefer weaving it in naturally rather than making a generic assertion.*

That prevents an authorship metric from rewarding fabricated substance.

**Supply four to six target-language exemplars.** Keep a stable representative panel of about four examples selected to cover the author's stylistic range, plus zero to two dynamic examples where useful. Do **not** make all examples nearest neighbors of the current topic. Evidence from 2–10-shot author imitation, DITTO saturation and topic-similarity retrieval all points to this range and to the importance of diversity over raw count. citeturn16view3turn3view3

The exemplar block should explicitly state:

> *Learn manner, rhythm and decision patterns from these examples. Do not reuse their facts, named entities, claims or distinctive phrases unless those facts independently appear in the current factual context.*

That will not perfectly prevent leakage, so enforce a copy detector after generation.

**Put the current brief and permitted facts in their own delimited block.** Never mix author exemplars into the brief. This makes the content/style distinction visible to the model and to your later instrumentation.

**State length and structure as a preference, not a large stylometric contract:**

> *Write one compact social post, around this author's normal length. Usually one or two short paragraphs; avoid a list unless the content genuinely calls for one.*

Then separately state the product's truly hard maximum if one exists.

**Return only the draft.** Avoid asking the generator to produce a style audit, word count and explanation in the same response; those are separate tasks.

A compact assembled prompt could therefore look like:

```text
SYSTEM
Write a new social post in <target language> from the supplied brief and facts.
Never invent personal experiences, measurements, quotations, tests or results.

AUTHOR VOICE
Compared with a generic <locale> social post:
- Defining: <2–4 strongest relative tendencies>.
- Supporting: <2–4 recurring tendencies>.
- Occasional: <0–3 traits that belong to the repertoire but should not be forced>.

These are tendencies, not quotas.
Do not add material merely to display a style trait.
Do not intensify the same conspicuous trait repeatedly.

AUTHOR-SPECIFIC EVIDENCE AVAILABLE FOR THIS POST
<retrieved factual material, with only facts relevant to the brief>
<or: NONE>

VOICE EXAMPLES
<4–6 original-language examples selected for representativeness and diversity>

The examples teach manner, not facts.
Do not copy their distinctive phrases or import facts from them.

CURRENT BRIEF
<neutral brief>

OUTPUT SHAPE
One compact social post, near the author's normal length.
Usually <author's qualitative structure tendency>.
Return only the post.
```

The crucial thing missing is the giant vector of hard feature corridors. Those features remain in your **measurement layer**.

### Recommended generation loop

For an ordinary API, I would use:

`retrieve evidence → select voice exemplars → one generation → deterministic verification → at most one targeted revision`

The deterministic verifier checks character count, paragraph/list constraints, exemplar phrase overlap, unsupported first-person empirical claims, required facts, and obvious prohibited structures. DVR and black-box length-control research provide much stronger evidence for this external verification pattern than for relying on the original prompt to self-police every hard requirement. citeturn18view2turn19view3

When a revision is necessary, make it surgical:

```text
The draft is 1,146 characters; the hard maximum is 900.
Reduce it to 780–900 characters.

Preserve:
- all supplied factual claims;
- first-person perspective where already natural;
- the author's direct conversational rhythm.

Prefer deleting redundancy and generic explanation.
Do not replace the whole draft with a generic summary.
Return only the revised post.
```

For runaway length, also set a conservative API output-token ceiling. Do not treat that ceiling as the author-length model.

If quality is valuable enough to support more inference cost, generate **two or three candidates** and rerank using a composite author/style/factuality score. That is more API-compatible than activation steering and far cheaper operationally than maintaining per-customer adapters, though generation spend approximately multiplies with candidate count.

### When per-customer tuning becomes economically rational

Fine-tuning should not be dismissed. The current literature makes it a **second-stage product option**, not the default.

A customer becomes a candidate for adaptation when there is enough writing to learn stable behavior, generation volume is high enough to amortize training/storage, and prompt+retrieval has hit a measured fidelity ceiling.

The best available author-style numbers are substantial. StyleTunedLM's LoRA approach reaches .879 author-classifier accuracy versus .693 for five-shot in its ten-author study; DITTO beats its SFT baseline by about 11.7 points on average and wins a small human personalization study by 12–28 points over several alternatives. citeturn3view5turn3view4

But the cost data are also concrete. DITTO reports about **15 minutes on an A100 80GB per seven-demonstration personalization**, versus about **2 minutes for its SFT baseline**, with rank-16 LoRA. It also creates synthetic preference comparisons. citeturn7view0turn7view2

Those are research GPU times, **not vendor-neutral dollar costs**, and they do not quantify full-parameter fine-tuning. A responsible dollar figure cannot be given without a chosen model, cloud/vendor and serving strategy.

For millions of low-volume customers, per-user adapters are likely architecturally unattractive even if training is cheap. For a smaller number of professional high-volume authors, the equation can reverse. Activation vectors are especially interesting long-term because published work reports an 8% relative personalization gain with roughly 1,700× lower personalization storage than PEFT—but only if you control hidden activations, which takes you outside the ordinary-chat-API assumption. citeturn8search5turn8search6

The experiment worth running after the API architecture is mature is therefore **not** “full fine-tune for everyone.” It is:

`best API prompt+retrieval`  
versus  
`LoRA SFT`  
versus  
`DITTO-like demonstration adaptation`

on the **same authors, same held-out briefs, same multilingual evaluation stack**.

### Evaluation protocol to run

For the present Russian author, first rerun the experiment factorially. Your current “numeric corridors + three examples” condition bundles two interventions, so it cannot tell you which caused what.

At minimum compare:

| Condition | Purpose |
|---|---|
| no voice | generic baseline |
| current two directives | incumbent |
| inferred relative profile only | tests owner's hypothesis |
| numeric corridors only | isolates numeric control |
| four/five representative exemplars only | isolates demonstrations |
| relative profile + exemplars | candidate prompt architecture |
| relative profile + topic-nearest exemplars | tests retrieval choice |
| relative profile + diverse exemplars | tests diversity |
| profile + exemplars + factual RAG | tests full product system |

Use the **same brief for every condition**, paired by random seed where the API permits, and retain full outputs rather than only the first 800 characters.

Then move from one author to a hierarchical multilingual benchmark. For a serious release gate, I would target approximately **20 authors per locale × eight held-out briefs per author × three generations per condition**. Across sixteen locales that is 7,680 generations per condition. If this is initially too costly, reduce generations before reducing authors: the main risk you need to remove is author-specific overfitting, not sampling noise from a single author.

Split author material before any profile extraction:

`training posts → style profile + exemplar bank`

`held-out posts → only evaluation`

Also create a **topic-shift** subset, where test briefs differ from the themes represented by the chosen voice examples. This determines whether the system learned voice or merely learned content.

For every generation compute:

**Style-only metrics:** character n-gram distance, your measured stylometric vector, and a content-disentangling embedding such as mStyleDistance where the locale is actually supported. citeturn22search1turn13search12

**Author metrics:** multilingual MSR where supported, plus LUAR/STAR only in languages/domains for which you have independently validated them. citeturn22search9turn22search0

**Human-normalized controls:** distance human→same author, human→other author, generic model→author, candidate model→author.

**Content fidelity:** all brief facts retained; no contradictions.

**Unsupported-author-claim rate:** any unsourced “I tested…,” “I measured…,” “in my experience…,” specific score, date or quotation.

**Copy leakage:** exemplar ROUGE/n-gram overlap, long repeated substrings, rare-phrase reuse and imported exemplar entities/facts.

**Shape:** characters, tokens, paragraphs, list markers, sentence count.

Report the current 800-character metric **and** full-output metrics during the transition so you can tell whether historical gains were an artifact of truncation.

For human evaluation, use three native or near-native raters per item and blinded pairwise comparisons. Show the judges a small held-out reference bundle from the actual author, not the examples used in the generation prompt. Ask separately:

> Which candidate sounds more like the same writer?

> Which candidate better follows the supplied brief and facts?

> Does either candidate appear to invent personal experience or evidence?

> Which is more natural as a social post in this language?

Never merge those questions into one “overall quality” score.

Randomize A/B order, reverse the order on a controlled subset, and measure agreement. For the primary voice question, I would require approximately **α ≥ .80** before treating an aggregate human result as a strong product conclusion; lower agreement means you should inspect authors/locales rather than hide disagreement inside a mean.

Use an LLM judge only as an auxiliary signal. Use a judge from a different model family from the generator where feasible, length-match candidates, randomize both orders, and calculate order consistency. The documented position, self-preference, verbosity and cross-language effects make a one-pass LLM verdict inappropriate as the release criterion. citeturn21academia19turn21search4turn21academia20

Statistically, bootstrap or fit mixed-effects models with **author and brief as clustered/random factors**. Report paired deltas and confidence intervals by locale, not just a global mean. A system should not receive a multilingual “win” because English dominates the sample.

### What your current evidence already justifies changing

You have enough evidence now to stop treating feature-corridor compliance as the primary objective.

You do **not** yet have enough evidence to say hard metrics actively damage voice. The correct conclusion from the current Russian experiment is narrower: **they raised compliance without raising resemblance, and the bundled condition performed worse than your simpler incumbent.**

You have enough external evidence to replace “three arbitrary exemplars” with a deliberate **small representative/diverse set** and to test four to six rather than continuously increasing prompt count. citeturn16view3turn3view3

You have enough evidence to move length enforcement out of the voice specification and into a **hard external verification loop**. citeturn19view0turn19view3turn18view2

And your 54% own-measurement feature is strong evidence for building an **author evidence channel** separate from the voice channel. The literature's style/content problem says this is not merely a prompt-engineering preference; it is a question of what information exists at generation time. citeturn2view0turn13search12

### Honest gaps

The largest gap is **multilingual author-generation evidence**. We now have respectable multilingual instruction-following and authorship-representation benchmarks, but almost none of the headline individualized style-generation results have been replicated across a broad locale set. Your Russian experiment is therefore unusually valuable rather than anomalous. citeturn20search0turn22search9

There is no published head-to-head answer to your exact **relative descriptive profile versus absolute numeric stylometry** question. Register-control research provides partial support for relative directions and direct evidence of overshoot, but it does not settle author imitation. citeturn4view1

There is no established optimal exemplar selector for private-author generation. We know that **topic-nearest-only can be bad**, and that 2→10 examples often gives little additional gain; we do not yet know the universal balance of centrality, distinctiveness and diversity. citeturn16view3

There is no universally accepted separation between author style and author substance. Indeed, recent representation benchmarks indicate that whether semantic information is a bug or a feature depends on the downstream definition of authorship. citeturn13search12turn21search11

There is no evidence that an LLM can truthfully reproduce an author's evidence-driven habit when the underlying evidence is unavailable. In that regime, increased “author similarity” can literally reward hallucination.

There is no vendor-neutral dollar comparison of API prompting versus per-user LoRA/DITTO that remains meaningful independent of model/provider. The strongest style-specific compute figure I found is DITTO's roughly 15 GPU-minutes per seven-example user adaptation on an A100 80GB versus roughly two minutes for its SFT baseline; that should be treated as an order-of-magnitude research reference, not production TCO. citeturn7view0turn7view2

Finally, the licensing situation for several proposed evaluation checkpoints is **not sufficiently explicit in the publications to certify commercial use from papers alone**. Before adopting LUAR, STAR, Style Embeddings, mStyleDistance or MSR in a product, the actual code licence, checkpoint licence, training-data restrictions and upstream base-model terms should be audited independently. “Open paper,” “public repository,” and “commercially usable weights” are not equivalent. citeturn22search0turn22search8turn22search9

The owner's thesis therefore survives the research, with an important amendment: **hard corridors are probably the wrong primary representation of voice, but quantitative stylometry is still extremely valuable. Move it from the generator's steering wheel to the instrumentation panel.** Use measurements to discover what is unusually authorial, turn the strongest findings into restrained relative directions, show the model a small and diverse set of real target-language examples, supply author-specific substance through a separate factual retrieval path, and enforce genuinely hard requirements with deterministic verification rather than hoping a prose prompt will simultaneously optimize resemblance, counting, structure and truth.