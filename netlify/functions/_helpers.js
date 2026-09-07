const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function corsPreflight() {
  return { statusCode: 204, headers: CORS_HEADERS, body: "" };
}

function parseJsonBody(event) {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

const NAME_PARTICLES = new Set(["de", "del", "la", "las", "los", "y"]);

function titleCaseSegment(segment, isFirstWord) {
  const lower = segment.toLowerCase();
  if (!isFirstWord && NAME_PARTICLES.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function normalizeNamePart(part, isFirstWord) {
  const pieces = part.split(/(['-])/);
  let subIndex = 0;
  return pieces
    .map((piece) => {
      if (piece === "-" || piece === "'") return piece;
      const out = titleCaseSegment(piece, isFirstWord && subIndex === 0);
      subIndex += 1;
      return out;
    })
    .join("");
}

function normalizeName(name) {
  const collapsed = String(name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!collapsed) return "";
  return collapsed
    .split(" ")
    .map((word, index) => normalizeNamePart(word, index === 0))
    .join(" ");
}

module.exports = { json, corsPreflight, parseJsonBody, isValidEmail, normalizeName };
