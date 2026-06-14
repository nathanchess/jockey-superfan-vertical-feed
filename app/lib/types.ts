import type { ShowId } from "@/lib/shows";

export type ProfileId = "drama_addict" | "fashion_obsessed" | "romance_fan";

export type IntensityPreference = "high" | "medium" | "any";

export type PreferenceProfile = {
  categories: string[];
  intensity_preference: IntensityPreference;
  subtag_boosts: string[];
};

export type Segment = {
  segment_id: string;
  asset_id: string;
  start_sec: number;
  end_sec: number;
  duration_sec?: number;
  primary_category: string;
  subtags?: string[];
  emotional_intensity: number;
  feed_headline: string;
  description: string;
  explanation: string;
  key_participants?: string[];
  show_name?: string;
  jockey_boost?: boolean;
  cross_episode_significance?: string;
  jockey_reasoning?: string;
};

export type ScoreBreakdown = Record<string, number>;

export type RankedSegment = Segment & {
  match_score: number;
  score_breakdown: ScoreBreakdown;
  scroll_index: number;
};

export type FeedManifest = {
  show_id?: string;
  generated_at?: string;
  asset_ids: string[];
  show_name?: string;
  segments: Segment[];
};

export type ShowCatalogEntry = {
  id: ShowId;
  label: string;
  shortLabel: string;
  available: boolean;
};

export type ShowsResponse = {
  default_show: ShowId;
  shows: ShowCatalogEntry[];
};

export type FeedPageResponse = {
  show: ShowId;
  profile: ProfileId;
  offset: number;
  limit: number;
  clips: RankedSegment[];
  hasMore: boolean;
  show_name?: string;
};

export type ProfilesResponse = {
  profiles: { id: ProfileId; label: string; icon: string }[];
};

export type AssetPlaybackResponse = {
  asset_id: string;
  status: string;
  hls_url: string;
  thumbnail_url: string | null;
  duration: number | null;
  filename: string | null;
};

export type SearchHit = {
  asset_id: string;
  start_sec: number;
  end_sec: number;
  thumbnail_url: string | null;
  transcription: string | null;
  search_rank: number;
  feed_headline: string;
  description: string;
  segment_id: string;
  match_score?: number;
  primary_category?: string;
  emotional_intensity?: number;
};

export type SearchResponse = {
  show: ShowId;
  query: string;
  profile: ProfileId;
  results: SearchHit[];
  show_name?: string;
};

export type IndexVideoPreview = {
  video_id: string;
  asset_id: string;
  thumbnail_url: string | null;
  thumbnail_urls: string[];
  duration: number | null;
  hls_video_url: string | null;
};
