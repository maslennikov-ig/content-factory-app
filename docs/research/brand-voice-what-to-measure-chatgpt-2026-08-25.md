# Evidence-Based Multilingual “Brand Voice”: What Can Be Measured, What Transfers, and What Should Ship

The central product conclusion is unusually clear: **do not replace the current eight formatting scales with another small set of supposedly deeper psychological scores.** The evidence supports a two-layer architecture.

The deterministic layer should contain **observable linguistic behaviours** that can be defined locally and audited: reader/self-reference, T–V or honorific address where the language actually marks it, hedge/booster markers, discourse markers, explicit admissions of error, punctuation and structure, function-word profiles, and character n-grams. The model layer may estimate semantic phenomena such as humour, self-disclosure, perceived warmth, politeness, or irony, but those should be explicitly labelled model-derived and should not be prerequisites for voice profiling.

Your own experiment strongly points in the same direction. The current eight scales were almost useless for discriminating the author from another writer, while character 5-grams were highly discriminative; yet forcing the generator to obey those scales did not make it stylometrically more author-like. That suggests three distinct objects that the product should stop conflating:

**identity signal** — “does this statistically resemble this author?”;  
**interpretable style profile** — “what does this writer habitually do?”;  
**generation controls** — “which behaviours should the model reproduce?”

Character n-grams are excellent candidates for the first, but poor explanations. Address, stance and self-reference are much better explanations and controls, but generally weaker fingerprints. That separation is more defensible than expecting one set of eight or twelve numbers to do all three jobs.

## Measurable dimensions and register frameworks

### ESTABLISHED

Biber’s multidimensional analysis is the most important precedent, but also the easiest one to misunderstand. MDA does **not** begin with psychologically appealing labels such as “warmth” or “confidence.” It counts many linguistic features, identifies features that covary across texts by factor analysis, and only then gives the resulting dimensions functional interpretations. The classic English analysis yielded dimensions such as **Involved versus Informational Production**, **Narrative versus Non-narrative Concerns**, **Explicit versus Situation-dependent Reference**, and **Overt Expression of Persuasion**. Later cross-linguistic work found analogous functional organization without claiming that every English surface feature or every English factor transfers unchanged. citeturn1search7turn0search14

This matters because the original MDA literature contains something much closer to the reliability evidence your product needs than most modern “style classifier” papers. Biber’s 1990 sampling study repeatedly cut texts into 1,000-word samples. Across **four 1,000-word samples**, item-standardized reliability coefficients were .9226 for first-person pronouns, .9029 for third-person pronouns, .9678 for contractions, .9483 for past tense, .8984 for present tense, .9652 for nouns, .9371 for prepositions, .9508 for relative clauses, .7385 for passives, and .7889 for conditional subordination. With only **two 1,000-word samples**, however, reliability ranged dramatically—from .9503 for prepositions and .9462 for present tense down to .5778 for relative clauses and .3116 for conditional subordination. Aggregating several 1,000-word samples made common grammatical features substantially more stable: coefficients in another analysis were roughly .959–.978 for first-/third-person pronouns, past tense, nouns and prepositions. citeturn21view1turn20view1

That is directly relevant to your 2,000–20,000-word range. **Two thousand words is enough for some high-frequency behaviours but demonstrably not enough for every syntactic feature. Around 4,000–5,000 words is a much safer generic floor for corpus-level style profiling.** That converges with Eder’s multilingual stylometric experiments: depending on corpus, the minimum effective sample ranged from about **2,500 words for Latin prose to roughly 5,000 words in most tested corpora**, including English, German, Polish and Hungarian novels. Eder also reported no simple split whereby inflected languages systematically required more text. citeturn22search3

The important limitation is genre. Eder used literary corpora, and Biber’s sampling study covered established written and spoken registers, not Telegram-style channels. **Five thousand words is therefore an evidence-informed product threshold, not a validated universal threshold for social posts.** Your own 153-post experiment is unusually valuable precisely because it supplies domain-specific evidence that the published literature does not.

Cross-linguistic MDA is real. Biber’s 1995 cross-linguistic synthesis incorporated English, Nukulaelae Tuvaluan, Korean and Somali. A dedicated Somali analysis used **65 linguistic features, 279 texts and 26 registers** and recovered five dimensions; the functional organization included personal involvement, informational purposes, interactiveness and production circumstances rather than a universal written-versus-spoken axis. citeturn1search3turn0search14 Brazilian Portuguese MDA likewise produced a multidimensional register description rather than simply importing English raw scores. citeturn1search24

The strongest recent evidence for the higher-level claim is Li, Dunn and Nini’s study of **60 languages**, comparing comparable register-specific corpora. They found that the relation between communicative context and register variation remains remarkably stable cross-linguistically. That supports the proposition “register is a cross-linguistically meaningful object”; it does **not** support the proposition “the English Biber tagger or English factor coefficients can be translated word-for-word into 60 languages.” citeturn18search15turn18search7

For your constraints, full MDA has an uncomfortable implication: classic dimensions draw on tense/aspect, pronouns, passives, relative clauses, nominalizations, subordination and other morphosyntactic categories. A complete implementation therefore needs substantial language-specific tagging or parsing. It is **Tier C**, not a suitable literal implementation for the no-parser deterministic layer. What is portable is the methodological principle: measure **bundles of observable behaviours**, validate their stability, and give the resulting bundle a functional, reader-friendly interpretation.

A practical evidence table looks like this:

