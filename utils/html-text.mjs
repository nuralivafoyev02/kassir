const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decodeHtml(value) {
  return String(value ?? "").replace(
    /&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/g,
    (_match, entity) => {
      if (entity[0] === "#") {
        const isHex = entity[1]?.toLowerCase() === "x";
        const parsed = Number.parseInt(
          entity.slice(isHex ? 2 : 1),
          isHex ? 16 : 10
        );
        return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
      }

      return Object.prototype.hasOwnProperty.call(HTML_ENTITIES, entity)
        ? HTML_ENTITIES[entity]
        : "";
    }
  );
}

export function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function truncateText(value, maxLength = 1024) {
  const text = String(value ?? "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function stripHtml(value) {
  const raw = String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtml(raw)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function toPlainNotificationContent({
  title = "",
  body = "",
  html = "",
  fallbackTitle = "Kassa",
} = {}) {
  const cleanTitle = truncateText(
    normalizeWhitespace(decodeHtml(title)),
    120
  );
  const cleanBody = truncateText(
    normalizeWhitespace(decodeHtml(body)),
    1000
  );

  if (cleanTitle || cleanBody) {
    return {
      title: cleanTitle || fallbackTitle,
      body: cleanBody,
    };
  }

  const plain = stripHtml(html);
  const lines = plain
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  return {
    title: truncateText(lines[0] || fallbackTitle, 120),
    body: truncateText(lines.slice(1).join(" "), 1000),
  };
}
