// Request checks for the Worker. Pure: they read headers and nothing else.

/**
 * True when the request looks like a browser following a link.
 * Missing Sec-Fetch-* headers pass, since older browsers do not send them.
 */
export function isNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;
  const h = request.headers;
  const ua = h.get("User-Agent") ?? "";
  if (ua.toLowerCase().startsWith("github-camo")) return false;
  const dest = h.get("Sec-Fetch-Dest");
  if (dest !== null && dest !== "document") return false;
  const mode = h.get("Sec-Fetch-Mode");
  if (mode !== null && mode !== "navigate") return false;
  return true;
}

/** A short hash of CF-Connecting-IP, or null without one. The address itself is never kept. */
export function clientId(request: Request): string | null {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return null;
  return fnv1a(ip);
}

// 32-bit FNV-1a, as 8 hex digits.
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