| Dimension or signal | Exact operationalisation suitable for the product | Evidence on minimum/reliability | Parser/model? | Portability tier |
|---|---|---|---|---|
| **Character n-gram fingerprint** | Unicode-normalize text; count overlapping character 3–5-grams including spaces/punctuation where meaningful; convert to relative frequencies; compare author/profile by cosine, Delta-like standardized distance, or held-out rank discrimination | Stylometric literature puts a broad reliable-attribution region around 2.5k–5k words, ~5k in most Eder corpora. Character n-grams are known to be robust under topic/genre change relative to many word features. citeturn22search3turn2search4 | No | **A** |
| **Punctuation/layout profile** | Rates of `? ! … — : ;`, repeated punctuation, parentheses, quotes, emoji, paragraph breaks, one-line paragraphs, list-like lines; distributions rather than one mean | Easy to estimate at 2k words, but published author-voice validity is weaker than for n-grams; your experiment independently shows that a small formatting bundle is not sufficient | No | **A** |
| **Function-word profile** | Relative frequencies of a language-specific closed-class inventory; preferably retain the whole vector rather than collapsing it to one score | High-frequency grammatical categories are among Biber’s most stable features at 4k–5k words; stylometric validation is extensive, but content-independent “voice” validity is not perfect. citeturn21view1turn22search3 | No parser if surface forms suffice | **B** |
| **Self-reference** | First-person singular/plural markers per 1,000 addressable units; keep `I/me/my`-like, `we/us/our`-like categories separate | First-person-pronoun reliability was .9226 across four 1,000-word samples and .8290 across two in Biber’s study. citeturn21view1 | No in languages with overt pronouns; morphological complications elsewhere | **B**, sometimes **C** |
| **Reader orientation** | Second-person markers, vocatives, reader-directed questions, direct imperatives where safely detectable; report per 1,000 words/sentences | High-frequency address markers should be estimable in your range, but there is no universal published minimum for “reader orientation” as one scale | No for pronouns/vocatives; imperatives often need morphology | **B/C** |
| **Involvement versus informationality** | Reduced deterministic version: self/reader pronouns + questions + contractions/colloquial markers + selected discourse markers, reported separately and optionally as a documented composite; full version uses Biber loadings | Full Biber MDA is extensively validated; 1,000-word feature counts have heterogeneous reliability, while several thousand words are substantially safer. citeturn21view1turn1search7 | Full version needs tagger/parser | **B** reduced; **C** full MDA |
| **Epistemic stance** | Hedge, booster and explicit evidential marker rates; hedge-to-booster balance; optionally separate epistemic verbs, adverbs, particles, evidentials | Hedge detection has published shared-task validation, but corpus-level minimum-text reliability is not well established. citeturn10search14 | Surface markers: no; scope/meaning: parser/model | **B/C** |
| **Address formality** | Language-specific T/V or speech-level marker counts; never force all languages onto a single pronoun scheme | Linguistically well established cross-linguistically; universal corpus-level reliability threshold has not been published. WALS explicitly distinguishes pronominal politeness systems. citeturn23search1 | Usually no for T/V; full ja/ko honorific analysis is heavier | **B/C** |
| **Directness / mitigation** | Rate of explicit mitigation markers, conventional indirect request frames and softened directives; semantic politeness/directness classifier only as an optional layer | Computational politeness research validates utterance-level cues and classifiers and shows relationships with social power. citeturn25view0 | B for cues; model/parser for general inference | **B/C** |
| **Humour / irony** | Do not operationalise true humour as punctuation. Optional model outputs probability/percentage of posts containing humour; irony separate | In SemEval-2018 English tweets, best binary irony F1 was **.71**; fine-grained type F1 **.51**. A targeted hand-feature system achieved only **.5914 F1**. citeturn24view1turn24view2 | Model for credible detection | **C** |
| **Concreteness** | Mean/median concreteness norm of covered content words plus coverage rate; never silently impute uncovered words | English Brysbaert norms contain 37,058 words + 2,896 expressions from >4,000 raters. citeturn17search0 | Large lexical norm; morphology/tokenization issue | **C** |
| **Self-disclosure / own-error admission** | Keep explicit first-person and fixed “I was wrong/my mistake”-type markers separate from semantic disclosure | Modern self-disclosure extraction is normally treated as span classification, including model-based work in Chinese; simple self-reference is not equivalent to disclosure. citeturn12search28 | B for explicit formulas; model for general disclosure | **B/C** |
| **Warmth** | Do **not** call a deterministic word count “warmth.” At most expose “affiliative cues”: thanks, positive reader-directed expressions, greetings, encouragement | Warmth/competence is a validated social-perception framework, but validation as an intrinsic authorial writing-style scale is much weaker. citeturn9search8turn9search18 | Model/human rating for perceived warmth | **B proxy / C construct** |

The practical minimum I would use is therefore:

**below 3,000 words:** provisional profile, confidence warning;  
**3,000–5,000 words:** high-frequency A/B features are usable, but low-frequency phenomena should be suppressed;  
**5,000–10,000 words:** normal product-quality deterministic profile;  
**above 10,000 words:** enough material to estimate rarer behaviours and split the corpus to measure stability.

Those boundaries are a product interpretation of Biber’s and Eder’s evidence, not published universal cut-offs. citeturn21view1turn22search3

### CONTESTED

The phrase **“style dimension”** covers at least three scientifically different things.

Biber dimensions are latent patterns of co-occurring grammatical features linked to communicative situations. Stylometric dimensions such as n-gram distances are optimized to separate authors. Reader-perceived dimensions such as formality or warmth are judgments about communicative effect. They need not coincide. In fact, your finding that hard-constraining eight understandable scales improved constraint compliance without improving author similarity is exactly what one would predict if **controllability and authorship discrimination are partially orthogonal**.

There is also a real disagreement about how “content-free” stylometry is. Character n-grams are exceptionally effective, but they encode spelling habits, punctuation and morphology **alongside topic-bearing substrings and recurring vocabulary**. Their high author discrimination should therefore be retained as an empirical fingerprint, not interpreted to a customer as “94% of your voice.”

MDA’s cross-linguistic success is sometimes overstated. The evidence supports recurring **functional pressures** on register; it does not establish a universal vector of English counts. The Somali and Brazilian Portuguese results are evidence for language-specific multidimensional analyses, while the 60-language study supports contextual/register stability at a higher level. citeturn1search3turn1search24turn18search15

### FOLKLORE

Three propositions should be rejected.

“Sentence length is voice.” It is one observable style property, not a sufficient voice construct.

“A dozen intuitive style sliders will uniquely identify an author.” Your own experiment directly contradicts that.

“Biber already gives us a universal set of six personality-like writing dimensions for every language.” It does not. MDA is a methodology and empirical register theory; full implementations rely on substantial linguistic annotation, and its dimensions are not personality types. citeturn1search7turn1search3

## Portability tiers and licence audit

### ESTABLISHED

The most important implementation rule is to distinguish **language-independent algorithms**, **small native-speaker-maintained inventories**, and **external linguistic resources**. The product should strongly prefer the first two because they can be audited, versioned and legally owned.

I would define the tiers this way:

| Measurement | Tier | New-language material | Realistic one-language effort | Validation before shipping |
|---|---:|---|---|---|
| Character n-grams | **A** | None | Engineering only | Split-half and held-out author discrimination |
| Unicode character-class rates, emoji, punctuation, repeated punctuation | **A** | None beyond Unicode processing | Engineering only | Test script normalization and punctuation fixtures |
| Character/paragraph/line-length distributions | **A** | None | Engineering only | Bootstrap stability |
| Paragraph/list/layout patterns | **A** | None, provided patterns are Unicode rather than Latin-centric | Engineering only | Native fixture tests |
| Question/exclamation terminal rates | **A** with caveat | Generic Unicode terminal inventory | Engineering | Check locale punctuation (`？`, Arabic `؟`, etc.) |
| Character n-gram author-distance | **A** | None | Engineering | Cross-topic held-out validation |
| Function words | **B** | Roughly **100–250 base surface entries**, potentially 150–400 when contractions/inflected closed-class variants must be included | One native-speaker day is plausible | Independent native review + concordance audit + split-half stability |
| Reader/self pronouns and address forms | **B** | Typically **10–80 forms/patterns**, larger in languages with kinship-based address | Hours to one day | Hand-label several hundred occurrences, not sentences sampled only from matches |
| Discourse markers | **B** | **30–100** high-frequency markers | One day | Precision audit and corpus-frequency check |
| Hedges / boosters | **B** | About **30–100 per family** for a conservative high-precision inventory | One day per family | Sample both hits and non-hits; check polysemy |
| Explicit evidentials | **B** where lexical/particle-based | Usually **10–60** markers/patterns | Hours to one day | Native contextual annotation |
| Explicit own-error formulas | **B** | **15–50** formulas/patterns | Hours | Precision/recall against native hand annotation |
| Greeting/thanks/affiliative cues | **B** | **20–80** conservative formulas | Hours | Do not validate as “warmth”; validate only literal cue detection |
| T–V address | **B** where overt | Usually small pronoun/verb-form inventory | Hours | Crucially distinguish formal singular from ordinary plural where possible |
| Japanese basic plain/polite endings | **B** as partial detector | Curated sentence-final patterns | About a day with an expert | Native sentence annotation |
| Full Japanese keigo / Korean speech-level and honorific analysis | **C** | Morphosyntactic analyser or substantial rules | Multi-week+ | Gold annotation |
| Full Biber MDA | **C** | POS/morphology/syntax features + language-specific validation corpus | Major project | Reproduce published MDA-style validation |
| General politeness/directness | **C** | Annotated corpus/classifier | Major | Out-of-domain/cultural validation |
| Humour/irony/self-deprecating humour | **C** | Annotated data/model | Major | Human-labelled test set |
| Semantic self-disclosure/error admission | **C** | Annotated data/model | Major | Span or post-level human labels |
| Concreteness/imageability | **C** | Thousands to tens of thousands of human word ratings | Major | Coverage and reliability study |
| Linguistic Category Model abstraction | **C** | Semantic verb/adjective classification plus syntax | Major | Language-specific coding validation |
| Perceived warmth/competence | **C** | Human-labelled text or trained model | Major | Validate against independent human ratings |
| Big Five / HEXACO / MBTI / DISC from text | **C** | Trained psychological prediction model and criterion labels | Major | External criterion validity; **not recommended as voice foundation** |
| Percentiles or z-scores “relative to other writers” | **C calibration layer** | A representative reference corpus for that language/register | Major data resource | Reference-corpus representativeness and temporal stability |

