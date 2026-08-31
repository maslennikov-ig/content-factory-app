# Brand-Voice From Text: What Is Measurable, What Ports Across 16 Languages, and What to Build

## TL;DR
- The owner is right: the eight current "scales" measure **formatting, not voice**, which is why they separate the author from a stranger in only 48% of held-out pairs (a coin flip) while character 5-grams reach 94.3%. The single most defensible, most portable signal you already have is **character n-grams plus punctuation/length/emoji distributions (Tier A)** — build the profile's spine there, expressed as **z-scores against a reference corpus** (the Burrows's Delta logic), not as absolute numbers.
- The owner's "stylistics" (informal address, humour, self-deprecation, bluntness, warmth) are **real and reader-salient but mostly NOT deterministically measurable in TypeScript without a model or a per-language lexicon.** Formality is the one exception with a deterministic proxy (Heylighen & Dewaele F-score, needs only a word-class list = Tier B). Humour, irony, self-deprecation, politeness, warmth are model-tier and modestly reliable at best (irony best-system F1 = 0.71 binary / 0.51 fine-grained; politeness in-domain 83.8%/78.2%, cross-domain drops to 67.5%/75.4%).
- **Personality typing is not a defensible steering layer.** Big Five from text tops out around r ≈ .35–.43 out-of-sample and shrinks further across domains; MBTI has ~50% category flips on retest and should not be used at all. Steer generation from **observable style deviations**, not an inferred "type."

## Key Findings

1. **Your eight scales are a register/formatting instrument, not a voice instrument.** They overlap heavily with Biber's Dimension 1 (involved vs. informational) and with readability — genuine but weak author discriminators. This is consistent with your 48% result.
2. **Character n-grams are the workhorse and they are Tier A (no per-language resource).** They are the best-attested language-independent authorship signal (state-of-the-art across English, Greek, Chinese, Arabic, Hebrew, Russian). This matches your 94.3% figure.
3. **Function words work but need a per-language closed list (Tier B).** Delta-style attribution is robust with roughly the 100–3,000 most-frequent words; a competent speaker can author the needed list in about a day.
4. **The heavy psycholinguistic resources you asked about are mostly licence-blocked for a commercial AGPL product.** LIWC is proprietary; NRC EmoLex/VAD are research-only; Warriner and Brysbaert norms are non-commercial supplementary data. These cannot ship.
5. **Georgian and Bengali are the thinnest, as expected** — no validated affective norms, no off-the-shelf spaCy/Stanza pipeline. Any dimension needing a heavy resource simply will not exist for ka/bn.
6. **The right product framing is a profile of deviations from a reference norm**, which is exactly what Burrows's Delta already formalises and what the (limited) HCI evidence and forensic "distinctiveness + consistency" framing support.

## Details

### Q1 — Which style dimensions are reliably estimable, lay-legible, and validated

**ESTABLISHED**

