<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- UI work should follow TwelveLabs Strand design tokens and match existing app aesthetics.
- Use browser preview to verify layout, overflow, and visual polish when changing UI.
- Interactive controls should use clear button affordances (cursor, hover states), not text that only changes color.
- The sidebar includes subtle "Demo app" labeling when expanded.

## Learned Workspace Facts

- Next.js app is in `app/`; Vercel deploys from that directory (`app/vercel.json`).
- `AGENTS.md` lives at `app/AGENTS.md`.
- Demo uses TwelveLabs Pegasus 1.5 (offline metadata), Marengo 3.0 (live search), and Jockey 1.0 (spotlight/cross-episode reasoning).
- Show catalog and per-show Marengo index/Jockey KS wiring live in `app/lib/shows.ts`.
- Bundled feed manifests are at `app/data/<show>_feed_manifest.json` (e.g. `kn_feed_manifest.json`).
- Three shows: `kn` (default), `tiwbg`, `rhoslc` (password-protected); each has its own Marengo index and `TL_KS_ID_*` env var.
- Offline pipeline (`ranking.py`, `pre-processing/`, `scripts/sync_manifest.py`) runs locally; commit updated manifests and redeploy—nothing runs on Vercel.
- Strand design tokens are in `strand/`; use `.cursor/skills/superfan-jockey-strand/SKILL.md` for TwelveLabs/Jockey/Strand work.
- Large source video assets are not stored in git; only pre-computed manifests ship with the app.
