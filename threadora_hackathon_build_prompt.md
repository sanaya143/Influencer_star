# THREADORA — AI Hackathon Problem Statement & Build Prompt

**Tagline:** Fashion for every you.

**Selected idea:** Influencer Matching Algorithm  
**Focus area:** Marketing & Personalization

> **Brand note:** THREADORA is a creative placeholder name. Check trademark and domain availability before using it commercially.

---

## 1. Business Context

THREADORA is a British-inspired, affordable, trend-led fashion brand catering to people across age groups and genders. Its catalog includes everyday wear, casual fashion, streetwear, denim, occasion wear, accessories, kidswear, men's and women's collections, unisex clothing, and coordinated couple and family outfits.

The brand aims to grow its digital presence and improve marketing campaign performance by collaborating with influencers whose audiences, content, interests, and engagement patterns align with the products being promoted.

## 2. Full Problem Statement

### Problem Statement: AI-Powered Influencer Matching and Campaign Intelligence

Selecting the right influencer for a fashion campaign is often a manual, time-consuming process. Marketing teams frequently rely on follower counts, visible popularity, or limited engagement metrics, which do not necessarily indicate whether an influencer can effectively promote a particular product to the intended audience.

For example, an influencer with a large following may not be suitable for promoting a children's collection, a men's fashion launch, or coordinated couple outfits. Similarly, a creator with impressive follower numbers but consistently low views on promotional posts may deliver limited campaign visibility.

THREADORA requires an AI-powered, agentic Influencer Matching and Campaign Intelligence application that identifies suitable influencers for individual products and marketing campaigns using structured influencer profiles, audience demographics, engagement metrics, content interests, brand affinity, and historical collaboration performance.

The solution must combine Google Agent Development Kit (ADK) with Python-based deterministic filtering and ranking to provide transparent, explainable, and configurable recommendations.

### Proposed Solution

The application will accept a product selection or a natural-language campaign brief, understand the campaign objectives and target audience, retrieve relevant mock product and influencer data, apply two levels of Python-based filtering, and rank the remaining influencers according to their suitability.

- **Level 1 — Eligibility Filtering:** Eliminate influencers who do not satisfy the campaign's configured minimum follower and promotional-view thresholds, or who fail mandatory data-quality or brand-safety checks.
- **Level 2 — Product and Audience Matching:** Match eligible influencers against the product's intended age segments, gender or collection requirements, audience demographics, geographical reach, content interests, brand affinity, and previous campaign performance.

The system will produce a ranked shortlist, explain why each influencer is recommended or excluded, highlight promising micro-influencers, and provide actionable campaign insights.

An interactive back-office dashboard will display campaign rankings, filtering results, audience alignment, recommendation explanations, agent execution traces, and LLM token usage. A separate THREADORA fashion storefront will provide a realistic product catalog and allow users to select products for a campaign.

All influencer profiles, audience segments, promotional metrics, and collaboration histories used in the MVP will be synthetic demonstration data served through a mock API. The architecture should support replacing the mock data service with authorized real-world integrations in the future.

### Business Objectives

1. Reduce the manual effort required to identify and shortlist suitable influencers.
2. Improve product-to-audience alignment for influencer marketing campaigns.
3. Avoid selecting creators solely on the basis of follower count.
4. Identify cost-effective micro-influencers with relevant audiences and credible engagement.
5. Make campaign recommendations explainable, measurable, and easy for marketing teams to review.
6. Demonstrate an agentic AI workflow with transparent execution, token tracking, and interactive visual analytics.

### Expected Outcome

A working MVP that allows a marketer to select a fashion product, configure campaign requirements, execute an agentic matching workflow, review the eligible and excluded influencers, compare ranked recommendations, and understand the reasoning behind each result.

The solution should be modular, accessible, responsive, open-source-friendly, and ready for a live hackathon demonstration.

---

## 3. Original Idea Summary

