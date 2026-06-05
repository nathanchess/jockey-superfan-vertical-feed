# 🦚 Product Requirements Document (PRD): The "Superfan" Vertical Feed

**Version:** 2.0 — Updated with Jockey API (Agents)
**Last Updated:** 2026-05-08
**Status:** Active
**Owner:** Developer Experience, TwelveLabs

---

## Table of Contents

1. [Objective](#objective)
2. [Problem Statement](#problem-statement)
3. [Target Customers](#target-customers)
4. [User Interaction & Design](#user-interaction--design)
5. [Requirements](#requirements)
6. [Architecture Workflows](#architecture-workflows)
7. [TwelveLabs API Integration](#twelvelabs-api-integration)
8. [System Architecture](#system-architecture)
9. [Success Metrics](#success-metrics)
10. [Risk Assessment](#risk-assessment)
11. [Appendix](#appendix)

---

## 🎯 Objective

Build a lightweight web application that ingests pre-indexed reality TV content: (1) uses TwelveLabs to segment and tag scenes with superfan-relevant categories, (2) enables user preference selection, and (3) generates a scrollable vertical feed with transparent AI reasoning—proving end-to-end value from raw episode to personalized experience.

The demo should show how TwelveLabs can transform long-form reality TV episodes into highly personalized, addictive short-form feeds for specific fan personas. With the addition of **Jockey** (TwelveLabs' unified multimodal agent), the system can now reason *across entire episode collections*—unlocking cross-episode entity tracking, natural-language feed curation, and multi-turn personalization refinement that goes far beyond single-video analysis.

---

## 😢 Problem Statement

Streamers and broadcasters (e.g., Peacock/Bravo) sit on massive libraries of premium content but struggle to engage younger audiences who prefer short-form, vertical video experiences.

1. **Manual tagging is unscalable**: Identifying every "eye roll" or "fashion moment" in thousands of episodes takes armies of loggers.
2. **Metadata is too shallow**: Traditional tagging misses the *emotional* context (e.g., distinguishing a "playful argument" from a "relationship-ending fight").
3. **Personalization is generic**: Recommendations are usually based on show titles, not the specific *vibe* of the content a user loves.
4. **Discovery is broken**: Superfans want to binge specific *types* of moments, not just whole episodes.
5. **Cross-episode continuity is lost**: Existing tools can't track character arcs, recurring feuds, or evolving storylines across an entire season.

### Why Existing Solutions Fall Short

- **Keyword Search**: Misses non-verbal cues like body language, tone of voice, and silence.
- **Standard CV**: Can identify "person" or "bag" but not "tension" or "luxury aesthetic."
- **GenAI Summaries**: Often hallucinate or fail to provide precise timestamps for video cutting.
- **Single-Video AI**: Can analyze a scene in isolation but can't tell you "show me every time NeNe and Porsha argue across all 12 episodes."

### Technical Differentiation

TwelveLabs provides a purpose-built **multimodal video intelligence layer** with two complementary capability tiers:

| Tier | APIs | Best For |
|------|------|----------|
| **Models** | Marengo (Search/Embed), Pegasus (Analyze) | Per-scene analysis, semantic search within a video, vector embeddings |
| **Agents (Jockey)** | Responses API + Knowledge Stores | Cross-episode reasoning, entity tracking, natural language corpus queries, multi-turn personalization |

This PRD now incorporates **both tiers** in a hybrid architecture that maximizes accuracy at the scene level and intelligence at the collection level.

---

## 🗣️ Target Customers

Peacock's Bravo team is pioneering a new content experience: transforming long-form reality TV shows (e.g., *Real Housewives*) into a TikTok-style vertical feed for superfans within the Peacock app. This represents a high-value M&E use case combining core TwelveLabs capabilities: Segmentation, Search, and now corpus-level Agentic Reasoning.

**Customer Requirements**

1. Process full episodes through AI to detect and timecode key scenes
2. Assign 10–15 content categories with ~5 subtags each (e.g., "Fights/Confrontation" → crying, physical altercation, hair pulling)
3. Generate personalized vertical feeds driven by user preference profiles
4. Enable cross-episode queries: "Find every moment this season where the group fractures"
5. Deliver addictive, bingeable content discovery within their streaming app

---

## 🎨 User Interaction & Design

**Mock UI components (demo-first):**

1. **Vertical Feed Player**: TikTok-style scrollable interface with autoplaying clips.
2. **Profile Selector**: Dropdown to switch between distinct viewer personas.
3. **Explanation Panel ("Why this clip?")**: Slide-out panel showing the AI's reasoning, detected categories, confidence scores, and — new — **cross-episode context** ("This mirrors the S11 reunion fight between the same cast members").
4. **Natural Language Feed Query (NEW)**: Free-text input powered by Jockey's Responses API. Users can type "Show me the most chaotic moments from this season" and get a curated feed returned as structured JSON.
5. **Raw Data View**: Toggle to show the JSON output from the API for technical credibility.

### Viewer Profile Selector (Mocked)

| Profile Name | Primary Interest |
|---|---|
| "Drama Addict" | Fights, Confrontations, Shade |
| "Fashion Obsessed" | Luxury brands, Outfits, Makeovers |
| "Romance Fan" | Dates, Kisses, Proposals, Heartbreak |

---

## 🤔 Requirements

### Pre-Processing Pipeline (Offline)

| Requirement | Specification |
|---|---|
| **Input Content** | 1–2 reality TV episodes (20–40 minutes each), rights-cleared or similar substitute |
| **Asset Upload** | Upload via `POST /assets` (URL method up to 2 GB, direct up to 200 MB). Poll until `status == "ready"` |
| **Knowledge Store** | Create one knowledge store per show/season via `POST /knowledge-stores` with Superfan ingestion config |
| **Scene Detection** | Leverage Marengo's automatic 2–10 second semantic segmentation (Models API, per-video) |
| **Category Tagging** | Run Marengo search queries per category/subtag, store matches with confidence scores |
| **Scene Analysis** | Call Pegasus `/analyze` endpoint with JSON schema for structured scene metadata |
| **Corpus Reasoning** | Use Jockey `POST /responses` to generate cross-episode insights, track cast entities, and surface storyline arcs |
| **Clip Extraction** | Extract video clips using timestamps (FFmpeg or similar), create vertical-optimized versions |
| **Output** | JSON manifest per video with all segment metadata + extracted clip files |

### Preference & Ranking System

**Profile-to-category mapping with weighted scoring:**

```json
PREFERENCE_PROFILES = {
    "drama_addict": {
        "categories": ["fights_confrontation", "shade_gossip", "emotional_moments"],
        "intensity_preference": "high",
        "subtag_boosts": ["screaming", "walkout", "betrayal"]
    },
    "fashion_obsessed": {
        "categories": ["luxury_fashion", "parties_nightlife"],
        "intensity_preference": "any",
        "subtag_boosts": ["designer_clothes", "jewelry_moment", "brand_callout"]
    },
    "romance_fan": {
        "categories": ["romance_relationships", "emotional_moments"],
        "intensity_preference": "medium",
        "subtag_boosts": ["kiss", "heartfelt_confession", "reconciliation"]
    }
}
```

**Ranking Algorithm**

1. Filter segments where `primary_category` matches profile categories
2. Calculate match score: `base` (category match) + `subtag_boost` (for each matching subtag) + `intensity_bonus` (if intensity matches preference)
3. **NEW — Jockey enrichment**: Boost clips that Jockey identifies as cross-episode anchors or season-defining moments
4. Sort by `match_score` descending, apply diversity sampling to avoid consecutive clips from same category
5. Return top N clips (default: 20) for feed display

---

## 🧠 Architecture Workflows

### Workflow 1: Ingest & Segmentation (Models API)

**User Story**: *As a system, I need to break a long episode into coherent, bite-sized moments without human intervention.*

1. Upload video to TwelveLabs via `POST /assets`. Poll until `status == "ready"`.
2. **Marengo** automatically detects semantic scene boundaries (2–10 seconds).
3. Store segment timestamps (start/end) for downstream processing.
4. Add asset to the season knowledge store via `POST /knowledge-stores/{id}/items`. Poll until `status == "ready"`.

### Workflow 2: Deep Understanding — Classify & Tag (Models API)

**User Story**: *As a content manager, I need consistent, rich metadata for every scene to enable filtering.*

1. Run **Pegasus Analyze** on each segment with the Superfan Taxonomy JSON schema.
2. Assign:
   - Primary Category
   - Sub-tags (specific actions/objects)
   - Emotional Intensity
   - One-line description and feed headline
3. Cache results in a JSON manifest per episode.

### Workflow 3: Cross-Episode Corpus Intelligence (Jockey / Agents API) ⭐ NEW

**User Story**: *As a superfan, I want to understand character arcs and recurring drama across all episodes of a season — not just individual clips.*

1. Once all episode assets are indexed in the knowledge store, call `POST /responses` with `model: "jockey1.0"`.
2. Use Jockey to:
   - **Track cast entities** across episodes (e.g., "NeNe appears in 8 episodes; her top 3 confrontation partners are...")
   - **Surface season storylines** ("The Kenya/Marlo feud begins in E02 and peaks in E09")
   - **Rank defining moments** by cross-episode significance, not just single-scene intensity
   - **Enable natural language feed queries** ("Show me every time someone leaves the table this season")
3. Use **structured output** (`text.format.type: "json_schema"`) to return typed JSON that feeds directly into the ranking engine.
4. Optionally use **multi-turn sessions** (`session_id`) to let users refine their feed with follow-up prompts.

```python
# Example: Cross-episode moment discovery with Jockey
response = requests.post(
    f"{BASE_URL}/responses",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "model": "jockey1.0",
        "instructions": "You are a reality TV content curator for superfans. Analyze the video collection and identify the most shareable, emotionally resonant moments for a TikTok-style vertical feed.",
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": "Find the top 20 most explosive confrontation moments across all episodes. For each, provide the timestamp, episode, participants, and a one-line feed headline."
            }
        ],
        "knowledge_store_id": SEASON_KNOWLEDGE_STORE_ID,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "superfan_feed",
                "schema": JOCKEY_FEED_SCHEMA  # See Appendix
            }
        }
    }
)
```

### Workflow 4: Personalization — The Feed Logic (App Layer)

**User Story**: *As a viewer, I want to see content that matches my specific mood and interests.*

1. User selects a profile (e.g., "Drama Addict") **or** types a natural language query.
2. For **profile-based feeds**: filter pre-processed manifest by category/subtag match scores.
3. For **NL query feeds**: call Jockey `POST /responses` with the user's query and the season knowledge store. Return structured JSON clip list.
4. Rank results; apply diversity sampling.
5. Optionally continue the session with a `session_id` for multi-turn refinement ("now show me only the ones from the Atlanta trip").

### Workflow 5: Delivery & Explanation

**User Story**: *As a buyer, I need to trust that the AI isn't just random.*

1. Player loads top-ranked clips.
2. On interaction, show **Reasoning Panel**:
   - For Models-sourced clips: "Matched 'Drama Addict' because: High Intensity + 'Screaming' detected. Confidence: 92%."
   - For Jockey-sourced clips: "Jockey identified this as the season's most-referenced confrontation, appearing in 3 cast member recaps and 2 reunion callbacks."
3. **Raw Data View**: Toggle to expose the full JSON response from both Pegasus and Jockey for technical buyers.

---

## 📏 TwelveLabs API Integration

### Hybrid Architecture: Models + Agents

This application uses a **two-tier API strategy**:

| Layer | API | Model | Use Case |
|---|---|---|---|
| Per-scene analysis | Analyze API | Pegasus 1.2 | Structured scene tagging, emotional intensity scoring |
| Semantic scene search | Search API | Marengo 3.0 | Find scenes matching category queries within a video |
| Cross-episode reasoning | Responses API | Jockey 1.0 | Natural language corpus queries, entity tracking, feed generation |
| Vector similarity | Embed API | Marengo 3.0 | (Optional) Similarity-based clip recommendations |

### Phase 1: Asset Upload & Knowledge Store Setup

```python
import requests
import time

API_KEY = "<YOUR_API_KEY>"
BASE_URL = "https://api.twelvelabs.io/v1.3"
HEADERS = {"x-api-key": API_KEY}

# Upload a video as an asset
response = requests.post(
    f"{BASE_URL}/assets",
    headers=HEADERS,
    files=[("method", (None, "url")), ("url", (None, "<EPISODE_URL>"))]
)
asset_id = response.json()["_id"]

# Poll until ready
while True:
    status = requests.get(f"{BASE_URL}/assets/{asset_id}", headers=HEADERS).json()["status"]
    if status == "ready": break
    time.sleep(5)

# Create a knowledge store for the season
response = requests.post(
    f"{BASE_URL}/knowledge-stores",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "name": "bravo-rhoa-season-12",
        "ingestion_config": {
            "enrichment_config": {
                "type": "description",
                "description": "Extract key emotional moments, cast interactions, recurring conflicts, luxury settings, fashion highlights, and relationship dynamics for a reality TV superfan audience."
            }
        }
    }qctions": "You are a reality TV content analyst. Track cast member appearances, recurring conflicts, and emotional arcs across episodes.",
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": "For each main cast member, list their top 5 most dramatic moments across all episodes with timestamps and a one-line description."
            }
        ],
        "knowledge_store_id": store_id,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "cast_highlights",
                "schema": CAST_ENTITY_SCHEMA  # See Appendix
            }
        }
    }
)

# Natural language feed generation (user-initiated)
feed_response = requests.post(
    f"{BASE_URL}/responses",
    headers={**HEADERS, "Content-Type": "application/json"},
    json={
        "model": "jockey1.0",
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": user_query  # e.g., "Show me every table flip this season"
            }
        ],
        "knowledge_store_id": store_id,
        "session_id": session_id,  # Omit for new session; reuse for multi-turn
        "text": {
            "format": {
                "type": "json_schema",
                "name": "superfan_feed",
                "schema": JOCKEY_FEED_SCHEMA
            }
        }
    }
)
```

### API Constraints & Considerations

| Parameter | Specification |
|---|---|
| **Asset upload (direct)** | Max 200 MB |
| **Asset upload (URL)** | Max 2 GB |
| **Knowledge store model** | `jockey1.0` |
| **Knowledge store items** | Poll until `status == "ready"` before querying |
| **Session continuity** | Reuse `session_id` for multi-turn feed refinement |
| **Structured output** | Pass JSON Schema in `text.format` field |
| **Streaming** | Set `stream: true` in request body + HTTP client |
| **Pegasus max video duration** | Up to 1 hour per video |
| **Pegasus max prompt length** | 2,000 tokens |
| **Pegasus max response length** | 4,096 tokens |
| **Jockey availability** | Private beta — contact account team for access |
| **Jockey webhooks** | Not available in beta; polling only |
| **Jockey deployment** | SaaS only; no on-premise during beta |

---

## ✅ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SUPERFAN VERTICAL FEED ENGINE v2                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌────────────────────────────────────────────────────┐     │
│  │   CONTENT    │    │              TWELVELABS LAYER                      │     │
│  │    INGEST    │    │                                                    │     │
│  │              │    │  ┌────────────────┐    ┌─────────────────────┐    │     │
│  │  Reality TV  │───▶│  │    Marengo     │    │      Pegasus        │    │     │
│  │   Episodes   │    │  │  (Models API)  │───▶│   (Models API)      │    │     │
│  │              │    │  │                │    │                     │    │     │
│  │  POST/assets │    │  │ • Scene Detect │    │ • Taxonomy Tagging  │    │     │
│  └──────────────┘    │  │ • Embeddings   │    │ • Intensity Score   │    │     │
│                      │  │ • Semantic Srch│    │ • Feed Headlines    │    │     │
│                      │  └────────────────┘    └─────────────────────┘    │     │
│                      │           │                      │                │     │
│                      │           ▼                      ▼                │     │
│                      │  ┌────────────────────────────────────────────┐   │     │
│                      │  │           SCENE MANIFEST (JSON)            │   │     │
│                      │  │  [Segment ID, Time, Tags, Score, Desc]     │   │     │
│                      │  └────────────────────────────────────────────┘   │     │
│                      │                                                    │     │
│                      │  ┌────────────────────────────────────────────┐   │     │
│                      │  │      JOCKEY KNOWLEDGE STORE (Agents API)   │   │     │
│                      │  │                                            │   │     │
│                      │  │  POST /knowledge-stores                    │   │     │
│                      │  │  POST /knowledge-stores/{id}/items         │   │     │
│                      │  │                                            │   │     │
│                      │  │  POST /responses (jockey1.0)               │   │     │
│                      │  │  • Entity Tracking (cast arcs)             │   │     │
│                      │  │  • Cross-episode moment discovery          │   │     │
│                      │  │  • NL feed queries + structured output     │   │     │
│                      │  │  • Multi-turn session refinement           │   │     │
│                      │  └────────────────────────────────────────────┘   │     │
│                      └───────────────────────┬────────────────────────────┘     │
│                                              │                                  │
│                                              ▼                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │                     PERSONALIZATION ENGINE (APP)                       │     │
│  │   ┌──────────────┐        ┌──────────────────────────────────────┐    │     │
│  │   │    User      │        │    Ranking Logic                     │    │     │
│  │   │  Profile /   │───────▶│ (Filter + Score + Jockey boost +     │    │     │
│  │   │  NL Query    │        │  Diversity Sample)                   │    │     │
│  │   └──────────────┘        └──────────────────────────────────────┘    │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                          │                                      │
│                                          ▼                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │                       FEED UI (DEMO PLAYER)                            │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │     │
│  │  │   Vertical   │  │  Explanation │  │   Profile    │  │  NL Feed │  │     │
│  │  │    Player    │  │    Panel     │  │   Switcher   │  │  Query   │  │     │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘  │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Jockey API Flow (Sequencing)

```
POST /assets ──[poll: status=ready]──► POST /knowledge-stores
                                               │
                                               ▼
                                    POST /knowledge-stores/{id}/items
                                               │
                                        [poll: status=ready]
                                               │
                                               ▼
                                        POST /responses
                                        (jockey1.0)
                                               │
                                  [reuse session_id for multi-turn]
```

**Parallel operations allowed:**
- Multiple asset uploads can run simultaneously
- Knowledge store creation and asset uploads can run simultaneously
- Multiple `knowledge-stores/{id}/items` additions can run simultaneously

---

## 📊 Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Feed generation latency (profile-based) | < 2 seconds | App instrumentation |
| Feed generation latency (Jockey NL query) | < 10 seconds | Responses API timing |
| Scene tagging accuracy (Pegasus) | > 85% precision | Manual review of 50 clips |
| Cross-episode entity recall (Jockey) | > 80% cast appearances found | QA against episode transcripts |
| Demo completion rate | > 90% (5-min demo) | Event tracking |
| Buyer "aha moment" within 60 seconds | > 75% | Demo session observation |
| Sales cycle acceleration | Measurable POC-to-contract reduction | CRM tracking |

---

## ⚠️ Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Jockey private beta access denied | Medium | High | Build full demo on Models API (Marengo + Pegasus); Jockey is an additive layer |
| Jockey API surface changes before GA | Medium | Medium | Abstract Jockey calls behind a thin service layer; version-pin `v1.3` endpoint |
| Knowledge store indexing latency (multi-episode) | Medium | Low | Run indexing offline before demo; show pre-built knowledge store |
| NL query hallucinations (wrong timestamps) | Low | High | Validate Jockey timestamp references against scene manifest; surface confidence signal in UI |
| Content rights for demo footage | Medium | High | Use publicly available clips or TwelveLabs-provided sample content |
| Polling overhead during live demo | Low | Medium | Pre-index all content; demo only queries, not ingestion |

---

## 📒 Appendix

### Scene Analysis JSON Schema (Pegasus)

Used with the Pegasus `/analyze` endpoint for per-scene structured output:

```json
SCENE_ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "primary_category": {
            "type": "string",
            "enum": ["fights_confrontation", "luxury_fashion", "romance_relationships",
                    "humor_awkward", "parties_nightlife", "emotional_moments", "shade_gossip"]
        },
        "subtags": {
            "type": "array",
            "items": { "type": "string" },
            "maxItems": 5
        },
        "description": { "type": "string" },
        "emotional_intensity": {
            "type": "string",
            "enum": ["low", "medium", "high", "explosive"]
        },
        "key_participants": {
            "type": "array",
            "items": { "type": "string" }
        },
        "feed_headline": { "type": "string" }
    },
    "required": ["primary_category", "subtags", "description", "emotional_intensity", "feed_headline"]
}
```

### Jockey Feed Schema (Agents API)

Used with `POST /responses` for structured cross-episode feed generation:

```json
JOCKEY_FEED_SCHEMA = {
    "type": "object",
    "properties": {
        "feed_clips": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "episode_id": { "type": "string" },
                    "start_sec": { "type": "number" },
                    "end_sec": { "type": "number" },
                    "primary_category": { "type": "string" },
                    "subtags": {
                        "type": "array",
                        "items": { "type": "string" }
                    },
                    "feed_headline": { "type": "string" },
                    "emotional_intensity": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "explosive"]
                    },
                    "key_participants": {
                        "type": "array",
                        "items": { "type": "string" }
                    },
                    "cross_episode_significance": { "type": "string" },
                    "jockey_reasoning": { "type": "string" }
                },
                "required": ["episode_id", "start_sec", "end_sec", "primary_category",
                             "feed_headline", "emotional_intensity", "jockey_reasoning"]
            }
        },
        "season_context": { "type": "string" }
    },
    "required": ["feed_clips"]
}
```

### Cast Entity Tracking Schema (Agents API)

Used with Jockey to build character arc summaries across episodes:

```json
CAST_ENTITY_SCHEMA = {
    "type": "object",
    "properties": {
        "cast_members": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "episode_appearances": { "type": "integer" },
                    "top_moments": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "episode_id": { "type": "string" },
                                "start_sec": { "type": "number" },
                                "description": { "type": "string" },
                                "category": { "type": "string" }
                            }
                        },
                        "maxItems": 5
                    },
                    "primary_conflict_partners": {
                        "type": "array",
                        "items": { "type": "string" }
                    }
                }
            }
        }
    }
}
```

### Segment Output Schema (Pre-processed Manifest)

Pre-processed segment data stored as JSON for feed generation:

```json
{
  "video_id": "episode_s12_e03",
  "video_title": "Real Housewives of Atlanta S12E03",
  "asset_id": "<TwelveLabs asset _id>",
  "knowledge_store_id": "<TwelveLabs knowledge store _id>",
  "segments": [
    {
      "segment_id": "ep3_seg_014",
      "start_sec": 1842.5,
      "end_sec": 1867.2,
      "duration_sec": 24.7,
      "primary_category": "fights_confrontation",
      "subtags": ["screaming", "crying", "walkout"],
      "emotional_intensity": "explosive",
      "feed_headline": "She did NOT just say that...",
      "description": "Porsha confronts NeNe about leaked texts, escalating to tears and a dramatic exit.",
      "key_participants": ["Porsha", "NeNe"],
      "search_confidence": 0.89,
      "thumbnail_time": 1855.0,
      "video_url": "/clips/ep3_seg_014.mp4",
      "jockey_cross_episode_significance": "Referenced in 3 subsequent episodes; cited in reunion."
    }
  ]
}
```

### Content Taxonomy (Peacock-Inspired)

| Category | Subtags / Search Signals |
|---|---|
| **Fights & Confrontation** | crying, screaming, physical_altercation, hair_pulling, table_flip, glass_throw, walkout |
| **Luxury Fashion** | designer_clothes, jewelry_moment, fancy_cars, mansion_tour, shopping_spree, brand_callout |
| **Romance & Relationships** | kiss, date_night, proposal, breakup_moment, flirting, jealousy_scene, reconciliation |
| **Humor & Awkward** | awkward_silence, verbal_slip, physical_comedy, reaction_shot, shade_throwing, side_eye |
| **Parties & Nightlife** | club_scene, dinner_party, champagne_toast, dance_moment, group_outing, vacation_scene |
| **Emotional Moments** | heartfelt_confession, apology, vulnerability, family_moment, tears_of_joy, support_scene |
| **Shade & Gossip** | talking_behind_back, revealing_secret, confrontation_buildup, alliance_forming, betrayal |

### Jockey vs. Models: When to Use Which

| Scenario | Recommended API | Reason |
|---|---|---|
| Tag a single scene with a category | Pegasus Analyze | Stateless, per-clip, fast |
| Find scenes matching a query within one episode | Marengo Search | Single-video semantic search |
| Generate vector embeddings for similarity | Marengo Embed | Agents do not generate embeddings |
| Track NeNe across all 12 episodes | Jockey Responses | Cross-video entity tracking |
| Answer "show me the wildest moments this season" | Jockey Responses | Corpus-level NL reasoning |
| Refine a feed with follow-up prompts | Jockey Responses + `session_id` | Multi-turn conversation support |

---

*This PRD is maintained by the TwelveLabs Developer Experience team. For questions, contact james@twelvelabs.io.*
