# Zylo — Influencer Matching & Campaign Intelligence

*Fashion for every you.* An agentic (Google ADK) influencer-matching MVP where **every filtering and ranking decision is deterministic Python**, and the LLM is used only to interpret a campaign brief and explain results.

> Zylo is a demo brand name (formerly THREADORA); check trademark/domain availability before commercial use. Logo: gold hanger wordmark in `frontend/public/` (`zylo-logo.png` full with tagline, `zylo-wordmark.png` used in headers, `favicon.png`).
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
| MCP server (inventory, orders, creators, campaigns for AI clients) | `backend/app/mcp_server.py` |
| Chat assistant (coordinator + specialist agents), agent brain | `backend/app/agents/concierge.py`, `agents/brain.py`, `services/agent_tools.py` |
| ADK agents, run recorder, tokens | `backend/app/agents/` (prompts in `agents/prompts/`) |
| Seed generator (reproducible) | `backend/app/data/seed_generator.py` → `data/seed/*.json` |

### Agent workflow (Google ADK)
The brief is prepared **instantly by rules** (`brief_parser.interpret`: product or collection, ages, gender, city, budget, thresholds, micro-influencers, objective) and reviewed by the marketer, so no model call is spent on it. Open-ended requests go to the chat assistant. (Earlier versions had a separate Campaign Brief Agent; it made one tool call and added nothing the parser could not, so it was merged. Old runs still display with it.)