- **Biber Multidimensional Analysis (MDA).** Biber (1988), *Variation Across Speech and Writing*, factor-analysed 67 lexico-grammatical features over the LOB/London-Lund corpora and extracted six interpretable dimensions: D1 Involved vs. Informational Production; D2 Narrative vs. Non-narrative; D3 Explicit (elaborated) vs. Situation-dependent Reference; D4 Overt Expression of Persuasion; D5 Abstract vs. Non-abstract; D6 On-line Informational Elaboration. MDA **requires POS tagging** and substantial text per register. It is a **register/genre** instrument, not an author-fingerprint instrument. Cross-linguistic replications exist: Biber (1995, *Dimensions of Register Variation*) covers English, Nukulaelae Tuvaluan, Korean, Somali; Biber & Tracy-Ventura (2007) Spanish; Sardinha et al. Brazilian Portuguese (48 registers); Cvrček et al. (2018–2021) Czech (8 dimensions, 137 features); a Russian web-corpus MDA (six dimensions "show significant similarities with Biber's original dimensions"). A 60-language study (arXiv 2209.09813) found register variation is broadly stable cross-linguistically. **Relevance to you:** D1 is essentially what your eight scales already approximate — which is why they behave like a register meter, not a voice meter. MDA needs a tagger (not available in your deterministic layer).
- **Burrows's Delta.** Burrows (2002), *LLC* 17(3):267–287. Represent a text by z-scored relative frequencies of the *n* most frequent words against a reference corpus; classify by nearest (Manhattan) distance. Argamon (2008, *LLC* 23(2):131–147) showed Delta is a nearest-neighbour rule on standardized frequencies; Evert et al. (2017, *DSH* 32:ii4–ii16) showed vector-length normalization (Cosine Delta) is the decisive improvement. Robust choice ≈ **3,000 MFW** (Evert et al.), though Burrows's originals used 100–150.
- **Minimum text (stylometry).** Eder (2015) — ~5,000 words for reliable attribution; Eder (2017) — **2,000 words can suffice when the authorial signal is clear.** Your per-author corpus (2,000–20,000 words) sits at or above this floor, so Delta-style methods are viable.
- **Readability formulas** (Flesch-Kincaid etc.) are cheap and lay-legible but measure difficulty, not voice, and their syllable counts are meaningless in zh/ja (see Q6).

**CONTESTED**

