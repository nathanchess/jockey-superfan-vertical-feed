import { formatTimestampExport } from "@/lib/format";
import type { RankedSegment, SearchHit } from "@/lib/types";

export type GridClip = RankedSegment | SearchHit;

export type ExploreRawRow = {
  clipNumber: number;
  timeIn: string;
  timeOut: string;
  durationSec: number;
  clipDescription: string;
  category: string;
  categoryAdditional1: string;
  categoryAdditional2: string;
  feedHeadline: string;
  keyParticipants: string;
  emotionalIntensity: string;
  matchScore: string;
  pegasusExplanation: string;
  jockeyBoost: string;
  jockeyReasoning: string;
  crossEpisodeSignificance: string;
  segmentId: string;
  assetId: string;
  showName: string;
  searchRank: string;
};

export const EXPLORE_RAW_COLUMNS: { key: keyof ExploreRawRow; label: string }[] = [
  { key: "clipNumber", label: "Clip #" },
  { key: "timeIn", label: "Time In" },
  { key: "timeOut", label: "Time Out" },
  { key: "durationSec", label: "Clip Duration (sec)" },
  { key: "clipDescription", label: "Clip Description" },
  { key: "category", label: "Category" },
  { key: "categoryAdditional1", label: "Category (additional)" },
  { key: "categoryAdditional2", label: "Category (additional)" },
  { key: "feedHeadline", label: "Feed Headline" },
  { key: "keyParticipants", label: "Key Participants" },
  { key: "emotionalIntensity", label: "Emotional Intensity" },
  { key: "matchScore", label: "Match Score" },
  { key: "pegasusExplanation", label: "Pegasus Explanation" },
  { key: "jockeyBoost", label: "Jockey Boost" },
  { key: "jockeyReasoning", label: "Jockey Reasoning" },
  { key: "crossEpisodeSignificance", label: "Cross-Episode Significance" },
  { key: "segmentId", label: "Segment ID" },
  { key: "assetId", label: "Asset ID" },
  { key: "showName", label: "Show Name" },
  { key: "searchRank", label: "Search Rank" },
];

const PRIMARY_CATEGORY_LABELS: Record<string, string> = {
  fights_confrontation: "Fights & Confrontation",
  luxury_fashion: "Luxury & Fashion",
  romance_relationships: "Romance & Relationships",
  humor_awkward: "Humor & Awkward Moments",
  parties_nightlife: "Parties & Nightlife",
  emotional_moments: "Emotional Moments",
  shade_gossip: "Shady or Dismissive Cast Behavior",
};

const SUBTAG_LABELS: Record<string, string> = {
  screaming: "Screaming & Yelling",
  crying: "Crying Breakdown",
  walkout: "Walkout / Storm Off",
  physical_altercation: "Physical Altercation",
  hair_pulling: "Hair Pulling",
  table_flip: "Table Flip",
  glass_throw: "Glass Throw",
  designer_clothes: "Designer Clothes",
  jewelry_moment: "Jewelry Moment",
  fancy_cars: "Fancy Cars",
  mansion_tour: "Mansion Tour",
  shopping_spree: "Shopping Spree",
  brand_callout: "Brand Callout",
  kiss: "Kiss",
  date_night: "Date Night",
  proposal: "Proposal",
  breakup_moment: "Breakup Moment",
  flirting: "Flirting",
  jealousy_scene: "Jealousy Scene",
  reconciliation: "Reconciliation",
  awkward_silence: "Awkward Silence",
  verbal_slip: "Iconic or Ridiculous Statements",
  physical_comedy: "Physical Comedy",
  reaction_shot: "Reaction Shot",
  shade_throwing: "Shade Throwing",
  side_eye: "Side Eye",
  club_scene: "Club Scene",
  dinner_party: "Dinner Party Chaos",
  champagne_toast: "Champagne Toast",
  dance_moment: "Dance Moment",
  group_outing: "Group Outing",
  vacation_scene: "Fabulous Destination Moments",
  heartfelt_confession: "Heartfelt Confession",
  apology: "Apology",
  vulnerability: "Vulnerability",
  family_moment: "Family Moment",
  tears_of_joy: "Tears of Joy",
  support_scene: "Support Scene",
  talking_behind_back: "Talking Behind Back",
  revealing_secret: "Revealing Secret",
  confrontation_buildup: "Confrontation Buildup",
  alliance_forming: "Alliance Forming",
  betrayal: "Betrayal",
  fashion_beat: "Fashion Beat",
  parties_nightlife: "Parties & Nightlife",
  shade_gossip: "Shady or Dismissive Cast Behavior",
  emotional_moments: "Emotional Moments",
};