| Field | Details |
|---|---|
| Focus Area | Marketing & Personalization |
| Idea Name | Influencer Matching Algorithm |
| Selected | Yes |
| Description | Combines influencer follower demographics (age, location, interests), engagement rates, and past brand collaborations. Recommends best-fit influencers per product. Improves campaign ROI and finds untapped creators. |
| MVP | ML/AI-assisted workflow matches products with relevant micro-influencers based on audience alignment. Scores influencers by engagement, audience demographics, and brand affinity. |
| Data Complexity | High (H) |
| Data Volume / Requirement | Social data and influencer profiles |
| Detailed Data Requirements | Influencer profiles (followers, engagement), audience demographics (synthetic segmentation), product attributes, brand affinity scores, and past collaboration performance |

---

## 4. Recommended Open-Source-Friendly Technology Stack

| Layer | Recommendation | Purpose |
|---|---|---|
| Agentic AI | Google ADK for Python | Campaign understanding, orchestration, and agent-to-tool workflow |
| Lightweight LLM | Ollama + a small instruction-tuned model | Local campaign brief understanding and explanations |
| Model adapter | LiteLLM | Connect ADK to a supported local or alternative model provider |
| Backend | Python + FastAPI + Pydantic | APIs, data validation, filtering, ranking, and execution traces |
| Matching engine | Pure Python | All Level 1 and Level 2 business filters and deterministic scoring |
| Frontend | React + Vite + TypeScript | Storefront and administrative user interfaces |
| UI styling | Tailwind CSS + Framer Motion | Responsive layouts and smooth transitions |
| Data visualization | D3.js | Ranking, filtering funnel, and audience-fit visualizations |
| Data store | SQLite for MVP; PostgreSQL later | Campaign runs, mock profiles, configuration, and audit history |
| Mock services | FastAPI mock endpoints + synthetic seed data | Simulate influencer and social-media platform data |
| Testing | pytest + frontend component tests | Validate filters, ranking, APIs, and key interactions |
| Packaging | Docker Compose | Reproducible demonstration environment |

**Technology clarification:** Google ADK is the agent framework, LiteLLM is a model integration layer, and Ollama runs the local model. LiteLLM is not itself an LLM. Use current compatible and security-reviewed dependency versions and a committed lockfile rather than blindly pinning old examples.

### Recommended Application Structure

Build two distinct frontend experiences connected to one shared backend:

1. **THREADORA Storefront:** Customer-facing fashion shopping experience.
2. **THREADORA Campaign Studio:** Marketing and influencer intelligence back office.

The dashboard should be the centerpiece of the hackathon demo because it shows the ranking logic, explanations, agent activity, and business value. The storefront makes the overall solution feel like a real fashion brand and provides product context.

---

## 5. Master Prompt for Building the Complete Application

> Copy the prompt below into your coding agent or AI app-building tool.

# BUILD PROMPT: THREADORA — AGENTIC INFLUENCER MATCHING & CAMPAIGN INTELLIGENCE

Act as a senior full-stack engineer, AI agent architect, Python developer, data scientist, and product UI/UX designer.

Build a complete, working, hackathon-ready AI application called **THREADORA — Influencer Matching & Campaign Intelligence**.

Do not build just a static landing page or a collection of disconnected UI mockups. Build a functional, end-to-end MVP with a modern fashion storefront, a separate marketing back-office dashboard, a Python-based influencer matching engine, an agentic workflow using Google ADK, synthetic data served through a mock API, and explainable analytics.

Prioritize a working end-to-end business workflow, excellent visual design, maintainable architecture, and a convincing live demonstration.

### 5.1 Business Context

THREADORA is a British-inspired, affordable, trend-led fashion brand offering clothing and accessories for different age groups, genders, body types, styles, and occasions.

The product catalog includes:

- Women's fashion
- Men's fashion
- Kidswear
- Teen and young-adult fashion
- Unisex clothing
- Casualwear, streetwear, denim, and sportswear
- Workwear and occasion wear
- Couple outfits and coordinated family collections
- Accessories and seasonal collections

The brand experience should feel contemporary, accessible, youthful, inclusive, and commercially realistic.

Use other fast-fashion retailers as broad UX inspiration only. Do not copy any competitor's branding, logos, proprietary assets, or exact page design.

