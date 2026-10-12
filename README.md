# THREADORA — Influencer Matching & Campaign Intelligence

*Fashion for every you.* An agentic (Google ADK) influencer-matching MVP where **every filtering and ranking decision is deterministic Python**, and the LLM is used only to interpret a campaign brief and explain results.

> THREADORA is a placeholder brand name; check trademark/domain availability before commercial use.
> **All influencers, audiences, products and campaign metrics are synthetic demonstration data.** Outcomes in real life depend on data quality and observed performance; nothing here predicts sales or ROI.

## What's inside

| Part | Where |
|---|---|
| Storefront (`/`) and Back office (`/admin`: campaigns, inventory, orders) | `frontend/` (React + Vite + TS + Tailwind + Framer Motion + D3) |
| Product inventory, stock, orders, image uploads (shared by storefront, back office and matching) | `backend/app/services/inventory.py`, `api/inventory_routes.py` |
| API, mock influencer service, SQLite | `backend/app/api`, `backend/app/db` |
| **Level 1** eligibility filter | `backend/app/services/eligibility_filter.py` |
| **Level 2** audience/product matcher | `backend/app/services/audience_matcher.py` |
| Ranking engine + pipeline | `backend/app/services/ranking_engine.py` |
| ADK agents, run recorder, tokens | `backend/app/agents/` (prompts in `agents/prompts/`) |
| Seed generator (reproducible) | `backend/app/data/seed_generator.py` → `data/seed/*.json` |

### Agent workflow (Google ADK)
1. **Campaign Brief Agent** (`LlmAgent`, tools `search_products`, `submit_brief`) → validated `CampaignBrief`; asks for clarification instead of guessing.
2. **Matching Coordinator Agent** (ADK `BaseAgent`) → calls the Python L1 filter, L2 matcher and ranking engine as tools. No LLM scoring.
3. **Campaign Insights Agent** (`LlmAgent`) → JSON explanation; retried once, then falls back to a deterministic template (run is marked *Needs Review*).

Each run records per-agent status (Pending / Running / Completed / Failed / Needs Review), tool inputs/outputs (secrets redacted), timings, retries and token usage (`/api/runs/{id}/trace`, `/usage`). Tokens are **actual** when the provider reports them, otherwise an **estimate** (~4 chars/token) clearly labelled. Cost shows only if you set pricing env vars.

### Scoring (configurable in the UI)
Audience fit 25 · Content/style fit 25 · Engagement 15 · Median promo views 15 · Past collaborations 10 · Brand affinity 5 · Region 5. Follower count is an **eligibility threshold only** (default ≥1,000 followers and ≥500 median promo views; both configurable demo defaults). Missing metrics are flagged *needs review* at Level 1 and receive a neutral-low sub-score (never a high one) later; they lower the confidence indicator.

## Back office: inventory → storefront
Products live in the SQLite `products` table (seeded once from `data/seed/products.json`). The back office writes there and everything else reads from it:

- **Inventory → Add product** is a validated form (name, description, category, colour, collection, price, badges, visibility, image link or upload, sizes with per-size stock, target audience and style tags) with a live storefront preview. Saving makes an *Active* product purchasable in the storefront immediately; *Draft* keeps it hidden (you can still plan campaigns); *Archive* is a soft delete so past orders and campaigns still resolve.
- The storefront shows live stock per size (sold-out sizes are disabled, “Only N left”), and checkout calls `POST /api/orders`, which checks every line and decrements stock atomically (HTTP 409 with per-line detail if anything ran out).
- Every stock change (initial stock, back-office edits, restocks, storefront orders) is written to `stock_movements`; the Inventory page shows them as a live feed and the Orders page lists every checkout.
- New products appear in the Create campaign picker, so the influencer-matching engine can promote them straight away.

