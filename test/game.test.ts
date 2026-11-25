import { describe, expect, it } from "vitest";
import { SELECTION_TTL_MS, activeSelection, applyClick, newGame, outcome, type GameState } from "../src/game";

const T = 1_000_000;

function play(state: GameState, squares: string[], now = T): GameState {
  return squares.reduce((s, sq) => applyClick(s, sq, now), state);
}

describe("applyClick", () => {
  it("selects a side-to-move piece with legal moves", () => {
    const s = applyClick(newGame(), "e2", T);
    expect(s.selected).toBe("e2");
    expect(s.selectedAt).toBe(T);
  });

  it("does not select an opponent piece, a blocked piece or an empty square", () => {
    expect(applyClick(newGame(), "e7", T).selected).toBeNull();
    expect(applyClick(newGame(), "a1", T).selected).toBeNull(); // rook has no moves
    expect(applyClick(newGame(), "e4", T).selected).toBeNull();
  });

  it("plays a move to a legal destination", () => {
    const s = play(newGame(), ["e2", "e4"]);
    expect(s.fen.split(" ")[0]).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
    expect(s.lastMove).toEqual({ from: "e2", to: "e4", san: "e4" });
    expect(s.moveCount).toBe(1);
    expect(s.history).toEqual(["e4"]);
    expect(s.selected).toBeNull();
  });

  it("switches selection to another own piece", () => {
    const s = play(newGame(), ["e2", "g1"]);
    expect(s.selected).toBe("g1");
  });

  it("clears selection on an illegal destination or on the same square", () => {
    expect(play(newGame(), ["e2", "e5"]).selected).toBeNull();
    expect(play(newGame(), ["e2", "e2"]).selected).toBeNull();
    expect(play(newGame(), ["e2", "e7"]).selected).toBeNull();
    expect(play(newGame(), ["e2", "e5"]).moveCount).toBe(0);
  });

  it("captures", () => {
    const s = play(newGame(), ["e2", "e4", "d7", "d5", "e4", "d5"]);
    expect(s.lastMove?.san).toBe("exd5");
    expect(s.moveCount).toBe(3);
  });

  it("expires the selection after two minutes", () => {
    const s = applyClick(newGame(), "e2", T);
    expect(activeSelection(s, T + SELECTION_TTL_MS - 1)).toBe("e2");
    expect(activeSelection(s, T + SELECTION_TTL_MS)).toBeNull();
    // An expired selection does not let a later click move the pawn.
    const later = applyClick(s, "e4", T + SELECTION_TTL_MS);
    expect(later.moveCount).toBe(0);
    expect(later.selected).toBeNull();
  });

  it("promotes to a queen automatically", () => {
    const start: GameState = { ...newGame(), fen: "8/P7/8/8/8/8/8/k6K w - - 0 1", positions: {} };
    const s = play(start, ["a7", "a8"]);
    expect(s.lastMove?.san).toBe("a8=Q+");
    expect(s.fen.startsWith("Q7/")).toBe(true);
  });

  it("detects checkmate and starts a new game on the next click", () => {
    const mated = play(newGame(), ["f2", "f3", "e7", "e5", "g2", "g4", "d8", "h4"]);
    expect(outcome(mated)).toMatchObject({ over: true, result: "0-1" });
    const fresh = applyClick(mated, "a1", T);
    expect(fresh.fen).toBe(newGame().fen);
    expect(fresh.gameNumber).toBe(2);
    expect(fresh.moveCount).toBe(0);
  });

  it("detects threefold repetition", () => {
    const knights = ["g1", "f3", "g8", "f6", "f3", "g1", "f6", "g8"];
    const s = play(newGame(), [...knights, ...knights]);
    expect(outcome(s)).toMatchObject({ over: true, result: "1/2-1/2", reason: "Draw, threefold repetition" });
  });

  it("caps the history", () => {
    const knights = ["g1", "f3", "g8", "f6", "f3", "g1", "f6", "g8"];
    // Two cycles is a draw, so check the cap without hitting it: break repetition with pawn moves.
    let s = newGame();
    const pawns = ["a2", "a3", "a7", "a6", "b2", "b3", "b7", "b6", "c2", "c3", "c7", "c6", "d2", "d3", "d7", "d6"];
    s = play(s, [...pawns, ...knights, "h2", "h3", "h7", "h6"]);
    expect(s.moveCount).toBe(14);
    s = play(s, ["g2", "g3", "g7", "g6", "e2", "e3", "e7", "e6", "f2", "f3", "f7", "f6"]);
    expect(s.moveCount).toBe(20);
    s = play(s, ["a3", "a4"]);
    expect(s.moveCount).toBe(21);
    expect(s.history).toHaveLength(20);
    expect(s.history.at(-1)).toBe("a4");
  });

  it("does not mutate its input", () => {
    const s = newGame();
    const copy = JSON.parse(JSON.stringify(s));
    play(s, ["e2", "e4"]);
    expect(s).toEqual(copy);
  });
});
