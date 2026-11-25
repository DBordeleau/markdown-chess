// Click state machine for the shared game. Pure: no Worker APIs.
import { Chess, type Square } from "chess.js";

export const SELECTION_TTL_MS = 2 * 60 * 1000;
export const HISTORY_LIMIT = 20;

export interface LastMove {
  from: string;
  to: string;
  san: string;
}

export interface GameState {
  fen: string;
  selected: string | null;
  /** Epoch ms when `selected` was set. */
  selectedAt: number | null;
  lastMove: LastMove | null;
  /** Half-moves played in the current game. */
  moveCount: number;
  /** Most recent SAN moves of the current game, oldest first. */
  history: string[];
  /** Repetition counts keyed by the first four FEN fields. */
  positions: Record<string, number>;
  /** Number of the current game, starting at 1. */
  gameNumber: number;
}

export type Outcome =
  | { over: false }
  | { over: true; result: "1-0" | "0-1" | "1/2-1/2"; reason: string };

function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function newGame(gameNumber = 1): GameState {
  const fen = new Chess().fen();
  return {
    fen,
    selected: null,
    selectedAt: null,
    lastMove: null,
    moveCount: 0,
    history: [],
    positions: { [positionKey(fen)]: 1 },
    gameNumber,
  };
}

/** The selected square, or null if there is none or it has expired. */
export function activeSelection(state: GameState, now: number): string | null {
  if (!state.selected || state.selectedAt === null) return null;
  if (now - state.selectedAt >= SELECTION_TTL_MS) return null;
  return state.selected;
}

export function outcome(state: GameState): Outcome {
  const chess = new Chess(state.fen);
  if (chess.isCheckmate()) {
    // The side to move has been mated.
    return chess.turn() === "w"
      ? { over: true, result: "0-1", reason: "Checkmate, Black wins" }
      : { over: true, result: "1-0", reason: "Checkmate, White wins" };
  }
  if (chess.isStalemate()) return { over: true, result: "1/2-1/2", reason: "Stalemate, draw" };
  if (chess.isInsufficientMaterial())
    return { over: true, result: "1/2-1/2", reason: "Draw, insufficient material" };
  if (chess.isDrawByFiftyMoves()) return { over: true, result: "1/2-1/2", reason: "Draw, 50-move rule" };
  if ((state.positions[positionKey(state.fen)] ?? 0) >= 3)
    return { over: true, result: "1/2-1/2", reason: "Draw, threefold repetition" };
  return { over: false };
}

/** Legal destination squares for the piece on `square`. */
export function destinations(fen: string, square: string): string[] {
  const chess = new Chess(fen);
  const moves = chess.moves({ square: square as Square, verbose: true });
  return [...new Set(moves.map((m) => m.to))];
}

function canSelect(chess: Chess, square: string): boolean {
  const piece = chess.get(square as Square);
  if (!piece || piece.color !== chess.turn()) return false;
  return chess.moves({ square: square as Square }).length > 0;
}

/**
 * Apply one click on `square` at time `now`. Returns the new state; the input
 * is not modified.
 */
export function applyClick(state: GameState, square: string, now: number): GameState {
  if (outcome(state).over) return newGame(state.gameNumber + 1);

  const chess = new Chess(state.fen);
  const selected = activeSelection(state, now);
  const clear: GameState = { ...state, selected: null, selectedAt: null };

  if (selected) {
    const move = chess
      .moves({ square: selected as Square, verbose: true })
      .find((m) => m.to === square);
    if (move) {
      const played = chess.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: "q" } : {}),
      });
      const fen = chess.fen();
      const key = positionKey(fen);
      return {
        ...clear,
        fen,
        lastMove: { from: played.from, to: played.to, san: played.san },
        moveCount: state.moveCount + 1,
        history: [...state.history, played.san].slice(-HISTORY_LIMIT),
        positions: { ...state.positions, [key]: (state.positions[key] ?? 0) + 1 },
      };
    }
    if (square !== selected && canSelect(chess, square)) {
      return { ...state, selected: square, selectedAt: now };
    }
    return clear;
  }

  if (canSelect(chess, square)) return { ...state, selected: square, selectedAt: now };
  return clear;
}
