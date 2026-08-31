# Author-independent calibration for multilingual short-form authorship verification

The central conclusion is that your current system should be treated as a **promising single-author prototype, not a calibrated authorship verifier**. Character n-grams are a defensible starting representation, and making part of the decision rule author-specific is directionally right, but none of the specific constants you list—5-grams, top 400, 10th/90th corridors, a threshold floor, minimum-corpus rules, or a headline acceptance number—has a literature-backed claim to universality. Modern authorship-verification work explicitly evaluates on **previously unseen authors**, and increasingly on unseen topics, discourse types, genres, languages, and time periods. PAN’s recent verification tasks were designed around that open-set premise. citeturn20search1turn20search0turn15view0

Your author-specific 95th-percentile leave-one-out threshold is **not wrong, but it is incomplete**. It estimates something like “how far this author’s genuine texts usually wander from this author’s profile.” It does **not** estimate “how far a non-author has to be before we reject them.” Those are different distributions. A highly variable author can acquire a very permissive genuine-only threshold, admitting many impostors. Moreover, leave-one-out distances are strongly dependent because nearly the same corpus is reused to construct each profile, so the nominal number of leave-one-out observations overstates the effective sample size. The right way to preserve your useful per-author idea is to estimate an author-specific genuine distribution, preferably with shrinkage toward a population norm, and then calibrate the final verification decision against **author-disjoint genuine and impostor examples**. PAN makes exactly this conceptual distinction between ranking, hard classification, and probability calibration. citeturn20search0turn20search4

A second major conclusion is that **adding language N is a validation programme, not a dictionary installation**. Multilingual style representations do transfer across languages, sometimes impressively, but per-language performance is not constant, thresholds are still commonly tuned on target-domain data, and the newest robustness work explicitly says that the field still lacks systematic multilingual evidence under realistic distribution shifts. citeturn6search6turn18view2turn14view0

## Author-independent calibration

**ESTABLISHED.** There are three distinct kinds of normalization/calibration in the literature, and they should not be conflated.

First is **feature normalization against a reference corpus**. Classical Burrows’s Delta takes relative frequencies of frequent words and standardizes each feature using a corpus mean and standard deviation; a document is therefore represented by deviations from what is normal in the reference corpus rather than by raw frequency alone. Later analyses of Delta emphasize that the reference corpus is not a neutral implementation detail: it determines the feature means, variances, and hence the geometry of the space. citeturn16search0turn16search24 The practical analogue for your product is straightforward: an author’s punctuation rate, character-sequence frequency, sentence length, emoji use, or any interpretable “style trait” should be expressed relative to a **language-appropriate external population**, not relative only to that author.

For a product, I would distinguish two reference sets:

| Reference set | Purpose | Correct unit of sampling |
|---|---|---|
| **Language/background corpus** | Feature frequency, smoothing, common-vs-rare n-grams, z-scores | Documents or balanced text |
| **Population-of-authors norm** | Claims such as “higher than most writers”, author variability priors, percentile ranks | **Authors**, equal-weighted |
| **Verification development set** | Thresholds, score-to-probability mapping, hyperparameters | Author-disjoint positive and negative pairs |

The second row is crucial. A 20-million-document crawl is not necessarily a good population norm if 5% of prolific sites or users supply most of the text. For “more than most people,” the statistical unit must be the **person/account**, not the token.

Second is **population-based standardization**. Burrows-style z-scoring is one version. Percentile ranks are another. For your feature corridors, a sensible author-independent construction is to first transform each feature into its population percentile or robust z-score within language × broad genre/platform, and only then ask whether the target author departs from that population. This turns, for example, “the author uses feature X at 3.2%” into the more meaningful “the author is at the 87th percentile among comparable writers.” Classical Delta and its variants supply strong precedent for external standardization, although they do not establish your particular 10th/90th corridor. citeturn16search0

Third is **verification calibration**. Recent PAN tasks explicitly require a bounded score interpreted as the “probability that this pair is a same-author text pair.” PAN evaluates AUC separately from Brier score; in PAN’s wording, Brier measures the “ability of systems to calibrate the verification scores as probability of a positive answer.” This is important because a system may rank same-author cases above different-author cases quite well while having a poor operational threshold. citeturn20search0

PAN did **not** settle on Platt scaling or isotonic regression as the canonical solution. It settled on the requirement that systems produce meaningful probabilistic scores and on evaluation that penalizes bad calibration. PAN 2021 also deliberately evaluated on authors and fandom domains absent from the previous calibration material, and its post-hoc analysis reported that systems benefited from substantial calibration data. citeturn20search1

Platt scaling and isotonic regression therefore belong one level below PAN’s protocol:

* Platt calibration fits a sigmoid transformation of a raw score.
* Isotonic regression learns a non-parametric monotone mapping.
* Standard calibration practice fits either mapping on a **separate labelled calibration set**, not on the data used to fit the base scoring function. citeturn21search4turn21search15

For your data scale I would start with Platt/logistic calibration because it has only a few parameters, then allow isotonic calibration to replace it only when author-disjoint held-out Brier/log loss demonstrably improves. That is an engineering recommendation, not something PAN established as universally optimal.

The strongest evidence against calibrating from a single author is the design of modern benchmarks themselves. AVShift, published in 2026 for German, uses 80%/10%/10% **author-disjoint** train/validation/test partitions; no author crosses partitions. It also caps the number of pairs contributed per author so prolific writers do not dominate. citeturn15view0turn15view2

### Your 95th-percentile rule

Suppose \(D^+_a\) is the distribution of distances between genuine texts and author \(a\)'s profile. Your rule estimates

\[
t_a = Q_{0.95}(D^+_a)
\]

and accepts a query if its distance is below \(t_a\).

If the estimate were perfect and future genuine texts were identically distributed, this would approximately target a 5% false-rejection rate. But verification also has a negative distribution,

\[
D^-_a = \text{distance of other-author or machine texts from author }a.
\]

Nothing in \(Q_{0.95}(D^+_a)\) constrains the false-acceptance probability

\[
P(D^-_a \le t_a).
\]

That is the precise defect. Your rule is a **one-class consistency envelope**, not a fully calibrated verifier.

A better design preserves the author adaptivity but adds population and negative evidence. One workable formulation is:

\[
z_{a,q} =
\frac{d(a,q)-\hat{\mu}_a}
     {\hat{\sigma}_a},
\]