The suggested Tier B list sizes are **product-engineering recommendations, not literature-defined magic numbers**. A closed list should be deliberately small enough that every entry can be reviewed in context by a competent speaker. The objective is not dictionary coverage; it is high-precision detection of a linguistically coherent behaviour.

The validation protocol should also be language-neutral. For every Tier B family, have one native speaker create the inventory and another review it independently. Then sample at least several hundred corpus contexts, including both matched and unmatched examples; calculate precision and, where a genuine annotation task is possible, recall/F1. Finally split long author corpora by posts and require acceptable profile stability. The last step is especially important because a perfectly accurate dictionary can still produce an unusably noisy author-level metric if the behaviour occurs twice in 5,000 words.

For generic Unicode processing, there is no licensing obstacle comparable with proprietary NLP dictionaries. Unicode data and software are under the **Unicode License v3**, which explicitly permits use, modification, publication, distribution and sale subject to retaining the notice. ICU describes its licence as nonrestrictive and suitable for commercial and open-source software. Those are appropriate foundations for an AGPL product. citeturn15search4turn15search6

Tier B should ideally contain **only lists authored or commissioned by your company**, and those lists should be shipped under **AGPL-3.0 together with the product** or under an explicitly chosen permissive data licence such as CC0 if you want independent reuse. That removes the licensing uncertainty that caused the English/Russian dictionary problem in the first place.

The Tier C situation is much worse.

**LIWC.** The official LIWC repository currently lists translated dictionaries for Brazilian Portuguese, Simplified and Traditional Chinese, French, German, Italian, Japanese, Russian, Spanish and Turkish, in addition to the core English product. Among your sixteen locales, that means official LIWC-family coverage exists for **en, de, es, fr, it, ja, pt-BR, ru, tr and zh**. It does not list official translations there for **ar, bn, he, ka, ko or vi**. More importantly, access to the translation repository requires an active LIWC licence, the repository is restricted to academic users, and the site explicitly directs commercial multilingual users to a commercial provider. **These dictionaries are therefore not AGPL-shippable dependencies for your product.** citeturn16search0

That point should not be softened: LIWC is interesting research evidence but **not a practical resource strategy for this AGPL product**.

**Concreteness norms.** English is exceptionally well served: Brysbaert et al. provide ratings for **37,058 words and 2,896 two-word expressions**, collected from more than 4,000 participants. citeturn17search0 French has a published set of **1,659 words**. citeturn17search27 Recent Italian/English contextual norms report high split-half and internal reliability. citeturn17search17 The NoRaRe catalogue indexes many further cross-linguistic norm resources, including material involving Chinese, Spanish, Russian and other languages, but an index entry is not a redistribution licence. citeturn17search2turn17search6 **I did not establish an explicit commercially redistributable licence for a sufficiently broad concreteness norm set across your sixteen languages. Under your hard rule, none of these should be built into the product until the underlying dataset licence has been individually cleared.**

The same conservative rule applies to warmth norms, irony corpora, politeness datasets and classifier weights. An article being open access does **not** automatically give the product redistribution rights to the accompanying labelled corpus or model weights. For example, ACL Anthology papers from 2016 onward are published under **CC BY 4.0**, including the SemEval irony paper, but that licence on the paper cannot safely be assumed to cover every underlying tweet, annotation or third-party model artefact. citeturn24view1

For model-based Tier C features, monetary cost should be represented provider-neutrally because the model vendor was not specified:

\[
\text{profile cost} =
\frac{T_{in}P_{in} + T_{out}P_{out}}{1{,}000{,}000}
\]

where \(T\) is token volume and \(P\) the provider’s current price per million tokens. As an illustrative normalized budget—not a claim about any vendor’s current tariff—at $1/M input and $5/M output, a 10k-input/1k-output batched profile costs $0.015; a 50k-input/3k-output profile costs $0.065. A semantic feature extractor should therefore batch the whole author corpus or many posts per call rather than call once per sentence. **The more important cost for your architecture is availability: every Tier C model-derived feature becomes unavailable when the workspace AI quota is exhausted, so no Tier C score may be required to construct the baseline profile.**

### CONTESTED

A seemingly simple Tier B feature can turn into Tier C depending on language.

“First-person pronouns” are Tier B in English because overt pronouns carry much of the signal. They are not equivalent to first-person reference in a pro-drop language where person is encoded in the verb or routinely omitted.

“Formality” is Tier B when the narrow question is “how often does this corpus use an overt T-form?” It becomes Tier C when the claim is “what level of interpersonal formality does this passage communicate?” Japanese and Korean make the distinction particularly obvious: pronouns alone miss central grammatical speech-level and honorific choices. WALS itself treats politeness systems as structurally heterogeneous rather than one universal pronoun switch. citeturn23search1turn23search13

“Certainty” can be Tier B if it means the frequency of an explicit hedge list and booster list. It is Tier C if it means the writer’s actual epistemic commitment to propositions, because words such as *may*, *think*, *apparently* or their equivalents are polyfunctional and their scope matters.

“Humour” never becomes Tier A merely because someone counts `😂`, `lol`, exclamation points or ironic quotation marks. Those are Tier A/B **humour cues**, not a validated humour detector. The performance gap in English tweet irony between a targeted feature system (.5914 F1) and the best SemEval system (.71 F1) is already a warning in an unusually cue-rich short-text domain. citeturn24view1turn24view2

### FOLKLORE

“Translate the English dictionary.” This is precisely the wrong portability strategy. Closed-class inventories, hedges, honorifics and discourse markers have language-specific grammatical distributions and pragmatic meanings.

“LIWC supports many languages, so it solves Tier C.” It neither covers all sixteen of your languages nor has an AGPL-compatible redistribution model. citeturn16search0

“A multilingual transformer makes the resource multilingual.” A multilingual encoder may accept sixteen scripts, but that says nothing about whether **humour, politeness, warmth or personality labels have been validated equivalently in those cultures**.

## The owner’s “stylistics” dimensions

### ESTABLISHED

The owner’s intuitions are substantially better aligned with what readers perceive than the existing eight scales, but the dimensions differ enormously in measurability. They should not all be presented with equal epistemic status.

