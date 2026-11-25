// Worker and Durable Object glue. Game rules live in game.ts, drawing in render.ts.
import { DurableObject } from "cloudflare:workers";
import { Budget } from "./budget";
import { applyClick, activeSelection, loadState, newGame, type GameState } from "./game";
import { parseIsmapQuery, pointToSquare } from "./geometry";
import { clientId, isNavigation } from "./guard";
import {
  BOARD_MEMO_MS,
  CLICK_BUDGET_BURST,
  CLICK_BUDGET_REFILL_MS,
  NOTICE_BUSY,
  NOTICE_BUSY_MS,
  NOTICE_NO_WRITES,
  NOTICE_NO_WRITES_MS,
} from "./limits";
import { fallbackSvg, hash, renderBoard } from "./render";

export interface Env {
  GAME: DurableObjectNamespace<ChessGame>;
  PROFILE_URL: string;
  /** Per-IP limiter. Absent in tests and local runs. */
  CLICK_LIMITER?: RateLimit;
  /** "on" serves /state. Anything else hides it. */
  STATE_ENDPOINT?: string;
}

const NO_CACHE = "no-cache, no-store, max-age=0, must-revalidate";
const SVG_TYPE = "image/svg+xml; charset=utf-8";
const PATHS = new Set(["/board.svg", "/click", "/state"]);

export class ChessGame extends DurableObject<Env> {
  private state: GameState;
  private readonly budget: Budget;
  private busyAt = -Infinity;
  private noWritesAt = -Infinity;
  private memo: { state: GameState; notice: string | null; selected: string | null; svg: string; etag: string } | null =
    null;
  private counters = { accepted: 0, refusedBudget: 0, failedWrites: 0, boardCalls: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.budget = new Budget(CLICK_BUDGET_BURST, CLICK_BUDGET_REFILL_MS, Date.now());
    try {
      const sql = ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)");
      const rows = sql.exec<{ data: string }>("SELECT data FROM game WHERE id = 1").toArray();
      this.state = rows.length ? loadState(JSON.parse(rows[0].data)) : newGame();
    } catch {
      this.state = newGame();
    }
  }

  private save(state: GameState): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO game (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      JSON.stringify(state),
    );
  }

  click(square: string, client: string | null): void {
    const now = Date.now();
    if (!this.budget.take(now)) {
      this.counters.refusedBudget++;
      this.busyAt = now;
      return;
    }
    this.counters.accepted++;
    const next = applyClick(this.state, square, now, client);
    if (next === this.state) return;
    try {
      // Store first, so a failed write leaves memory and storage in agreement.
      this.save(next);
    } catch {
      this.counters.failedWrites++;
      this.noWritesAt = now;
      return;
    }
    this.state = next;
  }

  board(): { svg: string; etag: string } {
    this.counters.boardCalls++;
    const now = Date.now();
    const notice =
      now - this.noWritesAt < NOTICE_NO_WRITES_MS
        ? NOTICE_NO_WRITES
        : now - this.busyAt < NOTICE_BUSY_MS
          ? NOTICE_BUSY
          : null;
    const selected = activeSelection(this.state, now);
    const m = this.memo;
    if (m && m.state === this.state && m.notice === notice && m.selected === selected) {
      return { svg: m.svg, etag: m.etag };
    }
    const svg = renderBoard(this.state, now, notice);
    const etag = `"${hash(svg)}"`;
    this.memo = { state: this.state, notice, selected, svg, etag };
    return { svg, etag };
  }

  snapshot() {
    const s = this.state;
    return {
      fen: s.fen,
      selected: activeSelection(s, Date.now()),
      lastMove: s.lastMove,
      moveCount: s.moveCount,
      history: s.history,
      gameNumber: s.gameNumber,
      counters: { ...this.counters },
    };
  }
}

// This isolate's copy of the board. A click here clears it so the next reload shows the move.
let boardMemo: { svg: string; etag: string; at: number } | null = null;

function backToProfile(env: Env): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${env.PROFILE_URL}#board`, "Cache-Control": NO_CACHE },
  });
}

async function handleClick(request: Request, env: Env, url: URL): Promise<Response> {
  if (!isNavigation(request)) return backToProfile(env);
  const point = parseIsmapQuery(url.search);
  const square = point ? pointToSquare(point) : null;
  if (!square) return backToProfile(env);

  try {
    const outcome = await env.CLICK_LIMITER?.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" });
    if (outcome?.success === false) return backToProfile(env);
  } catch {
    // A broken limiter lets the click through.
  }

  await env.GAME.getByName("main").click(square, clientId(request));
  boardMemo = null;
  return backToProfile(env);
}

async function handleBoard(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  let memo = boardMemo;
  if (!memo || now - memo.at >= BOARD_MEMO_MS) {
    const { svg, etag } = await env.GAME.getByName("main").board();
    memo = { svg, etag, at: now };
    boardMemo = memo;
  }
  const headers = { "Content-Type": SVG_TYPE, "Cache-Control": NO_CACHE, ETag: memo.etag };
  if (request.headers.get("If-None-Match") === memo.etag) return new Response(null, { status: 304, headers });
  return new Response(memo.svg, { headers });
}

async function handleState(env: Env): Promise<Response> {
  if (env.STATE_ENDPOINT !== "on") return new Response("Not found", { status: 404 });
  return Response.json(await env.GAME.getByName("main").snapshot(), { headers: { "Cache-Control": NO_CACHE } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!PATHS.has(path)) return new Response("Not found", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    try {
      if (path === "/click") return await handleClick(request, env, url);
      if (path === "/board.svg") return await handleBoard(request, env);
      return await handleState(env);
    } catch {
      if (path === "/click") return backToProfile(env);
      if (path === "/board.svg") {
        return new Response(fallbackSvg(), { headers: { "Content-Type": SVG_TYPE, "Cache-Control": NO_CACHE } });
      }
      return new Response("Internal error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