### 5.2 Core Business Problem

Marketing teams struggle to find suitable influencers for each product. High follower counts do not necessarily indicate relevant audiences, strong promotional-post performance, good brand affinity, or effective campaign outcomes.

Build an intelligent platform that selects relevant influencers through two levels of Python-only filtering, ranks the surviving candidates, explains the ranking, and helps marketers plan better campaigns.

### 5.3 Application Structure

Build two distinct frontend applications connected to one shared backend.

#### Application A: THREADORA Storefront

Route: `/` or the storefront application's root.

Purpose: Demonstrate the fashion brand and provide a realistic product catalog from which campaign products can be selected.

Include:

1. Modern home page with the THREADORA logo and tagline, **"Fashion for every you."**
2. A prominent search bar near the top.
3. Category navigation for Women, Men, Kids, Unisex, Couple Looks, and Accessories.
4. A responsive product grid with realistic fashion imagery.
5. Product cards showing image, name, price in GBP (£), available sizes, category, and relevant badges.
6. Product detail page with product description, target audience, style tags, category, and images.
7. Size selection and a functioning demo shopping bag.
8. Search, category filtering, sorting, wishlist interactions.
9. A campaign action such as **"Promote this product"** that navigates to Campaign Studio with the selected product prefilled.
10. A responsive bottom navigation bar on mobile for Home, Search, Categories, Wishlist, and Bag.
11. A clean desktop layout with suitable top navigation.

Use synthetic product information and public, appropriately licensed fashion placeholder imagery, with local visual fallbacks if remote images fail.

#### Application B: THREADORA Campaign Studio

Route: `/admin` or a separately runnable frontend application.

Purpose: Provide the main marketing intelligence experience.

Create the following pages:

- Overview Dashboard
- Create Campaign
- Influencer Discovery
- Matching Results
- Influencer Profile
- Campaign Analytics
- Agent Execution and Token Usage

Use a simple, professional admin navigation system. Make this interface visually consistent with the storefront while keeping the back-office layout optimized for marketing workflows.

### 5.4 Strict Brand Design System

Use a modern, minimalistic, and professional design.

#### Color Palette

- Primary brand color: `#01ABDD`
- Main background: `#FFFFFF`
- Soft card and section background: `#F4F9FB`
- Text and high-contrast elements: `#111111`

Follow the 60-30-10 color rule:

- 60% white
- 30% soft ice-tint
- 10% primary cyan accents

Use the primary cyan for key action buttons, selected navigation items, active filters, icons, chart highlights, and important interactive states.

Use dark text on cyan buttons when necessary to satisfy accessibility contrast requirements. Avoid introducing unrelated decorative colors. Use subtle gray borders and neutral secondary text where needed.

#### Visual Identity

Create a minimal THREADORA wordmark with a simple custom geometric thread-inspired symbol. Use SVG or CSS rather than introducing a complex logo image dependency.

Design requirements:

- Generous whitespace.
- Clean typography and clear hierarchy.
- Rounded cards with restrained shadows.
- High-quality fashion photography.
- Compact, readable tables.
- Consistent spacing and alignment.
- Smooth page transitions, hover states, and subtle scroll animations.
- Skeleton loaders, empty states, success feedback, and error states.
- Accessible keyboard navigation, semantic HTML, focus indicators, and meaningful image alt text.
- Responsive layouts across desktop, tablet, and mobile.
- No excessive gradients, glassmorphism, visual clutter, or unnecessary animation.

Respect reduced-motion preferences. Use animation to improve feedback, not to delay business operations.

### 5.5 Recommended Technology Architecture

Use open-source-friendly technologies.

#### Backend

- Python
- FastAPI
- Pydantic
- Google Agent Development Kit (ADK) for Python
- LiteLLM as the model adapter where required
- Ollama with a small, locally runnable instruction-tuned model
- SQLite for the MVP, with PostgreSQL compatibility
- pytest for automated backend tests

Select a model that performs adequately for short campaign briefs, structured JSON extraction, and concise explanations. Make the model configurable through environment variables.

