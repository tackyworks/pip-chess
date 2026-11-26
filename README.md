# Pip · free chess coach

Game reviews that explain your mistakes, habit tracking, an opening trainer built from your own games, puzzles made from your mistakes and a sparring partner that plays like a human. Free, no sign-up, for chess.com and Lichess.

Everything runs in the visitor's browser: Stockfish 19 (full NNUE network), the Maia-3 human move model and a SQLite database in the browser's private file system. The server only hosts static files and stores shared review links, so hosting stays free.

## Run it locally

```
npm install
npm run data
npm run build
npm start
```

`npm run data` prepares the engine, opening book, piece sets and about 1,000 puzzle files (about 115 MB, once). The site is about 1,100 files, all under Cloudflare's 25 MB per-file limit. On Windows you can also double-click `start.cmd`.

`npm run dev` starts the dev server with hot reload. `npm run check` type-checks everything.

## How it works

| Layer | What it does |
|---|---|
| Core worker | All logic runs in a Web Worker: game sync, analysis queue, coach, insights, training, openings. The page talks to it over a small typed RPC. |
| Storage | SQLite WASM on OPFS. One database per account, plus a shared evaluation cache. |
| Engine pool | Several single-threaded Stockfish 19 workers split each game into lanes. A separate engine stays free for instant answers while you explore. The 99 MB engine is split into five parts, cached on first visit and shared by all workers. |
| Two passes | A quick first look appears in seconds, then a full-depth scan and deep re-searches of every suspicious move replace it. Nothing is called a blunder until the deep pass agrees. |
| Human model | Maia-3 through onnxruntime-web (WebGPU when available, WebAssembly otherwise). It powers "played like", real brilliancies and human-like sparring. |
| Sharing | Cloudflare Pages Functions store a shared review and its preview card in KV. `/r/:id` serves the app with the right title, description and image for link previews. |
| SEO | Each landing page is pre-rendered at build time with its own title, description, structured data and crawlable content. `robots.txt` and `sitemap.xml` are generated too. |

## Deploy to Cloudflare Pages

Free plan, unlimited bandwidth for static files, commercial use allowed.

1. Create a free account at cloudflare.com.
2. Log in from this folder: `npx wrangler login`
3. Create the storage for shared reviews: `npx wrangler kv namespace create SHARES`
   Copy the `id` it prints into `wrangler.toml`, replacing the zeros.
4. Create the project once: `npx wrangler pages project create pip-chess --production-branch main`
5. Deploy: `npm run deploy`

The site is live at `https://pip-chess.pages.dev`. Run `npm run deploy` again after every change.

### Your own domain

1. Buy a domain (Cloudflare Registrar sells at cost, Porkbun and Namecheap are good too).
2. In the Cloudflare dashboard, open Workers & Pages → pip-chess → Custom domains and add it.
3. Create a `.env` file with `SITE_URL=https://yourdomain.com` (see `.env.example`) and deploy again, so canonical links, the sitemap and preview images use your domain.
4. Submit `https://yourdomain.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

### Test sharing locally

`npm run pages:dev` runs the site with Functions and a local KV store at http://127.0.0.1:8788.

## Ads and support links

Edit `client/public/config.json`:

```json
{
  "support": { "label": "Support Pip", "url": "https://ko-fi.com/yourname" },
  "sponsor": null,
  "adsense": {
    "client": "ca-pub-0000000000000000",
    "cmp": "pip",
    "slots": { "games": "1234567890", "insights": "1234567890", "trained": "1234567890", "review": "1234567890" }
  }
}
```

Ads only appear in four calm places: below the first day of games, under insights, after a training session and below a finished review. Never on the board or mid-puzzle.

With `"cmp": "pip"`, Pip shows its own small consent banner and loads Google ads only after the visitor allows them. For visitors in the EEA, UK and Switzerland, Google requires a certified consent platform: turn on the free European regulations message in AdSense under Privacy & messaging, then set `"cmp": "google"` to hide Pip's banner.

`sponsor` takes a house ad per placement (`title`, `text`, `url`, `cta`, optional `image`). It is shown instead of AdSense when set.

Also add `ads.txt` to `client/public` with the line AdSense gives you.

## Keys

`←` `→` moves · `↓` `↑` key moments · `R` retry a mistake · `F` flip · `Esc` back to the game · `?` all shortcuts. Drag any piece during a review to explore a line with live engine lines.

## Credits and license

- [Stockfish](https://stockfishchess.org) 19, GPL-3.0
- [Maia-3](https://github.com/CSSLab/maia-platform-frontend) by the University of Toronto CSSLab, AGPL-3.0
- [chessground](https://github.com/lichess-org/chessground) and [chessops](https://github.com/niklasf/chessops) by the Lichess team, GPL-3.0
- Lichess [puzzle](https://database.lichess.org) and [opening](https://github.com/lichess-org/chess-openings) databases, CC0
- cburnett pieces by Colin M.L. Burnett (GPL v2+), merida pieces by Armando Hernandez Marroquin (GPL v2+)

Pip is licensed under the GNU AGPL-3.0 or later. If you run a modified version as a website, publish its source. Pip is not affiliated with chess.com or Lichess.
