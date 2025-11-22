// src/api/types.ts

export type Role = "coach" | "player" | "parent" | "assistant";

export interface Profile {
  id: string;               // uuid from profiles.id
  role: Role;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone?: string | null;
  bio?: string | null;
}

export interface Team {
  id: string;               // uuid from teams.id
  name: string;
  age_group: string;        // enum in DB, treat as string here (e.g. "10U")
  level: string;            // enum in DB, treat as string (e.g. "MAJORS_TRAVEL")
  logo_url: string | null;
  motto: string | null;
}

export interface TeamPlayer {
  id: string;               // team_players.id (uuid)
  team_id: string;
  player_id: string;
  status: string;           // enum in DB
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

// You can expand this file as we go:
// - BattingOrder
// - PitchingConfiguration
// - Conversation / Message
// - Event / EventAttendee