Do not hard-code API keys, model names, or provider pricing. Provide `.env.example` and a setup guide. Keep LLM provider integration replaceable.

#### Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- Framer Motion
- D3.js
- Lucide icons or another open-source icon library

#### Data and Development

- Synthetic JSON seed data.
- FastAPI-based mock services.
- Docker Compose for local execution.
- A README with installation, model setup, API documentation, and demo steps.

Use current compatible and security-reviewed dependency versions. Include a dependency lockfile.

### 5.6 Agentic AI Requirements

The solution **must** use Google ADK to orchestrate a real, observable agent workflow.

Do not make every operation depend on an LLM. The LLM should understand the marketing request and generate contextual explanations, while filtering, calculations, eligibility checks, and ranking must be deterministic Python functions.

Create a coordinator that orchestrates the following agents and tools.

#### Agent 1: Campaign Brief Agent

Responsibilities:

- Accept a natural-language marketing request.
- Identify the product, campaign objective, target age group, target customer segment, location, campaign budget if supplied, and relevant constraints.
- Convert the request into a validated structured `CampaignBrief` object using Pydantic.
- Resolve the product from the product catalog.
- Use configured defaults when optional constraints are omitted.
- Ask for clarification when a required business decision cannot safely be inferred.
- Display the resulting brief for the marketer to review before execution.

Example request:

> "Find suitable UK-based influencers to promote our new women's streetwear collection for customers aged 18–24. Prioritize strong promotional views and relevant micro-influencers."

The agent should produce structured data, not an unvalidated block of generated text.

#### Agent 2: Matching Coordinator Agent

Responsibilities:

- Retrieve the campaign product and influencer records.
- Call the Python Level 1 eligibility filter.
- Call the Python Level 2 product-and-audience filter.
- Call the deterministic ranking engine.
- Preserve a complete audit trail of decisions and excluded records.
- Handle empty results and missing data gracefully.
- Return the ranked candidates and filtering statistics.

The coordinator should not create its own alternative scoring formula in natural language. It must call the implemented Python services.

#### Agent 3: Campaign Insights Agent

Responsibilities:

- Explain why the top-ranked influencers match the selected product.
- Summarize audience alignment, views, engagement, brand affinity, and past collaboration signals.
- Identify trade-offs between creator reach and audience relevance.
- Highlight promising micro-influencers when supported by the data.
- Generate a concise campaign recommendation and suggested next steps.
- Clearly label estimates, synthetic data, and assumptions.
- Never fabricate campaign performance or guaranteed ROI.

#### Agent Execution Behavior

Use Google ADK for agent orchestration and tool execution. The campaign workflow must actually invoke the implemented agents and Python tools.

Provide a working agent run trace, including:

- Agent name.
- Run ID.
- Current status.
- Start and completion timestamps.
- Tool invocations.
- Tool inputs and outputs, with secrets removed.
- Errors and retry information where applicable.
- Input and output token counts when available.
- Final execution summary.

Support the states Pending, Running, Completed, Failed, and Needs Review.

Do not simulate a completed AI workflow using hard-coded animation if the backend did not run.

### 5.7 Level 1: Python Eligibility Filtering

Implement Level 1 entirely in Python.

Input: a validated campaign brief and the influencer dataset.

Apply mandatory eligibility rules before evaluating audience fit.

#### Mandatory Checks

1. Influencer meets the configured minimum follower count.
2. Influencer meets the configured minimum median views on promotional posts.
3. Required platform and profile fields are available.
4. Influencer is not marked as failing the configured brand-safety policy.
5. Required campaign eligibility conditions are met.

Provide illustrative default thresholds of:

- Minimum followers: `1,000`.
- Minimum median promotional-post views: `500`.

Treat both numbers as configurable demo defaults, not universal marketing recommendations. Store them in configuration and let the marketer change them from campaign settings.

Use promotional-post performance rather than assuming general post views represent sponsored-post performance.

#### Filtering Behavior

- Exclude influencers below the required follower threshold.
- Exclude influencers below the required promotional-view threshold.
- Record the precise reason for every exclusion.
- Keep missing or unreliable critical metrics distinguishable from verified low performance.
- Flag records requiring manual review instead of inventing missing values.
- Do not remove micro-influencers simply because their audiences are smaller when they meet the campaign's eligibility criteria.

