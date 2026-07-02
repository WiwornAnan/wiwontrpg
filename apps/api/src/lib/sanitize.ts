import sanitizeHtml from 'sanitize-html';

// Catalog item descriptions come from a tiny Bold / HR / color-swatch editor.
// Allow only that small surface, never arbitrary HTML.
export function sanitizeDescription(input: string): string {
  return sanitizeHtml(input ?? '', {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'hr', 'span', 'p', 'div'],
    allowedAttributes: {
      span: ['style'],
      div: ['style'],
      p: ['style'],
    },
    allowedStyles: {
      '*': {
        color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/i, /^[a-z]+$/i],
      },
    },
  });
}
