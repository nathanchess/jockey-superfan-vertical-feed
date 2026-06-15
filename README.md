# Fox Superfan Vertical Feed

A production-style demo that turns long-form reality TV episodes into a personalized TikTok-style vertical feed. Built with **TwelveLabs Pegasus 1.5** (scene metadata), **Marengo 3.0** (semantic search + embeddings), and **Jockey 1.0** (cross-episode reasoning).

## Repository layout

| Path | Purpose |
|------|---------|
| `app/` | **Next.js web app** — deploy this to Vercel |
| `app/data/rhoslc_feed_manifest.json` | Pre-computed Pegasus segments for RHOSLC |
| `app/lib/shows.ts` | Show catalog (add new shows here) |
| `ranking.py` | Offline pipeline: Pegasus segmentation + Jockey enrichment |
| `pre-processing/` | Knowledge store helpers |
| `scripts/sync_manifest.py` | Copy manifest from `data/` → `app/data/` |
| `scripts/check_ks_items.mjs` | Debug: list Jockey knowledge-store items |
| `strand/` | TwelveLabs Strand design tokens |
| `PRD-Superfan-Vertical-Feed.md` | Product spec |
| `architecture.png` | System architecture diagram |

## Architecture

![Superfan Vertical Feed Engine architecture](architecture.png)

Offline pre-processing (Pegasus segmentation, Jockey enrichment) runs locally and produces per-show manifests (e.g. `rhoslc_feed_manifest.json`). The Next.js app on Vercel serves persona-ranked feeds, Marengo search, and runtime Jockey Spotlight against live TwelveLabs APIs.

## Quick start (local)

### 1. Web app

```bash
cd app
npm install
cp .env.example .env.local
# Edit .env.local — set TL_API_KEY, TL_INDEX_ID, TL_KS_ID
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2. Offline manifest pipeline (optional)

The web app reads pre-computed scene metadata from `app/data/<show>_feed_manifest.json`. Use the scripts below when you add episodes, re-run Pegasus, or refresh Jockey cross-episode boosts.

See **[Pre-processing pipeline](#pre-processing-pipeline)** for the full walkthrough.

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — TL_API_KEY, TL_INDEX_ID, TL_KS_ID
python ranking.py segment    # Step 1: Pegasus segmentation
python ranking.py jockey     # Step 2: Jockey cross-episode enrichment
python scripts/sync_manifest.py
```

## Pre-processing pipeline

Offline scripts transform TwelveLabs assets into the bundled manifest the Next.js app serves. Nothing in this section runs on Vercel — run locally, commit the updated JSON, then redeploy.

