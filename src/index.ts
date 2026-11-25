// Worker and Durable Object glue. Game rules live in game.ts, drawing in render.ts.
import { DurableObject } from "cloudflare:workers";
import { applyClick, activeSelection, newGame, type GameState } from "./game";
import { parseIsmapQuery, pointToSquare } from "./geometry";
import { hash, renderBoard } from "./render";

export interface Env {
  GAME: DurableObjectNamespace<ChessGame>;
  PROFILE_URL: string;
}

const NO_CACHE = "no-cache, no-store, max-age=0, must-revalidate";

export class ChessGame extends DurableObject<Env> {
  private state: GameState;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)");
    const rows = sql.exec<{ data: string }>("SELECT data FROM game WHERE id = 1").toArray();
    this.state = rows.length ? (JSON.parse(rows[0].data) as GameState) : newGame();
  }

  private save(): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO game (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      JSON.stringify(this.state),
    );
  }

  click(square: string): void {
    const next = applyClick(this.state, square, Date.now());
    if (next !== this.state) {
      this.state = next;
      this.save();
    }
  }

  board(): { svg: string; etag: string } {
    const svg = renderBoard(this.state, Date.now());
    return { svg, etag: `"${hash(svg)}"` };
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
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const game = env.GAME.getByName("main");

    if (url.pathname === "/board.svg") {
      const { svg, etag } = await game.board();
      const headers = {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": NO_CACHE,
        ETag: etag,
      };
      if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
      return new Response(svg, { headers });
    }

    if (url.pathname === "/click") {
      // Only a click that carries ismap coordinates on the board changes the game.
      const point = parseIsmapQuery(url.search);
      const square = point ? pointToSquare(point) : null;
      if (square) await game.click(square);
      return new Response(null, {
        status: 302,
        headers: { Location: `${env.PROFILE_URL}#board`, "Cache-Control": NO_CACHE },
      });
    }

    if (url.pathname === "/state") {
      return Response.json(await game.snapshot(), { headers: { "Cache-Control": NO_CACHE } });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
