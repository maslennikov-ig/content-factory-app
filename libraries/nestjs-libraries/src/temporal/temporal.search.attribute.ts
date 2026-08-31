import {
  defineSearchAttributeKey,
  SearchAttributeType,
} from '@temporalio/common';

/**
 * Both values are opaque identifiers, and every query that uses them asks for
 * an exact match (`postId="…" AND ExecutionStatus="Running"`). KEYWORD stores
 * the identifier whole; TEXT tokenises it, so a uuid split on its hyphens can
 * answer with another post's workflow.
 *
 * It also decides whether this product needs Elasticsearch. Temporal's SQL
 * visibility offers three Text columns and two of them are already taken by the
 * built-in `CustomStringField` and `CustomTextField`, so two more Text
 * attributes cannot be registered at all and the backend refuses to start.
 * Keyword columns are plentiful.
 */
export const organizationId = defineSearchAttributeKey(
  'organizationId',
  SearchAttributeType.KEYWORD
);

export const postId = defineSearchAttributeKey(
  'postId',
  SearchAttributeType.KEYWORD
);