See the [architecture diagram](#architecture) above for the full system layout.

### Pipeline steps

From the **repo root**:

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
cp .env.example .env
```

| Variable | Used by | Purpose |
|----------|---------|---------|
| `TL_API_KEY` | All scripts | TwelveLabs API auth |
| `TL_KS_ID` | `knowledge_store.py`, `ranking.py jockey` | Jockey knowledge store ID |
| `TL_INDEX_ID` | App runtime only | Marengo index (not required for offline pipeline) |

Episodes must already exist as **TwelveLabs assets** (24-char hex IDs) with HLS enabled. Update `DEFAULT_ASSET_IDS` in `ranking.py` or pass your own list when calling `run_segmentation_step(asset_ids=[...])`.

### Step 0 — Knowledge store setup (Jockey)

`pre-processing/knowledge_store.py` creates a season-level Jockey Knowledge Store and registers episode assets.

**Create a knowledge store** (writes `TL_KS_ID` into repo-root `.env`):

Edit `main()` in `pre-processing/knowledge_store.py`, uncomment `create_and_save_knowledge_store()` with your show name and enrichment config (`SUPERFAN_CTV_ENRICHMENT_JSON_SCHEMA` is included), then:

```bash
python pre-processing/knowledge_store.py
```

The script refuses to create a second store if `TL_KS_ID` is already set.

**Add episodes to an existing store:**

```python
# In main(), call add_asset_to_knowledge_store(asset_ids=[...])
python pre-processing/knowledge_store.py
```

Each asset is polled until `status == "ready"` before you can query Jockey. Copy the resulting `TL_KS_ID` into `app/.env.local` as well so Spotlight works locally.

**Verify KS items** (optional debug):

```bash
node scripts/check_ks_items.mjs
```

Lists every knowledge-store item with `_id`, `asset_id`, and `status`. Uses `TL_API_KEY` and `TL_KS_ID` from repo-root `.env`.

### Step 1 — Pegasus segmentation

Runs **Pegasus 1.5** in `time_based_metadata` mode: 10–30 second windows with structured superfan taxonomy fields (category, subtags, emotional intensity, feed headline, explanation).

```bash
python ranking.py segment
```

- **Input:** asset IDs from `DEFAULT_ASSET_IDS` in `ranking.py`
- **Output:** `data/feed_manifest.json` with all segments
- **Runtime:** several minutes per episode (async analyze tasks polled every 5s)

Re-run when you add episodes or change the Pegasus segment schema in `feed_moment_segment_definition()`.

### Step 2 — Jockey cross-episode enrichment

Calls **Jockey 1.0** via `POST /responses` against your knowledge store to find season-defining moments, then merges `jockey_boost`, `jockey_reasoning`, and `cross_episode_significance` onto matching Pegasus segments.

```bash
python ranking.py jockey
```

- **Requires:** `TL_KS_ID` and a populated knowledge store
- **Updates:** `data/feed_manifest.json` in place

To re-map existing Jockey clips without a new API call (e.g. after fixing KS item → asset_id resolution):

```bash
python ranking.py jockey --merge-only
```

### Step 3 — Ranking preview (optional)

Prints the diversified scroll order for each persona profile to stdout — useful for QA before syncing to the app.

```bash
python ranking.py
```

Adds `feed_drama_addict`, etc. to `data/feed_manifest.json` for inspection. The Next.js app computes ranking at request time from segments; this step is for local validation only.

You can also invoke the same entry point via `pre-processing/ranking.py` (thin wrapper around repo-root `ranking.py`).

### Step 4 — Sync manifest to the Next.js app

Copies the repo manifest into the path the web app loads at runtime, re-applying Jockey boost merges and slimming the payload:

```bash
python scripts/sync_manifest.py
# or from app/:
npm run sync-manifest
```

- **Reads:** `data/rhoslc_feed_manifest.json` (or `data/<show>_feed_manifest.json`)
- **Writes:** `app/data/rhoslc_feed_manifest.json`

Commit `app/data/*_feed_manifest.json` and redeploy Vercel for profile feeds to pick up new clips.

**Adding another show:** register it in `app/lib/shows.ts`, add manifest paths to `scripts/sync_manifest.py`, run pre-processing, then `python scripts/sync_manifest.py <show_id>`.

### Script reference

| Script | Command | Description |
|--------|---------|-------------|
| `pre-processing/knowledge_store.py` | `python pre-processing/knowledge_store.py` | Create Jockey KS; add episode assets |
| `ranking.py` | `python ranking.py segment` | Pegasus 1.5 segmentation → manifest |
| `ranking.py` | `python ranking.py jockey` | Jockey top moments + segment boosts |
| `ranking.py` | `python ranking.py jockey --merge-only` | Re-merge existing Jockey clips only |
| `ranking.py` | `python ranking.py` | Persona ranking preview (stdout) |
| `scripts/sync_manifest.py` | `python scripts/sync_manifest.py` | Publish manifest to `app/data/` |
| `scripts/check_ks_items.mjs` | `node scripts/check_ks_items.mjs` | List KS items for debugging |
| `scripts/upload_assets.py` | `python scripts/upload_assets.py` | Multipart upload local proxies → TwelveLabs |

### Local video files (`assets/`)

**Do not commit episode `.mov` / `.mp4` files or use Git LFS.** The Vercel app streams from TwelveLabs, not from the repo.

1. Place source files in `assets/` (gitignored).
2. Transcode if needed: `assets/transcode_under_4gb.ps1` → `assets/proxies/`.
3. Upload: `python scripts/upload_assets.py`.
4. Add returned asset IDs to `ranking.py`, then run the pre-processing steps above.

See [assets/README.md](assets/README.md) for URL-ingest and cloud-storage options.

### Typical refresh workflow

When adding a new episode to an existing season:

1. Transcode if needed (`assets/transcode_under_4gb.ps1`) and upload to TwelveLabs (`python scripts/upload_assets.py`).
2. Add to Marengo index (`TL_INDEX_ID`).
3. `python pre-processing/knowledge_store.py` — add asset to KS.
4. Append asset ID to `DEFAULT_ASSET_IDS` in `ranking.py`.
5. `python ranking.py segment`
6. `python ranking.py jockey`
7. `python scripts/sync_manifest.py`
8. Commit `app/data/feed_manifest_v2.json` and redeploy.

## Deploy to Vercel

The Next.js app in `app/` is **Vercel-ready** after you set environment variables.

### Steps

1. Push this repo to GitHub (initialize git if needed).
2. Import the project in [Vercel](https://vercel.com/new).
3. Set **Root Directory** to `app`.
4. Add environment variables (Production + Preview):

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `TL_API_KEY` | Yes | TwelveLabs API key |
   | `TL_INDEX_ID` | Yes | Marengo index ID for search & HLS playback |
   | `TL_KS_ID` | Recommended | Jockey knowledge store for Spotlight / cross-episode queries |

5. Deploy. Vercel runs `npm install` and `npm run build` inside `app/`.

### What ships with the deployment

- **Profile feed** (`/api/feed`) — reads bundled `app/data/feed_manifest_v2.json` (no Python at runtime).
- **Semantic search** (`/api/search`) — live Marengo Search API.
- **Spotlight** (`/api/spotlight`) — live Jockey Responses API.
- **HLS playback** (`/api/assets/[assetId]`) — resolves TwelveLabs assets server-side (API key never exposed to browser).

### Runtime requirements

- Node.js **20+** (see `app/package.json` engines).
- TwelveLabs assets must remain indexed and HLS-enabled in your TwelveLabs project.
- Manifest JSON is committed; re-run `ranking.py` + `sync_manifest.py` locally when you add episodes, then redeploy.

## Environment variables

See `app/.env.example` for the web app and `.env.example` for Python scripts.

**Never commit `.env` or `.env.local`** — they are gitignored.

## Features

- Vertical feed with persona-based ranking (Drama Addict, Fashion Obsessed, Romance Fan)
- Transparent score breakdown (category, subtags, intensity, Jockey boost)
- Marengo natural-language search across indexed episodes
- Jockey Spotlight: actor highlight reels and storyline discovery
- Strand design system (TwelveLabs branding)

## License

Demo / consulting project. Content rights for indexed videos are your responsibility.
