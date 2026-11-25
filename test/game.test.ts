import { describe, expect, it } from "vitest";
import {
  SELECTION_TTL_MS,
  activeSelection,
  applyClick,
  loadState,
  newGame,
  outcome,
  type GameState,
} from "../src/game";
import { RESTART_HOLD_MS, SELECTION_LOCK_MS, SELECTION_LOCK_STREAK } from "../src/limits";

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
    expect(activeSelection(later, T + SELECTION_TTL_MS)).toBeNull();
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
    const fresh = applyClick(mated, "a1", T + RESTART_HOLD_MS);
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

const FOOLS_MATE = ["f2", "f3", "e7", "e5", "g2", "g4", "d8", "h4"];
const MATED_FEN = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

describe("applyClick returns the same state when nothing changes", () => {
  it("on an empty square with no selection", () => {
    const s = newGame();
    expect(applyClick(s, "e4", T)).toBe(s);
    expect(applyClick(s, "e7", T, "a")).toBe(s);
  });

  it("when the stored selection has expired and the click selects nothing", () => {
    const s = applyClick(newGame(), "e2", T);
    expect(applyClick(s, "e4", T + SELECTION_TTL_MS)).toBe(s);
  });

  it("returns a new state when a click clears an active selection", () => {
    const s = applyClick(newGame(), "e2", T);
    const cleared = applyClick(s, "e5", T);
    expect(cleared).not.toBe(s);
    expect(cleared.selected).toBeNull();
  });
});

describe("restart hold", () => {
  it("sets endedAt on the ending move", () => {
    const mated = play(newGame(), FOOLS_MATE, T + 5);
    expect(outcome(mated).over).toBe(true);
    expect(mated.endedAt).toBe(T + 5);
  });

  it("does not set endedAt on other moves", () => {
    expect(play(newGame(), ["e2", "e4"]).endedAt).toBeNull();
  });

  it("keeps a finished game for the hold, then restarts", () => {
    const mated = play(newGame(), FOOLS_MATE, T);
    expect(applyClick(mated, "a1", T + RESTART_HOLD_MS - 1)).toBe(mated);
    const fresh = applyClick(mated, "a1", T + RESTART_HOLD_MS);
    expect(fresh.gameNumber).toBe(mated.gameNumber + 1);
    expect(fresh.endedAt).toBeNull();
  });

  it("restarts at once when a finished game has endedAt null", () => {
    const mated: GameState = { ...newGame(4), fen: MATED_FEN, endedAt: null };
    expect(applyClick(mated, "a1", T).gameNumber).toBe(5);
  });

  it("detects threefold repetition after the repeating move", () => {
    const knights = ["g1", "f3", "g8", "f6", "f3", "g1", "f6", "g8"];
    const s = play(newGame(), [...knights, ...knights], T + 9);
    expect(s.endedAt).toBe(T + 9);
  });
});

describe("selection lock", () => {
  it("records who selected", () => {
    const s = applyClick(newGame(), "e2", T, "a");
    expect(s.selectedBy).toBe("a");
    expect(s.selectStreak).toBe(1);
  });

  it("refuses another client inside the lock window", () => {
    const s = applyClick(newGame(), "e2", T, "a");
    expect(applyClick(s, "e4", T + SELECTION_LOCK_MS - 1, "b")).toBe(s);
    expect(applyClick(s, "g1", T + 1, "b")).toBe(s);
    expect(applyClick(s, "e5", T + 1, "b")).toBe(s);
    expect(applyClick(s, "e4", T + 1, null)).toBe(s);
    expect(applyClick(s, "e4", T + 1)).toBe(s);
  });

  it("lets another client move after the lock window", () => {
    const s = applyClick(newGame(), "e2", T, "a");
    const moved = applyClick(s, "e4", T + SELECTION_LOCK_MS, "b");
    expect(moved.lastMove?.san).toBe("e4");
    expect(moved.selectedBy).toBeNull();
    expect(moved.selectStreak).toBe(0);
  });

  it("lets the owner move, switch or clear inside the window", () => {
    const s = applyClick(newGame(), "e2", T, "a");
    expect(applyClick(s, "e4", T + 1, "a").lastMove?.san).toBe("e4");
    expect(applyClick(s, "g1", T + 1, "a").selected).toBe("g1");
    expect(applyClick(s, "e5", T + 1, "a").selected).toBeNull();
  });

  it("drops the lock once the streak passes the cap", () => {
    let s = newGame();
    for (let i = 1; i <= SELECTION_LOCK_STREAK; i++) {
      s = applyClick(s, "e2", T, "a");
      expect(s.selectedBy).toBe("a");
      expect(s.selectStreak).toBe(i);
      s = applyClick(s, "e2", T, "a"); // clear
    }
    s = applyClick(s, "e2", T, "a");
    expect(s.selectStreak).toBe(SELECTION_LOCK_STREAK + 1);
    expect(s.selectedBy).toBeNull();
    expect(applyClick(s, "e4", T + 1, "b").lastMove?.san).toBe("e4");
  });

  it("restarts the streak for a different client", () => {
    let s = applyClick(newGame(), "e2", T, "a");
    s = applyClick(s, "e2", T, "a");
    s = applyClick(s, "e2", T, "a");
    expect(s.selectStreak).toBe(2);
    s = applyClick(s, "e2", T, "a");
    s = applyClick(s, "d2", T, "b");
    expect(s.selectedBy).toBe("b");
    expect(s.selectStreak).toBe(1);
  });

  function pastCap(client: string): GameState {
    let s = newGame();
    for (let i = 0; i < SELECTION_LOCK_STREAK; i++) s = applyClick(applyClick(s, "e2", T, client), "e2", T, client);
    return applyClick(s, "e2", T, client);
  }

  it("keeps counting the capped client's streak", () => {
    let s = pastCap("a");
    expect(s.streakBy).toBe("a");
    s = applyClick(s, "d2", T + 1, "a");
    expect(s.selectStreak).toBe(SELECTION_LOCK_STREAK + 2);
    expect(s.selectedBy).toBeNull();
  });

  it("locks a new client's selection after another client passes the cap", () => {
    const s = applyClick(pastCap("a"), "d2", T + 1, "b");
    expect(s.selectedBy).toBe("b");
    expect(s.streakBy).toBe("b");
    expect(s.selectStreak).toBe(1);
    const later = T + 1 + SELECTION_LOCK_MS - 1;
    expect(applyClick(s, "e2", later, "a")).toBe(s);
    expect(applyClick(s, "d4", later, "a")).toBe(s);
    expect(applyClick(s, "h5", later, "a")).toBe(s);
    const moved = applyClick(s, "d4", later, "b");
    expect(moved.lastMove?.san).toBe("d4");
    expect(moved.streakBy).toBeNull();
    expect(moved.selectStreak).toBe(0);
  });

  it("does not reset the streak when a selection is cleared", () => {
    let s = applyClick(newGame(), "e2", T, "a");
    s = applyClick(s, "h5", T, "a");
    expect(s.selected).toBeNull();
    expect(s.streakBy).toBe("a");
    expect(applyClick(s, "e2", T, "a").selectStreak).toBe(2);
  });
});