- Whether MDA "dimensions" are cross-linguistic universals or artefacts of comparable-corpus design (Kilgarriff's review notes the method is powerful but under-used because it is laborious; Evert et al. 2017 note there is still no theoretical account of *why* Delta works).

**FOLKLORE**

- "Sentence length / burstiness = voice." These are weak discriminators alone; your own 48% result is the local proof.

### Q2 — The three-tier portability sort (the core deliverable)

**Tier A — no per-language resource at all (ship everywhere immediately)**
- **Character n-grams (3-, 4-, 5-grams).** ESTABLISHED as the most language-independent authorship signal: Keselj/Peng character-level LMs reach state-of-the-art on English, Greek, Chinese; Arabic short-text studies find character 3-/4-/5-grams beat word features (up to ~90%+ with KNN; 87.1% on classical Arabic with punctuation-augmented n-grams); Hebrew, Russian (Taiga) confirmed. Your 94.3% is exactly the expected behaviour.
- **Punctuation rates, sentence/paragraph length distributions (mean, SD, %short), list/markup rates, question-mark rate, dash rate, casing, emoji/emoticon rates, digit rates.** All computable from Unicode.
- **Caveats (Tier A is not free of engineering):** word/sentence segmentation needs Unicode-aware handling. `Intl.Segmenter` (Baseline across all major browser engines since April 2024) gives locale-aware grapheme/word/sentence segmentation in TypeScript in-process, no model. For **zh/ja/th** there is no whitespace; `Intl.Segmenter` word granularity uses ICU dictionaries — your Node build must include them (full-ICU). On **abjads (ar/he)** character n-grams work but omit unwritten short vowels (this is fine — it's still a stable author signal). Casing features are null for **ka** (Georgian is unicameral) and for zh/ja/ko/ar/he/bn (no case). Emoji require grapheme-cluster segmentation (ZWJ sequences) — use grapheme granularity. Georgian segmentation is low-risk (space-separated); Bengali is space-separated but is an abugida with combining matras/conjuncts/virama and duplicate-encoding normalization issues — use grapheme granularity and Unicode-normalize input.

**Tier B — a small closed list a competent native speaker writes in ~a day**
- **Function-word / particle frequencies** for Delta-style attribution. Concrete size: Delta is stable from ~100 MFW up; Evert et al. recommend ~3,000 MFW for robustness across languages; Eder shows shorter feature vectors need longer samples. A curated **150–300 function-word list** (the order of O'Shea's 277-item English list used in stylometry) is a reasonable Tier-B target. Validation: held-out attribution accuracy, plus native-speaker review and back-translation checks.
- **Formality F-score word classes** (Heylighen & Dewaele 2002): counts of nouns/adjectives/articles/prepositions (formal) minus pronouns/adverbs/verbs/interjections (contextual). Strictly this needs POS, but a **closed list of the high-frequency pronouns/adverbs/interjections/prepositions** captures most of the signal deterministically. Needs ≥ a few hundred words per sample for stability (authors' own caveat).
- **Address forms, hedges, discourse markers, interjections, emoji sets** as closed lists (T–V pronouns, honorific particles, ты/вы, hedge cues).

**Tier C — heavy resource (per-language, licence-gated, often model-tier)**
- Psycholinguistic norms (concreteness/VAD), LIWC-style dictionaries, trained classifiers (formality, politeness, irony, personality), treebanks/parsers.
- **Language coverage of the 16 (honest):**
  - Concreteness/VAD norms: **en** (Brysbaert, Warriner — but non-commercial); partial for **de, es, fr, it, pt, ru, zh, ja** via various academic norm sets; **bn** has one small semantic-differential EPA study (1,469 concepts, *Behavior Research Methods* 2016, 40 respondents); **ka has essentially nothing validated**.
  - LIWC translations exist for de, es, fr, it, pt, ru, zh, ja, tr and more — **all proprietary (require a paid LIWC-22 licence; commercial rights held exclusively by Receptiviti)**; unusable under AGPL commercial.
  - UD treebanks / parsers: broad for de/es/fr/it/pt/ru/tr/zh/ja/ko/ar/he; **Georgian UD_Georgian-GLC exists (CC BY-SA 4.0) but is small (~44k-token training set, first released UD v2.13, 2023); Bengali UD_Bengali-BRU exists (CC BY-SA 4.0) but is a tiny grammar-examples test set (no train file).** Neither spaCy nor Stanza ships a *trained* Georgian or Bengali pipeline (both are alpha/tokenizer-only in spaCy; absent from Stanza's default model list).
  - Emotion lexicons: NRC EmoLex/VAD auto-translated to 100+ languages including possibly ka/bn, but machine-translated and **research-only**.

**Dimensions that live in more than one tier:** Formality (Tier B via word-class F-score, deterministic; Tier C via GYAFC/XFORMAL BERT classifier, model). Concreteness (Tier C norms; or Tier B tiny hand-built concrete/abstract seed list, weaker). Directness/hedging (Tier B hedge cue list; Tier C politeness classifier).

### Q3 — The owner's "stylistics," one by one

**Formality of address.**
- ESTABLISHED: Heylighen & Dewaele (2002, *Foundations of Science* 7:293–340) F-score from word-class frequencies; validated across Dutch, French, Italian, English, with a similar top factor in 7 languages; needs a few hundred words for reliability (authors' explicit caveat: "For single sentences, the F-value should only be computed for purposes of illustration"). Pavlick & Tetreault (2016, *TACL* 4:61–74) built a 6,574-sentence English formality-annotated corpus (7-point scale). GYAFC (Rao & Tetreault 2018, ~110k pairs) and XFORMAL (Briakou et al. 2021, Brazilian-Portuguese/French/Italian) extend it; BERT/GBERT classifiers reach ~0.85–0.88 Spearman/accuracy in-language, dropping cross-lingually (e.g. XLM-R GYAFC en→de ≈ 0.72–0.77). For grammatical T–V (ru ты/вы; de/fr/es/it/pt/tr) and honorifics (ja/ko), the informal/formal marker is a **closed pronoun/verb-form list = Tier B, deterministic.** For English (lexical only) the deterministic proxy is the F-score plus contractions/first-person rate.
- Verdict: **Deterministic-measurable (Tier B).** The one owner-dimension you can actually ship in-process across most locales.

**Humour, irony, self-deprecation.**
- ESTABLISHED: Van Hee, Lefever & Hoste, SemEval-2018 Task 3 (ACL S18-1005), 43 teams (binary Task A) / 31 teams (multiclass Task B) on a 3,834-tweet train / 784-tweet test corpus collected via #irony/#sarcasm/#not: "The highest classification scores obtained for both subtasks are respectively **F1 = 0.71 and F1 = 0.51** and demonstrate that fine-grained irony classification is much more challenging than binary irony detection." The organizers note irony "requires a more complex understanding based on associations with the context or world knowledge" — i.e. it is inherently annotator-subjective and context-bound. Self-deprecation has essentially **no standalone validated operationalisation.**
- Verdict: **Model-tier, modest reliability, brittle.** Not deterministic. Self-deprecation: not reliably measurable.

**Directness vs. hedging; politeness.**
- ESTABLISHED: Danescu-Niculescu-Mizil et al. (2013, ACL P13-1025) Stanford Politeness Corpus + SVM with 20 theory-based strategy classes: in-domain accuracy **83.79% (Wikipedia) / 78.19% (Stack Exchange)** vs. human **86.72% / 80.89%**; **cross-domain drops to 67.53% (Wiki→SE) and 75.43% (SE→Wiki).** TyDiP (Srinivasan & Choi 2022) extends to 9 languages; multilingual models transfer zero-shot but below human, and annotator agreement is low (Fleiss' κ ≈ 0.15–0.19), reflecting politeness's subjectivity. Hedge detection: CoNLL-2010 shared task (Farkas et al.), best sentence-level F1 up to ~0.86 (biomedical), lower on Wikipedia weasel. Culture-boundness is real (CCSARP/Blum-Kulka; Wierzbicka on Russian vs. Anglo directness) — a "direct" profile may reflect the language's norm, not the author, which is exactly why **z-scoring against a same-language reference corpus is essential.**
- Verdict: **Hedging = Tier B (cue list) deterministic-ish; politeness = Tier C model.**

**Warmth (and warmth/competence, agency/communion).**
- ESTABLISHED: Fiske's Stereotype Content Model (warmth/competence) and Abele & Wojciszke (agency/communion) are operationalised in text by the **Pietraszkiewicz et al. (2019, *EJSP* 49:871–887) "Big Two" dictionaries** (LIWC-approach, validated across 4 studies; standardized .dic of ~447 terms on OSF, **licence unstated — contact authors before commercial embedding**) and by Nicolas et al. auto-generated stereotype-content lexicons. A 2026 sentence-level warmth/competence dataset (W&C-Sent, ~1,600 pairs) exists for model training.
- Verdict: **Tier C (English dictionary; licence unstated). Model-tier for other languages.** Not deterministic.

**Certainty / epistemic stance (hedges, boosters, evidentiality).**
- ESTABLISHED: Hyland's metadiscourse taxonomy with hedge/booster item lists (Hyland 1998, 2005) — but these are **appendix lists under publisher copyright (John Benjamins), not a licensed dataset**; the individual words aren't copyrightable but the compiled appendix is, so **rebuild your own list.** CoNLL-2010 hedge F1 up to ~0.86. Evidentiality is grammaticalised in Turkish (-miş) — a **closed suffix/enclitic cue = Tier B for tr**, but suffix detection without a morph parser is fragile.
- Verdict: **Tier B (hand-built hedge/booster list), deterministic.**

**Concreteness vs. abstraction.**
- ESTABLISHED: Brysbaert et al. (2014) concreteness (40k lemmas, ~CC BY-NC-ND 3.0) and Warriner et al. (2013) VAD (restricted supplementary data) — **both non-commercial, unusable in a commercial AGPL product.** Linguistic Category Model (Semin & Fiedler 1988/1991) automated by Seih, Beier & Pennebaker (2017) using an ~1,800–8,000-verb dictionary (inter-coder Cronbach's α ≈ .68 in construction); criticised (Rabbitsnore 2019) for over-weighting nouns as abstract.
- Verdict: **Tier C; licence-blocked in en; absent for ka/bn.** A tiny hand-built concrete/abstract seed list is a weak Tier-B fallback.

**Admission of error; self-disclosure; self-reference.**
- ESTABLISHED: Pronoun-based self-reference (Pennebaker line) is trivially Tier A/B (first-person pronoun rate) — **but note the Pennebaker LIWC-personality effects are small** (Tilburg meta-analysis of Big Five × 52 LIWC categories: strongest |ρ| ≈ .08–.14; the 52 categories explain ~5% of personality variance on average). "Admits mistakes" has **no published operationalisation.**
- Verdict: self-reference = Tier A/B deterministic (with pro-drop caveat); **"admits mistakes" = not reliably measurable (model at best).**

### Q4 — Personality typing from text (how defensible?)

**ESTABLISHED**
- **Big Five / OCEAN.** Schwartz et al. (2013, *PLoS ONE* 8(9):e73791) open-vocabulary on ~66k–75k Facebook users; Park, Schwartz, Eichstaedt et al. (2015, *JPSP* 108(6):934–952) reported out-of-sample language-based predictions correlating with self-report at **Pearson r ≈ .35–.43** (openness highest ~.41; agreeableness/neuroticism lower ~.31–.35), built on 66,732 users and validated on 4,824. Azucar et al. (2018) meta-analysis r ≈ .28–.39. The Tilburg closed-vocabulary LIWC meta-analysis found much smaller effects (|ρ| ≈ .08–.14). Effect sizes **shrink out-of-sample and across domains** (Bleidorn/Hopwood critiques); the myPersonality dataset was withdrawn.
- **MBTI.** Pittenger (1993, *Review of Educational Research*; 2005, *Consulting Psychology Journal*): "Across a 5-week re-test period, **50% of the participants received a different classification on one or more of the [MBTI] scales**" (independent replications place the range at 39–76%); it dichotomizes continuous, normally distributed traits; near-zero correlation with job performance (ρ ≈ 0.0–0.10). MBTI-from-text Kaggle datasets suffer **label leakage** (posts contain the type strings themselves).
- **HEXACO** has strong test-retest (HEXACO-100) but thin text-prediction evidence. **DISC** is a commercial instrument with weak independent psychometric support.

**CONTESTED**
- The Myers-Briggs Company disputes Pittenger, citing scale-level test-retest > .80 over 15 weeks and arguing whole-type reliability should be judged differently. Even granting scale-level reliability, whole-type instability and construct-validity issues remain.

**FOLKLORE**
- "We can read your MBTI type from your posts and generate in it." Not defensible — it combines an unstable typology with a leakage-inflated benchmark.

**Verdict:** Do **not** infer a personality type and steer through it. If you steer, steer from **observable style deviations** (formality, hedging rate, first-person rate, emoji rate, sentence rhythm), which are what a reader actually recognises.

### Q5 — Style as a PROFILE OF DEVIATIONS from a norm

**ESTABLISHED**
- **Burrows's Delta is literally this**: z-score the author's feature frequencies against a reference corpus's mean and SD, so every number is "how far from typical." Argamon (2008) geometric/probabilistic account; Evert et al. (2017) mechanics. This directly supports "jokes more than most, addresses the reader informally, rarely asks questions" as **standardized deviations**, and it is inherently more comparable across authors and (with a same-language reference corpus) across languages than absolute counts.
- **Keyness / effect-size vs. reference corpus:** log-likelihood, and Hardie's **Log Ratio** and Bayes-Factor effect-size measures for corpus comparison, are the standard way to express "distinctively more/less than a reference."
- **Forensic idiolect:** Grant's "consistency + distinctiveness" framing — Grant & MacLeod (2020): practical authorship analysis "may depend less on a strong theory of idiolect than on the simple detection of consistency and the determination of distinctiveness." Deviation-from-norm plus within-author stability is the operational definition; Nini (2023) gives a usage-based (chunk-based) theory of individuality.

**CONTESTED / thin**
- Direct HCI/UX evidence that lay users understand relative ("more than most") better than absolute numbers is **limited**; it is a reasonable inference from the general superiority of normed/comparative feedback, but I did not find a definitive controlled study — flagging this as a genuine gap.

**Verdict:** Build the profile as **z-scores/percentiles against a per-language reference corpus.** This is more stable, more portable, and more legible than absolute scale values.

### Q6 — What breaks off-English

- **(a) Morphologically rich (ru, tr, ka, de, ar, he):** Type-token ratio and Yule's K **inflate and destabilise** because inflection multiplies word forms; use **MATTR, MTLD, HD-D** (MATTR most length-stable per Covington & McFall 2010 and Zenker/Kyle evaluations of ~4,500 L2 essays). Function-word lists lose power where grammatical meaning is in suffixes (tr, ka, ja/ko particles) — character n-grams partly recover it. TTR itself becomes a *morphological-complexity* signal (Kettunen 2014), not a vocabulary-richness signal.
- **(b) Free word order (ru, de, ka, ja):** syntactic/positional features degrade; frequency-based (Delta) and character n-gram features survive.
- **(c) Non-alphabetic script (ja, zh, ko, bn):** no whitespace in zh/ja → "word" is ill-defined; syllable-based readability (Flesch-Kincaid) is meaningless. Character n-grams work well (attribution results in Chinese/Japanese confirm). Requires ICU segmentation.
- **(d) RTL abjad (ar, he):** character n-grams strong (Arabic 87–90%+); short vowels unwritten (fine for style); pronoun-drop and rich clitics complicate word features.
- **Pro-drop (ja, ko, ru, es, it, pt, tr):** **critical** — several proposed dimensions are pronoun-based (first-person rate, T–V address, self-reference). In pro-drop languages the pronoun is often absent and person is carried by verb morphology, so **pronoun-count measures under-report and are not comparable across languages.** For these, address/formality must be read from **verb forms and honorific particles (Tier B lists), not pronoun counts** — and cross-language comparison must be z-scored within each language.

## Recommendations

**Build now (v1, deterministic, ships to all 16 immediately):**
1. Stop calling the eight scales "voice." Keep them but relabel them **formatting/register** metrics.
2. Make the profile spine **character 3/4/5-gram + punctuation + length-distribution + emoji/casing features**, expressed as **z-scores/percentiles against a per-language reference corpus** (Burrows/Cosine Delta with vector normalization, ~1,000–3,000 MFW where a word list exists, else pure character n-grams). Tier A; no lexicon.
3. Use `Intl.Segmenter` for segmentation; ship with full-ICU so zh/ja/th word granularity works; use grapheme granularity for emoji and for character-n-gram counting; Unicode-normalize Bengali input.
4. Fix the "English borrows Russian dictionaries" defect by giving English its own function-word and hedge lists.

**Build next (v2, Tier B, per-language ~1 day of native-speaker work each):**
5. Add **formality (Heylighen–Dewaele word-class F-score)** and **T–V/honorific address detection** from closed pronoun/verb-form lists — the only owner-"stylistics" dimension that is deterministic and reader-salient.
6. Add **hedging/booster rate** from a rebuilt (not copied-from-Hyland) cue list, and **first-person/self-reference rate** (with the pro-drop caveat).

**Only if a model call is acceptable (v3, Tier C — label and cost as model-tier):**
7. Politeness (Danescu-style), warmth/competence, irony — via a hosted classifier or an LLM rubric pass. Order-of-magnitude cost per author corpus (20k words ≈ 30k tokens): a single small-model classification pass ≈ cents; an LLM rubric pass ≈ tens of cents to ~$1; latency seconds. **Must degrade gracefully when the workspace AI quota is exhausted** — so these can never sit in the deterministic layer.

**Thresholds that change the plan:** if character-5-gram author-vs-stranger separation on a new language falls below ~85% on held-out pairs, add the Tier-B function-word list for that language. If a dimension's cross-domain reliability (author's own posts vs. their other posts) is below ~0.6, drop it from the profile.

**Do NOT build:** MBTI/DISC typing; "admits mistakes" as a measured scale; anything depending on LIWC, NRC, Warriner, or Brysbaert in the shipped commercial product.

### (a) Shortlist of dimensions to build on, by evidence strength + tier
1. **Character n-grams** — strongest, most portable — **Tier A**.
2. **Punctuation / length / list / question / emoji / casing distributions** — strong, portable — **Tier A**.
3. **Function-word frequency profile (Delta)** — strong, needs list — **Tier B**.
4. **Formality (F-score + T–V/honorific address)** — good, reader-salient — **Tier B**.
5. **Hedging/booster & first-person self-reference rate** — moderate — **Tier B**.
6. **Politeness / warmth / irony** — modest, brittle, culture-bound — **Tier C (model)**.
7. **Personality type** — not defensible — **do not ship.**

### (b) Minimum kit to add a 17th language (checklist)
- **Tier A:** nothing language-specific beyond confirming `Intl.Segmenter`/ICU coverage and building a reference corpus (a few hundred–thousand in-language posts) for z-scoring. ~1 day engineering.
- **Function-word list:** 150–300 entries, one competent native speaker, validated by held-out attribution accuracy + a second-speaker review + back-translation spot-check. ~1 day.
- **Formality word classes:** high-frequency pronouns/adverbs/interjections/prepositions + T–V/honorific forms, ~100–200 entries. ~0.5 day.
- **Hedge/booster/discourse-marker/interjection/emoji lists:** ~50–150 entries each, native-speaker authored, inter-annotator check. ~1 day.
- **Total:** roughly **3–4 person-days** to reach Tier-A+B parity; Tier C only if a licensed norm set or model exists for that language.

### (c) Honest gap list (no English extrapolation)
- **Georgian (ka):** no validated affective/concreteness norms, no LIWC, no formality/stylometry/authorship dataset, no trained spaCy/Stanza pipeline; only a small CC BY-SA UD treebank. Tier C effectively unavailable — ship Tier A/B only.
- **Bengali (bn):** one small EPA norm study (1,469 concepts, 2016) and the InFormal formality set (Krishna et al. 2022, ~1,000 pairs); tiny UD test set; no trained pipeline. Tier C very limited.
- **HCI/UX:** no definitive controlled study found showing lay users prefer relative to absolute descriptions — inferred, not proven.
- **Self-deprecation & "admits mistakes":** no published operationalisation in any language — model-only, unvalidated.
- **Licences (hard blockers, not preferences):** LIWC (proprietary; commercial rights held by Receptiviti), NRC EmoLex/VAD (research-only), Warriner/Brysbaert norms (non-commercial supplementary data) all **cannot ship** in a commercial AGPL product. Safe-to-ship: spaCy library (MIT), Stanza code (Apache-2.0), VADER (MIT), Empath (open, verify repo LICENSE), UD_Georgian-GLC and UD_Bengali-BRU (CC BY-SA 4.0). **Caution:** individual UD treebanks and non-English spaCy models vary — several are CC BY-NC-SA (e.g. it_core_news_sm, UD_Japanese-BCCWJ) and cannot be used commercially; check each per-language pipeline's LICENSE before shipping.
- **Cross-language comparability:** because of pro-drop and morphology, absolute values are not comparable across languages; only within-language z-scores are — this constrains any "global" voice dashboard.

## Caveats
- Your authorship-accuracy figures (94.3%, 66.7%, 68.7%, 48.0%) are measurements on one 153-post Russian channel; nothing here establishes they are Russian-specific, but neither is that ruled out — the recommended per-language held-out author-vs-stranger validation is how you'd find out.
- Reported classifier maxima (irony F1 = 0.71; politeness 83.8% in-domain; formality ~0.85) are best-case results on curated benchmark data and will be lower on your short 200–4,000-character posts.
- LLM-generated text partially defeats stylometry by design (your 66.7%/68.7% drop), so a "does this AI output match the author's voice" check will always be weaker than author-vs-human separation — treat the voice score on generated text as a soft signal, not a gate.
- Where a source was a secondary summary (e.g. some licence strings and the Bengali/Georgian resource inventory), I relied on the most authoritative available page and flagged residual uncertainty (notably the Pietraszkiewicz .dic and Empath repo licences, which should be confirmed at ship time).