where \(\hat{\mu}_a,\hat{\sigma}_a\) describe genuine within-author variability but are **partially pooled** toward language/genre population values when author \(a\) has little evidence. Then fit

\[
P(\text{same author}\mid z,\text{length},\text{genre shift},\ldots)
\]

on an author-disjoint development population containing both genuine and hard negative pairs.

The literature does not establish classic **James–Stein shrinkage of authorship-verification thresholds** as a standard technique. I found no PAN-era evidence that “take each author’s 95th quantile and James–Stein-shrink those quantiles” has been validated. Classic James–Stein theory concerns shrinkage of mean-like parameters under specific loss/distributional assumptions; a sample 95th percentile is not automatically covered by that theory. So this should be treated as a new method to validate, not as established stylometry.

The **empirical-Bayes idea**, however, is highly appropriate statistically: authors with 150,000 characters should be allowed to determine their own variability more strongly than authors with 15,000 characters. A hierarchical model of author-specific location and scale, followed by a posterior-predictive genuine quantile, is cleaner than directly shrinking raw quantiles. A robust alternative is to shrink counts/frequencies toward a language-level Dirichlet prior and shrink author-level distance location/dispersion toward population parameters.

There is another practical problem with leave-one-post-out calibration: the training sets overlap almost completely. Prefer **leave-one-time-block-out, leave-one-thread/topic-out, or leave-one-batch-out** estimates. They better approximate the future-text problem and reduce dependence.

**ESTABLISHED.** The Impostors family is explicitly based on a background population. Koppel and Winter repeatedly subsample features and compare the questioned document with the candidate and with external “impostor” documents. The method achieved useful verification accuracy even for documents of roughly 500 words, but its optimal parameter values were selected on a **separate, disjoint development set**; the authors themselves note that the resulting approach was “technically not completely unsupervised.” citeturn20search12 Variants of Impostors were among the strongest systems in early PAN verification campaigns, and later work specifically improved how impostors are selected. citeturn20search6

General Impostors does **not eliminate thresholds**. It converts absolute similarity into a relative score—roughly, “how often does the candidate beat plausible alternatives under random feature views?”—which is much more robust than an isolated raw distance. But a binary decision still requires a score cutoff or score-shifting/calibration procedure; implementations of the General Impostors framework include explicit parameter optimization. citeturn20search3

**CONTESTED.** What should the background corpus contain? A narrowly matched reference corpus reduces domain mismatch, but can make topic-specific habits look stylistic. A very broad corpus better represents “anybody else,” but may make the verification task unrealistically easy. The best product compromise is to use several negative strata: same-topic/same-genre humans, same-platform humans, broad random humans, and machine impersonators. The operating threshold should be driven primarily by the difficult strata, not the random-background stratum.

Also contested is whether a verifier should be expressed as a probability at all. For forensic-style applications, likelihood-ratio approaches have been proposed because the relevant quantity is the relative support under same-author versus different-author hypotheses rather than an opaque similarity number. Recent AV work explicitly explores likelihood-ratio formulations for this reason. citeturn20search16

**FOLKLORE.** None of the following should survive as an assumed product constant without cross-author tests: “character 5-grams are the right n,” “400 is enough,” “10/90 is a natural corridor,” “95% is the right genuine quantile,” “a global threshold floor is necessary,” or “80/85/90 is the right headline match number.” These are hypotheses.

In particular, a global floor under an otherwise author-specific threshold is logically suspicious: it reintroduces a universal constant precisely where your model says authors differ. It may ultimately be useful, but it must win on author-disjoint development data.

## Reference corpora, licensing, and population norms

**ESTABLISHED.** The large multilingual web corpora solve a different problem from an author-population norm. They can provide background frequencies, language identification, n-gram priors, and broad web statistics. Most do **not** reliably provide one-person-one-profile sampling. In addition, a corpus being downloadable or having a permissive *dataset packaging* license does not necessarily mean the underlying crawled text has been relicensed for arbitrary commercial reuse. Common Crawl’s own terms explicitly warn that crawled content can remain subject to separate terms imposed by the original content owners. citeturn19search3turn19search11

For an AGPL-3.0 application, the software license and data rights are separate layers. AGPL does not turn noncommercial data into commercial data, and it does not clear copyright in a scraped webpage. The table below is therefore deliberately conservative. It is licence/product analysis, not legal advice.

| Collection | Scale and coverage | Composition / collection | Stated licence situation | AGPL product verdict |
|---|---|---|---|---|
| **Leipzig Corpora Collection** | Over 250 languages; more than 1,000 corpus-derived dictionaries/corpora. citeturn19search0 | Web and news material, collected periodically from online sources. citeturn19search8 | Leipzig states that data are free for private/scientific use under **CC BY-NC** and that commercial use is prohibited. citeturn19search12 | **No for a commercial product.** Excellent research/background resource, not a production commercial norm under those terms. |
| **OSCAR** | Very large multilingual Common-Crawl-derived corpus, distributed by language. citeturn19search5 | Language classification and filtering of Common Crawl. | Project materials use CC0 for released material/metadata, but the underlying source is Common Crawl; that does not erase originating-site rights. citeturn19search13turn19search3 | **Not licence-clean enough to assume commercial clearance.** Useful for research and frequency estimation after legal review. |
| **CC-100** | Roughly 100 languages; the widely used release is about **292 GB**. | Extracted from Common Crawl/CC-Net, principally from a 2018 crawl. | The CC-Net code has its own permissive software licence, but the CC-100 corpus itself has historically lacked a clear blanket content licence in common dataset cards. | **Unclear; do not treat as cleared production data.** |
| **mC4** | **101 languages, ~38.5 TiB**, assembled from many Common Crawl snapshots. | Multilingual cleaned Common Crawl. | Distributed under **ODC-By** in common releases, with Common Crawl terms still applicable to contained source material. | **Conditional.** ODC-By permits database use with attribution, but underlying web rights remain a separate question. |
| **HPLT** | Current releases cover about **198 languages** and tens of terabytes; HPLT v3 reports roughly 50 TB compressed. | Large multilingual web crawl processing. | HPLT packaging is presented under permissive/CC0 terms while explicitly distinguishing those terms from ownership of the underlying texts. | **Conditional / not blanket-cleared.** Useful background corpus; not a substitute for source-rights review. |
| **FineWeb2** | **>1,000 languages, ~20 TB, ~5 billion documents, nearly 3 trillion words.** citeturn19search28 | Nearly 100 Common Crawl snapshots with language-adaptive filtering/deduplication. | **ODC-By 1.0**; the dataset card explicitly says use is also subject to Common Crawl’s terms. citeturn19search2turn19search1 | **Best current broad technical option, but still not “copyright-cleared web text.”** Good for nonredistributed statistics after legal review. |
| **Common Crawl directly** | More than **300 billion pages**, with several billion pages added in typical monthly crawls. citeturn19search9 | Raw public-web crawl archives. | Common Crawl makes access open but explicitly says individual crawled materials can have separate terms. citeturn19search3 | **Not a content licence.** |
| **Million Authors Corpus — MAC** | **60.08M text chunks, 1.29M Wikipedia contributors, 60 languages.** citeturn18view0 | Contiguous text added in Wikipedia edits, linked to contributor identity. citeturn18view1 | The current Zenodo record’s Rights/License field is blank. citeturn18view1 | **Very valuable research reference because it has authors; do not assume redistribution/product rights until clarified.** |

