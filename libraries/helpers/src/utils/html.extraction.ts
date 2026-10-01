import { parse, serialize } from 'parse5';
import type { ChildNode, Element, Node } from 'parse5';
import * as defaultTreeAdapter from 'parse5/lib/tree-adapters/default';
import striptags from 'striptags';

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const headingBits = new Map(
  ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag, index) => [tag, 1 << index])
);

// parse5 6 exposes its typed default adapter through this internal path.
// Clone it: other parser callers must keep the standard insertion behavior.
const legacyAdapter: typeof defaultTreeAdapter = {
  ...defaultTreeAdapter,
  insertTextBefore(parentNode, text, referenceNode) {
    const previous =
      parentNode.childNodes[
        parentNode.childNodes.findIndex((node) => node === referenceNode) - 1
      ];
    if (previous && 'value' in previous) {
      previous.value += text;
    } else {
      // JSDOM22's adapter appends new foster text (_append), despite the
      // reference argument. Preserve the existing malformed-table order.
      defaultTreeAdapter.appendChild(parentNode, {
        nodeName: '#text',
        value: text,
        parentNode,
      });
    }
  },
};

const parseDocument = (html: string) =>
  parse(html, { scriptingEnabled: false, treeAdapter: legacyAdapter });

const childNodes = (node: Node): ChildNode[] =>
  'childNodes' in node ? node.childNodes : [];

function elements(root: Node): Element[] {
  const found: Element[] = [];
  function walk(node: Node) {
    if ('tagName' in node) found.push(node);
    // Template.content is not a descendant for DOM querySelectorAll.
    for (const child of childNodes(node)) walk(child);
  }
  walk(root);
  return found;
}

function textContent(node: Node): string {
  if ('value' in node) return node.value;
  return childNodes(node).map(textContent).join('');
}

/** Text selected by the legacy heading-type/depth reduction, without a DOM. */
export function extractHeadingHtmlText(html: string): string | undefined {
  const document = parseDocument(html);
  const masks = new Map<Node, number>();
  function mask(node: Node): number {
    let descendants = 0;
    for (const child of childNodes(node)) descendants |= mask(child);
    masks.set(node, descendants);
    return (
      descendants | ('tagName' in node ? headingBits.get(node.tagName) || 0 : 0)
    );
  }
  mask(document);

  const selected = elements(document)
    .filter((node) => masks.get(node))
    .reverse()
    .reduce<{ total: number; depth: number; element: Element | null }>(
      (all, current) => {
        let depth = 0;
        let node: Node = current;
        while ('parentNode' in node && node.parentNode) {
          depth++;
          node = node.parentNode;
        }
        let calculate = 0;
        for (let index = 0; index < 6; index++) {
          if ((masks.get(current) || 0) & (1 << index)) calculate++;
        }
        // Independent depth priority is observable even with fewer titles.
        if (calculate > all.total || depth > all.depth) {
          return { total: calculate, depth, element: current };
        }
        return all;
      },
      { total: 0, depth: 0, element: null }
    );

  return selected.element
    ? textContent(selected.element).replace(/\n/g, ' ').replace(/ {2,}/g, ' ')
    : undefined;
}

/** The legacy autopost body serialization/striptags path, without a DOM. */
export function extractAutopostHtmlText(html: string): string {
  const document = parseDocument(html);
  for (const node of elements(document)) {
    if (node.tagName === 'script' || node.tagName === 'style') {
      const siblings = node.parentNode.childNodes;
      siblings.splice(siblings.indexOf(node), 1);
    }
  }
  const body = elements(document).find(
    (node) => node.tagName === 'body' && node.namespaceURI === HTML_NAMESPACE
  );
  // Frameset documents had no document.body; loadUrl caught that failure.
  return body ? striptags(serialize(body)) : '';
}
