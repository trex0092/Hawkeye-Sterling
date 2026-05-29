/**
 * Escapes HTML special characters to prevent XSS when rendering external
 * content (news snippets, hit reasons, adverse-media text) outside of React's
 * default JSX escaping. Use this when content originates from an external API
 * and must be embedded in a context that bypasses React's auto-escaping.
 */
export function sanitizeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