| Desired concept | What can be measured deterministically | What requires a model | Product verdict | Tier |
|---|---|---|---|---|
| **Formality of address** | Explicit T/V pronouns/forms; titles; some polite/plain endings; lexical/formulaic formality cues | General perceived formality, especially English and complex honorific systems | **Good core dimension if reformulated language-specifically** | **B**, sometimes **C** |
| **Humour** | Laughter markers, emoji and explicit joke formulas only | Whether a passage is actually humorous | **Model-only as a semantic claim** | **C** |
| **Irony** | A few high-precision cues only | General irony recognition | **Do not claim deterministic measurement** | **C** |
| **Self-deprecating humour** | No generally reliable deterministic detector | Needs recognition of self-targeting + negative evaluation + humorous/nonliteral intent | **Model-only, experimental** | **C** |
| **Directness / hedging / mitigation** | Hedge, booster, request-softener and discourse-marker rates | Contextual directness/politeness and face-work | **Strong B proxy family; C for holistic score** | **B/C** |
| **Warmth** | “Affiliative cue” counts only | Human-perceived interpersonal warmth | **Do not equate word count with SCM warmth** | **B proxy/C** |
| **Certainty / epistemic stance** | Explicit hedges, boosters, evidentials | Scope-sensitive epistemic commitment | **Strong core B family** | **B/C** |
| **Concreteness / abstraction** | No satisfactory resource-free semantic measure | Norm lookup/classifier/semantic coding | **Useful research dimension, poor portability fit** | **C** |
| **Admission of own error** | Explicit high-precision formula patterns | Implicit admissions, narrative responsibility, ironic admissions | **Good B event/cue count + optional C semantic expansion** | **B/C** |
| **Self-disclosure** | First-person/self-reference is only a proxy | Actual disclosure of personal facts, feelings or experiences | **Model-only if called self-disclosure** | **C** |
| **Self-reference** | Pronoun/person-marker frequency | Usually unnecessary except pro-drop recovery | **Strong core observable** | **B**, sometimes **C** |

**Formality of address.** The first correction is terminological: do not create one universal `informal_address = true/false` feature. WALS distinguishes languages with no pronoun politeness distinction, binary European-type distinctions, and systems with multiple degrees; it explicitly gives German *du/Sie*, French *tu/vous* and Russian *ты/вы* as the familiar European binary type. citeturn23search1

For overt T–V systems, compute **marker-specific behaviours**, not an omniscient formality score:

\[
T\ rate = \frac{\text{informal second-person markers}}{\text{all explicit address opportunities}}
\]

\[
V\ rate = \frac{\text{formal-or-plural markers}}{\text{all explicit address opportunities}}
\]

and always expose **coverage**.

There is a major channel-post confound: in Russian *вы*, French *vous* and similar systems, the V form is also an ordinary plural. When an author is addressing thousands of subscribers, a V form can literally mean “you all,” not “I maintain formal social distance from one reader.” A deterministic system cannot manufacture that distinction. **Presence of an unambiguous T form can be strongly informative; presence of V in broadcast writing is not necessarily evidence of formality.**

Spanish, Italian, Portuguese and Turkish likewise permit useful language-specific T/V-style inventories, but regional usage must be encoded explicitly rather than assuming one national standard. Chinese has its own polite/familiar address contrast; Bengali and Vietnamese make interpersonal status visible through richer pronoun/kinship choices. These are reasons to treat the inventory as native-speaker linguistic data rather than translate the Russian implementation. Cross-linguistic typology confirms that pronoun politeness systems vary substantially. citeturn23search1

Japanese and Korean require a different definition. Japanese/Korean politeness cannot be reconstructed from second-person pronouns alone; relevant distinctions include speech style, sentence-final morphology, honorific and humble forms, and avoidance/substitution of pronouns. Research specifically comparing Japanese and Korean pronoun systems treats them as pragmatically unusual relative to simple European T/V paradigms. citeturn23search13 A **partial** Japanese plain-versus-*desu/masu* style detector can be Tier B; “uses keigo/formal honorific speech” is Tier C unless you are willing to build substantially richer morphological rules. Korean is at least as problematic.

For **English**, the correct answer to “how does the product measure informal reader address without grammatical T/V?” is: **it cannot measure the same variable.** Instead measure separate observables:

`reader_reference_rate`: *you/your/yours*;  
`casual_address_cues`: native-authored vocatives, greetings and informal discourse markers;  
`formal_formula_cues`: conventional formal/polite formulas;  
`contraction_rate`;  
optionally, `perceived_formality`: a model-derived Tier C score.

English formality classifiers have been built and human formality judgments have been collected across genres, but this is a perceived-register task, not an English replacement for grammatical T/V. citeturn7search0

**Humour and irony.** This is one of the clearest “model or do not claim it” cases. SemEval-2018 supplied **3,834 training tweets and 784 test tweets**; the best systems reached F1=.71 for binary irony and only .51 for fine-grained irony type. A deliberately interpretable targeted-feature entry scored .5914 F1. citeturn24view1turn24view2 If sophisticated English systems struggle on explicit short-form irony, punctuation/emoji rules cannot credibly be presented as a multilingual humour meter.

Self-deprecating humour is more difficult still: the system must establish that the negative evaluation targets the speaker, that it is humorous rather than genuinely distressed or factual, and often that it is nonliteral. A high-precision Tier B list can find literal formulas such as “I’m an idiot” equivalents, but calling those “self-deprecating humour” would be semantically unjustified.

**Directness, mitigation and face-work.** This is a better deterministic target if you measure **markers rather than inferred intentions**. A Tier B profile can report conventional hedges, request softeners, politeness formulas, modal/conditional frames where surface-detectable, discourse particles and direct-address constructions. Danescu-Niculescu-Mizil and colleagues operationalised politeness through cues associated with indirectness, deference, impersonalization and modality and demonstrated that computational politeness also varies with social status: higher-status users were, in their datasets, often less polite. citeturn25view0

That last result is a warning: politeness is **not just an author trait**. It varies with addressee, power relationship and situation. The product should say “this author’s posts contain more explicit mitigating cues” rather than “this author is a polite person.”

**Warmth.** The social-cognition literature gives warmth and competence much stronger construct validity than marketing copy often suggests: the Stereotype Content Model treats warmth as perceived intentions/trustworthiness/friendliness and competence as perceived capability/status, and the “Big Two” structure has been replicated across multiple social-perception settings. citeturn9search8turn9search18 But that literature validates **judgments of people and groups**, not a deterministic author-style dictionary.

Consequently, use a different name for the deterministic feature: **affiliative cues**. Count greetings, thanks, explicit appreciation, encouragement, affectionate address and perhaps carefully chosen positive reader-directed formulas from a native-authored Tier B list. A semantic “this passage feels warm versus dry” judgment is Tier C and should be validated directly against human readers.

**Certainty and epistemic stance.** This is one of the strongest candidates for the real product. At Tier B, maintain three inventories: **hedges**, **boosters**, and **explicit evidentials/source markers**. Report each separately plus a balance measure such as:

\[
stance\ balance =
\frac{boosters - hedges}{boosters + hedges + \epsilon}.
\]

Do not reduce them immediately to “confidence.” A writer can hedge because of scientific norms, politeness, legal caution or genuine uncertainty. Hedge detection has been important enough to support dedicated shared-task work, which also demonstrates why cue detection and scope detection are different NLP problems. citeturn10search14

The cross-language reformulation is important. English epistemic stance is heavily lexical/modal. In languages where evidentiality or epistemic distinctions are more tightly integrated into morphology, whitespace-token dictionaries lose recall. Under your no-parser constraint, a native linguist can sometimes supply suffix or sentence-ending regex families, but that remains an approximation rather than morphological analysis.

**Concreteness versus abstraction.** Psycholinguistic concreteness is real and unusually well normed in English: Brysbaert et al. collected ratings for 37,058 words plus 2,896 expressions from more than 4,000 participants. citeturn17search0 French has a much smaller 1,659-word set; Italian/English contextual norms also exist. citeturn17search27turn17search17 The basic operation is straightforward:

\[
author\ concreteness =
\frac{\sum_{w \in covered} rating(w)}
{|covered|}
\]

with **norm coverage reported alongside the score**.

Unfortunately this is almost the archetype of Tier C portability trouble: large open-class norms, lemmatization/inflection issues, sense ambiguity and inconsistent licensing. Translating English ratings does not create validated Russian, Arabic, Korean or Georgian norms.

The **Linguistic Category Model** offers another principled abstraction hierarchy, ranging from concrete descriptive action verbs toward more abstract state predicates and adjectives, but automatic LCM coding requires semantic verb/adjective classification and usually syntactic information. It therefore fails your deterministic portability constraint even though the underlying psychological framework is respectable. citeturn11search6turn11search21

