// src/api/stats.ts
import api from "./client";
import type {
  TeamStatsOverview,
  PlayerStatsOverview,
  TeamTrophiesResponse,
  PlayerMedalsResponse,
  TeamOffenseDrilldown,
  TeamEvaluationListResponse,
  TeamEvalScope,
  TeamDefenseDrilldown
} from "./types";


export interface TeamStatsQuery {
  evalScope?: TeamEvalScope;
  assessmentDate?: string | null;
}

function buildEvalQuery(params?: TeamStatsQuery): string {
  const searchParams = new URLSearchParams();

  if (params?.evalScope) {
    searchParams.append("eval_scope", params.evalScope);
  }

  if (params?.assessmentDate) {
    searchParams.append("assessment_date", params.assessmentDate);
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}


export async function getTeamStatsOverview(
  teamId: string,
  params?: TeamStatsQuery
): Promise<TeamStatsOverview> {
  const res = await api.get<TeamStatsOverview>(
    `/teams/${teamId}/stats/overview${buildEvalQuery(params)}`
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
  teamId: string,
  params?: TeamStatsQuery
): Promise<TeamOffenseDrilldown> {
  const res = await api.get<TeamOffenseDrilldown>(
    `/teams/${teamId}/stats/offense-drilldown${buildEvalQuery(params)}`
  );
  return res.data;
}



/**
 * Block 2B – Defense drilldown accordion:
 * Backend route: GET /teams/:teamId/stats/defense-drilldown
 */
export async function getTeamDefenseDrilldown(
  teamId: string,
  params?: TeamStatsQuery
): Promise<TeamDefenseDrilldown> {
  const res = await api.get<TeamDefenseDrilldown>(
    `/teams/${teamId}/stats/defense-drilldown${buildEvalQuery(params)}`
  );
  return res.data;
}


export async function getTeamEvaluations(
  teamId: string
): Promise<TeamEvaluationListResponse> {
  const res = await api.get<TeamEvaluationListResponse>(
    `/teams/${teamId}/stats/evaluations`
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
