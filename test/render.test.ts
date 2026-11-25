import { describe, expect, it } from "vitest";
import { applyClick, newGame, type GameState } from "../src/game";
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "../src/geometry";
import { hash, renderBoard, statusText } from "../src/render";

const T = 1_000_000;

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("renderBoard", () => {
  it("draws a self-contained SVG of the declared size", () => {
    const svg = renderBoard(newGame(), T);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain(`width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}"`);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no external resources
    expect(svg).not.toMatch(/@import|<image|<script|<foreignObject/);
    expect(count(svg, "<use href=")).toBeGreaterThanOrEqual(32);
  });

  it("shows whose turn it is", () => {
    expect(statusText(newGame(), T)).toBe("White to move");
    const s = applyClick(applyClick(newGame(), "e2", T), "e4", T);
    expect(statusText(s, T)).toBe("Black to move");
  });

  it("highlights the selection and its destinations", () => {
    const base = renderBoard(newGame(), T);
    const sel = renderBoard(applyClick(newGame(), "e2", T), T);
    expect(sel).toContain('fill="#baca2b"');
    expect(base).not.toContain('fill="#baca2b"');
    // e3 and e4 dots
    expect(count(sel, "<circle cx=") - count(base, "<circle cx=")).toBe(2);
    expect(statusText(applyClick(newGame(), "e2", T), T)).toContain("Selected e2");
  });

  it("drops an expired selection from the drawing", () => {
    const s = applyClick(newGame(), "e2", T);
    expect(renderBoard(s, T + 3 * 60 * 1000)).toBe(renderBoard(newGame(), T));
  });

  it("highlights the last move", () => {
    const s = applyClick(applyClick(newGame(), "e2", T), "e4", T);
    expect(count(renderBoard(s, T), 'fill="#f6f669"')).toBe(2);
  });

  it("shows the result when the game is over", () => {
    const mated: GameState = {
      ...newGame(),
      fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    };
    expect(renderBoard(mated, T)).toContain("Checkmate, Black wins. Click to restart");
  });

  it("changes hash when the drawing changes", () => {
    const a = renderBoard(newGame(), T);
    const b = renderBoard(applyClick(newGame(), "e2", T), T);
    expect(hash(a)).toBe(hash(a));
    expect(hash(a)).not.toBe(hash(b));
  });
});
