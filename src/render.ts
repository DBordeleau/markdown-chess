// SVG board renderer. Pure: builds a string, loads nothing external.
import { Chess } from "chess.js";
import { BOARD_PX, FILES, IMAGE_HEIGHT, IMAGE_WIDTH, SQUARE_PX, STATUS_PX, squareOrigin } from "./geometry";
import { activeSelection, destinations, outcome, type GameState } from "./game";

const LIGHT = "#eeeed2";
const DARK = "#769656";
const LAST_MOVE = "#f6f669";
const SELECTED = "#baca2b";
const HINT = "rgba(20,20,20,0.28)";
const FONT = "Helvetica, Arial, 'Liberation Sans', sans-serif";

// Piece outlines drawn on a 100x100 grid. Original shapes for this project.
const BASE = '<rect x="22" y="80" width="56" height="10" rx="3"/>';
const PIECE_BODY: Record<string, string> = {
  p: '<circle cx="50" cy="34" r="12"/><path d="M38 80 Q40 56 46 46 L54 46 Q60 56 62 80 Z"/>' + BASE,
  r:
    '<path d="M30 80 L33 44 L67 44 L70 80 Z"/>' +
    '<path d="M26 44 L26 20 L36 20 L36 28 L45 28 L45 20 L55 20 L55 28 L64 28 L64 20 L74 20 L74 44 Z"/>' +
    BASE,
  n:
    '<path d="M30 80 L34 62 C28 58 20 54 22 46 L36 30 L40 16 L48 25 C66 26 76 44 72 80 Z"/>' +
    BASE,
  b:
    '<circle cx="50" cy="13" r="5"/>' +
    '<path d="M50 18 C34 32 34 52 40 62 L60 62 C66 52 66 32 50 18 Z"/>' +
    '<path d="M40 62 L36 80 L64 80 L60 62 Z"/>' +
    BASE,
  q:
    '<path d="M28 80 L20 32 L33 52 L35 24 L44 50 L50 20 L56 50 L65 24 L67 52 L80 32 L72 80 Z"/>' +
    '<circle cx="20" cy="30" r="5"/><circle cx="35" cy="22" r="5"/><circle cx="50" cy="17" r="5"/>' +
    '<circle cx="65" cy="22" r="5"/><circle cx="80" cy="30" r="5"/>' +
    BASE,
  k:
    '<path d="M46 6 H54 V16 H62 V24 H54 V32 H46 V24 H38 V16 H46 Z"/>' +
    '<path d="M36 46 C36 30 64 30 64 46 Z"/>' +
    '<path d="M28 80 L24 46 Q50 38 76 46 L72 80 Z"/>' +
    BASE,
};
// Inner detail lines, drawn in the opposite colour so they show on both sides.
const PIECE_DETAIL: Record<string, string> = {
  n: '<circle cx="40" cy="38" r="3.5"/>',
  b: '<path d="M48 32 L57 44" fill="none" stroke-width="4"/>',
};

function pieceDefs(): string {
  let out = "";
  for (const type of Object.keys(PIECE_BODY)) {
    out += `<g id="w${type}" fill="#fff" stroke="#222" stroke-width="4" stroke-linejoin="round">${PIECE_BODY[type]}</g>`;
    out += `<g id="b${type}" fill="#222" stroke="#000" stroke-width="4" stroke-linejoin="round">${PIECE_BODY[type]}</g>`;
    if (PIECE_DETAIL[type]) {
      out += `<g id="w${type}d" fill="#222" stroke="#222">${PIECE_DETAIL[type]}</g>`;
      out += `<g id="b${type}d" fill="#fff" stroke="#fff">${PIECE_DETAIL[type]}</g>`;
    }
  }
  return out;
}
const DEFS = `<defs>${pieceDefs()}</defs>`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function statusText(state: GameState, now: number): string {
  const o = outcome(state);
  if (o.over) return `${o.reason}. Click to restart`;
  const chess = new Chess(state.fen);
  const side = chess.turn() === "w" ? "White" : "Black";
  const check = chess.inCheck() ? " (check)" : "";
  const sel = activeSelection(state, now);
  return sel ? `${side} to move${check}. Selected ${sel}` : `${side} to move${check}`;
}

