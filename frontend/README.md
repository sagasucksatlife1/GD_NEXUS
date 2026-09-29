# NEXUS Frontend

React terminal for the NEXUS loop. Reads one event stream (repair_log.json in replay, /api/events in live) and derives every page from it.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
```
Only 3 runtime deps: react, react-dom, katex. Build tool: Vite.

## Modes
- **REPLAY** (default): reads `public/data/` (export from the backend: `python scripts/export.py --out ../nexus-frontend/public/data --csi`). Scrubber + 1x/10x/100x replays the whole run.
- **LIVE**: polls the backend at VITE_API_URL (default http://localhost:8000). Start it with `uvicorn nexus.server:app --port 8000`, then hit LIVE in the top bar. Control panel starts/pauses the daemon.

`public/data/` currently holds a DEMO export (mock LLM + synthetic prices) so the site works immediately. The DEMO DATA badge disappears when you export a real run (meta.json drives it). Never present demo numbers as results.

## Deploy
Push to GitHub → import in Vercel. `vercel.json` handles routing. No build settings needed.

## Pages
/ (animated story) · /terminal (pipeline board) · rejections · dossiers/:id · agents/M6 & M8 · observatory · graveyard · portfolio · library · research · control. Cmd+K jumps anywhere.
