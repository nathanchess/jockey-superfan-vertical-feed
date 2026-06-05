# Local source videos (not in Git)

Episode files in this folder are **working copies only**. They are too large for Git or GitHub LFS and are **not used by the Vercel deployment**.

The deployed app plays video from **TwelveLabs** (HLS via `/api/assets/[assetId]`). Your pipeline only needs **asset IDs** in `ranking.py` and the bundled manifest — not the raw files in the repo.

## Do not use Git LFS for episodes

| Approach | Verdict |
|----------|---------|
| Commit `.mov` / `.mp4` to Git | Bad — repo bloat, slow clones, GitHub file limits |
| Git LFS | Usually unnecessary — LFS bandwidth/storage costs; TwelveLabs is already your video store |
| **Upload to TwelveLabs** | **Correct** — matches how this project is built |

## Recommended workflow

```
assets/*.mov          Source files (gitignored, stay on your machine or cloud storage)
       │
       ▼  transcode_under_4gb.ps1
assets/proxies/*.mp4  H.264 proxies under 4 GB (gitignored)
       │
       ▼  scripts/upload_assets.py  OR  POST /assets (URL method)
TwelveLabs Assets     24-char hex IDs → ranking.py → manifest → Vercel
```

### 1. Transcode (if sources are large `.mov` files)

TwelveLabs multipart direct upload supports files up to **2 GB**; URL ingest supports up to **2 GB** per request. For larger sources, create a proxy first:

```powershell
cd assets
.\transcode_under_4gb.ps1
```

Outputs 720p H.264 MP4s under `assets/proxies/`, capped under 4 GB.

### 2. Upload to TwelveLabs

**Option A — Multipart upload from local proxies** (best for files on disk):

```bash
# from repo root, with .env containing TL_API_KEY
python scripts/upload_assets.py
python scripts/upload_assets.py assets/proxies/Episode_01_proxy.mp4
```

Prints asset IDs to add to `DEFAULT_ASSET_IDS` in `ranking.py`.

**Option B — URL ingest** (best for files already in cloud storage):

1. Upload MP4 to S3, GCS, Azure Blob, or [Vercel Blob](https://vercel.com/docs/storage/vercel-blob).
2. Generate a **public or presigned HTTPS URL**.
3. Create asset via API:

```python
import requests, os, time

BASE = "https://api.twelvelabs.io/v1.3"
HEADERS = {"x-api-key": os.environ["TL_API_KEY"]}

r = requests.post(
    f"{BASE}/assets",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "method": "url",
        "url": "https://your-bucket.s3.amazonaws.com/episodes/ep01_proxy.mp4",
        "enable_hls": True,
        "enable_thumbnail": True,
    },
)
asset_id = r.json()["_id"]

while True:
    status = requests.get(f"{BASE}/assets/{asset_id}", headers=HEADERS).json()["status"]
    if status == "ready":
        break
    time.sleep(5)
print(asset_id)
```

**Option C — TwelveLabs Playground** — manual upload for one-off demos.

### 3. Index + knowledge store

After upload:

1. Add each asset to your **Marengo index** (`TL_INDEX_ID`) for search/HLS in the app.
2. Add to **Jockey knowledge store** via `pre-processing/knowledge_store.py`.
3. Update `DEFAULT_ASSET_IDS` in `ranking.py`.
4. Run pre-processing: `python ranking.py segment` → `jockey` → `scripts/sync_manifest.py`.

See the root [README](../README.md#pre-processing-pipeline).

## Where to store originals long-term

Keep source `.mov` files outside Git:

- Local disk (this `assets/` folder)
- S3 / GCS / Azure with lifecycle policies
- Fox/Peacock internal DAM if you have rights-cleared masters

Only **TwelveLabs asset IDs** and the **JSON manifest** need to live in this repository.

## Gitignore

These patterns are in the root `.gitignore`:

- `assets/*.mov`, `assets/*.mp4`, `assets/*.MOV`
- `assets/proxies/` (except this README is under `assets/` root)

Committed in Git: `transcode_under_4gb.ps1` and this README only.