Return:

- Eligible influencers.
- Excluded influencers.
- Exclusion reason codes.
- Counts for retrieved, eligible, excluded, and review-required records.
- Configured thresholds.
- Data-quality warnings.

All business rules and decisions must execute in Python, not in React, TypeScript, JavaScript, or an LLM prompt.

### 5.8 Level 2: Python Product and Audience Matching

Apply Level 2 only to Level 1 eligible influencers.

Compare influencer attributes with the product's campaign requirements.

#### Age-Group Matching

Support configurable audience segments such as:

- Children.
- Teens.
- Young adults aged 18–24.
- Adults aged 25–34.
- Adults aged 35–54.
- Adults aged 55 and above.

Use the product's intended audience and the influencer's audience demographic distribution to calculate audience alignment.

For a young-adult collection, prioritize influencers whose verified or synthetic audience distribution contains an appropriate proportion of the intended age segment.

For mature or family-focused collections, apply the corresponding audience match criteria.

#### Gender and Collection Matching

Support product target categories including:

- Men.
- Women.
- Unisex.
- Couple outfits.
- Family collections.
- Kidswear.

For couple outfits, consider creators whose published content style and audience interests indicate couple fashion, coordinated looks, or lifestyle content relevant to the campaign.

Do not assume that an influencer's personal gender determines their audience or product suitability. Evaluate the audience and content signals represented in the synthetic profile.

#### Additional Matching Criteria

Evaluate:

- Audience location and UK regional relevance.
- Product-category and style alignment.
- Fashion interests and creator content themes.
- Brand affinity.
- Engagement quality.
- Previous collaboration performance.
- Promotional-post view patterns.
- Data completeness and confidence.

Use transparent Python functions for every match calculation.

Return a reasoned match result for every candidate, identifying which criteria were satisfied, partially satisfied, or not satisfied.

### 5.9 Influencer Ranking and Explainability

Rank influencers using a configurable deterministic Python scoring engine.

Use the following initial weighting:

| Ranking criterion | Weight |
|---|---:|
| Target audience demographic fit | 25% |
| Product, style, and content-interest fit | 25% |
| Engagement quality | 15% |
| Median promotional-post views | 15% |
| Previous collaboration performance | 10% |
| Brand affinity | 5% |
| Target-region audience relevance | 5% |
| **Total** | **100%** |

Normalize individual sub-scores to a 0–100 scale and calculate the overall score using the configured weights.

Mandatory eligibility rules and brand-safety checks must run before ranking. A failed mandatory check must not be offset by a high ranking score.

Keep follower count as an eligibility criterion, not the dominant ranking criterion. This avoids automatically favoring the biggest accounts and helps reveal suitable micro-influencers.

Define the underlying metrics and normalization formulas in code. Handle missing values explicitly, document the policy, and avoid allowing missing data to create unjustifiably high scores.

#### Required Output

For every ranked influencer, return:

- Rank.
- Influencer name and handle.
- Primary platform.
- Follower count.
- Median promotional-post views.
- Engagement rate.
- Relevant audience distribution.
- Product and content relevance.
- Overall match score.
- Sub-score breakdown.
- Concise recommendation rationale.
- Potential concerns.
- Data-confidence indicator.

Support ranking filters and configurable scoring weights in the back office.

Label any projected reach or campaign outcome as an estimate based on explicit assumptions. Do not present expected impressions, sales, or ROI as observed facts.

### 5.10 Synthetic Data and Mock API

Do not depend on real Instagram, TikTok, or YouTube account credentials for the MVP.

Create a mock service using FastAPI endpoints and realistic generated data.

#### Recommended Demo Data Volume

- 300 synthetic influencer profiles.
- 60 fashion products.
- 600 synthetic promotional-post records.
- 100 historical collaboration records.
- Multiple sample campaign briefs.

Make the seed generator configurable so the dataset can grow to thousands of profiles for testing.

#### Influencer Profile Schema