describe("position pruning", () => {
  it("keeps only the new position after a pawn move", () => {
    const s = play(newGame(), ["g1", "f3", "e7", "e5"]);
    expect(Object.keys(s.positions)).toHaveLength(1);
    expect(Object.values(s.positions)).toEqual([1]);
  });

  it("keeps only the new position after a capture", () => {
    const start: GameState = {
      ...newGame(),
      fen: "4k3/8/8/3r4/8/8/8/3RK3 w - - 0 1",
      positions: { a: 1, b: 2 },
    };
    const s = play(start, ["d1", "d5"]);
    expect(s.lastMove?.san).toBe("Rxd5");
    expect(Object.keys(s.positions)).toHaveLength(1);
  });

  it("adds to the map on other moves", () => {
    const s = play(newGame(), ["g1", "f3", "g8", "f6"]);
    expect(Object.keys(s.positions)).toHaveLength(3);
  });

  it("still detects threefold repetition after a pawn move", () => {
    const knights = ["g1", "f3", "g8", "f6", "f3", "g1", "f6", "g8"];
    const s = play(newGame(), ["e2", "e4", "e7", "e5", ...knights]);
    expect(outcome(s).over).toBe(false);
    const done = play(s, knights);
    expect(outcome(done)).toMatchObject({ over: true, reason: "Draw, threefold repetition" });
  });
});

describe("loadState", () => {
  it("round trips a current state", () => {
    const s = applyClick(play(newGame(3), ["e2", "e4"]), "e7", T, "a");
    expect(loadState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("loads a row in the old shape with defaults", () => {
    const s = applyClick(play(newGame(2), ["e2", "e4"]), "e7", T);
    const { selectedBy: _a, selectStreak: _b, streakBy: _d, endedAt: _c, ...old } = s;
    const loaded = loadState(JSON.parse(JSON.stringify(old)));
    expect(loaded).toEqual({ ...old, selectedBy: null, selectStreak: 0, streakBy: null, endedAt: null });
    expect(applyClick(loaded, "e5", T).lastMove?.san).toBe("e5");
  });

  it("returns a new game for garbage", () => {
    for (const raw of [null, undefined, 42, "x", [], true]) expect(loadState(raw)).toEqual(newGame());
  });

  it("returns a new game with the stored number for a bad FEN", () => {
    const row = { ...newGame(7), fen: "not a fen" };
    expect(loadState(JSON.parse(JSON.stringify(row)))).toEqual(newGame(7));
    expect(loadState({ ...newGame(), fen: 5, gameNumber: "7" })).toEqual(newGame(1));
  });

  it("returns a new game for wrong positions, history or lastMove", () => {
    const base = newGame(5);
    expect(loadState({ ...base, positions: [] })).toEqual(newGame(5));
    expect(loadState({ ...base, positions: { a: "1" } })).toEqual(newGame(5));
    expect(loadState({ ...base, history: "e4" })).toEqual(newGame(5));
    expect(loadState({ ...base, history: [1] })).toEqual(newGame(5));
    expect(loadState({ ...base, lastMove: { from: "e2" } })).toEqual(newGame(5));
    expect(loadState({ ...base, lastMove: "e4" })).toEqual(newGame(5));
  });
});
