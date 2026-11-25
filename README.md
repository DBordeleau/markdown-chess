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
- Pawns promote to a queen automatically.
- When a game ends, the board shows the result. The next click starts a new game.
- A request to `/click` with no position does nothing. Crawlers that follow the link send no position, so they cannot move pieces.

## Host your own

You need [Node.js](https://nodejs.org) 20 or newer, a GitHub account, and a Cloudflare account. The free Cloudflare plan is enough and needs no payment card.

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

## Limitations

**Narrow phones.** GitHub shrinks README images to fit the page, and a shrunken board reports click positions in the smaller size. The board shows at full size on screens 354 pixels wide or wider, which covers most current phones. On a 320-pixel screen it shrinks to 87.5%, and clicks near the right and bottom edges land up to one square off. The GitHub mobile app has not been tested.

**One selection for everyone.** GitHub fetches the board image through its own proxy, so the Worker cannot tell visitors apart. Two people playing at the same moment share one selection and can undo each other's clicks.

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

On Windows, a project in a deep folder can make the local server fail with `internal error`, because the path of its database file passes 260 characters. Run `npx wrangler dev --persist-to C:/tmp/chess-state`, or move the project to a shorter path.

### Endpoints

| Route | What it does |
| --- | --- |
| `GET /board.svg` | Returns the board as SVG. It is sent with no-cache headers and an ETag so that GitHub's image proxy does not keep an old board. |
| `GET /click?x,y` | Applies a click at image position `x,y`, then redirects to `PROFILE_URL#board`. |
| `GET /state` | Returns JSON with the position, the selected square, the last move and recent moves. Use it for debugging. |

### Code layout

- `src/geometry.ts` maps click positions to squares.
- `src/game.ts` holds the click rules, which are selection, moves, expiry and game end.
- `src/render.ts` draws the board SVG. The piece shapes were drawn for this project, so the image needs no fonts or outside files.
- `src/index.ts` is the Worker and its Durable Object. It routes requests and stores the game.

Chess rules come from [chess.js](https://github.com/jhlywa/chess.js). The game is stored in one SQLite-backed Durable Object.