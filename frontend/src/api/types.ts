// src/api/types.ts
export type Role = "coach" | "player" | "parent" | "assistant" | "admin";

export interface Profile {
  id: string; // uuid from profiles.id
  role: Role;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone?: string | null;
  bio?: string | null;
}

export interface PlayerProfile {
  profile_id: string;
  height_inches: number | null;
  weight_lbs: number | null;
  school: string | null;
  grade: string | null;
  home_address: string | null;
  positions: string[];
  pitches: string[];
  batting_hand: string | null;
  throwing_hand: string | null;
  primary_jersey_number: number | null;
  walk_up_song: string | null;
  glove_brand: string | null;
  glove_size_inches: number | null;
  bat_length_inches: number | null;
  bat_weight_oz: number | null;
}

export interface CoachProfile {
  profile_id: string;
  phone: string | null;
  organization: string | null;
  title: string | null;
  years_experience: number | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ParentChildLink {
  link_id: number;
  relationship: string | null;
  child: Profile | null;
}

export interface CreateAccountPayload {
  role: "player" | "parent" | "coach";
  display_name: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  organization?: string | null;
}

export interface UpdateBasicProfilePayload {
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  birthdate?: string;
}

export interface UpsertPlayerProfilePayload {
  height_inches?: number | null;
  weight_lbs?: number | null;
  school?: string | null;
  grade?: string | null;
  home_address?: string | null;
  positions?: string[];
  pitches?: string[];
  batting_hand?: string | null;
  throwing_hand?: string | null;
  primary_jersey_number?: number | null;
  walk_up_song?: string | null;
  glove_brand?: string | null;
  glove_size_inches?: number | null;
  bat_length_inches?: number | null;
  bat_weight_oz?: number | null;
}

export interface UpsertCoachProfilePayload {
  phone?: string | null;
  organization?: string | null;
  title?: string | null;
  years_experience?: number | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}

export type TeamRole = "coach" | "assistant" | "player" | "parent";

export interface TeamWithRole {
  id: string;
  name: string;
  age_group: string | null;
  level: string | null;
  logo_url: string | null;
  motto: string | null;
  role: TeamRole;
}

export interface Team {
  id: string; // uuid from teams.id
  name: string;
  age_group: string; // enum in DB, treat as string here (e.g. "10U")
  level: string; // enum in DB, treat as string (e.g. "MAJORS_TRAVEL")
  logo_url: string | null;
  motto: string | null;
}

export interface TeamPlayer {
  id: string; // team_players.id (uuid)
  team_id: string;
  player_id: string;
  status: string; // enum in DB
  jersey_number: number | null;
  is_primary_team?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerRating {
  id: number;
  player_assessment_id?: number | null;
  player_id: string;
  age_group_id: number;
  team_id: string | null;
  overall_score: number | null;
  offense_score: number | null;
  defense_score: number | null;
  pitching_score: number | null;
  /**
   * JSON breakdown from the rating engine.
   * Example shape (partial):
   * {
   *   "hitting": {
   *     "tests": {
   *       "contact_score": number | null,
   *       "power_score": number | null,
   *       "strike_chance_percent": number | null,
   *       ...
   *     },
   *     "max_points": number,
   *     "total_points": number | null
   *   },
   *   "athletic": {
   *     "tests": {
   *       "speed_score": number | null,
   *       ...
   *     },
   *     ...
   *   }
   * }
   */
  breakdown: Record<string, unknown>;
  created_at: string;
}

export interface PlayerMedal {
  id: number;
  medal_id: number;
  player_id: string;
  player_assessment_id: number;
  is_official: boolean;
  awarded_at: string;
}

export interface TeamTrophy {
  id: number;
  trophy_id: number;
  team_id: string;
  awarded_at: string;
}

// --- Stats / ratings shared types ------------------------------

export type CoreMetricCode =
  | "bpoprating"
  | "offense"
  | "defense"
  | "pitching"
  | "athletic";

export type TrophyTier = "bronze" | "silver" | "gold" | "platinum";

export interface StatsMetricSummary {
  code: CoreMetricCode;
  /**
   * Human label for display (“Offense Score”, etc.)
   */
  label: string;
  /**
   * Score on a 0–50 scale (team average for teams, personal for players).
   */
  score: number | null;
  /**
   * Percent on a 0–100 scale (normalized metric percent).
   */
  percent: number | null;
  /**
   * Number of underlying samples:
   * - Team: players contributing to this metric
   * - Player: 1 (or 0 if no data)
   */
  sample_size: number;
}

/**
 * Team-level stats overview used on the Stats page (coach/admin view).
 */
export interface TeamStatsOverview {
  team_id: string;
  team_name: string | null;
  age_group_label: string | null;
  level: string | null;
  metrics: StatsMetricSummary[];
}

export type TeamEvalScope = "latest_eval" | "all_star" | "specific";

export interface TeamEvaluationOption {
  id: string;
  performed_at: string;
  label: string;
  template_id?: number | null;
  template_name?: string | null;
  kind?: string | null;
}

export interface TeamEvaluationListResponse {
  team_id: string;
  evaluations: TeamEvaluationOption[];
}

/**
 * Player-level stats overview used on the Stats page (player view).
 */
export interface PlayerStatsOverview {
  player_id: string;
  team_id: string | null;
  age_group_label: string | null;
  latest_assessment_id: number | null;
  metrics: StatsMetricSummary[];
}

// --- Offense drilldown (Stats page Block 2A) -------------------

export type OffenseSubMetricCode =
  | "offense"
  | "contact"
  | "power"
  | "speed"
  | "strikechance";

export interface OffenseDrilldownMetric {
  code: OffenseSubMetricCode;
  label: string;
  team_average: number | null;
}

export interface OffenseDrilldownPlayerMetrics {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  hitting_score: number | null;
  contact_score: number | null;
  power_score: number | null;
  speed_score: number | null;
  /**
   * Value from 0–1 (we'll display as a % on the frontend).
   */
  strike_chance: number | null;
}

export interface TeamOffenseDrilldown {
  team_id: string;
  team_name: string | null;
  age_group_label: string | null;
  level: string | null;
  metrics: OffenseDrilldownMetric[];
  players: OffenseDrilldownPlayerMetrics[];
}

/**
 * Shape of a single team trophy as returned from /teams/:teamId/trophies.
 * (Mirrors the backend TrophySummary type.)
 */
export interface TeamTrophyWithDefinition {
  id: number;
  trophy_id: number;
  team_id: string;
  awarded_at: string | null;
  definition: {
    id: number;
    metric_code: string | null;
    tier: TrophyTier;
    name: string;
    description: string | null;
    icon_url: string | null;
    age_group_label: string | null;
  } | null;
}

/**
 * Response from GET /teams/:teamId/trophies.
 */
export interface TeamTrophiesResponse {
  team_id: string;
  trophies: TeamTrophyWithDefinition[];
}

/**
 * Shape of a player medal row as returned from /players/:playerId/medals.
 * (We’ll lean on this more in Block 2.)
 */
export interface PlayerMedalWithDefinition {
  id: number;
  medal_id: number;
  player_id: string;
  player_assessment_id: number | null;
  is_official: boolean;
  awarded_at: string | null;
  definition: {
    id: number;
    metric_code: string | null;
    tier: TrophyTier;
    name: string;
    description: string | null;
    icon_url: string | null;
    age_group_label: string | null;
    min_percent: number | null;
  } | null;
}

export interface PlayerMedalsResponse {
  player_id: string;
  medals: PlayerMedalWithDefinition[];
}

export type OffenseSubmetricCode =
  | "offense"
  | "contact"
  | "power"
  | "speed"
  | "strikechance"; // hitters' StrikeChance (pitchers will use StrikeoutChance later)

export interface OffenseDrilldownMetric {
  code: OffenseSubmetricCode;
  label: string;
  team_average: number | null;
  player_count: number;
}

export interface OffenseTestPlayerRow {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;