FineWeb2 is the most attractive of the current general web corpora if you merely need language-level statistics: unlike older resources, it covers far more than your sixteen locales with one processing pipeline. But it still does not solve the “most people” problem because webpages are not an unbiased sample of individual writers. citeturn19search28turn19search3

MAC solves the *identity* problem much better: 1.29 million contributors and 60 languages make it unusually useful for estimating between-author variation. But Wikipedia writing is an especially poor approximation of ordinary channel posts: editing is formalized, collaborative, topic constrained, and strongly selected by who edits Wikipedia. The authors of MAC themselves motivate it as an authorship-verification and cross-domain benchmark, not as a demographic census of everyday writing. citeturn18view0

### Short-form and social data among your locales

The public situation is substantially worse once the requirements become: **short**, **author-preserving**, **natural**, and **clearly commercially reusable**.

| Locale | Public short/social author data I could substantiate | Product-rights assessment |
|---|---|---|
| **ar** | PAN 2017 Twitter; PAN 2018 gives 100 tweets per author. citeturn21search1turn21search2 | Useful benchmark; task pages do not provide the kind of explicit commercial content licence I would require for a production norm. |
| **bn** | Multilingual Wikipedia/MAC and broad web data exist; I did not locate a clearly commercial-permissive, author-preserving short-social norm corpus. | **Build/obtain first-party reference data.** |
| **de** | GerAV 2026: >600k labelled pairs from Twitter and Reddit; multilingual Reddit AV work also exists. citeturn21academia35turn21search3 | Excellent research validation asset; commercial corpus rights need separate confirmation. |
| **en** | PAN Twitter resources, including PAN 2020 with 100 tweets per user, plus extensive Reddit/blog benchmarks. citeturn21search8 | Richest research ecosystem; that does not make Twitter/Reddit text blanket-cleared for product redistribution. |
| **es** | PAN 2017/2018 and PAN 2020 Twitter. citeturn21search1turn21search2turn21search8 | Research-cleaner than production-clean. |
| **fr** | Multilingual Reddit corpora exist—for example a 1.8M-comment moderation corpus covering English, German, Spanish and French—but these are not designed as representative author norms. citeturn21search14 | No clearly suitable production author norm located. |
| **he** | Broad multilingual/MAC-type resources; no licence-clean author-preserving short-social norm located. | **First-party panel recommended.** |
| **it** | Older multilingual author-profiling/social benchmarks exist in the literature, but no source reviewed here gave sufficiently clear commercial content rights for a production norm. | **First-party panel recommended.** |
| **ja** | Broad multilingual resources and multilingual authorship models exist; no licence-clean public short-social author panel located. | **First-party panel recommended.** |
| **ka** | MAC/Wikipedia and multilingual modelling provide research data; short social resources are particularly sparse. | **First-party panel effectively required.** |
| **ko** | Covered by multilingual style-model research; no clearly reusable author-preserving public social norm located. | **First-party panel recommended.** |
| **pt** | PAN 2017 Twitter contains Portuguese. citeturn21search1turn21search20 | Useful benchmark; no explicit production-grade content clearance on the task page. |
| **ru** | Good broad-web and Wikipedia resources; no clearly commercial-permissive, author-preserving short-social norm found in the sources reviewed. | **First-party panel recommended.** |
| **tr** | Broad-web/Wikipedia and multilingual modelling resources; no clean public social norm located. | **First-party panel recommended.** |
| **vi** | Broad-web/Wikipedia and multilingual modelling resources; no clean public social norm located. | **First-party panel recommended.** |
| **zh** | Broad-web/Wikipedia and multilingual modelling resources; no clean public social norm located. | **First-party panel recommended.** |

That “no clean corpus located” language is deliberate: it means **I would not sign off on production use from the primary licensing evidence I found**, not that no dataset whatsoever exists.

For a commercial product, the cleanest route is therefore a **consented or contractually licensed author reference panel**. A few hundred writers per language is tiny compared with FineWeb2, but much more valuable for your actual question because you know that each profile is one writer, what platform/register it represents, when it was written, and what rights you have.

**How many authors for a stable norm?** Stylometry does not provide a universal theorem saying “N=137 authors is enough.” For percentile norms, ordinary sampling statistics give useful intuition. A 95th percentile estimated from 100 authors has only about five observations beyond it; with 200 authors it has about ten; with 500 it has about twenty-five. The binomial probability-scale standard error around a 95% cumulative probability is about 1.5 percentage points at \(N=200\) and about 1 percentage point at \(N=500\); uncertainty in the *value* of the quantile can be larger when the distribution is flat or heavy-tailed.

For product norms I would call **200 authors/language a minimum**, **300 a credible working target**, and **500 preferable** if you intend to publish tail statements such as “top 5%.” These are engineering/statistical recommendations, not stylometry consensus.

Text volume per author also has no universal threshold. Eder’s controlled literary attribution experiments found minimum effective sample lengths around **2,500–5,000 words**, with roughly 5,000 words common for modern English, German, Polish, and Hungarian prose; the paper explicitly emphasizes genre differences. citeturn16search8 Those experiments concern literary attribution rather than short-post verification, so they should not be transplanted literally. They do tell you something important: your low end of **15,000 characters** is not obviously “large data”; in alphabetic languages it can sit near the region where classical stylometry was still sensitive to sampling noise.

