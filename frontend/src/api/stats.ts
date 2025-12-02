// src/api/stats.ts
import api from "./client";
import type {
  TeamStatsOverview,
  PlayerStatsOverview,
  TeamTrophiesResponse,
  PlayerMedalsResponse,
  TeamOffenseDrilldown,
} from "./types";


export async function getTeamStatsOverview(
  teamId: string
): Promise<TeamStatsOverview> {
  const res = await api.get<TeamStatsOverview>(
    `/teams/${teamId}/stats/overview`
  );
  return res.data;
}

export async function getPlayerStatsOverview(
  playerId: string
): Promise<PlayerStatsOverview> {
  const res = await api.get<PlayerStatsOverview>(
    `/players/${playerId}/stats/overview`
  );
  return res.data;
}

/**
 * Block 2A – Offense drilldown accordion:
 * Backend route: GET /teams/:teamId/stats/offense
 */
export async function getTeamOffenseDrilldown(
  teamId: string
): Promise<TeamOffenseDrilldown> {
  const res = await api.get<TeamOffenseDrilldown>(
    `/teams/${teamId}/stats/offense-drilldown`
  );
  return res.data;
}


/**
 * Existing backend route: GET /teams/:teamId/trophies
 */
export async function getTeamTrophies(
  teamId: string
): Promise<TeamTrophiesResponse> {
  const res = await api.get<TeamTrophiesResponse>(`/teams/${teamId}/trophies`);
  return res.data;
}

/**
 * Existing backend route: GET /players/:playerId/medals
 * (We’ll use this more in Block 2 for player awards UI.)
 */
export async function getPlayerMedals(
  playerId: string
): Promise<PlayerMedalsResponse> {
  const res = await api.get<PlayerMedalsResponse>(
    `/players/${playerId}/medals`
  );
  return res.data;
}