  /**
   * Main numeric value for this test.
   *
   * - Contact tests: quality points (higher is better)
   * - Power tests: bat speed / exit velo in MPH (once backend is updated)
   * - Speed tests: feet per second (ft/s) for the run (once backend is updated)
   */
  value: number | null;

  /** Raw MPH for power tests (bat speed / exit velo). */
  raw_mph?: number | null;

  /**
   * Optional raw time in seconds for timed‑run tests.
   * (Filled for timed_run_1b / timed_run_4b once backend is updated.)
   */
  raw_seconds?: number | null;

  /**
   * Optional basepath distance in feet for timed‑run tests.
   * (e.g. 60/70/90 ft; we can default to the longest in multi‑eval scenarios.)
   */
  raw_distance_ft?: number | null;
}


export interface OffenseTestBreakdown {
  id: string;
  label: string;
  description?: string | null;
  submetric: OffenseSubmetricCode;
  team_average: number | null;
  player_count: number;
  per_player: OffenseTestPlayerRow[];

  /** Team-average raw MPH for power tests (bat speed / exit velo). */
  team_avg_mph?: number | null;
}

export interface OffenseDrilldownPlayerRow {
  player_id: string;
  player_name: string | null;
  jersey_number: number | null;
  hitting_score: number | null;
  contact_score: number | null;
  power_score: number | null;
  speed_score: number | null;
  strike_chance: number | null; // 0–1
}

export interface TeamOffenseDrilldown {
  team_id: string;
  team_name: string | null;
  metrics: OffenseDrilldownMetric[];
  players: OffenseDrilldownPlayerRow[];
  tests_by_metric: {
    offense?: OffenseTestBreakdown[];
    contact?: OffenseTestBreakdown[];
    power?: OffenseTestBreakdown[];
    speed?: OffenseTestBreakdown[];
    strikechance?: OffenseTestBreakdown[];
  };
}

// You can expand this file as we go:
// - BattingOrder
// - PitchingConfiguration
// - Conversation / Message
// - Event / EventAttendee