For social text, many short posts aggregated across time are more valuable than one contiguous passage of equal length, provided you avoid leakage from repeated threads, copied templates, and quotations.

Web-scraped norms need controls for at least platform, period, topic, demographics, bots/spam, corporate/shared accounts, copied content, machine-assisted writing, code-switching, dialect, source duplication, and unequal author activity. The newest robustness evidence reinforces that genre and time are not nuisance details: AVShift finds large genre effects and performance degradation with increasing temporal separation. citeturn14view2turn14view3

**CONTESTED.** Whether one universal “general writing” norm is desirable. A global norm makes product explanations simple but can turn platform conventions into supposed personal traits. A Telegram technical-channel author compared with a population dominated by news articles will look stylistically extraordinary for reasons having little to do with individuality. I would maintain a broad language norm for user-facing comparability but also calculate platform/register-conditioned norms and suppress claims that reverse under reasonable reference sets.

**FOLKLORE.** “A huge corpus is automatically a good norm.” It is not. Ten million web pages with no reliable author identities can be worse for your percentile question than 300 carefully sampled people with 30,000 characters each.

Likewise, “OSCAR/FineWeb/HPLT is open, therefore every sentence is commercially relicensed” is unsafe. Their dataset/database terms and the copyright/terms of the crawled source material are distinct. Common Crawl says this explicitly. citeturn19search3

## Validation across authors

**ESTABLISHED.** The standard unit of generalization in modern authorship verification is the **unseen author**. A valid evaluation therefore separates authors, not merely texts, across development and test.

PAN 2021 used a new test set with authors and fandom domains not present in the previous materials. citeturn20search1 AVShift goes further and explicitly splits authors 80%/10%/10%, samples different works/threads for positive pairs to reduce topic leakage, and limits each author’s pair contribution. citeturn15view0

A good cross-author protocol for your product is consequently:

\[
\text{fit feature choices/calibration on authors A}
\rightarrow
\text{freeze}
\rightarrow
\text{evaluate on entirely new authors B}.
\]

Leave-one-author-out cross-validation is acceptable when data are scarce, but **model selection must itself be nested**. If you try 5-grams, 4-grams, 400 features, 800 features, four percentile corridors and three threshold rules and then report the best leave-one-author-out result on the same authors, those authors have become development data.

Cross-topic evaluation requires more than random pair splitting. Positive same-author pairs should come from different topics/threads; negative pairs should include other authors on the **same** topic. AVShift uses exactly this style of controlled construction: story pairs come from different fanfiction works, review pairs refer to different stories, and forum pairs come from different threads. citeturn15view2

Cross-genre evaluation is harder still: profile on one register, query on another. PAN 2022 was explicitly designed around verification across discourse types—essays, emails, text messages and business memos from roughly 100 people—rather than merely different topics within one form. citeturn9search2

Published sample sizes span orders of magnitude, which is itself evidence that there is no magic “validated at N authors” threshold:

| Study / benchmark | Independent-author scale | Why it matters |
|---|---:|---|
| PAN 2022 cross-discourse | ~100 individuals | Controlled discourse shift. citeturn9search2 |
| 2026 LLM impersonation study | 46 BOLT, 60 Twitter, 76 Enron authors | Direct person-specific machine-impersonation testing. citeturn11view1 |
| 2025 personal-style imitation | >400 real authors, >40,000 generations/model | Large adversarial personalization evaluation. citeturn13view1 |
| AVShift 2026 | Depending on subset, ~1,849–4,806 unique users; >150k pairs overall | Author-disjoint cross-genre/time German benchmark. citeturn15view0turn15view2 |
| Million Authors Corpus 2025 | 1.29 million contributors | Cross-language/domain scale rather than short-social realism. citeturn18view0 |

The important sample size is the number of **independent authors**, not the number of generated pairs. Ten thousand pairs constructed from three people are still fundamentally three independent author clusters.

There is also no universal value for “normal between-author variance.” It depends on feature, language, genre, length, and platform. The most informative recent evidence measures *within-author cross-genre variability relative to between-author variability*. AVShift’s more than 4,000 handcrafted features had stability scores ranging from –1.70 to 0.90, mean 0.22 and median 0.25; 80% were positive overall, but only 48% were positive for one genre transition versus 85% for another. Even the identity of the most stable features changed substantially by genre pair. citeturn14view2

That is a strong argument against assuming that a fixed top-400 feature profile has a universal between/within-author ratio.

### What three authors buys you

Three authors are useful for:

1. finding coding errors;
2. seeing whether the score has any within-author repeatability;
3. checking whether gross topic leakage exists;
4. generating candidate hypotheses about profile size, corpus length and distance definitions.

Three authors do **not** let you estimate a population threshold, a distribution of author variability, a language effect, a stable tail percentile, or a reliable false-accept rate against unseen writers.

Even under an unrealistically simple Gaussian model, a variance estimate based on three independent observations has only two degrees of freedom and an enormous confidence interval. More pairs between the same three people do not repair that.

I would describe three corpora as an **engineering smoke test**, not a validation study.

**CONTESTED.** How many authors are enough depends on the desired claim. Fifty independent authors can expose a disastrous method. It is much less persuasive for a production statement such as “this method works for arbitrary people.” Hundreds are preferable when estimating per-language heterogeneity or tail risks.

There is also a legitimate disagreement between very large benchmark training and smaller carefully controlled evaluation. Millions of noisy web authors are valuable for learning representations; dozens or hundreds of carefully curated authors can be more diagnostic for causal questions about topic, genre, LLM impersonation, and corpus size. MAC and large multilingual representation work illustrate the former; PAN 2022 and controlled impersonation studies illustrate the latter. citeturn18view0turn13view1

**FOLKLORE.** “Leave-one-author-out means the method is author-independent.” It only means that particular outer split is author-disjoint. If parameters were chosen after inspecting all authors’ results, the authors have indirectly entered model selection.

Similarly, “95% accuracy over thousands of pairs” can be misleading if those pairs come from a few writers. Confidence intervals and bootstrap resampling should be **clustered by author**.

## Cross-lingual transfer

**ESTABLISHED.** There is now credible evidence that *representations* of style can transfer across languages. There is much less evidence that every **calibration constant** transfers unchanged.