Include fields such as:

- `influencer_id`
- `display_name`
- `username`
- `platform`
- `bio`
- `creator_content_style`
- `follower_count`
- `median_recent_views`
- `median_promotional_views`
- `engagement_rate`
- `audience_age_distribution`
- `audience_gender_distribution`
- `audience_location_distribution`
- `interests`
- `fashion_categories`
- `content_tags`
- `brand_affinity_score`
- `collaboration_history`
- `brand_safety_status`
- `data_quality_status`

#### Product Schema

Include:

- `product_id`
- `product_name`
- `description`
- `category`
- `price_gbp`
- `sizes`
- `target_age_segments`
- `target_gender_or_collection`
- `style_tags`
- `target_region`
- `campaign_keywords`
- `product_image`
- `seasonal_collection`

#### Collaboration Schema

Include:

- `collaboration_id`
- `influencer_id`
- `product_id` or `campaign_id`
- `campaign_type`
- `promotional_views`
- `engagement`
- `click_or_conversion_metrics` where simulated
- `campaign_outcome`
- `recorded_at`

Clearly distinguish real application metadata from fictional demonstration metrics.

Create reusable seed generation so results are reproducible when the same random seed is used.

### 5.11 Campaign Studio Dashboard

Design a professional, compact analytics dashboard using the THREADORA color system.

#### A. Dashboard Summary

Include metric cards for:

- Total influencers in the mock dataset.
- Influencers evaluated.
- Eligible after Level 1.
- Audience matches after Level 2.
- Ranked recommendations.
- Campaign execution status.
- Token usage for the latest run.

All cards must use real values from the backend, not fixed numbers.

#### B. Campaign Creation

Provide a campaign form with:

- Product selector.
- Campaign objective.
- Target age segment.
- Target gender or collection.
- Location.
- Budget, where applicable.
- Minimum follower count.
- Minimum promotional views.
- Optional category and interest preferences.

Support natural-language brief entry as an alternative to the structured form.

Display the interpreted brief and allow the marketer to review it before launching the run.

#### C. Influencer Ranking Table

Show the top recommendations with:

- Rank and creator identity.
- Platform and follower count.
- Promotional views.
- Engagement rate.
- Audience-fit score.
- Overall matching score.
- Recommendation explanation.
- View Profile and Compare actions.

Allow sorting by overall score, audience fit, promotional views, and engagement rate.

Allow the marketer to inspect excluded creators and their explicit exclusion reasons.

#### D. Influencer Details

Build a meaningful profile view containing demographics, content interests, promotional performance, prior collaborations, match score, and score components.

Use visual labels and explanatory text so marketers understand why an influencer was ranked above another candidate.

#### E. Comparison Experience

Allow the user to select two or three candidates and compare their performance and audience fit side by side.

#### F. Filtering Controls

Provide visible controls to change Level 1 thresholds and supported Level 2 campaign requirements.

After a filter configuration changes, the backend must execute the Python filtering engine again and return refreshed results.

Do not calculate eligibility or ranking inside the frontend.

### 5.12 D3.js Visualizations

Use interactive D3.js charts driven by the actual API response data.

Implement at least these three visualizations.

#### Chart 1: Matching Funnel

Show the progression through:

- Influencers retrieved.
- Passed Level 1.
- Passed Level 2.
- Ranked recommendations.

Display actual counts and percentages from the execution.

#### Chart 2: Influencer Ranking Breakdown

Use a horizontal stacked bar chart to show how the main scoring criteria contribute to each shortlisted influencer's overall score.

Selecting a bar should open that influencer's detailed profile or score explanation.

#### Chart 3: Audience Fit vs Promotional Performance

Use a scatter or bubble plot.

- X-axis: median promotional-post views.
- Y-axis: product/audience match score.
- Bubble size: follower count.
- Tooltip: creator name, platform, views, engagement, and overall score.

Highlight the strongest candidates without allowing bubble size alone to determine the result.

#### Optional Chart 4: Audience Demographic Alignment

Compare the campaign's target age distribution against the available audience distribution for a selected influencer or shortlist.

