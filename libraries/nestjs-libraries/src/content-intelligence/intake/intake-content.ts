/** Remove only an explicit writing-request sentence; leave the author's assertions verbatim. */
export const contentFromIntent = (text: string): string => text.split(/(?<=[.!?])\s+|\n+/u)
  .filter((sentence) => !/^(?:я\s+)?(?:(?:бы\s+)?(?:хочу|хотел(?:а)?|хотим|хотят|хотите|хочешь|хочет)\s+(?:бы\s+)?(?:в\s+этот\s+раз\s+)?(?:написать|рассказать|сделать\s+пост)\s+(?:о|об|про)|давай(?:те)?\s+(?:напишем\s+)?про)(?=\s|[,:]|$)|^I\s+(?:(?:would\s+like|want)\s+to\s+write\s+about)/iu.test(sentence.trim()))
  .join('\n\n');

export const textOrNull = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return !text || /^(?:null|none|undefined|n\/a|нет)$/iu.test(text.replace(/^[\s:"'`,;{}\[\]]+|[\s:"'`,;{}\[\]]+$/gu, '')) ? null : text;
};

/** Fixed deployment cutoff: a restart cannot prolong the diagnostic window. */
export const intakeDiscardDiagnostic = (
  operation: string,
  field: string,
  value: unknown,
  cutoff = process.env.CF_INTAKE_DISCARD_LOG_UNTIL,
  now = Date.now()
): string => {
  const until = cutoff ? Date.parse(cutoff) : NaN;
  const inWindow = Number.isFinite(until) && now < until && now >= until - 14 * 24 * 60 * 60 * 1000;
  return JSON.stringify({ operation, field, ...(inWindow ? { discarded: String(value).trim().slice(0, 80) } : {}) });
};