mStyleDistance was trained using synthetic style variation across multiple languages including Arabic, German, Spanish, French, Japanese, Korean, Russian and Chinese and evaluated on authorship verification beyond its training distribution. citeturn6search6turn7view1 On the PAN 2013–2015 verification sets, the paper reports approximate ROC-AUC averages of **0.64 for Greek, 0.73 for Spanish and 0.60 for Dutch**, versus roughly **0.52, 0.62 and 0.62** for its English-oriented StyleDistance predecessor; the multilingual model’s overall average was about 0.66 versus 0.59. citeturn8view0

That is evidence of useful transfer. It is simultaneously evidence **against uniform transfer**: the same representation is not equally good in every language.

The successor line of multilingual authorship-representation work is broader still. The MSR work trains on multilingual, multi-domain author data and explicitly separates **seen** and **unseen** languages. Among your locales, its multilingual data include French, Russian, Italian, Arabic, Japanese, Turkish, Hebrew, Vietnamese, Chinese, Georgian and Bengali, while German, Spanish and Portuguese are among held-out-language evaluations. citeturn18view2

The data availability is radically unequal. In the MSR appendix, some language slices have thousands of authors while Georgian has only about **176** in the cited slice; performance and uncertainty therefore differ substantially across languages. citeturn18view2 A high observed score on 176—or fewer testable—authors should not be read as proving low-resource parity.

Recent German evidence is particularly instructive. GerAV reports more than 600,000 labelled German verification pairs and finds that models specialized on one data type work best on matching data but generalize less well across data regimes; mixing sources mitigates some of that specialization. citeturn21academia35 AVShift uses multilingual MSR embeddings for German but still **tunes the verification threshold on the German AVShift data**, using Youden’s \(J\). citeturn14view1

That is almost exactly your product question: **the representation can transfer while the operating threshold still needs target-language/target-domain calibration**.

Character n-grams make the need for validation stronger, not weaker. A 5-character sequence in English is often part of one or two words plus spaces; five Han characters can encode a much larger lexical/semantic unit; Japanese mixes kanji, hiragana and katakana; Arabic has normalization/diacritic choices; Korean may be represented as composed Hangul syllables or decomposed Jamo. Thus the same integer \(n=5\) has different linguistic granularity and topic exposure across scripts. Multilingual style work’s nonuniform per-language results are consistent with that expectation. citeturn8view0turn18view2

A strong practical design is therefore to transfer the **algorithmic template**:

> normalize → estimate author profile → estimate genuine variability → compare query → calibrate against author-disjoint positives/negatives

while allowing feature granularity, profile size, corpus-size rules, shrinkage strength and threshold mapping to differ when data show that they must.

**CONTESTED.** Whether one multilingual calibrator can ultimately replace sixteen language-specific calibrators. It is plausible if scores are first made language-invariant—for example by converting them to population quantiles or standardized distance residuals—and if a held-out invariance test shows equal calibration. But current multilingual authorship evidence is not strong enough to assume this in advance.

A sensible hierarchy is:

\[
\text{global method}
\rightarrow
\text{language random effect}
\rightarrow
\text{genre/length corrections},
\]

with statistical shrinkage allowing high-resource languages to help low-resource ones. If the language effect shrinks to nearly zero, you have experimentally earned a shared calibrator. If it does not, retain language-specific parameters.

**FOLKLORE.** “Adding a language means adding a word list.” For your present character-n-gram representation, no word list is even required. The expensive work is elsewhere:

* normalization and Unicode decisions;
* representative population data;
* corpus-size and short-text stability;
* topic/genre testing;
* target-language score calibration;
* target-language LLM impersonation generation;
* bias and licensing review.

Language-specific dictionaries become an additional cost only for interpretable lexical traits such as function-word classes, slang, humor markers, hedging, discourse markers, contractions, or register. Borrowing another language’s dictionary may be acceptable as a prototype hack only where linguistic overlap has been verified feature by feature; it is not a general multilingual strategy.

For product planning, I would therefore price language N as **a validation programme plus, sometimes, lexical-resource work**.

## Topic, genre, and temporal robustness

**ESTABLISHED.** Topic is one of the central confounders in stylometry. Lexical content features—especially named entities and nouns tied to subject matter—fail first. Cross-domain work on the Guardian corpus found strong topic effects from common and proper nouns and showed that masking proper nouns improved cross-domain authorship analysis; importantly, removing *all* content words was not universally beneficial because some verbs, adjectives, adverbs and even nouns also carry authorial information. citeturn9search0

This is why “function words only” is not a universally solved answer. Function words are less directly topical than nouns, but their frequencies can still move with register, syntax and topic. Hard masking can throw out useful author signal along with content signal.

Character n-grams are often comparatively strong under topic change because they capture punctuation, affixes, spacing, orthography and word fragments, but they are **not topic-free**. A character 5-gram can contain an entire short word or a distinctive content fragment. That problem is more pronounced in scripts where a character carries more lexical information.

Recent cross-genre evidence is very strong. AVShift’s handcrafted author vectors separated conspicuously by genre even when the same individuals wrote the texts. It reports that cross-genre performance deteriorates for all model families in controlled settings and that feature stability is transition-specific rather than universal. citeturn14view2turn15view1

The magnitude is product-relevant. In AVShift, best in-domain F1 was around **0.89 for reviews, 0.80 for stories and 0.78 for forums**. A model trained in one genre could lose about **0.2 F1** when transferred to another; broadly mixed training frequently did better than specializing on one particular genre transition. citeturn15view3

English CrossNews provides a similar warning. Same-genre article–article and tweet–tweet verification was substantially easier for several systems than article–tweet verification, although a well-trained mixed/LLM approach reached strong cross-genre results. citeturn14view2

The newest evidence also says **time itself matters**. AVShift spans 2004–2025 and reports verification degradation of up to about **0.21 F1** with temporal separation, with a noticeable decline already after the first year. citeturn14view0turn14view3 A style profile should consequently have a timestamp and probably an ageing policy; “this author’s style” should not be treated as a permanent biometric.

Corrections with evidence include:

**Topic masking/text distortion.** Replace or suppress content-heavy portions while retaining structural signals.

**Hard same-topic negatives.** Train the system on pairs where different authors discuss the same subject, forcing it away from topic shortcuts.

**Cross-topic positives.** Same author, different subjects.

**Mixed-domain training.** AVShift’s mixed training results strongly favor exposing models to diverse stylistic contexts. citeturn15view3

**Probabilistic rather than deterministic content masking.** Recent multilingual representation work reports that simple deterministic stopword/POS masking can underperform an unmasked baseline, while probabilistic content masking combined with language-aware training improves cross-domain/cross-language robustness. citeturn7view2