All charts must support responsive rendering, useful tooltips, accessible labels, and empty states.

Use the specified palette with neutral chart elements and cyan highlights.

### 5.13 Agent Cards and Token Usage Calculator

Add a dedicated Agent Execution panel with a visually distinct card for each configured agent.

Every card should show:

- Agent name.
- Agent role and short description.
- Current status.
- Tools called.
- Latest output summary.
- Run duration.
- Input token count.
- Output token count.
- Total tokens.
- Errors, if any.

Display a workflow trace showing the campaign brief passing through the agents, Python filters, ranking engine, and insights stage.

#### Token Calculator

Show:

- Prompt/input tokens.
- Response/output tokens.
- Total tokens per agent.
- Total tokens for the campaign run.
- Model name and provider.
- Actual or estimated token-count indicator.
- Estimated provider cost, only when the relevant pricing configuration is present.
- Execution timestamp.

Prefer actual token usage returned by the model/provider.

If token usage is unavailable, calculate an explicitly labelled estimate using an appropriate tokenizer or documented approximation. Do not present estimates as actual model-reported usage.

For a local Ollama model, explain that model inference has no per-token API fee by default, but it still consumes local compute resources. Do not claim that local execution has zero operating cost.

Keep model pricing in configurable data or environment settings rather than hard-coding unverified rates.

### 5.14 API Design

Implement well-structured endpoints, including the following or equivalent routes:

- `GET /api/health`
- `GET /api/products`
- `GET /api/products/{product_id}`
- `GET /api/mock/influencers`
- `GET /api/mock/influencers/{influencer_id}`
- `POST /api/campaigns`
- `POST /api/campaigns/parse-brief`
- `POST /api/campaigns/{campaign_id}/match`
- `GET /api/campaigns/{campaign_id}/results`
- `GET /api/campaigns/{campaign_id}/excluded`
- `GET /api/runs/{run_id}/trace`
- `GET /api/runs/{run_id}/usage`
- `GET /api/campaigns/{campaign_id}/analytics`

Use Pydantic request and response schemas, clear error handling, appropriate status codes, and generated OpenAPI documentation.

Store campaign configurations and run history in SQLite. Use persistent records rather than in-memory-only state for important demo outputs.

The mock API must return believable, consistent data and support basic pagination, filtering parameters, and detail lookups.

### 5.15 Functional Requirements

The end-to-end journey must work:

1. User opens the THREADORA storefront.
2. User selects a fashion product.
3. User clicks **"Promote this product"**.
4. Campaign Studio opens with that product selected.
5. User enters a natural-language campaign brief or fills in the campaign form.
6. Campaign Brief Agent produces the validated campaign configuration.
7. User reviews the brief and launches the workflow.
8. The backend retrieves mock influencer records.
9. Python Level 1 filters ineligible profiles.
10. Python Level 2 evaluates product and audience suitability.
11. Python ranks eligible candidates using configurable weights.
12. The Insights Agent explains the strongest recommendations.
13. The dashboard displays the ranked shortlist, filtering funnel, D3.js charts, and exclusions.
14. Agent cards show the real execution trace and available token usage.
15. User can inspect profiles, compare creators, adjust thresholds, and rerun the campaign.
16. Campaign results can be exported as CSV or JSON.

Ensure that buttons, forms, charts, navigation, and filters work. Do not leave primary actions as decorative placeholders.

### 5.16 Non-Functional Requirements

- Keep filtering and ranking logic in dedicated Python modules.
- Keep prompts and agent instructions separate from business logic.
- Use type hints, Pydantic validation, and meaningful error messages.
- Add unit tests for threshold filtering, missing metrics, audience alignment, scoring normalization, and ranking order.
- Add API tests for campaign creation and matching.
- Include loading, error, and zero-result states.
- Ensure stable sorting and reproducible demo data.
- Use safe defaults and store no secrets in source code.
- Do not make external social-media API calls during the standard demo.
- Include a deterministic testing mode that does not require a live LLM service.
- Use synthetic data throughout the default demonstration.
- Document that real-world outcomes depend on data quality and observed campaign performance.
- Avoid making unverified sales or ROI claims.

