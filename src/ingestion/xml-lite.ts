// Minimal XML tokenizer — extracts elements as { tag, attrs, text, children }.
// No external deps. Good enough for sanctions-list XML (UN, OFAC, EU) where
// the schema is well-behaved and doesn't rely on CDATA tricks or namespaces
// with attribute-space collisions. Not a general XML 1.0 parser.

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlNode[];
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, text: '', children: [] };
  const stack: XmlNode[] = [root];
  const tagRe = /<(\/?)([a-zA-Z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*"|\s+[\w:.-]+\s*=\s*'[^']*')*)\s*(\/?)>/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    const textBefore = xml.slice(cursor, m.index).trim();
    if (textBefore.length > 0) {
      const top = stack[stack.length - 1];
      if (top) top.text = (top.text + ' ' + decodeEntities(textBefore)).trim();
    }
    const isClose = m[1] === '/';
    const tag = m[2];
    const attrs = parseAttrs(m[3] ?? '');
    const selfClose = m[4] === '/';
    if (!tag) { cursor = tagRe.lastIndex; continue; }
    if (isClose) {
      if (stack.length > 1) stack.pop();
    } else {
      const node: XmlNode = { tag, attrs, text: '', children: [] };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(node);
      if (!selfClose) stack.push(node);
    }
    cursor = tagRe.lastIndex;
  }
  return root;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const k = m[1] ?? m[3];
    const v = m[2] ?? m[4];
    if (k && v !== undefined) out[k] = decodeEntities(v);
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

// Strip namespace prefix (e.g. "fsf:sanctionEntity" → "sanctionEntity") for
// comparison. When the search tag has no prefix we match both exact and
// namespace-prefixed variants, making the parser robust against feeds that
// add or change XML namespace prefixes between schema revisions.
function localName(tag: string): string {
  const colon = tag.lastIndexOf(':');
  return colon >= 0 ? tag.slice(colon + 1) : tag;
}

function tagMatches(nodeTag: string, search: string): boolean {
  const sl = search.toLowerCase();
  return nodeTag.toLowerCase() === sl || localName(nodeTag).toLowerCase() === sl;
}

export function findAll(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  const visit = (n: XmlNode) => {
    if (tagMatches(n.tag, tag)) out.push(n);
    for (const c of n.children) visit(c);
  };
  visit(node);
  return out;
}

export function textOf(node: XmlNode | undefined, tag: string): string {
  if (!node) return '';
  for (const c of node.children) if (tagMatches(c.tag, tag)) return c.text;
  return '';
}