For your product I would not choose between raw character n-grams and topic-masked features a priori. Maintain two score channels:

\[
S_{\text{raw style}}
\quad\text{and}\quad
S_{\text{content-reduced style}},
\]

and test whether divergence between them predicts topic contamination. A query that matches only in raw lexical character n-grams but not in content-reduced features should carry lower confidence.

**CONTESTED.** The main dispute is how aggressively to remove topic. Too little masking makes topic masquerade as identity. Too much masking destroys genuine idiolect. Sundararajan and Woodard’s results are a particularly clear demonstration that selective masking can beat blanket content removal. citeturn9search0

Genre adaptation is similarly not solved by a fixed correction coefficient. AVShift finds that the identity of stable features changes markedly between genre pairs: overlap among the 100 most/least stable feature sets can be as low as 2%, although overall feature rankings remain moderately correlated. citeturn14view2 A technical channel → personal diary transition is therefore not necessarily equivalent to corporate announcements → personal diary.

**FOLKLORE.** “Style is the part of writing that stays constant when topic changes.” That is a conceptual ideal, not an empirical fact. Actual people change syntax, vocabulary, punctuation, emoji use, sentence length and formality with context.

Also folklore: “function words are topic independent,” “character n-grams are topic independent,” and “once a feature survived one cross-topic benchmark it is robust.” Robustness is a property of **a feature × language × genre transition × text length**, not of the feature name alone.

## The LLM impersonation adversary

**ESTABLISHED.** This is now an emerging research area distinct from generic human-vs-machine detection, and it is much closer to your threat model.

A 2026 study explicitly tested **LLM authorship impersonation against authorship verifiers**, using GPT-4o to imitate targets under four prompting conditions and evaluating emails, text messages and social-media writing. It tested non-neural n-gram tracing, Ranking-Based Impostors, LambdaG, and neural LUAR/STAR-type systems. In that study, the generated impersonations generally **failed to evade the verifiers**; in some settings they were easier to reject than genuine other-author negatives. citeturn11view1

The social-media setup is unusually relevant to you. The study’s Twitter corpus had 60 authors, and experiments constructed approximately **2,000 known-author tokens plus 500 unknown/query tokens** per case. citeturn11view1 The authors report that Twitter impersonations were among the easiest to reject and that no one prompting strategy consistently defeated verification. citeturn11view1

Residual machine cues included higher compressed size, entropy and type-token ratio in generated texts relative to the target writers at matched lengths. citeturn11view0 These are useful auxiliary signals, but they should not be treated as permanent fingerprints of machine text: generation models and prompting practices change.

A separate 2025 study involving **more than 400 real-world authors and over 40,000 generations per model** reached a nuanced conclusion. LLMs could approximate style relatively well in structured forms such as news and email but struggled more with subtle informal blog/forum style. citeturn13view1 This is consistent with the 2026 impersonation result but also warns that genre determines attack strength.

PersonalBench, posted in August 2026, gives another important distinction. Across **50 authors and 1,000 generations** from Qwen 3 and GLM-4 families, personalization produced author-differentiated machine outputs: LUAR could distinguish which author the generated output targeted with AUC **0.918**. Yet the generated texts still did not cross the human–LLM style boundary: reported LUAR similarity to the target humans remained around **0.484–0.508**, below a cross-human floor of **0.626**. The same study validated LUAR on real authors at AUC 0.76 for individual posts and 0.96 when multiple posts were aggregated. citeturn13view2

That combination is extremely relevant: an LLM can become recognizably “Alice-like rather than Bob-like” while still remaining measurably unlike Alice herself.

There is also 2026 work evaluating LLMs directly on social-media authorship verification. A Twitter benchmark with roughly 120,000 users found large model differences and emphasized evaluation on tweets posted from January 2024 onward to reduce training-data leakage. citeturn13view3 That work is mainly about LLMs as verifiers rather than LLMs as impersonators, but it reinforces that temporal leakage and short-post conditions matter.

### What your 94.3%, 66.7%, and 1-of-24 result says

Your numbers are more diagnostic than the 94.3% headline suggests.

Separating an author from **another person’s technical documentation** in 94.3% of pairs is an easy-negative result if topic, genre, register, formatting and document purpose differ.

Dropping to **66.7%** when the negative is an LLM writing on the author’s own topics shows that a large part of your easy separation was probably coming from confounds that the machine negative removes: topic, vocabulary, or broad register.

Most important: if “flagged” means the verifier rejected the generated text as not-this-author, then **1 of 24 = 4.17% rejection**, i.e. **23 of 24 = 95.83% false acceptance on that hard-negative set** at the current operating threshold.

That can coexist perfectly with 66.7% pairwise discrimination. PAN’s separation of AUC from Brier/hard decisions exists precisely because a score may contain useful ranking information but have a disastrous threshold. citeturn20search0

This pattern is exactly what I would expect from a threshold derived only from genuine leave-one-out distances: the scores can notice that generated texts are *somewhat less similar*, but the threshold has never been taught how far an actual adversarial negative lies.

Your current result therefore does **not** primarily say “character 5-grams fail against LLMs.” It says “the operational calibration fails against this negative distribution.” Feature failure and threshold failure must be separated experimentally.

The next experiment should plot the complete score distributions for:

\[
\begin{aligned}
&\text{same author, same topic}\\
&\text{same author, different topic}\\
&\text{other human, same topic}\\
&\text{other human, different topic}\\
&\text{LLM topic-only}\\
&\text{LLM + few-shot author examples}\\
&\text{LLM + explicit extracted style profile}\\
&\text{LLM + iterative/adaptive imitation}.
\end{aligned}
\]

Then compute AUC and false-acceptance rate at the product operating point separately. If AUC remains reasonable but FAR is enormous, recalibration can rescue the system. If AUC itself collapses toward 0.5 under the strongest impersonation conditions, the representation needs replacement or augmentation.

Features worth retaining in the LLM adversary include character/subword distributions, punctuation/formatting, function-like sequences, lexical diversity, compression/entropy measures, spelling and idiosyncratic orthography, and learned authorship representations such as LUAR/MSR. The 2026 impersonation study is encouraging precisely because both classical and neural author-verification families retained signal. citeturn11view1turn11view0

