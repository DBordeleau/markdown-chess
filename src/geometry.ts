// Board geometry and ismap coordinate mapping. Pure: no Worker APIs.

/**
 * Side of one square in CSS pixels at the declared image width.
 * GitHub's mobile profile page leaves the README 82px narrower than the
 * viewport, so a 272px board shows unscaled on any screen 354px or wider.
 */
export const SQUARE_PX = 34;
/** Width and height of the 8x8 board area. */
export const BOARD_PX = SQUARE_PX * 8; // 272
/** Height of the status strip drawn under the board. */
export const STATUS_PX = 30;
/** Full image size. The README must declare width = IMAGE_WIDTH. */
export const IMAGE_WIDTH = BOARD_PX;
export const IMAGE_HEIGHT = BOARD_PX + STATUS_PX;

export const FILES = "abcdefgh";

export interface Point {
  x: number;
  y: number;
}

/**
 * Parse the raw query string a browser appends for an `ismap` image,
 * e.g. "?123,45" or "123,45". Anything else returns null.
 */
export function parseIsmapQuery(search: string): Point | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const m = /^(\d{1,5}),(\d{1,5})$/.exec(raw);
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

/**
 * Map a click on the image (in pixels at the declared width) to a square,
 * white at the bottom. Clicks outside the 8x8 area return null.
 */
export function pointToSquare(p: Point): string | null {
  if (p.x < 0 || p.y < 0 || p.x >= BOARD_PX || p.y >= BOARD_PX) return null;
  const file = Math.floor(p.x / SQUARE_PX);
  const rank = 8 - Math.floor(p.y / SQUARE_PX);
  return FILES[file] + String(rank);
}

/** Top-left corner of a square in image pixels, white at the bottom. */
export function squareOrigin(square: string): Point {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return { x: file * SQUARE_PX, y: (8 - rank) * SQUARE_PX };
}