/** A notice, when given, takes the place of the status text. */
export function renderBoard(state: GameState, now: number, notice?: string | null): string {
  const chess = new Chess(state.fen);
  const selected = activeSelection(state, now);
  const targets = new Set(selected ? destinations(state.fen, selected) : []);
  const scale = SQUARE_PX / 100;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">`,
    DEFS,
  );

  for (let rank = 8; rank >= 1; rank--) {
    for (let f = 0; f < 8; f++) {
      const sq = FILES[f] + rank;
      const { x, y } = squareOrigin(sq);
      const dark = (f + rank) % 2 === 1; // a1 is dark
      let fill = dark ? DARK : LIGHT;
      if (state.lastMove && (sq === state.lastMove.from || sq === state.lastMove.to)) fill = LAST_MOVE;
      if (sq === selected) fill = SELECTED;
      parts.push(`<rect x="${x}" y="${y}" width="${SQUARE_PX}" height="${SQUARE_PX}" fill="${fill}"/>`);
      const labelFill = dark ? LIGHT : DARK;
      if (f === 0)
        parts.push(`<text x="${x + 2}" y="${y + 9}" font-size="8" font-family="${FONT}" fill="${labelFill}">${rank}</text>`);
      if (rank === 1)
        parts.push(
          `<text x="${x + SQUARE_PX - 7}" y="${y + SQUARE_PX - 2}" font-size="8" font-family="${FONT}" fill="${labelFill}">${FILES[f]}</text>`,
        );
    }
  }

  for (let rank = 8; rank >= 1; rank--) {
    for (let f = 0; f < 8; f++) {
      const sq = FILES[f] + rank;
      const { x, y } = squareOrigin(sq);
      const piece = chess.get(sq as never);
      if (piece) {
        const id = piece.color + piece.type;
        const t = `translate(${x} ${y}) scale(${scale})`;
        parts.push(`<use href="#${id}" xlink:href="#${id}" transform="${t}"/>`);
        if (PIECE_DETAIL[piece.type]) parts.push(`<use href="#${id}d" xlink:href="#${id}d" transform="${t}"/>`);
      }
      if (targets.has(sq)) {
        const c = SQUARE_PX / 2;
        parts.push(
          piece
            ? `<circle cx="${x + c}" cy="${y + c}" r="${c - 2}" fill="none" stroke="${HINT}" stroke-width="4"/>`
            : `<circle cx="${x + c}" cy="${y + c}" r="${SQUARE_PX / 6}" fill="${HINT}"/>`,
        );
      }
    }
  }

  parts.push(statusStrip(notice ? notice : statusText(state, now)), "</svg>");
  return parts.join("");
}

function statusStrip(status: string): string {
  // Fonts differ between viewers, so squeeze long lines to a fixed width.
  const fit = status.length > 38 ? ` textLength="${IMAGE_WIDTH - 12}" lengthAdjust="spacingAndGlyphs"` : "";
  return (
    `<rect x="0" y="${BOARD_PX}" width="${IMAGE_WIDTH}" height="${STATUS_PX}" fill="#262421"/>` +
    `<text x="${IMAGE_WIDTH / 2}" y="${BOARD_PX + 19}" text-anchor="middle" font-size="12" font-family="${FONT}" fill="#fff"${fit}>${esc(status)}</text>`
  );
}

const FALLBACK =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">` +
  `<rect x="0" y="0" width="${IMAGE_WIDTH}" height="${BOARD_PX}" fill="${DARK}"/>` +
  statusStrip("The board is resting. Try again later.") +
  "</svg>";

/** Static board-sized SVG for when the game cannot be read. */
export function fallbackSvg(): string {
  return FALLBACK;
}

/** Short stable hash of a string (FNV-1a, 32-bit), used for the ETag. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