**Admission of one’s own error, self-disclosure and self-reference must be split into three features.** They are not synonyms.

`self_reference`: first-person markers, Tier B and deterministic.

`explicit_error_admission`: fixed constructions equivalent to *I was wrong*, *my mistake*, *I misunderstood*, *we got this wrong*. This can be a high-precision Tier B event count.

`self_disclosure`: revelation of personal experience, feeling, identity or private information. This is semantic. Recent computational work treats it as a span-level/model task rather than a pronoun count. citeturn12search28

A writer who says “I think the API is broken” constantly has high self-reference but has not necessarily disclosed anything. A writer can disclose “my father died last year” without using humour or admitting an error. A writer can describe the organization’s mistake without accepting personal responsibility. A product that combines these into “vulnerability” would be psychologically attractive and scientifically muddy.

### CONTESTED

**Politeness universals versus cultural specificity** remains an important debate. Cross-linguistic typology clearly shows that languages grammaticalize respect differently, while computational studies show that politeness usage changes with social relationships and power. citeturn23search1turn25view0 Brown-and-Levinson-style concepts such as mitigation, face threat and indirectness are useful sources of operationalizable hypotheses, but they should not be treated as a universal scalar conversion in which “more indirect = more polite” in every community.

**Warmth** is similarly contested at the product level. Social-cognition warmth is well established; “warm writing” is an everyday reader perception. It does not follow that a LIWC-like positive-affect count is a validated bridge between them.

**Concreteness** has robust lexical norms, but author-level “abstractness of voice” can be topic-driven. A philosopher writing about contracts and a food writer describing ingredients differ in topic as much as style. A profile should therefore say “uses more concrete lexical material in this corpus” rather than reify abstraction as an author essence.

### FOLKLORE

“Uses emojis, therefore humorous.” Unsupported.

“Uses *please*, therefore polite.” At best a cue.

“Uses many *I*s, therefore narcissistic/self-disclosing.” Unsupported by the observable.

“Rarely hedges, therefore confident.” The same pattern can reflect genre norms, expertise, rudeness, compressed writing, or editing conventions.

“Formal English means fewer *you*s.” English second-person frequency principally measures reader orientation; it is not a grammatical T/V formality switch.

## Personality typing from text

### ESTABLISHED

The evidence supports a very asymmetric conclusion: **Big Five and HEXACO are legitimate personality frameworks; that does not make personality inference from 2,000–20,000 words a sufficiently accurate or portable representation of brand voice. MBTI is weaker as a typology. DISC is weaker still as a scientific foundation for text inference.**

| Framework | Psychometric standing | What text prediction actually achieves | Short/social-text evidence | Cross-language evidence | Product verdict |
|---|---|---|---|---|---|
| **Big Five / OCEAN** | Strong mainstream dimensional framework | Typically modest correlations, not near-diagnostic inference | Best evidence among the four; Facebook and other social media studied | Far weaker than English evidence; feature relations not demonstrated invariant across your 16 | **Do not infer as brand voice; optionally use only as a secondary experimental label** |
| **HEXACO** | Strong dimensional framework, adds Honesty-Humility | Some promising text-based results, but much thinner literature | Limited; strongest text studies often use elicited open-ended answers | No convincing all-16 transfer record | **Psychometrically respectable, text inference not production-ready** |
| **MBTI** | Internally consistent scales can exist, but typological/dichotomous interpretation is weak | Text classifiers generally predict self-selected labels rather than independently establishing type | Thin and often platform-specific | No defensible multilingual portability basis | **Do not infer or steer from it** |
| **DISC** | Vendor-specific family rather than one canonical scientific trait model | No robust text-inference literature comparable with Big Five | Essentially absent for this use | Essentially absent | **Do not build on it** |

**Big Five.** The classic large social-media result is Park et al.: language from **66,732 Facebook users** was used to predict questionnaire Big Five scores. citeturn13search1 Open-vocabulary models achieved correlations with self-reported traits of about **r=.31 to .41**, with openness at the high end, versus about **r=.21–.29** for the closed-vocabulary approach. citeturn27search6 A later paper describing the Park models reports openness predictive accuracy of **r=.46** under its quoted specification, illustrating that exact coefficients vary with evaluation/model version. citeturn27search1

Those are meaningful correlations—but they are nowhere near “we know this person’s personality from their posts.” An r=.30 prediction explains about **9% of criterion variance**; r=.40 about **16%**.

The more important synthesis is Moreno et al.’s meta-analysis of **23 independent estimates**: combined correlations for computational language indicators and Big Five traits were in the small-to-moderate range, approximately **r=.26–.30**, including r=.26 for agreeableness/neuroticism and r=.30 for openness. citeturn27search0turn26search4 A later synthesis cited in 2025 reports another 26-study meta-analytic range around **r=.29–.40**. citeturn27search21

Park’s language-based assessments did show longitudinal stability: later summaries report average test–retest reliability around **.70** across six-month intervals. citeturn27search26 This is evidence that the model captures some persistent individual signal. It is not evidence that all of that signal is personality rather than persistent topic, community, demographics, interests or register.

The replication record is therefore **“real but modest signal,” not “personality can be read accurately from prose.”** Recent work explicitly examining limits of automatic text-based personality recognition and failed cross-validation of some dictionary–Big-Five relationships reinforces the need for out-of-domain testing rather than headline accuracy. citeturn27search33turn27search25

For text quantity, the strongest large social-media studies generally use aggregated user histories rather than demonstrating a clean minimum-word learning curve. **There is no published basis for telling your customer that exactly 2,000, 5,000 or 20,000 words is sufficient for accurate Big Five recovery.** This is a major gap. Your range is large enough to contain stylometric signal; that is not the same as sufficient personality criterion validity.

Cross-language transfer is weaker again. Big Five questionnaire structures have broad cross-cultural support, but an English text predictor learns lexical, topical and pragmatic correlates specific to its training population. There is no evidence reviewed here supporting one English text-to-Big-Five model across **ar, bn, de, en, es, fr, he, it, ja, ka, ko, pt, ru, tr, vi, zh** with comparable criterion validity.

**HEXACO.** As a psychometric model, HEXACO deserves to be treated separately from MBTI/DISC. HEXACO-100 has good stability at the domain level: later work reports a median **13-day domain test–retest reliability around .88**; individual items are naturally less stable, with a median item retest of **.65** and range .39–.84. citeturn27search24turn27search7

There is also genuine language-inference evidence. One study predicting HEXACO from answers to open-ended questions reported an average correlation of **r=.37 across the six dimensions** between self-rated and language-inferred scores. citeturn13search4 But that task is unusually favorable: respondents answer prompts capable of eliciting personality-relevant content. It is not equivalent to passively reading 153 product/news/channel posts. No evidence establishes that r=.37 transfers to your short-form author corpora or to sixteen languages.

**MBTI.** The critical literature is more nuanced than the internet slogan “MBTI has zero reliability,” but the product conclusion is still negative.

McCrae and Costa compared MBTI dimensions with the Five-Factor Model in **468 adults**. Their conclusion contains the key distinction:

> “There is no support for the view that the MBTI measures truly dichotomous preferences or qualitatively distinct types.”

They found that MBTI indices could largely be understood as continuous dimensions associated with four Big Five factors, and questioned the distinct interpretation of Judging–Perceiving. citeturn5view1

