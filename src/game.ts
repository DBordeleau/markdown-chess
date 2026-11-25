// Click state machine for the shared game. Pure: no Worker APIs.
import { Chess, type Square } from "chess.js";
import { RESTART_HOLD_MS, SELECTION_LOCK_MS, SELECTION_LOCK_STREAK } from "./limits";

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
  /** Client that made the selection, or null when the selection has no lock. */
  selectedBy: string | null;
  /** Selections in a row by the same client with no move between them. */
  selectStreak: number;
  /** Client whose streak `selectStreak` counts, or null. */
  streakBy: string | null;
  /** Epoch ms of the move that ended the game, or null. */
  endedAt: number | null;
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
    selectedBy: null,
    selectStreak: 0,
    streakBy: null,
    endedAt: null,
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

function select(state: GameState, square: string, now: number, client: string | null): GameState {
  // streakBy keeps the owner even after the cap drops the lock.
  const streak = client === null ? 0 : state.streakBy === client ? state.selectStreak + 1 : 1;
  const locked = client !== null && streak <= SELECTION_LOCK_STREAK;
  return {
    ...state,
    selected: square,
    selectedAt: now,
    selectedBy: locked ? client : null,
    selectStreak: streak,
    streakBy: client,
  };
}

/**
 * Apply one click on `square` at time `now` by `clientId`. Returns the new
 * state, or `state` itself when the click changes nothing. The input is not
 * modified.
 */
export function applyClick(state: GameState, square: string, now: number, clientId?: string | null): GameState {
  const client = clientId ?? null;

  if (outcome(state).over) {
    if (state.endedAt !== null && now - state.endedAt < RESTART_HOLD_MS) return state;
    return newGame(state.gameNumber + 1);
  }

  const chess = new Chess(state.fen);
  const selected = activeSelection(state, now);

  if (!selected) {
    if (canSelect(chess, square)) return select(state, square, now, client);
    return state;
  }

  const lockHeld =
    state.selectedBy !== null &&
    client !== state.selectedBy &&
    state.selectedAt !== null &&
    now - state.selectedAt < SELECTION_LOCK_MS;
  if (lockHeld) return state;

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
    // Earlier positions cannot repeat after a pawn move or a capture.
    const irreversible = played.piece === "p" || played.captured !== undefined;
    const next: GameState = {
      ...state,
      selected: null,
      selectedAt: null,
      selectedBy: null,
      selectStreak: 0,
      streakBy: null,
      fen,
      lastMove: { from: played.from, to: played.to, san: played.san },
      moveCount: state.moveCount + 1,
      history: [...state.history, played.san].slice(-HISTORY_LIMIT),
      positions: irreversible ? { [key]: 1 } : { ...state.positions, [key]: (state.positions[key] ?? 0) + 1 },
    };
    if (outcome(next).over) next.endedAt = now;
    return next;
  }
  if (square !== selected && canSelect(chess, square)) return select(state, square, now, client);
  // Keep the owner and streak so clearing does not reset the count.
  return { ...state, selected: null, selectedAt: null };
}

const SQUARE_RE = /^[a-h][1-8]$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Build a state from a parsed storage row. Never throws. */
export function loadState(raw: unknown): GameState {
  try {
    if (!isRecord(raw)) return newGame();
    const gameNumber = finite(raw.gameNumber) ? raw.gameNumber : 1;
    const reset = newGame(gameNumber);

    const { fen, positions, history, lastMove } = raw;
    if (typeof fen !== "string") return reset;
    try {
      new Chess(fen);
    } catch {
      return reset;
    }
    if (!isRecord(positions) || !Object.values(positions).every(finite)) return reset;
    if (!Array.isArray(history) || !history.every((h) => typeof h === "string")) return reset;
    let last: LastMove | null = null;
    if (isRecord(lastMove)) {
      const { from, to, san } = lastMove;
      if (typeof from !== "string" || typeof to !== "string" || typeof san !== "string") return reset;
      last = { from, to, san };
    } else if (lastMove !== null && lastMove !== undefined) {
      return reset;
    }

    const selected = typeof raw.selected === "string" && SQUARE_RE.test(raw.selected) ? raw.selected : null;
    const selectedAt = selected !== null && finite(raw.selectedAt) ? raw.selectedAt : null;
    const selectedBy = typeof raw.selectedBy === "string" ? raw.selectedBy : null;
    return {
      fen,
      selected: selectedAt === null ? null : selected,
      selectedAt,
      selectedBy,
      selectStreak: finite(raw.selectStreak) && raw.selectStreak >= 0 ? raw.selectStreak : 0,
      streakBy: typeof raw.streakBy === "string" ? raw.streakBy : selectedBy,
      endedAt: finite(raw.endedAt) ? raw.endedAt : null,
      lastMove: last,
      moveCount: finite(raw.moveCount) && raw.moveCount >= 0 ? raw.moveCount : history.length,
      history: [...history],
      positions: { ...positions } as Record<string, number>,
      gameNumber,
    };
  } catch {
    return newGame();
  }
}