## Data
All synthetic: **1,200 creators** (the first 300 are identical to earlier seeds), ~1,500 collaborations, ~2,300 promotional posts, **1,200 historical orders** (timestamps relative to first start) and 60 products. Regenerate with `python -m app.data.seed_generator --influencers 1200`.
Product photos are hand-picked [Unsplash](https://unsplash.com/license) images matched to each product name (served from `images.unsplash.com`); offline, each tile falls back to a line illustration of the right garment type in the product colour.

## UI
Light and dark themes (header toggle, or **Settings → Appearance**), page transitions and micro-animations on both sites. Animations follow the device's *reduce motion* setting (gentle fades only); choose **Animations: On** in Settings → Appearance to see the full motion. The header's model chip always shows the provider/model the agents use (green = live, amber = selected but no token, grey = AI off) with a quick switcher.
**Agent execution** shows a live call graph (agents, tools, LLM, data counts on each edge) that updates while a run is in progress and replays finished runs step by step; select any node for its inputs, outputs, timing and tokens on the same page.

## Quick start (works with no token; add one in Settings for real agents)

Requirements: Python 3.11+, Node 20+. No Docker needed. One-liner: `./start.ps1` (Windows PowerShell) or `./start.sh`.

```bash
# 1. Backend
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # macOS/Linux: .venv/bin/pip

.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 2. Frontend (second terminal)
cd frontend && npm install && npm run dev            # http://localhost:5173
```
Seed data is generated on first start (`python -m app.data.seed_generator --influencers 1200 --seed 42`; pass a larger `--influencers` for stress tests). API docs: http://localhost:8000/docs
Single-process mode: after `npm run build`, the backend also serves the built frontend, e.g. `python -m uvicorn app.main:app --app-dir backend --port 8010` → http://localhost:8010.

### Choosing the model and access token (in the app)
Open **Campaign Studio → Settings**:
1. Pick a **provider** (Google Gemini, OpenRouter, OpenAI, Anthropic, Ollama, or Custom LiteLLM string).
2. Pick a **model** from the dropdown or choose *Custom model id…* and type any id (e.g. `nvidia/nemotron-3-ultra-550b-a55b:free` on OpenRouter).
3. Paste your **access token** (not needed for Ollama). It is write-only: stored in the local SQLite file `data/threadora.db` (git-ignored) and never sent back to the browser.
4. Press **Test connection** (makes one tiny real call and reports latency, tokens and clear errors), then **Save settings**.

Untick *Use an AI model* for the deterministic offline mode (rule-based brief parser + templated insights, zero tokens, no network). If a saved model fails during a run, the brief step falls back to the rule-based parser and the run is marked *Needs Review*; insights fall back to the template.

Environment variables are an optional fallback only (see `.env.example`); anything saved in Settings wins. Ollama has no per-token API fee but still uses local compute (`ollama pull llama3.2`, base URL `http://localhost:11434`).

## Demo script (≈3 min)
1. Open the storefront, choose **Oversized Graphic Hoodie** → **Promote this product**.
2. Paste: *"Find suitable UK-based influencers to promote our new women's streetwear collection for customers aged 18–24. Prioritize strong promotional views and relevant micro-influencers."* → **Interpret brief** → review → **Launch**.
3. Results: **Top 3 in each field** (overall, audience fit, promo views, engagement, micro), funnel (1,200 evaluated → eligible → matched → ranked), ranked table, recommendation, **Excluded / review** tab with exact Python reason codes.
4. Tick 2–3 creators → **Compare**. Open a **Profile** for the score breakdown.
5. Change *Min followers* / *Min promo views* → **Re-run matching** (backend recomputes).
6. **Analytics** tab (funnel, audience age alignment, score breakdown, fit vs performance; each with a table view) and **Agent execution** (live graph + replay, cards, tool calls, tokens). Export CSV/JSON from the header.
7. **Inventory → Add product**, save, open the storefront: it leads *New in*. Buy a size; the order appears in **Orders** and stock drops in **Inventory**.

## API
`GET /api/health` · `/api/products[/{id}]` (active products, live stock) · `/api/mock/influencers[/{id}]` · `POST /api/campaigns/parse-brief` · `POST /api/campaigns` · `POST /api/campaigns/{id}/match` · `GET /api/campaigns/{id}/results|excluded|analytics|export` · `GET /api/runs` · `GET /api/runs/{id}/trace|usage`.
Back office: `GET /api/inventory/meta|summary|movements` · `GET|POST /api/inventory/products` · `GET|PUT|DELETE /api/inventory/products/{id}` · `POST /api/inventory/products/{id}/stock|status` · `GET|POST /api/orders` · `POST /api/uploads` (PNG/JPEG/WebP/GIF ≤ 4 MB). Full OpenAPI at `/docs`.

## Tests
```bash
cd backend && .venv/Scripts/python -m pytest      # filters, missing data, scoring, ranking, API, ADK (scripted model)
cd frontend && npm test && npm run build
```

## Notes & limits
- The mock data service sits behind `services/data_provider.py`; replace it with an authorised real integration by implementing the same interface.
- Estimated reach on the Analytics page is an explicitly labelled estimate from synthetic medians, not a forecast.
- Product images are Unsplash photos chosen to match each product (not real THREADORA photography), with a garment illustration fallback offline. Uploaded images are stored in `data/uploads/` (git-ignored).
- Stock writes are serialised in-process for the SQLite MVP; on PostgreSQL use row locks (`SELECT … FOR UPDATE`).