An older review by Carlson was more favorable about the instrument’s reliability evidence, describing split-half and test–retest correlations as generally satisfactory while noting that the construct-validity literature was not systematic. citeturn5view2 The newest important counterweight is Erford et al.’s 2025 synthesis of **193 studies from 1999–2024**: MBTI Form M internal consistency was **.845–.921**, and convergent evidence with related constructs was described as robust across six instruments. But the same review reports that **structural-validity and test–retest studies were absent from the sampled 25-year literature**, despite aggregating type proportions across 178 articles and 57,170 participants. citeturn25view2

So the rigorous conclusion is not “MBTI items are random.” It is: **continuous MBTI scale scores can be internally consistent, while the psychologically appealing discrete sixteen-type interpretation is much less well supported.** That is fatal for your use case, because it is precisely the discrete type that would be used as a generation steering persona.

**DISC.** Commercial DiSC instruments can report respectable instrument-specific reliability; for example, the Everything DiSC vendor reports median coefficient alpha **.87** and median test–retest **.86**. citeturn26search17 But “DISC” is not one universally standardized open psychometric instrument, and I found no body of independent text-prediction evidence remotely comparable to the Facebook Big Five literature. There is therefore no defensible basis for turning an author’s posts into D/I/S/C scores and treating those scores as a validated latent voice representation.

### CONTESTED

The main Big Five dispute is not whether personality relates to language—it does—but **how much of the relation generalizes**.

Large datasets make r=.3 statistically overwhelming, yet r=.3 is still an imprecise individual-level estimate. Open-vocabulary models outperform dictionary approaches partly because they exploit thousands of words/topics that may encode demographics, interests and social context alongside personality. The fact that Park’s assessments have temporal stability is encouraging, while failed cross-domain/cross-validation studies warn against assuming that lexical correlates are universal. citeturn27search6turn27search26turn27search25

There is also a conceptual distinction between **generating text perceived as extraverted** and **accurately inferring the writer’s Extraversion**. A model may successfully produce terse, energetic, sociable-sounding copy from a personality prompt without proving that an inferred psychological score was correct.

### FOLKLORE

“Big Five can be predicted at 80–90% accuracy from text.” Accuracy headlines often come from binarized traits, balanced datasets or closed benchmarks. For continuous psychological prediction, correlations around **.26–.40** are much closer to the empirical center of gravity. citeturn27search0turn27search21

“MBTI is unusable because it has zero reliability.” Too crude: recent Form M internal-consistency estimates are high. The stronger criticism is its **type/dichotomy and structural interpretation**, not that every item is noise. citeturn25view2turn5view1

“HEXACO is more scientific, therefore we can infer it from a Telegram channel.” The first clause does not establish the second.

“DISC is a convenient four-dimensional writing-style system.” There is no adequate text-inference validation for that use.

For this product, **use observable style behaviours instead of inferred personality**. Big Five/HEXACO could be offered only as explicitly experimental model-generated metadata or, more defensibly, as **user-declared creative controls** (“make this draft more outgoing/reflective”), not as claims about who the writer psychologically is.

## Profiles as deviations from norms

### ESTABLISHED

Yes: there is a substantial published precedent for describing style as **deviation from a corpus norm**.

Burrows’s Delta, one of the foundational stylometric methods, standardizes each frequent word’s relative frequency against the reference corpus:

\[
z_{i,a}=\frac{f_{i,a}-\mu_i}{\sigma_i}.
\]

An author is therefore represented not simply by “uses *and* 2.8% of the time,” but by “uses *and* 0.7 standard deviations more than the comparison corpus.” Delta then compares standardized profiles. Later methodological work explicitly describes this as normalization of each word over the corpus mean and variance. citeturn18search0

That is extremely close to the owner’s desired narrative:

> jokes more than most people  
> addresses the reader informally more often  
> hedges less than comparable writers  
> rarely asks questions

Biber-style MDA also depends on normalization and relative placement of texts/registers, although its aim is register dimensions rather than author individuality. citeturn18search2turn1search7

For your product, I would make **norm-relative description the presentation layer**, but not pretend that one global norm exists.

For an observable feature \(x\), keep three numbers:

**raw author rate** — scientifically auditable;  
**reliability/confidence** — how stable it is across this author’s posts;  
**reference percentile or robust standardized deviation** — intelligible comparison.

For example:

> **Reader-directed questions:** 3.1 per 1,000 sentences; 9th percentile among Russian channel writers; high profile stability.

or:

> **Explicit hedging:** 0.6 standard deviations below matched channel norm; moderate confidence.

For skewed stylistic rates I would prefer empirical percentiles or a robust z-score over a naïve mean/SD z-score. A practical robust standardization is:

\[
z_{robust}=
\frac{x-\mathrm{median}(X)}
{1.4826\,MAD(X)}.
\]

That robust formulation is a **product proposal**, not a claim from Burrows.

Crucially, the reference corpus must be matched at least by **language and broad register/platform**. Li, Dunn and Nini’s 60-language evidence strengthens this requirement: linguistic variation is systematically tied to communicative situation across languages. citeturn18search15 Comparing a Telegram entrepreneur to academic journal articles and reporting “more informal than average” would mostly rediscover register.

This also offers a better way to validate stability. For every author with enough material:

1. split posts randomly into two balanced halves many times;
2. calculate the complete profile separately;
3. measure each feature’s split-half agreement and the profile-vector agreement;
4. repeat for raw rates and norm-relative scores;
5. suppress labels whose confidence remains low.

This is vastly better than declaring a global “minimum 5,000 words” and showing every dimension regardless of its event count.

### CONTESTED

There is **not** good evidence that I found showing that a lay-facing profile of percentile deviations such as “jokes more than 82% of writers” is intrinsically more stable than the underlying raw rates. Standardization changes scale and comparability; it cannot manufacture signal from an unreliable feature.

Nor is norm-relative representation automatically cross-language portable. A percentile can make **presentation** comparable:

> 90th percentile in reader-directness within Russian channels  
> 90th percentile in reader-directness within Japanese channels

but those two percentiles may be calculated from quite different underlying linguistic markers. That is actually the correct architecture: **functional label shared where justified, language-specific operationalization underneath**.

There is also no convincing evidence located here that such profiles make LLM generation more author-like. Your experiment already demonstrates that enforcing interpretable statistics can leave stylometric proximity unchanged. The normative profile may be much better for explanation while still not being the optimal generation loss.

The safest design is therefore:

**describe with interpretable deviations; verify with stylometric distance; generate from exemplars plus selected behaviour instructions.**

Do not require those three components to use the same representation.

### FOLKLORE

“A percentile is more scientific than an absolute rate.” Not automatically. It is only as good as its reference population.

“Normalize across all writers on the internet.” Register, platform, period, demographic composition and topic distribution would contaminate the interpretation.

“Once everything is converted to z-scores, English and Japanese become comparable.” Mathematical standardization is not semantic measurement invariance.

## Cross-linguistic failure modes

### ESTABLISHED

The sixteen-language requirement changes several recommendations that would be acceptable in an English-only product.

