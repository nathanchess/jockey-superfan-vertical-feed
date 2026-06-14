import { NextRequest, NextResponse } from "next/server";
import { getTwelveLabsConfig } from "@/lib/twelvelabs";
import { getShowKsId, resolveShowId } from "@/lib/shows";
import { logServerTelemetry } from "@/lib/telemetry";

// ─── KS item lookup (UUID → real TL asset_id) ────────────────────────────────

type KsItemCache = { at: number; ksId: string; map: Map<string, string> };
let ksItemCache: KsItemCache | null = null;
const KS_ITEM_TTL_MS = 10 * 60 * 1000;

async function buildKsMap(
  apiKey: string,
  ksId: string,
): Promise<Map<string, string>> {
  if (ksItemCache && ksItemCache.ksId === ksId && Date.now() - ksItemCache.at < KS_ITEM_TTL_MS) {
    return ksItemCache.map;
  }

  const map = new Map<string, string>();
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const res = await fetch(
      `https://api.twelvelabs.io/v1.3/knowledge-stores/${ksId}/items?page=${page}&page_limit=50`,
      { headers: { "x-api-key": apiKey, "Content-Type": "application/json" }, cache: "no-store" },
    );
    if (!res.ok) {
      console.warn(`[spotlight/ks-map] list failed (${res.status}) — skipping resolution`);
      break;
    }
    const body = (await res.json()) as {
      data?: Array<{ _id?: string; asset_id?: string }>;
      page_info?: { total_page?: number };
    };
    for (const item of body.data ?? []) {
      if (item._id && item.asset_id) {
        // Index by both full "ksi_<uuid>" and bare UUID (what Jockey returns)
        map.set(item._id, item.asset_id);
        const bare = item._id.replace(/^ksi_/i, "");
        if (bare !== item._id) map.set(bare, item.asset_id);
      }
    }
    const totalPages = body.page_info?.total_page ?? 1;
    hasNext = page < totalPages;
    page++;
    if (page > 20) break;
  }

  ksItemCache = { at: Date.now(), ksId, map };
  console.info(`[spotlight/ks-map] loaded ${map.size} entries for KS ${ksId}`);
  return map;
}

// ─── Structured output schemas ────────────────────────────────────────────────

const ACTOR_SPOTLIGHT_SCHEMA = {
  type: "object",
  properties: {
    actor_name: { type: "string", description: "Full name of the cast member" },
    summary: {
      type: "string",
      description: "2-3 sentence narrative arc summary for this cast member across all episodes",
    },
    total_appearances: { type: "integer", description: "Number of episode segments they appear in" },
    top_relationships: {
      type: "array",
      description: "Top 3 cast members they interact with most",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dynamic: { type: "string", description: "e.g. 'rivals', 'allies', 'frenemies'" },
        },
        required: ["name", "dynamic"],
      },
      maxItems: 3,
    },
    clips: {
      type: "array",
      description: "Top 8 clips featuring this cast member, ranked by significance",
      items: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "TwelveLabs asset ID (24-char hex)" },
          start_sec: {
            type: "number",
            minimum: 0,
            description: "The exact second within the full episode video where the described moment BEGINS. Episodes are 30-60 minutes long — realistic values are like 312, 840, 1680, 2355. Do NOT use near-zero values (< 120) unless the scene truly starts in the opening two minutes. The video player will seek to exactly this second.",
          },
          end_sec: {
            type: "number",
            minimum: 30,
            description: "The exact second where this clip ENDS. Must be 60-180 seconds after start_sec to capture the full scene. Must bracket the same action described in the description field.",
          },
          headline: { type: "string", description: "Short punchy feed headline (max 80 chars)" },
          description: { type: "string", description: "1-2 sentence scene description" },
          significance: {
            type: "string",
            enum: ["season_defining", "high", "medium"],
            description: "How important this moment is to the actor's arc",
          },
          other_participants: {
            type: "array",
            items: { type: "string" },
            description: "Other cast members in this clip",
          },
        },
        required: ["asset_id", "start_sec", "end_sec", "headline", "description", "significance"],
      },
    },
  },
  required: ["actor_name", "summary", "clips"],
};

