import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
];

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
};
