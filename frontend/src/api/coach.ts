// src/api/coach.ts
import api from "./client";
import type { TeamWithRole } from "./types";

export async function getMyTeams(): Promise<TeamWithRole[]> {
  const res = await api.get<{ teams: TeamWithRole[] }>("/coach/my-teams");
  // Handle both shapes gracefully (just in case older data exists)
  return res.data.teams ?? (res.data as any);
}
// Add this near the bottom of src/api/coach.ts

// Roster player shape from GET /teams/:teamId/players
export interface TeamPlayer {
  player_id: string;
  status: string;
  jersey_number: number | null;
  is_primary_team: boolean;
  created_at: string;
  updated_at: string;
  profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    [key: string]: any;
  };
}

// Full team roster (team_players joined to profiles)
export async function getTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
  const res = await api.get(`/teams/${teamId}/players`);
  return res.data as TeamPlayer[];
}