1. **Matching Coordinator Agent** (ADK `BaseAgent`, no LLM). Tools, in order: `resolve_target` (product or collection) → `retrieve_data` (Zylo's creators) → `fetch_external_creators` (an outside provider, **over MCP**) → `level1_eligibility_filter` → `level2_audience_matcher` → `ranking_engine` → `roi_planner`.
2. **Campaign Insights Agent** (`LlmAgent`) → JSON explanation, including the budget plan; retried once, then falls back to a deterministic template (run is marked *Needs Review*).

Each run records per-agent status (Pending / Running / Completed / Failed / Needs Review), tool inputs/outputs (secrets redacted), timings, retries and token usage (`/api/runs/{id}/trace`, `/usage`). Tokens are **actual** when the provider reports them, otherwise an **estimate** (~4 chars/token) clearly labelled. Cost shows only if you set pricing env vars.

### Scoring (configurable in the UI)
Audience fit 25 · Content/style fit 25 · Engagement 15 · Median promo views 15 · Past collaborations 10 · Brand affinity 5 · Region 5. Follower count is an **eligibility threshold only** (default ≥1,000 followers and ≥500 median promo views; both configurable demo defaults). Missing metrics are flagged *needs review* at Level 1 and receive a neutral-low sub-score (never a high one) later; they lower the confidence indicator.

## Collections
A campaign can promote one product or a whole **collection**: Marvel & DC Exclusive, Disney Collection, Summer Sale (−30%), Winter Collection, Back to School (table `collections`, `GET|POST /api/collections`). A collection is matched as one "virtual product" (its audience, styles and average price), and creators must also post about its **content themes** (e.g. `marvel`, `comics`, `cosplay`): those who do not are excluded with reason `NO_CONTENT_THEME`, and theme overlap counts for half of content fit. Every creator now has `content_themes` (fandoms, seasons, life moments) and a `rate_card`, generated from separate random streams so all earlier profile fields are unchanged. The licensed collections add 13 products (P101–P113); existing databases get them on start.

## ROI and creator fees
**Campaign → ROI & budget** (`GET /api/campaigns/{id}/roi?budget=`), all deterministic and labelled as estimates:
- what each shortlisted creator **asks** for their main deliverable vs the **market rate** (median cost per 1,000 views for creators of the same size and platform), flagged *good value / fair / above market*, with a suggested offer;
- cost per 1,000 views, expected orders (views × the creator's past purchase rate × a match-score factor) and revenue (× product or collection price);
- a **budget plan** that books the creators giving the most value per pound (target-audience views, or revenue when the objective is *sales*), compared with booking the **biggest accounts** in the category for the same budget;
- the market-rate table and every assumption. Profiles show the rate card and the same economics; the chat answers "what would £3,000 get?".

## Outside creator data over MCP
The Matching Coordinator is also an **MCP client**: each run asks an outside creator-data provider for creators who post about the campaign's themes and adds them to the pool (marked "via MCP" in results). By default it launches the bundled mock provider `app/external/social_data_server.py` (300 synthetic creators, ids `X0001…`) over **stdio**; set `ZYLO_EXTERNAL_MCP_URL` (and optionally `ZYLO_EXTERNAL_MCP_TOKEN`) to use a real provider over Streamable HTTP. Every outbound call appears in **MCP activity** (marked *outbound*), fetched profiles are cached in `external_creators`, and if the provider is unreachable the run carries on with Zylo's own creators. Switch it off in **Settings → Outside creator data** (or `ZYLO_EXTERNAL_MCP=off`).

## Token usage and cost
The header's **token chip** opens a dropdown with tokens and cost for today / 7 / 30 days, by source (campaign runs, assistant chat), by model (with its price), by agent, and the latest calls (`GET /api/usage/summary?days=`). Cost = tokens × price per million: free (`:free`) and local models cost $0, a few list prices are built in, and any model's price can be set in **Settings → Model prices** (`GET|PUT /api/settings/prices`). Unpriced models are flagged rather than guessed.

## Back office: inventory → storefront
Products live in the SQLite `products` table (seeded once from `data/seed/products.json`). The back office writes there and everything else reads from it:

- **Inventory → Add product** is a validated form (name, description, category, colour, collection, price, badges, visibility, image link or upload, sizes with per-size stock, target audience and style tags) with a live storefront preview. Saving makes an *Active* product purchasable in the storefront immediately; *Draft* keeps it hidden (you can still plan campaigns); *Archive* is a soft delete so past orders and campaigns still resolve.
- The storefront shows live stock per size (sold-out sizes are disabled, “Only N left”), and checkout calls `POST /api/orders`, which checks every line and decrements stock atomically (HTTP 409 with per-line detail if anything ran out).
- Every stock change (initial stock, back-office edits, restocks, storefront orders) is written to `stock_movements`; the Inventory page shows them as a live feed and the Orders page lists every checkout.
- New products appear in the Create campaign picker, so the influencer-matching engine can promote them straight away.

## Assistant (chat) and the agent brain
The **Ask Zylo** button at the bottom right of every back-office page opens the assistant (the expand icon opens the full page with the brain beside each reply). It is a chat where the system explores a non-deterministic path: a language model (Google ADK, the model chosen in Settings) decides which specialist agent to consult and which of its tools to call, can chain several calls, and writes the answer from the results.

| Specialist agent | Tools |
|---|---|
| Inventory | `list_products`, `get_product`, `list_collections`, `inventory_summary`, `recent_orders` |
| Creator | `search_creators`, `get_creator` |
| Matching | `preview_matching` (deterministic engine; nothing saved; `micro_only` for micro-influencers) |
| Campaign | `list_campaigns`, `get_campaign_results`, `get_campaign_roi`, `explain_creator_in_campaign`, `start_campaign` (a product or a collection id) |

The specialists do the real work in deterministic Python (the same code the MCP server uses, in `services/agent_tools.py`); the model never scores anyone. `start_campaign` launches the Matching → Insights workflow and is only called when you explicitly ask to create, launch or run a campaign. Chat cannot change stock or products. Under each reply the interface shows result cards built from the tool results (not by the model): products, creators, rankings, orders, KPIs, campaign links.

If no model is configured, or the model fails or times out (free models often do), a rule-based keyword router calls the same tools and fills a fixed template. The reply is labelled "Rule-based router" with the reason, so it is never mistaken for the model. Tick *Skip the AI model* to force this instant path.

**Agent brain.** Every model turn is recorded: what it saw (the latest message or tool result), any reasoning it returned, what it said, which tools it decided to call, tokens and time. Tool calls and the deterministic agents' rule-based decisions (thresholds, weights, template use) are in the same timeline. See it live beside each chat reply, and on every campaign run (**Agent execution → Agent brain**, filterable by agent). It is stored in `trace.brain` (`chat_turns.brain` for chat). Runs recorded before this feature have no brain.

API: `POST /api/chat/sessions`, `POST /api/chat/sessions/{id}/messages`, `GET /api/chat/turns/{id}` (poll), `GET /api/chat/sessions[/{id}]`, `GET /api/chat/capabilities`.

## MCP server
Zylo exposes its services to any [Model Context Protocol](https://modelcontextprotocol.io) client (Claude Desktop/Code, IDE agents, other agent frameworks). The tools call the same service layer as the REST API, so there is one set of business rules.

| Area | Tools (read-only unless marked ✎) |
|---|---|
| Inventory | `list_products`, `get_product`, `inventory_summary`, `stock_movements` · ✎ `create_product`, `adjust_stock`, `set_product_status` |
| Orders | `list_orders` · ✎ `place_order` |
| Creators | `search_creators`, `get_creator` |
| Matching | `preview_matching` (deterministic Level 1 → Level 2 → ranking for a product; nothing is saved, no LLM) |
| Campaigns | `list_campaigns`, `get_campaign_results`, `get_campaign_analytics`, `explain_creator_in_campaign` |
| Reference | resource `zylo://methodology`, prompt `plan_influencer_campaign` |

**Streamable HTTP** runs inside the API process at `http://localhost:8000/mcp` (no extra service to start):
```bash
claude mcp add --transport http zylo http://localhost:8000/mcp
# with a token:  ZYLO_MCP_TOKEN=... on the server, then
claude mcp add --transport http zylo http://localhost:8000/mcp --header "Authorization: Bearer <token>"
```
**stdio** (read-only) for desktop clients, e.g. Claude Desktop `claude_desktop_config.json`:
```json
{ "mcpServers": { "zylo": { "command": "C:/path/to/Influencer_star/backend/.venv/Scripts/python.exe",
                            "args": ["-m", "app.mcp_server"], "cwd": "C:/path/to/Influencer_star/backend" } } }
```
**Activity log:** every tool call, resource read and prompt request, from both HTTP and stdio, is recorded (time, client name, tool, trimmed inputs with secrets masked, result hint, duration, success or error, and whether it changed data) in the `mcp_calls` table. See it live in **Agent execution → MCP activity** (filters for data changes and errors, expandable rows, pause/resume), or via `GET /api/mcp/calls`. Full results and access tokens are never stored; the last 5,000 calls are kept.

Safety defaults: the endpoint only accepts local `Host`/`Origin` headers (DNS-rebinding protection; add deployed ones with `ZYLO_MCP_ALLOWED_HOSTS`); tools that change data are **off** unless `ZYLO_MCP_WRITES=1` **and** `ZYLO_MCP_TOKEN` is set, and they are never available over stdio (stock changes are serialised inside the API process). Creator bios and product descriptions returned by tools are data, not instructions. Test with the MCP Inspector: `npx @modelcontextprotocol/inspector` → Streamable HTTP → `http://localhost:8000/mcp`.

## Data
All synthetic: **1,200 creators** (the first 300 are identical to earlier seeds), ~1,500 collaborations, ~2,300 promotional posts, **1,200 historical orders** (timestamps relative to first start), 73 products and 5 collections, plus 300 creators held by the outside MCP provider (`data/external/creators.json`). Regenerate with `python -m app.data.seed_generator --influencers 1200` (also rewrites the outside provider's file).
Product photos are hand-picked [Unsplash](https://unsplash.com/license) images matched to each product name (served from `images.unsplash.com`); offline, each tile falls back to a line illustration of the right garment type in the product colour.

## UI
Light and dark themes (header toggle, or **Settings → Appearance**), page transitions and micro-animations on both sites. Animations follow the device's *reduce motion* setting (gentle fades only); choose **Animations: On** in Settings → Appearance to see the full motion. The header's model chip always shows the provider/model the agents use (green = live, amber = selected but no token, grey = AI off) with a quick switcher.
**Agent execution** shows a live call graph (agents, tools, LLM, data counts on each edge) that updates while a run is in progress and replays finished runs step by step (click any step on the timeline). The canvas pans by dragging and zooms with the − / % / + controls, Ctrl/⌘ + scroll or pinch, and the keyboard (`+` `-`, `0` fit everything, `R` readable view, arrows); a minimap appears when part of the graph is off-screen, the camera follows the active step, and the expand button opens it full screen. Select any node for its inputs, outputs, timing and tokens on the same page.
**Analytics**: *Score breakdown* and *Audience fit vs promotional performance* open as sortable tables (inline bars, quadrant filter, select a creator to open the profile); the chart view is one click away.

## Quick start (works with no token; add one in Settings for real agents)

### Run on a new Windows machine

Two files, in this order: **`setup.ps1` once**, then **`run.ps1` every time** you want to use the app.

**Before you start (once per machine)**
1. Install **Python 3.11 or newer** (3.13 recommended) from https://www.python.org/downloads/ and tick **"Add python.exe to PATH"** during install.
2. Install **Node.js 20 or newer** (LTS) from https://nodejs.org/
3. Copy the project folder to the machine. Leave out `backend\.venv` and `frontend\node_modules`: they are large, machine-specific and recreated by setup. Copy `data\zylo.db` and `.env` only if you want to keep saved model settings, token and past campaigns.

**Step 1: setup (only the first time)**

Open PowerShell in the project folder and run:
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```
It takes a few minutes: it checks your Python and Node versions, creates `backend\.venv`, installs every Python package from the pinned root `requirements.txt` (the exact versions this build was tested with), installs the web app's packages from `frontend/package-lock.json` and builds the web app. Wait for the green **"Setup complete"** message.

**Step 2: run (every time)**
```powershell
powershell -ExecutionPolicy Bypass -File run.ps1
```
The browser opens Zylo Reach at **http://localhost:8000/admin** after a few seconds; the shop is at http://localhost:8000. Press **Ctrl+C** in the PowerShell window to stop. If port 8000 is already in use:
```powershell
powershell -ExecutionPolicy Bypass -File run.ps1 -Port 8010
```

**Step 3: choose the AI model (optional)**

In Zylo Reach > **Settings**, pick a provider and model, paste the access token, press **Test connection**, then **Save**. Without a token the app still works in offline mode (rule-based answers). The database and synthetic data are created on first start.

**If something goes wrong**
- *"Python ... was not found"* or *"Node.js was not found"*: install it (tick PATH for Python), close and reopen PowerShell, run `setup.ps1` again.
- *"Not set up yet"* when running: run `setup.ps1` first.
- You changed the code or copied newer files over: run `setup.ps1` again (it rebuilds the web app).

**Manual setup (any OS):**

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
3. Paste your **access token** (not needed for Ollama). It is write-only: stored in the local SQLite file `data/zylo.db` (git-ignored; an existing `data/threadora.db` is copied there once on first start) and never sent back to the browser.
4. Optional: set a **Base URL** to send model calls through a gateway, proxy, Azure deployment or self-hosted server (blank = the provider's standard endpoint, shown in the field). It is saved per provider, must be a full `http(s)://` address, and takes priority over `LLM_BASE_URL`.
5. Press **Test connection** (makes one tiny real call and reports latency, tokens and clear errors), then **Save settings**.

Untick *Use an AI model* for the deterministic offline mode (rule-based brief parser + templated insights, zero tokens, no network). If a saved model fails during a run, the brief step falls back to the rule-based parser and the run is marked *Needs Review*; insights fall back to the template.

Environment variables are an optional fallback only (see `.env.example`); anything saved in Settings wins. Ollama has no per-token API fee but still uses local compute (`ollama pull llama3.2`, base URL `http://localhost:11434`).

## Demo script (≈3 min)
1. Open the storefront, choose **Oversized Graphic Hoodie** → **Promote this product**.
2. Paste: *"Find suitable UK-based influencers to promote our new women's streetwear collection for customers aged 18–24. Prioritize strong promotional views and relevant micro-influencers."* → **Prepare brief** (instant) → review → **Launch**. Or switch to **A collection**, pick Marvel & DC Exclusive, and launch: watch the outside provider add creators over MCP in the agent graph, then open **ROI & budget**.
3. Results: **Top 3 in each field** (overall, audience fit, promo views, engagement, micro), funnel (1,200 evaluated → eligible → matched → ranked), ranked table, recommendation, **Excluded / review** tab with exact Python reason codes.
4. Tick 2–3 creators → **Compare**. Open a **Profile** for the score breakdown.
5. Change *Min followers* / *Min promo views* → **Re-run matching** (backend recomputes).
6. **Analytics** tab (funnel, audience age alignment, score breakdown, fit vs performance; each with a table view) and **Agent execution** (live graph + replay, cards, tool calls, tokens). Export CSV/JSON from the header.
7. **Inventory → Add product**, save, open the storefront: it leads *New in*. Buy a size; the order appears in **Orders** and stock drops in **Inventory**.

## API
`GET /api/health` · `/api/products[/{id}]` (active products, live stock) · `/api/mock/influencers[/{id}]` · `POST /api/campaigns/parse-brief` · `POST /api/campaigns` · `POST /api/campaigns/{id}/match` · `GET /api/campaigns/{id}/results|excluded|analytics|export` · `GET /api/runs` · `GET /api/runs/{id}/trace|usage`.
Back office: `GET /api/inventory/meta|summary|movements` · `GET|POST /api/inventory/products` · `GET|PUT|DELETE /api/inventory/products/{id}` · `POST /api/inventory/products/{id}/stock|status` · `GET|POST /api/orders` · `POST /api/uploads` (PNG/JPEG/WebP/GIF ≤ 4 MB). MCP at `/mcp` (activity log: `GET /api/mcp/calls`). Chat: `/api/chat/*`. Full OpenAPI at `/docs`.

## Security (Zylo Reach)
**Rate limits** (per client IP, `app/security.py`): chat messages 20/min and 300/day, campaign runs 6/min and 60/day, connection tests 10/min, and at most 3 campaign runs in flight. Over a limit the API returns **429** with `Retry-After`; the app shows the message. `X-Forwarded-For` is ignored (it is spoofable). Tune with `ZYLO_RATE_CHAT_MESSAGE=10,100`, `ZYLO_RATE_CAMPAIGN_RUN=…`, `ZYLO_RATE_MODEL_TEST=…`, or switch off with `ZYLO_RATE_LIMITS=off`.

**Daily token budget** (optional): `ZYLO_DAILY_TOKEN_BUDGET=200000` refuses new model-using requests once today's recorded tokens reach it. Rule-based chat and offline runs keep working.

**Security headers** on every `/admin`, `/api` and `/mcp` response: a strict Content-Security-Policy (scripts only from this server plus the one inline theme script, allowed by its SHA-256 hash computed from the built `index.html`; images only from this server and Unsplash; fonts from Google Fonts; no framing, no plugins), plus `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a strict `Referrer-Policy` and `Permissions-Policy`, `Cross-Origin-Opener/Resource-Policy`, `Cache-Control: no-store` on API responses, and HSTS when served over HTTPS. The storefront pages are not changed.

**Dependency scanning:** `pip-audit` (backend, in `requirements-dev.txt`) and `npm audit` (frontend, `npm run audit:deps`). Minimum safe versions are pinned in `requirements.txt` (`starlette>=1.3.1`, `google-adk>=1.28.1,<2`). Run everything with:
```bash
powershell -ExecutionPolicy Bypass -File scripts/security-audit.ps1
```
(or `sh scripts/security-audit.sh`): both dependency scans plus the security, MCP and settings test suites; exits non-zero on any finding.

**Automated attack tests** (`backend/tests/test_security.py`): security headers and the CSP hash, rate limits (per minute, per day, per client, spoofed `X-Forwarded-For`, runs in flight), the token budget, path traversal, SQL-injection and script payloads, oversized and malformed input, tokens never returned, method restrictions, and the MCP write gate. These are an automated baseline, **not a substitute for a manual penetration test**.

Also in place: write-only model tokens (masked in responses, logs and errors), MCP writes off unless `ZYLO_MCP_WRITES=1` **and** `ZYLO_MCP_TOKEN` are set, DNS-rebinding protection on `/mcp`, upload type checks by file signature (no SVG), and strict input validation. **Not yet:** user login and roles for `/admin`, and encryption of the stored model token.

## Tests
```bash
cd backend && .venv/Scripts/python -m pytest      # filters, missing data, scoring, ranking, API, ADK (scripted model)
cd frontend && npm test && npm run build
powershell -ExecutionPolicy Bypass -File scripts/security-audit.ps1   # dependency scans + security tests
```

## Notes & limits
- The mock data service sits behind `services/data_provider.py`; replace it with an authorised real integration by implementing the same interface.
- Estimated reach on the Analytics page is an explicitly labelled estimate from synthetic medians, not a forecast.
- Product images are Unsplash photos chosen to match each product (not real Zylo photography), with a garment illustration fallback offline. Uploaded images are stored in `data/uploads/` (git-ignored).
- Stock writes are serialised in-process for the SQLite MVP; on PostgreSQL use row locks (`SELECT … FOR UPDATE`).
