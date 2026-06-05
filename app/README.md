# Superfan Vertical Feed (Next.js)

Next.js 16 app for the Fox Superfan vertical feed demo. This is the **Vercel-deployable** package — set it as the project root directory when importing to Vercel.

System architecture: [architecture.png](../architecture.png) (repo root).

## Setup

```bash
npm install
cp .env.example .env.local
```

Required in `.env.local`:

| Variable | Purpose |
|----------|---------|
| `TL_API_KEY` | TwelveLabs API authentication |
| `TL_INDEX_ID` | Marengo index for `/api/search` and HLS resolution |
| `TL_KS_ID` | Jockey knowledge store for `/api/spotlight` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server at http://localhost:3000 |
| `npm run build` | Production build (run before deploy) |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run sync-manifest` | Copy manifest from repo `data/` (requires Python at repo root) |

## Routes

| Route | Description |
|-------|-------------|
| `/` | Vertical feed player |
| `/explore` | Search + grid browse |
| `/spotlight` | Jockey actor / storyline discovery |
| `/api/feed` | Persona-ranked clip pagination |
| `/api/search` | Marengo semantic search |
| `/api/spotlight` | Jockey structured responses |
| `/api/assets/[assetId]` | HLS playback URL proxy |

## Data

Feed ranking reads `data/feed_manifest_v2.json` at build/runtime. Regenerate via the repo-root pre-processing pipeline — see the root [README](../README.md#pre-processing-pipeline).

Quick sync after updating `data/feed_manifest.json`:

```bash
# from repo root
python scripts/sync_manifest.py

# or from app/
npm run sync-manifest
```

## Deploy on Vercel

1. Connect this repo; set **Root Directory** = `app`.
2. Add `TL_API_KEY`, `TL_INDEX_ID`, and `TL_KS_ID` in project settings.
3. Deploy — no extra build config required (`vercel.json` included).

Ensure `data/feed_manifest_v2.json` is committed so profile feeds work without calling Pegasus at request time.

## Stack

- Next.js 16 (App Router)
- Tailwind CSS 4 + [Strand](../strand/) design tokens
- hls.js for segment playback
- TwelveLabs API v1.3