const MOMENT_DISCOVERY_SCHEMA = {
  type: "object",
  properties: {
    story_title: {
      type: "string",
      description: "Compelling title for the storyline arc (e.g. 'The Fall of Lisa & Meredith')",
    },
    story_summary: {
      type: "string",
      description: "2-4 sentence narrative explaining how the story unfolded chronologically across episodes",
    },
    query_interpretation: {
      type: "string",
      description: "How Jockey interpreted the user's story question",
    },
    key_characters: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Main cast members involved in this storyline",
    },
    story_scenes: {
      type: "array",
      description:
        "Scenes in strict chronological order (earliest first) showing how the story was built — include buildup and season-defining beats",
      items: {
        type: "object",
        properties: {
          chronological_order: {
            type: "integer",
            minimum: 1,
            description: "1 = earliest scene in the arc",
          },
          scene_role: {
            type: "string",
            enum: ["origin", "buildup", "tension", "turning_point", "season_defining", "aftermath"],
            description:
              "origin = first hint; buildup = escalating friction; tension = near-breaking; turning_point = pivot; season_defining = iconic peak; aftermath = fallout",
          },
          asset_id: { type: "string", description: "TwelveLabs asset ID (24-char hex)" },
          start_sec: {
            type: "number",
            minimum: 0,
            description: "The exact second within the full episode video where the described scene/dialogue BEGINS. Episodes are 30-60 minutes long — realistic values are like 496, 882, 1165, 2355. Do NOT use near-zero values (< 120) unless the scene truly starts in the opening two minutes. This timestamp must match the description precisely — the video player will seek to this exact moment.",
          },
          end_sec: {
            type: "number",
            minimum: 30,
            description: "The exact second where this scene ENDS (camera cut, conversation wraps). Must be 60-180 seconds after start_sec to capture the full exchange. This timestamp must bracket the same action described in the description field.",
          },
          headline: { type: "string", description: "Short punchy feed headline (max 80 chars)" },
          description: { type: "string", description: "1-2 sentence scene description that precisely matches what occurs at start_sec through end_sec" },
          bridge_text: {
            type: "string",
            description: "One sentence linking this scene to what happens next in the arc",
          },
          key_participants: { type: "array", items: { type: "string" } },
          emotional_intensity: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: [
          "chronological_order",
          "scene_role",
          "asset_id",
          "start_sec",
          "end_sec",
          "headline",
          "description",
        ],
      },
    },
  },
  required: ["story_title", "story_summary", "query_interpretation", "story_scenes"],
};

// ─── Jockey instructions per mode ────────────────────────────────────────────

const ACTOR_SPOTLIGHT_INSTRUCTIONS = `You are a reality TV superfan analyst. Analyze the cast member's full arc across all episodes and return their top moments, relationships, and defining scenes as a highlight reel.

TIMESTAMP RULES (critical — the video player seeks to these exact seconds):
- Episodes are 30-60 min long. Use realistic positions: 312, 847, 1680, 2355 — never near-zero values like 8 or 15 unless the scene truly starts in the first two minutes.
- start_sec = exact second the described action begins. end_sec = exact second it ends.
- Window must be 60-180 s. Self-check: confirm timestamps bracket the scene you described.`;

const MOMENT_DISCOVERY_INSTRUCTIONS = `You are a reality TV storyteller for superfans. Trace the user's narrative question as a story arc across episodes in chronological order.

Story rules: return 5-10 scenes (chronological_order 1 = earliest). Mix roles: origin, buildup, tension, turning_point, season_defining, aftermath. Write bridge_text connecting each beat. story_summary reads like a superfan recap: cause → escalation → climax → fallout.

TIMESTAMP RULES (critical — the video player seeks to these exact seconds):
- Episodes are 30-60 min long. Use the real position of the described moment: 496, 882, 1165, 2355 — never near-zero like 8 or 15 unless the scene truly opens the episode.
- start_sec = exact second the described dialogue or action BEGINS. end_sec = exact second it ENDS.
- Window must be 60-180 s to capture the full beat, not a single line. Self-check: re-read your description and confirm the timestamps bracket exactly that action. Do not default to 0 or near-zero when uncertain — use the best position found during retrieval.`;

/**
 * Shape the Jockey response for the client — no filtering, no dropping.
 * The /api/assets route handles ID resolution (UUID → real asset_id via KS map).
 * actor_spotlight: keep clips array as-is (up to 8).
 * moment_discovery: sort story_scenes by chronological_order and expose as both
 *   story_scenes and clips so the UI can use either field.
 */
