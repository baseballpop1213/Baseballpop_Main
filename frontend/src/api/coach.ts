// src/api/coach.ts
import api from "./client";
import type { TeamWithRole } from "./types";

export async function getMyTeams(): Promise<TeamWithRole[]> {
  const res = await api.get<{ teams: TeamWithRole[] }>("/coach/my-teams");
  // Handle both shapes gracefully (just in case older data exists)
  return res.data.teams ?? (res.data as any);
}
// Add this near the bottom of src/api/coach.ts

export interface TeamPlayer {
  player_id: string;
  status: string;
  jersey_number: number | null;
  is_primary_team: boolean;
  profiles: {
    id: string;
    display_name: string | null;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
}

/**
 * Fetch full roster for a team, including profile info.
 * Backed by GET /teams/:teamId/players
 */
export async function getTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
  const res = await api.get(`/teams/${teamId}/players`);
  return res.data as TeamPlayer[];
}