| Language property | What breaks | What survives well | Required reformulation |
|---|---|---|---|
| **Morphologically rich / agglutinative** — relevant to ru, tr, ka and others | Surface word-form dictionaries fragment; person/evidentiality may be inside words; nominal/deverbal categories cannot be reliably inferred from suffix resemblance alone | Character n-grams; punctuation; paragraph features; many invariant particles | Add surface-pattern families only where native validation shows adequate precision; otherwise mark feature C |
| **Pro-drop / person encoded on verbs** | Pronoun rate ≠ self-reference or reader-reference | Literal overt-pronoun style remains measurable | Rename it “overt self-reference”; true person-reference needs morphology/model |
| **Relatively free word order** | Word-position templates and fixed word n-grams become less portable; English syntax heuristics fail | Character n-grams, rates of overt markers, punctuation, paragraph structure | Avoid English positional regexes |
| **No obligatory whitespace word segmentation** — zh, ja | Word counts, mean word length, word n-grams, closed word dictionaries become tokenizer-dependent | Unicode characters/graphemes, punctuation, paragraph structure, many explicit character strings | Prefer character-level measurements; use language-aware segmentation only when the feature truly needs words |
| **Honorific morphology / pronoun avoidance** — ja, ko | `formal = polite-pronoun frequency` fails | Selected sentence-final/style markers, punctuation/layout | Split basic speech-level cues from full honorific analysis |
| **Kinship/social-role address** — especially vi and relevant in several Asian languages | Binary T/V model collapses relational distinctions | Frequency of selected address families | Represent address as several categories, not one “formal” bit |
| **Right-to-left** — ar, he | Visual assumptions, punctuation-handling bugs, naive string display; hidden bidi controls can contaminate raw n-grams | Logical Unicode string processing and character counts | Normalize Unicode consistently; treat display direction as UI, not token order |
| **Multiple orthographies / spelling normalization** | Character n-gram distance may measure orthographic choices or normalization pipeline rather than author | That variation can itself be authorial when authentic | Preserve author spelling, but normalize technical Unicode equivalences consistently |
| **Script variation / simplified–traditional Chinese** | A single n-gram reference profile becomes script-specific | Within-script n-gram stylometry | Treat script choice as metadata; never transliterate silently |
| **Dialect-heavy languages** — especially ar, es, pt and others | “One locale, one lexical list” can embed a prestige dialect | Tier A features and local lists | Version Tier B dictionaries by target variety when differences materially affect markers |

Eder’s multilingual stylometric result is useful here because it counters one simplistic fear: in his tested literary corpora, the approximate 2.5k–5k-word attribution threshold did **not** divide neatly into “inflected languages fail, analytical languages work.” citeturn22search3 Morphology changes which features are portable; it does not abolish authorial signal.

**Character n-grams survive more language types than almost anything else**, which explains why they are so valuable as the hidden verification layer. They do not require a lexicon, POS tagger, morphology, word-order assumption or translation. Your Russian 94.3% result is therefore not an oddity that should be discarded because it is uninterpretable. The correct response is to keep n-grams as a verifier while developing a separate explanatory layer.

But character n-grams need one important reformulation for cross-script comparison: **“5 characters” does not represent an equal linguistic span in every writing system.** Five Latin letters can be less than one English word; five Han characters can contain several morphemes or words. Consequently, do not compare the absolute magnitude of an English 5-gram distance to a Chinese 5-gram distance as though the scales were measurement-invariant. Tune n or combine 3–5-gram channels within each language, and validate discrimination locally.

The same point applies to sentence length. “Mean sentence length in words” is easy in whitespace-delimited English and becomes tokenizer-dependent in Chinese/Japanese. For a genuinely Tier A cross-language feature, use **sentence length in Unicode characters/grapheme-like units**, or keep word-length statistics only when a trusted segmenter is available. The product can still display “short/long sentences” after calibrating against a same-language norm; it should not pretend that 18 English tokens and 18 Chinese tokens are comparable units.

**Function words are portable as a concept, not as a list.** The Russian list must not be reused in English, and an English list must not be machine-translated into Bengali or Turkish. The evidence that high-frequency grammatical categories can be extremely stable is strong; the realization of those categories is language-specific. Biber’s sampling reliabilities make this distinction particularly clear. citeturn21view1

**MDA needs reformulation, not translation.** The fact that Somali MDA recovered interpretable dimensions from 65 features across 279 texts and that broad register relationships persist across 60 languages is positive evidence for functional portability. But every morphology/syntax-heavy feature inventory has to respect the target language. citeturn1search3turn18search15

**RTL itself is not a linguistic obstacle to stylometry.** The dangerous part is implementation: treating visual order as string order, stripping or retaining directional controls inconsistently, or assuming ASCII punctuation. Unicode should be the substrate. Its data/software licence is commercially usable under Unicode License v3, so this is a solvable engineering issue rather than a resource-licensing barrier. citeturn15search4

### CONTESTED

The biggest portability disagreement concerns whether a “universal semantic dimension” can have radically different surface realizations and still be called one metric.

For **reader formality**, I would permit a common presentation label only if the UI can explain its language-specific basis. An English lexical informality score and a Japanese polite-speech-level score are related communicative concepts, but they are not measurements of identical grammatical variables.

For **warmth, politeness and directness**, cultural calibration is unavoidable. The fact that social status affects politeness behaviour and languages encode deference through very different grammatical systems makes raw cross-language score comparison particularly hazardous. citeturn25view0turn23search1

For **concreteness**, translation of norms is attractive but scientifically weak. Concrete versus abstract judgments can correlate across languages, but lexical senses, conventional metaphors and morphology change coverage. Existing independent French and Italian norming projects are evidence for **re-norming**, not a justification for translating the English 37k table. citeturn17search0turn17search27turn17search17

### FOLKLORE

“Unicode makes NLP language-independent.” Unicode solves representation, not grammar or pragmatics.

“Chinese characters are basically words, so character 5-grams are directly equivalent to English character 5-grams.” They are not.

“Russian/Turkish/Georgian just need more entries in the English-style word dictionary.” Inflection and grammatical encoding change the unit of measurement.

“Right-to-left text needs a different stylometric algorithm.” Generally no; it needs correct Unicode processing.

“Japanese formality can be measured from pronouns like French *tu/vous*.” This fundamentally misunderstands the system. citeturn23search13

## Product build recommendation

### The shortlist I would actually ship

Ordered by **evidence strength for this product**, not by psychological attractiveness:

| Priority | Dimension | Tier | What the user should see | Why it belongs |
|---:|---|---:|---|---|
| **Highest** | **Character n-gram author fingerprint** | **A** | Usually not a “voice slider”; show only a compatibility/similarity diagnostic if needed | Strongest evidence from your own experiment; excellent language portability; stylometric literature supports short-to-medium corpus use. citeturn22search3turn2search4 |
| **Highest** | **Function-word / closed-class profile** | **B** | “Uses these linking/grammatical words unusually often/rarely” only where intelligible; mostly hidden similarity signal | High-frequency grammatical features are stable; much less topical than open vocabulary. citeturn21view1 |
| **High** | **Self-reference and reader orientation** | **B** | “Talks about self frequently”; “addresses the reader directly”; first-person singular/plural separated | Lay-intelligible, high-frequency, reliability evidence for pronouns is good. citeturn21view1 |
| **High** | **Explicit epistemic stance: hedges, boosters, evidentials** | **B** | “Usually qualifies claims” / “often states them categorically,” with raw marker examples | Linguistically grounded and highly relevant to “blunt versus hedging”; deterministic when limited to overt cues. citeturn10search14 |
| **High where applicable** | **Address system: T/V, polite/plain, titles** | **B**, sometimes **C** | “Frequently uses familiar T-address”; “usually uses polite speech endings” — language-specific wording | Direct match to owner’s concept and linguistically well established. citeturn23search1turn23search13 |
| **Medium-high** | **Discourse markers / interaction markers** | **B** | “Often starts turns with…”, “frequently uses conversational connectors” | Interpretable component of involvement/register; cheap to localize |
| **Medium-high** | **Explicit admission of own error** | **B** | “Explicitly says ‘I was wrong / my mistake’ more often than peers” | Narrow but highly intelligible; high-precision rules are feasible; do not broaden it to psychological vulnerability |
| **Medium** | **Mitigation / politeness cues** | **B** | “Uses explicit softeners frequently/rarely” | Better defined than holistic politeness and close to owner’s desired bluntness dimension. citeturn25view0 |
| **Medium** | **Punctuation, questions, paragraph/list/layout signature** | **A** | Keep current readable statistics, but demote them from “voice” to “writing mechanics” | Cheap, stable, controllable; your experiment demonstrates that they are insufficient as voice |
| **Optional model** | **Humour / irony** | **C** | “Humorous posts: estimated X%,” prominently marked AI-estimated | Semantically meaningful, but deterministic rules are not credible; even English benchmark performance is imperfect. citeturn24view1turn24view2 |
| **Optional model** | **Self-disclosure** | **C** | “Shares personal experience/feelings…” | Distinct useful concept; cannot be reduced to `I` frequency. citeturn12search28 |
| **Experimental model** | **Perceived warmth** | **C** | “Readers are likely to experience the writing as warmer/drier” | Potentially useful UX, but should be directly human-validated rather than inherited from SCM word norms. citeturn9search8turn9search18 |
| **Research only** | **Concreteness / abstraction** | **C** | Do not ship globally yet | Strong psycholinguistic construct, poor sixteen-language resource/licence portability. citeturn17search0turn17search27 |
| **Do not use as author voice** | **Big Five / HEXACO inference** | **C** | None by default | Real but modest text-prediction correlations, weak cross-language/domain assurance. citeturn27search0turn13search4 |
| **Do not use** | **MBTI / DISC inference** | **C** | None | Insufficient construct/text-inference case for this purpose. citeturn5view1turn25view2turn26search17 |