function formatCategoryLabel(value: string | undefined): string {
  if (!value) return "";
  return PRIMARY_CATEGORY_LABELS[value] ?? SUBTAG_LABELS[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function clipSubtags(clip: GridClip): string[] {
  if ("subtags" in clip && Array.isArray(clip.subtags)) return clip.subtags;
  return [];
}

function clipField<T>(clip: GridClip, key: keyof RankedSegment): T | undefined {
  if (key in clip) return (clip as RankedSegment)[key] as T;
  return undefined;
}

export function buildExploreRawRows(clips: GridClip[], showName: string | null): ExploreRawRow[] {
  return clips.map((clip, index) => {
    const subtags = clipSubtags(clip);
    const durationSec = Math.max(0, Math.round(clip.end_sec - clip.start_sec));

    return {
      clipNumber: index + 1,
      timeIn: formatTimestampExport(clip.start_sec),
      timeOut: formatTimestampExport(clip.end_sec),
      durationSec,
      clipDescription: clip.description ?? "",
      category: formatCategoryLabel(clip.primary_category),
      categoryAdditional1: formatCategoryLabel(subtags[0]),
      categoryAdditional2: formatCategoryLabel(subtags[1]),
      feedHeadline: clip.feed_headline ?? "",
      keyParticipants: (clipField<string[]>(clip, "key_participants") ?? []).join(", "),
      emotionalIntensity:
        clip.emotional_intensity != null ? String(clip.emotional_intensity) : "",
      matchScore: clip.match_score != null ? String(Math.round(clip.match_score)) : "",
      pegasusExplanation: clipField<string>(clip, "explanation") ?? "",
      jockeyBoost: clipField<boolean>(clip, "jockey_boost") ? "Yes" : "",
      jockeyReasoning: clipField<string>(clip, "jockey_reasoning") ?? "",
      crossEpisodeSignificance: clipField<string>(clip, "cross_episode_significance") ?? "",
      segmentId: clip.segment_id ?? "",
      assetId: clip.asset_id,
      showName: clipField<string>(clip, "show_name") ?? showName ?? "",
      searchRank: "search_rank" in clip ? String(clip.search_rank) : "",
    };
  });
}

export async function downloadExploreRawXlsx(
  rows: ExploreRawRow[],
  filename: string,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fox Superfan Feed";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Explore Clips", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headerFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF1D1C1B" },
  };
  const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  const altFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF4F3F3" },
  };
  const border = {
    top: { style: "thin" as const, color: { argb: "FFD3D1CF" } },
    left: { style: "thin" as const, color: { argb: "FFD3D1CF" } },
    bottom: { style: "thin" as const, color: { argb: "FFD3D1CF" } },
    right: { style: "thin" as const, color: { argb: "FFD3D1CF" } },
  };

  sheet.columns = EXPLORE_RAW_COLUMNS.map(({ key, label }) => ({
    header: label,
    key,
    width: key === "clipDescription" || key === "pegasusExplanation" || key === "jockeyReasoning" ? 48 : 18,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = border;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });

  for (const row of rows) {
    const dataRow = sheet.addRow(row);
    dataRow.eachCell((cell) => {
      cell.border = border;
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
    });
    if (dataRow.number % 2 === 0) {
      dataRow.eachCell((cell) => {
        cell.fill = altFill;
      });
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPLORE_RAW_COLUMNS.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