### 5.17 Project Structure and Delivery

Organize the repository clearly. A suggested structure is:

```text
threadora/
├── apps/
│   ├── storefront/
│   └── campaign-studio/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── agents/
│   │   ├── schemas/
│   │   ├── services/
│   │   │   ├── eligibility_filter.py
│   │   │   ├── audience_matcher.py
│   │   │   └── ranking_engine.py
│   │   ├── data/
│   │   ├── db/
│   │   └── main.py
│   ├── tests/
│   └── requirements.txt
├── data/
│   └── seed/
├── docker-compose.yml
├── .env.example
└── README.md
```

Adapt this structure when helpful, but maintain clear separation of concerns.

#### Required Deliverables

1. Working storefront.
2. Working Campaign Studio.
3. Google ADK agent orchestration.
4. Python Level 1 and Level 2 filters.
5. Transparent ranking engine.
6. Synthetic data generator and mock API.
7. Agent cards, execution trace, and token usage calculator.
8. D3.js visualizations.
9. API documentation.
10. Tests for core business rules.
11. Docker Compose configuration.
12. Complete setup and demonstration instructions.

Provide a one-command or clearly documented startup process, with a separate documented step for installing and starting the local LLM if required.

#### Definition of Done

The project is complete only when a user can choose a seeded product from the demo catalog, execute a campaign through the implemented workflow, see actual filtering and ranking results, inspect why creators passed or failed, and review the resulting dashboard and agent usage data.

Do not stop after generating the architecture, wireframes, or code skeleton. Build and verify the working vertical slice first, then improve the visual design and optional features.

Prioritize correctness, explainability, accessibility, attractive design, and a smooth live hackathon demonstration.

---

## 6. Execution Plan

The biggest risk is trying to build two full applications and a multi-agent AI system at once. Use phased delivery so you always have a demonstrable working product.

### Phase 1 — Data and Matching Engine

**Highest priority.** Create synthetic product and influencer profiles, FastAPI endpoints, Pydantic models, Level 1 filtering, Level 2 matching, ranking scores, and exclusion reasons. Test the entire pipeline before introducing the LLM.

### Phase 2 — Agentic Workflow

Integrate Google ADK, the local model, and the campaign brief. Implement agent tools, coordinator flow, execution records, and token instrumentation.

### Phase 3 — Campaign Studio Dashboard

Build the ranking table, excluded influencer view, agent cards, usage calculator, and three D3.js charts. Connect each element to real backend results.

### Phase 4 — Fashion Storefront

Implement product search, category navigation, product cards, detail pages, sizes, bag interactions, and the **"Promote this product"** connection to Campaign Studio.

### Phase 5 — Demo Readiness

Run automated tests, validate empty-result scenarios, check responsive behavior, verify local LLM setup, confirm token reporting, seed repeatable demo data, and finalize the README.

---

## 7. Recommended Hackathon Demonstration

Focus the demonstration on one complete, realistic scenario.

For example, a marketer selects a new women's streetwear product targeting UK customers aged 18–24. The system receives 300 synthetic influencer profiles, excludes creators below the configured eligibility thresholds, evaluates audience alignment, and returns a ranked shortlist.

The judge should be able to see not only **who** was recommended, but also:

- **Why they were recommended:** the contribution of audience fit, content relevance, engagement, and previous collaborations.
- **Why other creators were excluded:** exact Python-generated reasons, not vague LLM explanations.
- **How the agents worked:** a live execution trace from campaign brief to final insights.
- **What the AI cost:** measured or clearly estimated token usage.
- **What the marketer can do next:** compare influencers and adjust thresholds to rerun the campaign.

The strongest technical differentiator is the combination of **agentic orchestration + deterministic Python decision-making + explainable ranking + live analytics**. It makes the solution more reliable and auditable than simply asking an LLM to recommend influencers.

### Final Implementation Recommendation

Complete the matching engine and Campaign Studio before spending significant time on storefront animations. The storefront makes the product feel like a real fashion brand, but the functioning matching workflow is what proves the selected hackathon idea.