The product should consequently stop calling all measurements “scales.” There are at least four useful kinds:

**fingerprints** — n-grams, function-word vectors;  
**behaviour rates** — hedges, T-address, questions, admissions of error;  
**bundles** — involvement, reader orientation, mitigation;  
**semantic judgments** — humour, warmth, self-disclosure, requiring a model.

That vocabulary makes the epistemic differences visible.

### A better profile schema

A voice profile should store, for every interpretable feature:

```text
dimension:
  key: epistemic_hedging
  display_label: "Qualifies claims"
  method: deterministic_dictionary
  tier: B

measurement:
  rate: ...
  denominator: ...
  matched_occurrences: ...
  coverage: ...

stability:
  split_half_reliability: ...
  confidence: low | medium | high

norm:
  reference_corpus: ...
  percentile: ...
  robust_z: ...

evidence:
  examples_from_author: [...]
  language_method_version: ...

generation:
  instruction: ...
  target_band: ...
  importance: advisory | strong

availability:
  works_without_ai_quota: true
```

Semantic dimensions should have a visibly different record:

```text
method: model_inference
tier: C
works_without_ai_quota: false
model_version: ...
human_validation_set: ...
estimated_cost: ...
```

This prevents a humour classifier and a literal question-mark count from masquerading as equally objective numbers.

### The minimum kit for adding a seventeenth language

A seventeenth language should **not** require a morphological parser, LIWC translation, embedding model or psycholinguistic database.

The minimum shippable kit should be:

**Tier A engine unchanged.** Unicode normalization policy, character 3–5-grams, punctuation and emoji profile, paragraph/list/layout distributions, character-based sentence-length distributions, question/exclamation markers, and the hidden stylometric verifier. Unicode/ICU foundations have commercially usable open licensing. citeturn15search4turn15search6

**One native-authored Tier B resource file**, ideally a few hundred lines rather than thousands. It should contain: approximately 100–250 function/closed-class forms; first- and second-person explicit markers; address forms; 30–100 conversational discourse markers; roughly 30–100 conservative hedges and 30–100 boosters; explicit evidential/source markers where appropriate; 15–50 error-admission formulas; and small groups of greetings, thanks and mitigation formulas. For morphology-heavy categories, surface regex patterns may be included only after native validation.

**A language behaviour specification**, written in prose as well as data. It must answer: Does the language have productive T/V? Does V conflate respectful singular with plural? Is it pro-drop? Is person routinely encoded on verbs? Are honorific speech levels central? Are words whitespace-separated? Which punctuation marks terminate questions? Which orthographic variants must remain distinct? Which features from the common schema are **not measurable** under the no-parser constraint?

**A native validation set.** Have a second competent speaker annotate several hundred randomly selected contexts, including non-matches. Report per-family precision/recall where meaningful rather than merely checking that translations “look right.”

**A corpus-level stability test.** Use several authors with roughly your actual 2k–20k-word corpus distribution. Split posts repeatedly, estimate feature stability, and establish which dimensions should disappear below particular evidence counts.

**A licence manifest.** Tier A: Unicode License v3 / applicable runtime licence. Tier B: company-authored data under AGPL-3.0 or another explicit company-selected licence. Tier C: **empty by default**. No resource enters the repository merely because it is downloadable or published in a paper.

That kit is realistic enough that adding a conventional new language can be measured in **native-speaker days rather than an NLP research project**. Languages with Japanese/Korean-like grammatical politeness, highly complex segmentation or heavy pro-drop will expose fewer deterministic dimensions rather than silently receiving bad approximations.

### Honest gaps

The most important gap is **corpus-level reliability research for the exact semantic stylistic constructs the owner wants**. There is abundant work on classifying one sentence as polite, ironic or self-disclosing, but far less evidence answering the product’s actual question: *given 2,000, 5,000 or 20,000 words of one author’s short posts, how stable is their estimated humour frequency or politeness profile across time and topic?* The published literature does not provide a clean table of minimum word counts for those constructs.

There is **no validated universal deterministic measure of “warmth of an author’s voice.”** Warmth/competence is strongly established in social cognition, but the bridge from that literature to multilingual writer profiling remains underdeveloped. citeturn9search8turn9search18

There is **no credible deterministic multilingual irony or self-deprecating-humour detector** that satisfies your no-model/no-parser requirement. English tweet benchmarks already demonstrate substantial ambiguity. citeturn24view1turn24view2

There is **no all-sixteen-language, licence-clean concreteness/imageability resource** established by this review. English is rich; some other languages have serious norming work; coverage and redistribution rights are patchy. Under your licence rule, this remains Tier C research rather than a product dependency. citeturn17search0turn17search27turn17search2

There is **no evidence that an English “formality” score can be translated into Japanese, Korean, Vietnamese or Bengali and preserve the same construct**. The correct solution is language-specific operationalisation under a shared UX concept, not dictionary translation. citeturn23search1turn23search13

There is **no good evidence that inferring Big Five, HEXACO, MBTI or DISC and then steering generation through that inferred type will reproduce an author better than directly steering on observed linguistic behaviour and exemplars**. Big Five text prediction is real but modest—meta-analytic correlations are around .26–.30 in one synthesis, with large social-media models around the .3–.4 range. citeturn27search0turn27search6 HEXACO is psychometrically defensible but its text-inference evidence is much thinner. citeturn27search7turn13search4 MBTI’s discrete type interpretation remains particularly problematic. citeturn5view1turn25view2

There is **no evidence that norm-relative presentation by itself improves generation**. Burrows-style deviation profiles are well established for stylometric comparison, but “82nd percentile in informality” is a user-interface interpretation, not a demonstrated author-simulation objective. citeturn18search0

And finally, there is an important gap between **recognizable authorship and desirable generated voice**. Your own experiment shows it directly. A generator can hit prescribed sentence-length, list, question and nominalization corridors without becoming stylometrically closer to the author. Conversely, character n-grams can identify an author impressively while being useless as a human writing brief. The architecture should embrace that gap rather than try to eliminate it:

**Use Tier A/B observable stylistics to explain the writer. Use exemplars plus those observable behaviours to steer generation. Use character n-grams and function-word vectors as independent held-out verification. Keep humour, warmth, self-disclosure and holistic politeness as explicitly optional Tier C model judgments. Do not infer personality types as the intermediate representation.**

That design is both closer to the published evidence and dramatically more portable across all sixteen languages than replacing the present Russian dictionaries with a larger English-centric psychology dictionary.