function sanitizeSpotlightResult(
  mode: "actor_spotlight" | "moment_discovery",
  parsed: unknown,
): { sanitized: unknown; droppedClipCount: number } {
  const asObj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;

  if (mode === "actor_spotlight") {
    const clips = Array.isArray(asObj.clips) ? asObj.clips : [];
    return { sanitized: { ...asObj, clips: clips.slice(0, 8) }, droppedClipCount: 0 };
  }

  const scenes = Array.isArray(asObj.story_scenes) ? asObj.story_scenes : [];
  const sorted = [...scenes].sort((a, b) => {
    const ao = (a as Record<string, unknown>).chronological_order;
    const bo = (b as Record<string, unknown>).chronological_order;
    return (typeof ao === "number" ? ao : 999) - (typeof bo === "number" ? bo : 999);
  });

  return {
    sanitized: {
      ...asObj,
      story_scenes: sorted,
      clips: sorted,
      total_found: sorted.length,
    },
    droppedClipCount: 0,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const config = getTwelveLabsConfig();

  const body = await request.json() as {
    mode: "actor_spotlight" | "moment_discovery";
    query: string;
    session_id?: string;
    show?: string;
  };

  const showParam = resolveShowId(body.show);
  const ksId = getShowKsId(showParam);

  if (!config) {
    return NextResponse.json({ error: "TL_API_KEY is not configured" }, { status: 503 });
  }
  if (!ksId) {
    return NextResponse.json(
      { error: `Knowledge store not configured for show "${showParam}"` },
      { status: 503 },
    );
  }

  const { mode, query, session_id } = body;
  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }
  if (mode !== "actor_spotlight" && mode !== "moment_discovery") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  const isActor = mode === "actor_spotlight";

  const userContent = isActor
    ? `Find all clips featuring "${query.trim()}" across all episodes. Identify their top moments, key relationships, and narrative arc. Return the 8 most significant clips.`
    : query.trim();

  const jockeyBody: Record<string, unknown> = {
    model: "jockey1.0",
    instructions: isActor ? ACTOR_SPOTLIGHT_INSTRUCTIONS : MOMENT_DISCOVERY_INSTRUCTIONS,
    input: [
      {
        type: "message",
        role: "user",
        content: userContent,
      },
    ],
    knowledge_store_id: ksId,
    text: {
      format: {
        type: "json_schema",
        name: isActor ? "actor_spotlight" : "moment_discovery",
        schema: isActor ? ACTOR_SPOTLIGHT_SCHEMA : MOMENT_DISCOVERY_SCHEMA,
      },
    },
  };

  if (session_id) jockeyBody.session_id = session_id;

  try {
    const res = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jockeyBody),
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[spotlight] Jockey error ${res.status}:`, text.slice(0, 400));
      return NextResponse.json(
        { error: `Jockey API error (${res.status})`, detail: text.slice(0, 200) },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = await res.json() as {
      id?: string;
      output?: Array<{ type: string; content?: Array<{ text?: string }> }>;
      session_id?: string;
    };

    // Extract the structured text content from the Jockey response
    const textContent = data.output
      ?.flatMap((o) => o.content ?? [])
      .find((c) => c.text != null)?.text ?? null;

    if (!textContent) {
      return NextResponse.json({ error: "No output from Jockey" }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      return NextResponse.json(
        { error: "Jockey returned non-JSON output", raw: textContent.slice(0, 500) },
        { status: 502 },
      );
    }

    const { sanitized, droppedClipCount } = sanitizeSpotlightResult(mode, parsed);
    const durationMs = Date.now() - startedAt;
    logServerTelemetry({
      event: "spotlight_query",
      show: showParam,
      mode,
      session_reused: Boolean(session_id),
      query_length: query.trim().length,
      duration_ms: durationMs,
      dropped_clip_count: droppedClipCount,
    });

    return NextResponse.json({
      show: showParam,
      mode,
      session_id: data.session_id ?? null,
      result: sanitized,
      raw: {
        request: jockeyBody,
        output_text: textContent,
        response_id: data.id ?? null,
      },
      telemetry: {
        duration_ms: durationMs,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spotlight request failed";
    console.error("[spotlight] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
