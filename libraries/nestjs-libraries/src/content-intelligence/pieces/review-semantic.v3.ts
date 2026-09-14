/**
 * Successor to v2: missing context stays a visible note, never a question to
 * the author. The v2 prompt remains immutable for historical receipts.
 */
export const REVIEW_SEMANTIC_V3 = `Semantic editorial review (not proof that a text was AI-written):
L52: pseudo-therapeutic care; respect personal/memoir genre. L53: cash out a metaphor: its physical mechanism/referent, ontology and consistent meaning. L54: self-labelled honesty without a real contrast, including headlines.
A6: generic optimism about problems/prospects: retain it when no supplied event or date supports a change. A11: one entity renamed by elegant synonym variation. A12: endpoints of “from X to Y” must share a scale. A20: distinguish honest knowledge/time limits from model boilerplate.
A28: audience/platform/identifier may justify an anglicism. A29: nominalization hides the actor. A30: genitive chains obscure relationships. A31: passive voice with a known actor. A35.2: after a colon, mere repetition instead of new substance.
A39: new concepts exceed audience context. A40: tangled syntax/indirect speech; preserve attribution and position. A41: redundant near-synonymous list members. A42: abstraction without an example, number without measurable comparison.
Repeated author structure needs an author corpus. For a section without new knowledge, retain it when the supplied material does not say what the reader should learn. A16/A18 sentence case/Russian quotation marks are formatting suggestions, never evidence of AI authorship.
For style use basket show with ruleId. Never use basket ask and never address a question to the author. When factual support is missing, keep replacement equal to excerpt and use basket show with a short note that the source was not found and the text was left as-is. Never invent facts, dates, actors or examples. Never call a found claim confirmed. Apply these checks only when style review or the requested regeneration scope permits.`;
