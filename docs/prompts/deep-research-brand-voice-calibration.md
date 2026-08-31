Target: Deep research agent (ChatGPT / Gemini / Claude Deep Research)
Audience: Manual handoff — a person will paste this into a deep-research tool and read the result.

Goal: Answer seven open questions about **measuring** author similarity for short social posts, so that a shipped product can decide «does this text read like this author» with a working point that means the same thing for every author. The first question is the blocker; the rest are the gaps a previous round of research left open. Deliver decisions with citations, not a literature tour.

Success criteria:
- Each of the seven questions answered separately, in its own section, with the verdict stated before the evidence.
- Every factual claim carries a source URL and the date the page or paper states. A claim you could not verify against a primary source is listed as unverified rather than smoothed over — a previous round of this research mis-stated two software licences by trusting secondary summaries, and that cost real time.
- Where the literature has no answer, say «no answer exists» and stop. Do not assemble one from adjacent results and present it as settled. Half of the value here is a clean list of what is genuinely unknown.
- Where two sources disagree, keep both and name the disagreement. Do not average them.
- Every recommendation states what evidence would overturn it.

Context:
- Everything in this section is already measured on our side. Take it as given and do not re-derive it; it is here so the research spends its effort on what is still open.
- The product analyses an author's own posts (Telegram exports, 100–1000 posts, 100k–750k characters) and builds a voice profile the generator writes under. The check judging the result is an **Impostors / general-imposters** procedure over character 5-grams, top-400 by frequency, 60 random halves of the feature set, three impostor prints from non-overlapping thirds of foreign prose. Language Russian; the product ships 16 locales.
- An **absolute distance threshold does not work**, settled by our own measurements: at every crop from 600 to 1200 characters it accepted 100% of generated texts, and AUC against generated text ran 0.53–0.71, falling as the crop grew. The same feature asked *relatively* — closer to this author than to the impostors — reaches AUC 0.86–0.88. The feature is not blind; the absolute question was.
- **Inference-time prompting has a measured ceiling.** PersonalBench (arXiv:2608.19746, 2026-08-20): 50 authors, 1000 generations, four generation methods all land at author similarity 0.484–0.508 against a human inter-author floor of 0.626 and ceiling 0.756, spread between methods 0.024. Our three-corpus run reproduced this in Russian: the voice block moves generation toward the author by 0.005–0.008 on a gap of roughly 0.06, and almost every interval covers zero.
- **Demonstrations beat descriptions beat numbers** — DITTO (arXiv:2406.00888, ICLR 2025), +19 points of win-rate over few-shot prompting with under 10 demonstrations, but it needs per-object weight updates, which a plain chat API does not allow.
- Two findings settled and not to be re-argued: eight presentational scales are formatting rather than voice; personality typing from text is not to be used.

Questions, in priority order:

**1. Can the working point of an Impostors check be normalised so it means the same thing for different authors?** This is the blocker. Measured on three Russian Telegram authors with identical method, identical impostor sets and identical parameters, the separation between the ceiling (the author's own held-out posts) and the floor (generation with no voice at all) was:

| author | ceiling | floor | separation |
| --- | --- | --- | --- |
| A, 153 posts, 131k chars | 86.4% | 29.2% | 57.2 points |
| B, 1023 posts, 754k chars | 91.1% | 72.7% | 18.4 points |
| C, 125 posts, 107k chars | 96.1% | 80.0% | 16.1 points |

Three-and-a-half times the headroom for one author than for another. With so little room on B and C, a real effect has nowhere to show, and the same number means different things per author — so «the same figure across three authors» cannot be compared. Report: what the general-imposters literature says about the variance of its separating power across authors; whether any published normalisation, per-author calibration, score standardisation or z-scoring against a per-author null distribution makes working points comparable; whether the impostor set should be chosen per author rather than shared; and whether the floor should be a per-author quantity rather than a constant. If the method has no such normalisation, say so plainly — that is an answer we can act on.

**2. What character n-gram configuration is right for short social posts?** We use 5-grams, top 400 by frequency. Both are our hypotheses, never confirmed. Report what is measured for texts of roughly 600–900 characters, and whether the optimum shifts across writing systems — the product ships Cyrillic, Latin and at least one non-alphabetic script.

**3. What is the minimum corpus, in characters, below which authorship verification of short social forms is unreliable?** Our three authors bring 107k–754k characters. The product's own gate admits 15,000. State whether 15,000 is defensible for this task, and what the confidence looks like as a function of corpus size.

**4. What completes a decision rule whose first half is the 95th percentile of the author's own distances?** The previous round concluded that this percentile is at best half a rule: it says how far the author's real texts wander and nothing about how close a stranger comes. Report the accepted way to set an operating point against a real adversary — here, generated text — and how to report the two error rates honestly to a non-technical user.

**5. Does a calibration obtained in one language transfer to another?** The previous round concluded the representation transfers and the operating point does not, without a citation strong enough to build on. Report what is measured about cross-lingual transfer of authorship-verification operating points, and what a 16-locale product must therefore do per locale.

**6. Is there a licence-clean, author-preserving corpus of short social texts in any widely spoken language?** Needed for calibration that does not depend on our three authors. The licence must permit commercial use by the product this research serves. Report the licence text and its date; the previous round mis-stated two licences by trusting summaries, so quote the governing document.

**7. Has anything since 2026-08-20 moved the prompting ceiling, and what beats prompting without per-customer fine-tuning?** Two sub-questions. Whether newer work supersedes PersonalBench's numbers. And whether any method — retrieval of the author's own passages, decoding-time steering, activation steering, a critic-and-revise loop, or anything else — is measured to beat prompting on author similarity *without* per-object weight updates. Include the one adjacent case we care about: is there a published method for a **single surgical length edit** that brings a draft to a target length without rewriting the voice? Our generations run 1.4 to 5.8 times longer than the authors write, and a general «shorten to N» is known to erase voice.

Constraints:
- Read-only research. Do not sign up for accounts, create API keys, or make paid API calls.
- Prefer primary sources: papers, the licence text itself, dated documentation. Where only a secondary summary states something, say so beside it.
- Most quantitative work in this field is English. Where evidence is English-only, label it as evidence about English and do not generalise it to Russian or to 16 locales.
- Do not recommend anything that requires per-customer weight updates as though it were available to us; the architecture is a plain chat API. Such methods may be reported as «what it would take», clearly separated.
- Do not re-argue the two settled findings named in the context.
- Where a reasonable reading of a question could change the answer, state your assumption in one line and continue; do not stop to ask.

Output:
1. Seven sections, one per question, verdict first.
2. A table of what is now answered, what remains unknown, and what is unknowable from public sources.
3. Contradictions between sources, kept as contradictions.
4. Licences quoted with their governing document and date, for anything you recommend adopting.
5. What evidence would overturn each recommendation.
Cite sources inline as links.

Stop: Stop and report when the five output sections are written, even if several questions come back «no answer exists». A clean map of the unknown is the deliverable here, not coverage.
