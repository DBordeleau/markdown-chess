# Markdown chess

A chess game made to run inside a GitHub README. You control it by clicking on the board and pieces.

You can see it running on [github.com/dbordeleau](https://github.com/dbordeleau).

The board is one SVG image inside a link, and a small Cloudflare Worker does the rest. The Worker fits in Cloudflare's free plan so anyone can clone this repo and host their own.

## How it works

The markdown file holds one line of HTML:

```html
<a href="https://YOUR-WORKER/click"><img src="https://YOUR-WORKER/board.svg" ismap width="272"></a>
```

The `ismap` attribute is old HTML that GitHub still allows. It makes the browser add the click position to the link, so a click on the board opens `/click?153,221`. The Worker then does three things:

1. It turns the position into a square, in this case e2.
2. It selects the piece on that square, or moves the selected piece there.
3. It redirects the visitor back to the README, which loads a new board image.

A move takes two clicks. The first click selects a piece and the board marks its legal moves. The second click plays the move. The tradeoff is a short page load after each mode. I still prefer this to controlling the pieces by clicking on links, like other markdown chess projects are controlled.

## Rules of play

- Anyone can move for either side. Only the side whose turn it is can be selected.
- Clicking another of your pieces switches the selected piece. 
- Clicking anywhere else clears the selected piece.
- The selected piece is shared by all visitors and expires after 2 minutes.
- For the first 10 seconds, a selection belongs to the visitor who made it. Only that visitor can move the piece, switch it or clear it. After 3 selections in a row by one visitor with no move, that visitor's next selections belong to no one. A selection by another visitor belongs to them as usual.
- Pawns promote to a queen automatically.
- When a game ends, the board shows the result for 60 seconds. The first click after that starts a new game.
- A request to `/click` with no position does nothing. Crawlers that follow the link send no position, so they cannot move pieces. The Worker also ignores clicks that are not page navigations and clicks over its limits, which [Running a public board](#running-a-public-board) describes.

## Host your own

You need [Node.js](https://nodejs.org) 20 or newer, a GitHub account, and a Cloudflare account. The free Cloudflare plan needs no payment card and allows 100,000 requests a day. Read [Running a public board](#running-a-public-board) to see what happens past that.

### 1. Clone and install

```sh
git clone https://github.com/dbordeleau/markdown-chess.git
cd markdown-chess
npm install
```

### 2. Sign in to Cloudflare

```sh
npx wrangler login
```

This opens a Cloudflare page in your browser. Approve the request there.

### 3. Point the Worker at your README

Open `wrangler.jsonc` and change two values:

- `PROFILE_URL` is the page the Worker sends visitors back to after a click. For a profile README, use `https://github.com/YOUR-USERNAME`. For a repository README, use the repository's address.
- `name` is the Worker's name and the first part of its address. Pick any name you like.

### 4. Deploy

```sh
npx wrangler deploy
```

If this is your first Worker, Cloudflare asks you to choose a `workers.dev` subdomain. That subdomain is public, because it is part of the image address in your README.

Wrangler prints the Worker's address, for example `https://markdown-chess.your-subdomain.workers.dev`. Open `/board.svg` on that address. You should see the starting position.

### 5. Add the board to your README

A profile README lives in a public repository named after your username, so `octocat/octocat` for the user `octocat`. Paste this into its `README.md` and replace `YOUR-WORKER` with the host Wrangler printed:

```html
## Board

<a href="https://YOUR-WORKER/click"><img src="https://YOUR-WORKER/board.svg" ismap width="272" alt="Chess board. Click a piece, then click a square to move it."></a>
```

Keep two things as they are:

- `width="272"`. The Worker reads click positions as pixels of an image 272 pixels wide.
- The `## Board` heading. The Worker redirects to `#board`, and that heading is what the page scrolls to.

Commit the README, open your profile, and click a pawn.

## Running a public board

Anyone can call your Worker's address from a script. This section covers what the Worker does about that and what you can add.

### What the Worker does by itself

- It writes the game to storage once per real change. A click that changes nothing writes nothing.
- It limits each visitor to 8 clicks per 10 seconds, counted by address. Cloudflare counts this per location, so the limit is approximate.
- It keeps one click budget for the whole board: 30 clicks at once, refilled at one click per second. When the budget is empty, the board says "Too many clicks. Try again in a minute."
- It accepts a click only from a page navigation. A click request from GitHub's image proxy, or from an image or script on another page, changes nothing.
- When something fails, it serves a fallback image that says the board is resting, in place of an error. When a storage write fails, the board says "No more moves today. Back at 00:00 UTC."

The numbers live in `src/limits.ts`. The per-visitor limit lives in the `ratelimits` block in `wrangler.jsonc`. Each click is a full page load, so a person clicks about once every 1.5 seconds at most and never meets these limits.

### What no Worker code can do

Every request counts toward your plan's request total, including requests the Worker refuses and requests served from a cache. The free plan allows 100,000 requests a day for the whole account. Past that, the board is down until 00:00 UTC. That is an outage and never a bill, but it also stops every other Worker on the account.

### On a paid plan

The paid plan has no daily request cap, so a flood turns into a bill. Set the Workers spending limit and the Durable Objects spending limit in the dashboard, under Billing, then Spend Management. Both are in beta and apply to the whole account. They lag by some minutes, so usage can pass the limit before Cloudflare blocks it. Once a limit takes effect, every Worker on the account stops until the next billing period. The spending limits do not cover logs, so the shipped config keeps 1% of them.

### Optional: a custom domain

A WAF rate limiting rule is the only control that can block a request before the Worker runs. It needs a domain on your Cloudflare account.

1. Add a route for the Worker on a domain in your Cloudflare account.
2. Set `"workers_dev": false` in `wrangler.jsonc`. Without it, a script can skip the rule by using the `workers.dev` address.
3. Add one rate limiting rule for that domain. The free plan allows one rule, counted per address over 10 seconds. Start near 20 requests per 10 seconds per address. GitHub's image proxy fetches the board for every real viewer from a few addresses, so a lower threshold can block real views.

Cloudflare's docs do not say outright that a blocked request stays off your Worker request count, so watch the count after you add the rule.

### If deploy rejects the rate limit

If `wrangler deploy` rejects the `ratelimits` block on your plan, delete the block. The Worker runs without it, and the board's click budget still applies.

### The state endpoint

`/state` returns 404 unless the `STATE_ENDPOINT` var in `wrangler.jsonc` is `"on"`. When it is on, `/state` also shows counters for accepted clicks, clicks the budget refused, failed writes and board requests. The counters live in memory and reset when the Durable Object restarts.

## Limitations

**Narrow phones.** GitHub shrinks README images to fit the page, and a shrunken board reports click positions in the smaller size. The board shows at full size on screens 354 pixels wide or wider, which covers most current phones. On a 320-pixel screen it shrinks to 87.5%, and clicks near the right and bottom edges land up to one square off. The GitHub mobile app has not been tested.

**One selection for everyone.** GitHub fetches the board image through its own proxy, so every viewer sees the same board. Two people playing at the same moment share one selection. Clicks come straight from each visitor's browser, so the Worker can tell clickers apart by a hash of their address. A new selection belongs to its visitor for 10 seconds. After that, the other player can undo it.

**No move confirmation.** A click on a marked square plays the move at once.

If you think you can improve this, PRs are welcome!

## Development

```sh
npm test            # unit tests for the game logic
npm run typecheck
npx wrangler dev    # local server on http://localhost:8787
```

With the local server running, you can play a move with curl. These two clicks select the e2 pawn and move it to e4:

```sh
curl -i "http://localhost:8787/click?153,221"
curl -i "http://localhost:8787/click?153,153"
curl "http://localhost:8787/state"
```

The last command returns 404 unless `/state` is on. For local work, add a `.dev.vars` file with the line `STATE_ENDPOINT=on` and restart the server.

On Windows, a project in a deep folder can make the local server fail with `internal error`, because the path of its database file passes 260 characters. Run `npx wrangler dev --persist-to C:/tmp/chess-state`, or move the project to a shorter path.

### Endpoints

| Route | What it does |
| --- | --- |
| `GET /board.svg` | Returns the board as SVG. It is sent with no-cache headers and an ETag so that GitHub's image proxy does not keep an old board. On an error it returns the fallback image. |
| `GET /click?x,y` | Applies a click at image position `x,y`, then redirects to `PROFILE_URL#board`. It redirects the same way when it ignores the click. |
| `GET /state` | Returns 404 unless the `STATE_ENDPOINT` var is `"on"`. When on, returns JSON with the position, the selected square, the last move, recent moves and the in-memory counters. Use it for debugging. |

### Code layout

- `src/geometry.ts` maps click positions to squares.
- `src/game.ts` holds the click rules, which are selection, moves, expiry and game end.
- `src/render.ts` draws the board SVG. The piece shapes were drawn for this project, so the image needs no fonts or outside files.
- `src/index.ts` is the Worker and its Durable Object. It routes requests and stores the game.
- `src/guard.ts` decides whether a click request is a page navigation and hashes the visitor's address.
- `src/budget.ts` is the click budget for the whole board.
- `src/limits.ts` holds the numbers for the budget, the selection lock and the restart delay.

Chess rules come from [chess.js](https://github.com/jhlywa/chess.js). The game is stored in one SQLite-backed Durable Object.

## License

[MIT](LICENSE)