**CONTESTED.** The reassuring studies do not prove safety against a determined adaptive attacker. Their attacker generally does not have repeated black-box access to your verifier, cannot optimize against its score indefinitely, and is not necessarily fine-tuned directly on 150,000 characters of a target’s writing.

A realistic high-end threat model would give the generator:

1. the same samples your product profiles;
2. the exact topic of the desired output;
3. an automatically extracted target-style profile;
4. iterative feedback such as “too formal,” “sentence length still wrong,” etc.;
5. optionally the verifier score itself.

That is materially stronger than generic “write like this example” prompting. The current literature has not settled how well modern verification survives that attack.

It is also unsettled how much apparent success comes from **machine fingerprint detection** rather than persistent human authorship cues. If a verifier rejects GPT-4o because of generic GPT-4o entropy/lexical characteristics, a newer generator or human post-editor may erase that advantage. PersonalBench’s observation that the LLM’s own fingerprint dominates is encouraging today, but should not be interpreted as a permanent law. citeturn13view2

Language is the largest unresolved dimension. The strongest person-specific impersonation studies above are overwhelmingly English-centric. Multilingual machine-generated-text benchmarks show considerable per-language variation, but generic “human or machine?” detection is **not the same task** as “did this specific person write it?” Multilingual authorship models themselves show nonuniform language performance. citeturn18view2turn8view0

**FOLKLORE.** “AI detection solves the adversary” is wrong. A generic AI detector asks

\[
P(\text{machine}\mid x),
\]

while you need

\[
P(\text{author }a\mid x,\text{author profile})
\]

against alternatives that include humans, machines, human-edited machines and possibly machine-assisted genuine author text.

The opposite folklore—“LLMs can perfectly clone a person after a few samples”—is also stronger than current evidence. The best direct studies so far show measurable personalization but persistent authorship gaps, particularly in informal personal writing. citeturn13view1turn13view2

## Executable validation protocol and what remains unknown

The following is a **product protocol I recommend**, not a set of magic values handed down by the literature. Its purpose is to make every current constant falsifiable.

### Data and language coverage

Validate **all sixteen languages before claiming support for all sixteen**. Cross-lingual research justifies sharing methods and priors; it does not justify shipping an untested locale. mStyleDistance/MSR and the German evidence show both positive transfer and material language/domain variation. citeturn8view0turn18view2turn21academia35

For method discovery, you can reduce initial cost by beginning with an eight-language panel chosen to stress scripts and resource levels—for example **en, ru, ar, bn, ka, tr, ja, zh**—but every remaining locale still gets a locked release test.

For each production language, target:

**Population/norm + development panel: 300 independent authors.**

**Locked final test: 100 additional independent authors.**

That is **400 authors per language, 6,400 authors for sixteen languages**. A lower-cost first stage could use 150 development/norm authors + 50 test authors per language, but I would not use that smaller panel to make confident top-5%-of-population statements.

Target **30,000–60,000 characters per author** across many posts. Keep 15,000-character authors as an explicit low-data tier because your product supports them, but do not let them define the high-confidence norm. Cap or subsample very prolific authors so a 150,000-character account cannot outweigh ten ordinary accounts.

Require many independent posting occasions rather than one long concatenation: preferably tens of posts, multiple topics, and more than one time period. AVShift’s evidence on genre and temporal drift makes this more important than merely maximizing token count. citeturn14view3turn15view0

### Freeze the test set before tuning

Separate authors into:

\[
\text{reference/development authors}
\quad\text{and}\quad
\text{locked test authors}.
\]

Never use locked authors to choose n-gram length, top-K, corridor width, minimum corpus rule, threshold floor, shrinkage strength, masking, calibrator, or headline operating point.

Within development, use nested author-disjoint cross-validation. Resample uncertainty **by author**.

### Construct the right test cases

For every author, build at least these positive conditions:

| Positive condition | What it tests |
|---|---|
| Same topic, same genre, near in time | Best case |
| Different topic, same genre | Topic robustness |
| Same topic, different register/genre | Genre robustness |
| Different topic and genre | Realistic hard positive |
| Future time block | Style drift |

Construct negative conditions at equal query length:

| Negative condition | Priority |
|---|---|
| Random other human | Sanity/easy baseline |
| Same-language, same-genre human | Necessary |
| **Same-topic human** | Critical |
| Nearest-neighbour human by semantic embedding | Critical hard negative |
| Generic LLM on same topic | Necessary |
| **LLM given target-author samples** | Critical |
| LLM given automatically extracted target profile | Critical |
| LLM iterative/adaptive imitation | Red-team tier |

Do not let the easy random-human condition dominate aggregate metrics.

### Re-open every current parameter

Evaluate character n-grams at least across \(n=3,4,5,6,7\). Try top-K values around 200, 400, 800 and 1,600, plus a regularized representation that does not hard-truncate at K. Evaluate current 10/90 corridors against 5/95, 15/85 and continuous distance formulations.

Run ablations against:

* punctuation/formatting-only features;
* function-word/function-sequence features where language resources permit;
* content-masked character features;
* word/POS or morphosyntactic features where appropriate;
* an Impostors baseline;
* a current multilingual embedding baseline such as mStyleDistance/MSR.

The purpose is not necessarily to replace your simple model. It is to determine whether 5/400 is inside a broad plateau of good choices—which would support generality—or a sharp local optimum on the original Russian author—which would be evidence of overfitting.

### Replace raw per-author quantiles with partial pooling

Keep a per-author genuine variability estimate, but compute it from block-held-out samples and shrink it according to evidence quantity.

Conceptually:

\[
\theta_a \sim \text{Population}(\theta_{\text{language,genre}})
\]

\[
D^+_{a,i}\sim F(\theta_a).
\]

An author with much data gets a mostly individual estimate; an author at 15,000 characters borrows more from the language population.

Do **not** call this “James–Stein stylometry” unless the exact estimator and loss justify that name. Treat hierarchical/empirical-Bayes shrinkage as a candidate innovation and include a no-shrinkage ablation.

The raw 95th percentile should survive only if it wins on genuinely unseen authors.

### Calibrate with negatives

After computing the raw author-normalized score, learn a score-to-probability map on development authors.

Use Platt/logistic calibration as the low-complexity baseline. Fit isotonic regression as an alternative. Select between them by author-disjoint **Brier score and log loss**, not training fit. PAN’s evaluation framework is strong precedent for treating calibration separately from ranking. citeturn20search0turn21search15

Do not set the decision threshold simply to 0.5 unless the calibrated probability, class prior, and error costs justify it.

Choose the operating point from a stated product loss:

\[
L =
C_{\mathrm{FA}}P(\mathrm{false\ accept})
+
C_{\mathrm{FR}}P(\mathrm{false\ reject}).
\]

For your adversary, \(C_{\mathrm{FA}}\) should explicitly include LLM impersonation.

### Separate descriptive norms from identity verification

“This author uses shorter sentences than 85% of writers” and “this text was probably written by this author” should not share one threshold.

The first needs a population norm.

The second needs same-author versus alternative distributions.

A stylistic outlier can still be the true author; a population-typical text can still contain highly diagnostic combinations of features.

### Passing criteria

Because the literature supplies no universal product threshold, I would pre-register the following **engineering release gates** before looking at the locked test. They are intentionally harder than your present easy-negative result.

On each language separately:

**Ranking:** author-macro ROC-AUC of at least **0.85** overall, with the lower clustered-bootstrap 95% confidence bound above **0.80**.

**Genuine acceptance:** at least **90%** overall and at least **85%** in every predeclared corpus-size/query-length stratum.

**Human hard-negative false acceptance:** no more than **10%** for same-topic/same-genre humans at the chosen operating point.

**LLM impersonation false acceptance:** no more than **10%** for the aggregate adversarial LLM set, and no more than **15%** for any one predeclared model/prompt condition.

**Cross-topic degradation:** no more than **0.10 absolute AUC** relative to matched-topic testing.

**Cross-genre degradation:** no more than **0.10 absolute AUC** or, if F1 is your fixed metric, no more than 0.10 absolute F1. This is ambitious relative to published cross-genre drops—AVShift can lose around 0.2 F1—so failure would be useful evidence that the product should narrow its claim rather than quietly lower the bar. citeturn15view3

**Calibration:** Brier score materially better than the uninformative base-rate predictor in every language, with no gross reliability-curve deviations; select the specific numerical Brier gate after the development phase and freeze it before the final test. PAN’s use of Brier is the relevant precedent, not a universal published Brier cutoff. citeturn20search0

**Low-data robustness:** authors with 15,000–30,000 characters must meet a separately reported gate. Never average them with 100,000-character profiles.

**Language parity:** no language may be declared supported merely because the macro-average across sixteen languages passes. Report every language. A useful engineering alarm is a gap greater than **0.08 AUC from English** or a failure of any primary gate.

These thresholds are not “scientifically established 0.85/10% constants.” Their virtue is that they encode the product behavior you actually need and can be falsified on locked data.

### What would falsify the current approach

I would regard any of the following as evidence that the present character-profile architecture, rather than merely its constants, needs revision:

1. On author-disjoint data, character 5-gram/top-400 performance collapses while alternative representations consistently beat it by more than about 0.10 AUC across several languages.

2. LLM impersonation AUC falls near 0.5 even after the operating threshold is recalibrated. That would mean the problem is representation, not threshold.

3. The hard-negative false-accept rate remains above roughly 25% in several languages after negative-aware calibration.

4. The author-specific genuine threshold varies so wildly at 15,000 characters that repeated bootstrap/block resampling yields materially different accept/reject decisions.

5. A supposedly stylistic score is predicted more strongly by topic/genre than by author under controlled same-topic/different-author tests.

6. Parameters that appear optimal in Russian repeatedly reverse ordering in Arabic, Chinese, Japanese, Bengali, Georgian or other scripts.

7. A global calibrator has significant language-specific reliability errors after score normalization. That would falsify the “same calibration everywhere” hypothesis.

8. Performance degrades unacceptably on future time blocks even when topic and length are controlled. AVShift makes this a realistic failure mode, not a theoretical one. citeturn14view3

9. The LLM adversary can use the target corpus plus iterative feedback to move comfortably inside the genuine score distribution. That would falsify the assumption that present-day residual machine fingerprints provide durable protection.

### What the literature still does not answer

The literature does **not** tell you an optimal number of character n-grams for arbitrary short-form authors and sixteen scripts. There is evidence that character n-grams are strong features; there is no evidence for a universal **5 / top-400** choice.

It does not give a validated universal minimum corpus size in characters for short social-text verification. Eder’s 2,500–5,000-word findings are informative historical evidence, not a direct answer for Telegram-like posts across Arabic, Bengali, Chinese or Japanese. citeturn16search8

It does not establish 10th/90th percentile feature corridors as a generally optimal profile representation.

It does not establish a 95th genuine leave-one-out percentile as a complete verification decision rule. At best, that is a defensible genuine-consistency component.

It does not validate James–Stein shrinkage of per-author stylometric quantiles. Hierarchical shrinkage is statistically promising here, but you would be doing new applied research.

It does not establish how many authors are sufficient for an industrial multilingual verification claim. Published work ranges from dozens of controlled authors to millions of noisy web contributors. citeturn11view1turn18view0

It does not demonstrate that calibration learned in English—or Russian—can be reused unchanged in all sixteen of your languages. Multilingual representations transfer; per-language quality varies, and target-dataset threshold tuning remains common. citeturn8view0turn14view1

It does not provide a licence-clean, representative, author-preserving short-social “population of writers” for all sixteen locales. Large web corpora cover the languages, but their licensing and sampling properties do not solve that problem. citeturn19search3turn19search28

It does not establish a universal topic-removal strategy. Proper-noun masking, text distortion, function-oriented features and probabilistic content masking all have evidence, but aggressive content deletion can also discard author signal. citeturn9search0turn7view2

Most importantly, it does **not yet answer your exact adversarial question across languages**: “Given 15,000–150,000 characters from person A, can a current strong LLM conditioned on those samples produce new on-topic short posts that fool a verifier trained to recognize A?” The English evidence from 2025–2026 is encouraging but incomplete, and the multilingual version of that experiment is largely missing. citeturn13view1turn11view1turn13view2

That missing experiment should be treated as a core part of the product’s validation programme, not as an edge case. Your own result—good separation against unrelated human documentation, much weaker separation against same-topic generation, and only 1/24 machine negatives rejected at the current threshold—is already enough evidence that **the adversary used for calibration changes the answer**. The strongest defensible architecture is therefore not “find a universally correct threshold,” but **learn a transferable scoring procedure, normalize it against a real population, partially pool author-specific uncertainty, and calibrate the final operating point on unseen authors against the exact human and machine alternatives the product will face**.